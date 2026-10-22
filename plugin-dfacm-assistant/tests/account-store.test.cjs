'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createFileKeyLoader, createAccountProviderStore } = require('../account-store.cjs');
const { memoryCollection } = require('./fake-collection.cjs');

const key = Buffer.alloc(32, 7);
const input = (overrides = {}) => ({ provider: 'custom', baseUrl: 'https://model.example.com/v1',
    model: 'account-model', apiKey: 'account-test-key', ...overrides });
function fixture(collection = memoryCollection()) {
    return { collection, store: createAccountProviderStore({ collection, loadKey: async () => key, now: () => 1720000000000 }) };
}
async function temporary(context) {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'dfacm-account-store-'));
    context.after(async () => {
        assert.equal(path.dirname(directory), path.resolve(os.tmpdir()));
        assert.ok(path.basename(directory).startsWith('dfacm-account-store-'));
        await fs.rm(directory, { recursive: true, force: true });
    });
    return directory;
}

test('account settings are encrypted at rest and public metadata never contains a key', async () => {
    const { store, collection } = fixture();
    const saved = await store.saveSettings(42, input(), '');
    assert.deepEqual(Object.keys(saved).sort(), ['baseUrl', 'configured', 'hasKey', 'model', 'provider', 'revision', 'uid', 'updatedAt']);
    assert.equal(saved.uid, 42); assert.equal(saved.configured, true); assert.equal(saved.updatedAt, '2024-07-03T09:46:40.000Z');
    const doc = collection.docs.get(42);
    for (const plaintext of ['account-test-key', 'account-model', 'https://model.example.com']) assert.ok(!JSON.stringify(doc).includes(plaintext));
    assert.deepEqual(Object.keys(doc).sort(), ['_id', 'ciphertext', 'iv', 'revision', 'tag', 'updatedAt', 'version']);
    assert.equal(Buffer.from(doc.iv, 'base64').length, 12); assert.equal(Buffer.from(doc.tag, 'base64').length, 16);
    const otherProcess = createAccountProviderStore({ collection, loadKey: async () => key });
    assert.deepEqual(await otherProcess.getSettings(42), saved);
    const model = await otherProcess.getModelConfig(42);
    assert.equal(model.apiKey, 'account-test-key'); assert.equal(model.model, 'account-model');
    assert.equal(model.endpoint, 'https://model.example.com/v1/chat/completions'); assert.equal(model.personal, true);
    assert.ok(!JSON.stringify(await store.getSettings(42)).includes('account-test-key'));
});

test('global UIDs isolate accounts and missing configuration never resolves a site key', async () => {
    const { store } = fixture();
    await store.saveSettings(42, input(), '');
    assert.equal((await store.getSettings(43)).configured, false);
    await assert.rejects(store.getModelConfig(43), { code: 'AI_NOT_CONFIGURED' });
    await store.saveSettings(43, input({ provider: 'agentrouter', model: 'gpt-5.6-sol', apiKey: 'other-account-key' }), '');
    assert.equal((await store.getModelConfig(42)).apiKey, 'account-test-key');
    assert.equal((await store.getModelConfig(43)).apiKey, 'other-account-key');
    assert.equal((await store.getModelConfig(43)).transport, 'codex-responses');
    for (const uid of [0, 1, -1, 1.5, '42', NaN]) await assert.rejects(store.getSettings(uid), { code: 'AI_ACCOUNT_REQUIRED' });
});

test('a blank key preserves the saved key while model changes create a new encrypted revision', async () => {
    const { store, collection } = fixture();
    const first = await store.saveSettings(42, input(), ''); const iv = collection.docs.get(42).iv;
    const changed = await store.saveSettings(42, input({ model: 'new-model', apiKey: '' }), first.revision);
    assert.notEqual(changed.revision, first.revision); assert.notEqual(collection.docs.get(42).iv, iv);
    assert.equal((await store.getModelConfig(42)).apiKey, 'account-test-key');
    assert.equal((await store.getModelConfig(42)).model, 'new-model');
    await store.saveSettings(42, input({ apiKey: 'replacement-key' }), changed.revision);
    assert.equal((await store.getModelConfig(42)).apiKey, 'replacement-key');
});

test('changing a provider or API destination requires its own key and normalized same endpoints preserve it', async () => {
    const { store } = fixture(); const saved = await store.saveSettings(42, input(), '');
    for (const change of [{ provider: 'agentrouter' }, { baseUrl: 'https://other.example.com/v1' }]) {
        await assert.rejects(store.saveSettings(42, input({ ...change, apiKey: '' }), saved.revision), { code: 'AI_KEY_REQUIRED' });
    }
    const normalized = await store.saveSettings(42, input({ baseUrl: 'https://model.example.com/v1/chat/completions/', apiKey: '' }), saved.revision);
    assert.equal((await store.getModelConfig(42)).apiKey, 'account-test-key');
    const next = await store.saveSettings(42, input({ provider: 'agentrouter', model: 'gpt-5.6-sol', apiKey: 'agentrouter-key' }), normalized.revision);
    assert.equal(next.baseUrl, 'https://agentrouter.org/v1');
    assert.equal((await store.getModelConfig(42)).transport, 'codex-responses');
});

