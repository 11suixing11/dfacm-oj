'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { randomBytes, createCipheriv, createDecipheriv } = require('node:crypto');
const { AssistantError } = require('./protocol.cjs');
const { DEFAULT_BASE, DEFAULT_MODEL, ACCOUNT_KEY_HEADER, personalProvider } = require('./provider-config.cjs');
const { personalModelConfig } = require('./client.cjs');

const MAX_ENCRYPTED_LENGTH = 16000;

function unavailable() { return new AssistantError('AI_CONFIG_UNAVAILABLE', '账户 AI 配置暂时无法读取，请联系管理员检查加密存储。', 503); }
function conflict() { return new AssistantError('AI_CONFIG_CONFLICT', 'AI 配置已在其他页面更新，请刷新配置后再保存。', 409); }
function accountId(uid) {
    if (!Number.isSafeInteger(uid) || uid <= 1) throw new AssistantError('AI_ACCOUNT_REQUIRED', '请先登录你的 OJ 账户。', 403);
    return uid;
}

function createFileKeyLoader({ collection, keyFile = process.env.DFACM_AI_KEY_FILE
    || path.join(os.homedir(), '.hydro', 'secrets', 'dfacm-ai.key') }) {
    let pending;
    return async function load() {
        pending ||= (async () => {
            if (!path.isAbsolute(keyFile)) throw unavailable();
            try {
                try { await fs.lstat(keyFile); }
                catch (error) {
                    if (error.code !== 'ENOENT' || await collection.findOne({ version: 1 })) throw unavailable();
                    await fs.mkdir(path.dirname(keyFile), { recursive: true, mode: 0o700 });
                    // Publish a fully written key atomically. Another worker
                    // must never read a partially initialized key file.
                    const temporary = path.join(path.dirname(keyFile), `.dfacm-ai-${randomBytes(16).toString('hex')}.tmp`);
                    try {
                        await fs.writeFile(temporary, randomBytes(32), { flag: 'wx', mode: 0o600 });
                        try { await fs.link(temporary, keyFile); }
                        catch (writeError) { if (writeError.code !== 'EEXIST') throw writeError; }
                    } finally { await fs.unlink(temporary).catch(() => {}); }
                }
                const info = await fs.lstat(keyFile);
                if (!info.isFile() || info.isSymbolicLink() || info.size !== 32
                    || process.platform !== 'win32' && (info.mode & 0o077)) throw unavailable();
                const key = await fs.readFile(keyFile);
                if (key.length !== 32) throw unavailable();
                return key;
            } catch { throw unavailable(); }
        })();
        try { return await pending; } catch (error) { pending = null; throw error; }
    };
}

function createAccountProviderStore({ collection, loadKey = createFileKeyLoader({ collection }), now = Date.now }) {
    async function decode(doc) {
        if (!doc || doc.version !== 1 || typeof doc.ciphertext !== 'string' || doc.ciphertext.length > MAX_ENCRYPTED_LENGTH
            || !/^[a-f0-9]{32}$/.test(doc.revision) || typeof doc.iv !== 'string' || typeof doc.tag !== 'string') throw unavailable();
        try {
            const key = await loadKey();
            const iv = Buffer.from(doc.iv, 'base64'); const tag = Buffer.from(doc.tag, 'base64');
            if (iv.length !== 12 || tag.length !== 16 || !Buffer.isBuffer(key) || key.length !== 32) throw unavailable();
            const cipher = createDecipheriv('aes-256-gcm', key, iv);
            cipher.setAAD(Buffer.from(`dfacm-ai:v1:${accountId(doc._id)}:${doc.revision}`)); cipher.setAuthTag(tag);
            const raw = Buffer.concat([cipher.update(Buffer.from(doc.ciphertext, 'base64')), cipher.final()]).toString('utf8');
            return personalProvider(JSON.parse(raw));
        } catch { throw unavailable(); }
    }
    async function encode(uid, config, revision) {
        const key = await loadKey();
        if (!Buffer.isBuffer(key) || key.length !== 32) throw unavailable();
        const iv = randomBytes(12); const cipher = createCipheriv('aes-256-gcm', key, iv);
        cipher.setAAD(Buffer.from(`dfacm-ai:v1:${uid}:${revision}`));
        const ciphertext = Buffer.concat([cipher.update(JSON.stringify(config), 'utf8'), cipher.final()]);
        return { version: 1, revision, iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'),
            ciphertext: ciphertext.toString('base64'), updatedAt: new Date(now()) };
    }
    async function read(uid) {
        const doc = await collection.findOne({ _id: accountId(uid) });
        return doc ? { doc, config: await decode(doc) } : null;
    }
    function publicConfig(uid, entry) {
        return { uid: accountId(uid), configured: !!entry, hasKey: !!entry,
            provider: entry?.config.provider || 'agentrouter', baseUrl: entry?.config.baseUrl || DEFAULT_BASE,
            model: entry?.config.model || DEFAULT_MODEL, revision: entry?.doc.revision || '',
            updatedAt: entry?.doc.updatedAt instanceof Date ? entry.doc.updatedAt.toISOString() : null };
    }
    async function getSettings(uid) { return publicConfig(uid, await read(uid)); }
    async function saveSettings(uid, input, revision) {
        uid = accountId(uid);
        const current = await read(uid);
        if (typeof revision !== 'string' || revision !== (current?.doc.revision || '')) throw conflict();
        const supplied = typeof input?.apiKey === 'string' ? input.apiKey.trim() : '';
        let config;
        try { config = personalProvider({ provider: input?.provider, baseUrl: input?.baseUrl,
            model: input?.model, apiKey: supplied || current?.config.apiKey || '' }); }
        catch (error) { throw new AssistantError('INVALID_PROVIDER', error.message || '请检查供应商配置。'); }
        if (!supplied && current && (config.provider !== current.config.provider || config.baseUrl !== current.config.baseUrl)) {
            throw new AssistantError('AI_KEY_REQUIRED', '更换供应商或 API 地址时，请填写对应的新 API Key。');
        }
        const nextRevision = randomBytes(16).toString('hex');
        const encrypted = await encode(uid, config, nextRevision);
        try {
            const result = await collection.updateOne(current ? { _id: uid, revision } : { _id: uid, revision: { $exists: false } },
                { $set: encrypted }, { upsert: !current });
            if (!result.modifiedCount && !result.upsertedCount) throw conflict();
        } catch (error) { if (error.code === 11000) throw conflict(); throw error; }
        return publicConfig(uid, { doc: { _id: uid, ...encrypted }, config });
    }
    async function clearSettings(uid, revision) {
        uid = accountId(uid);
        const current = await collection.findOne({ _id: uid });
        if (typeof revision !== 'string' || revision !== (current?.revision || '')) throw conflict();
        if (current) {
            const result = await collection.deleteOne({ _id: uid, revision });
            if (result.deletedCount !== 1) throw conflict();
        }
        return publicConfig(uid, null);
    }
    async function getModelConfig(uid) {
        const current = await read(uid);
        if (!current) throw new AssistantError('AI_NOT_CONFIGURED', '请先在账户设置中保存 AI 供应商和 API Key，再使用题目助手。', 400);
        return personalModelConfig(current.config);
    }
    return Object.freeze({ getSettings, saveSettings, clearSettings, getModelConfig });
}

module.exports = { ACCOUNT_KEY_HEADER, createFileKeyLoader, createAccountProviderStore };