test('concurrent saves and stale deletions cannot overwrite a newer account revision', async () => {
    const { store } = fixture(); const first = await store.saveSettings(42, input(), '');
    const updates = await Promise.allSettled(['one', 'two'].map(model => store.saveSettings(42, input({ model, apiKey: '' }), first.revision)));
    assert.equal(updates.filter(result => result.status === 'fulfilled').length, 1);
    assert.equal(updates.find(result => result.status === 'rejected').reason.code, 'AI_CONFIG_CONFLICT');
    await assert.rejects(store.clearSettings(42, first.revision), { code: 'AI_CONFIG_CONFLICT' });
    const latest = await store.getSettings(42);
    assert.equal((await store.clearSettings(42, latest.revision)).configured, false);
    await assert.rejects(store.getModelConfig(42), { code: 'AI_NOT_CONFIGURED' });
    assert.equal((await store.clearSettings(42, '')).hasKey, false);
});

test('two first saves for the same account allow exactly one insertion', async () => {
    const { store, collection } = fixture();
    const results = await Promise.allSettled(['one', 'two'].map(model => store.saveSettings(42, input({ model }), '')));
    assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
    assert.equal(results.find(result => result.status === 'rejected').reason.code, 'AI_CONFIG_CONFLICT');
    assert.equal(collection.docs.size, 1);
});

test('GCM rejects changed ciphertext, wrong account binding, revision and master keys without exposing stored secrets', async () => {
    const { store, collection } = fixture(); await store.saveSettings(42, input(), '');
    const original = structuredClone(collection.docs.get(42));
    for (const mutated of [
        { ...original, ciphertext: Buffer.alloc(40).toString('base64') },
        { ...original, revision: 'a'.repeat(32) }, { ...original, tag: Buffer.alloc(16).toString('base64') },
        { ...original, iv: 'bad' }, { ...original, version: 2 }, { ...original, ciphertext: 'x'.repeat(16001) },
    ]) {
        collection.docs.set(42, mutated);
        await assert.rejects(store.getSettings(42), error => {
            assert.equal(error.code, 'AI_CONFIG_UNAVAILABLE'); assert.ok(!error.message.includes('account-test-key')); return true;
        });
    }
    collection.docs.set(42, original); collection.docs.set(43, { ...original, _id: 43 });
    await assert.rejects(store.getModelConfig(43), { code: 'AI_CONFIG_UNAVAILABLE' });
    const wrongKey = createAccountProviderStore({ collection, loadKey: async () => Buffer.alloc(32, 8) });
    await assert.rejects(wrongKey.getSettings(42), { code: 'AI_CONFIG_UNAVAILABLE' });
    await store.clearSettings(43, original.revision); assert.equal(collection.docs.has(43), false);
});

test('invalid account inputs neither persist a document nor echo rejected credentials', async () => {
    const { store, collection } = fixture();
    for (const change of [{ apiKey: '' }, { apiKey: 'bad\nkey' }, { provider: 'other' }, { baseUrl: 'https://model.example.com/v1?key=secret' }]) {
        await assert.rejects(store.saveSettings(42, input(change), ''), error => {
            assert.equal(error.code, 'INVALID_PROVIDER'); assert.ok(!error.message.includes('secret')); return true;
        });
    }
    assert.equal(collection.docs.size, 0);
});

test('file key loader creates one private master key and independent processes read the same key', async context => {
    const directory = await temporary(context); const collection = memoryCollection();
    const keyFile = path.join(directory, 'secrets', 'ai.key');
    const loaders = [createFileKeyLoader({ collection, keyFile }), createFileKeyLoader({ collection, keyFile })];
    const values = await Promise.all(loaders.map(load => load()));
    assert.equal(values[0].length, 32); assert.deepEqual(values[0], values[1]);
    assert.deepEqual(await createFileKeyLoader({ collection, keyFile })(), values[0]);
    if (process.platform !== 'win32') {
        assert.equal((await fs.stat(keyFile)).mode & 0o777, 0o600);
        assert.equal((await fs.stat(path.dirname(keyFile))).mode & 0o777, 0o700);
    }
});

test('a missing master key with existing accounts fails closed and can recover only with the original key', async context => {
    const directory = await temporary(context); const { collection, store } = fixture();
    await store.saveSettings(42, input(), ''); const keyFile = path.join(directory, 'missing.key');
    const load = createFileKeyLoader({ collection, keyFile });
    await assert.rejects(load(), { code: 'AI_CONFIG_UNAVAILABLE' });
    await assert.rejects(fs.stat(keyFile), { code: 'ENOENT' });
    await fs.writeFile(keyFile, key, { mode: 0o600 });
    const recovered = createAccountProviderStore({ collection, loadKey: load });
    assert.equal((await recovered.getModelConfig(42)).apiKey, 'account-test-key');
});

test('master key validation rejects relative paths, wrong length and nonprivate files', async context => {
    const directory = await temporary(context); const collection = memoryCollection();
    await assert.rejects(createFileKeyLoader({ collection, keyFile: 'relative.key' })(), { code: 'AI_CONFIG_UNAVAILABLE' });
    const keyFile = path.join(directory, 'wrong.key'); await fs.writeFile(keyFile, Buffer.alloc(31), { mode: 0o600 });
    await assert.rejects(createFileKeyLoader({ collection, keyFile })(), { code: 'AI_CONFIG_UNAVAILABLE' });
    if (process.platform !== 'win32') {
        await fs.writeFile(keyFile, key); await fs.chmod(keyFile, 0o644);
        await assert.rejects(createFileKeyLoader({ collection, keyFile })(), { code: 'AI_CONFIG_UNAVAILABLE' });
        await fs.chmod(keyFile, 0o600); const link = path.join(directory, 'link.key'); await fs.symlink(keyFile, link);
        await assert.rejects(createFileKeyLoader({ collection, keyFile: link })(), { code: 'AI_CONFIG_UNAVAILABLE' });
    }
});
