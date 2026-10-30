/* Run inside `hydrooj cli execute`; models and the TypeScript loader are initialized. */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const { MongoClient, BSON } = require('mongodb');
const markdown = require('/usr/local/share/.config/yarn/global/node_modules/@hydrooj/ui-default/backendlib/markdown.js');
const { xss, ensureTag } = require('/usr/local/share/.config/yarn/global/node_modules/@hydrooj/ui-default/backendlib/markdown-it-xss');
const storage = require('/usr/local/share/.config/yarn/global/node_modules/hydrooj/src/model/storage').default;
const problem = require('/usr/local/share/.config/yarn/global/node_modules/hydrooj/src/model/problem').default;
const { parseConfig } = require('/usr/local/share/.config/yarn/global/node_modules/hydrooj/src/lib/testdataConfig');

const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const root = process.env.PROBLEM_REPAIR_ROOT || '/root/backups/problem-repair-20261022';
const batchFile = process.env.PROBLEM_REPAIR_BATCH || path.join(root, 'statements.json');
const action = process.env.PROBLEM_REPAIR_ACTION || 'render';
const batchStem = path.basename(batchFile).replace(/\.json(?:\.gz)?$/, '');

function render(row) {
    let content = row.content;
    try {
        const parsed = JSON.parse(content);
        if (parsed && typeof parsed === 'object') content = Object.values(parsed)[0];
        else if (typeof parsed === 'string') content = parsed;
    } catch { /* Plain Markdown/HTML. */ }
    return ensureTag(row.html ? xss.process(content) : markdown.render(content));
}

function filePath(row, file) {
    return `problem/${row.domainId}/${row.docId}/${file.kind}/${file.name}`;
}

async function fileBytes(row, file) {
    const stream = await storage.get(filePath(row, file));
    const chunks = [];
    for await (const chunk of stream) chunks.push(Buffer.from(chunk));
    return Buffer.concat(chunks);
}

async function fileState(row, file, current) {
    const entries = file.kind === 'testdata' ? current.data : current.additional_file;
    const listed = (entries || []).some(item => item.name === file.name || item._id === file.name);
    const meta = await storage.getMeta(filePath(row, file));
    if (listed !== !!meta) throw new Error(`File metadata mismatch ${row.docId}/${file.name}`);
    const bytes = meta ? await fileBytes(row, file) : null;
    return { bytes, currentSha: bytes === null ? null : sha(bytes) };
}

async function payloadBytes(patch, file) {
    if (file.sourceName) {
        if (file.kind !== 'additional_file' || file.sourceName !== path.basename(file.sourceName)) throw new Error('Invalid attachment source');
        const bytes = await fileBytes(patch, { kind: 'additional_file', name: file.sourceName });
        if (sha(bytes) !== file.sourceSha256 || file.sourceSha256 !== file.sha256) throw new Error('Attachment source changed ' + patch.docId + '/' + file.sourceName);
        return bytes;
    }
    const bytes = Buffer.from(file.base64, 'base64');
    if (sha(bytes) !== file.sha256) throw new Error('File payload checksum ' + file.name);
    return bytes;
}

function preserveTestdata(patch, current) {
    if (!patch.preserveTestdata) return;
    const files = (current.data || []).map(({ name, size, etag }) => ({ name, size, etag })).sort((a, b) => a.name.localeCompare(b.name, 'en'));
    const expected = [...patch.preserveTestdata].sort((a, b) => a.name.localeCompare(b.name, 'en'));
    if (JSON.stringify(files) !== JSON.stringify(expected) || JSON.stringify(current.config ?? null) !== JSON.stringify(patch.preserveConfig)) throw new Error('Judge data/config changed ' + patch.docId);
}

async function verifyCaseCount(patch, current, pendingNames = []) {
    if (patch.testdataCount === undefined) return;
    const names = [...new Set([...(current.data || []).map(item => item.name), ...pendingNames])];
    const config = await parseConfig(current.config, names);
    if (config.count !== patch.testdataCount) throw new Error(`Judge case count ${patch.docId}: ${config.count}, expected ${patch.testdataCount}`);
    console.log('CONFIG_VERIFIED', patch.domainId, patch.docId, config.count, 'cases');
}

module.exports = (async () => {
    const batchBytes = fs.readFileSync(batchFile);
    const batch = JSON.parse((batchFile.endsWith('.gz') ? zlib.gunzipSync(batchBytes) : batchBytes).toString('utf8'));
    if (batch.version !== 1 || !Array.isArray(batch.problems)) throw new Error('Unsupported batch');
    fs.mkdirSync(root, { recursive: true, mode: 0o700 });
    fs.chmodSync(root, 0o700);
    const rendered = batch.problems.map(row => {
        if (sha(row.content) !== row.newContentSha256) throw new Error(`Payload checksum ${row.docId}`);
        const html = render(row);
        return { domainId: row.domainId, docId: row.docId, category: row.category, content: row.content, html };
    });
    const renderFile = path.join(root, batchStem + '-rendered.json');
    fs.writeFileSync(renderFile, JSON.stringify(rendered), { mode: 0o600 });
    fs.writeFileSync(renderFile + '.gz', zlib.gzipSync(JSON.stringify(rendered), { level: 9 }), { mode: 0o600 });
    console.log('RENDER_COMPLETE', rendered.length, renderFile);
    if (action === 'render') return;
    if (!['apply', 'verify'].includes(action)) throw new Error('Unsupported action');
    const confirmation = path.join(root, batchStem + '-validated.json');
    const validated = JSON.parse(fs.readFileSync(confirmation, 'utf8'));
    if (validated.batchSha256 !== sha(batchBytes) || validated.problems !== rendered.length || validated.errors !== 0) {
        throw new Error('Validated render does not match this exact batch');
    }

    const uri = JSON.parse(fs.readFileSync('/root/.hydro/config.json', 'utf8')).uri;
    const client = new MongoClient(uri);
    await client.connect();
    try {
        const collection = client.db('hydro').collection('document');
        const todo = [];
        const keys = new Set();
        for (const patch of batch.problems) {
            const key = `${patch.domainId}/${patch.docId}`;
            if (keys.has(key)) throw new Error('Duplicate problem ' + key);
            keys.add(key);
            const current = await collection.findOne({ domainId: patch.domainId, docType: 10, docId: patch.docId });
            if (!current || current.title !== patch.title || (current.pid || null) !== (patch.pid || null)) throw new Error('Identity changed ' + key);
            preserveTestdata(patch, current);
            const applied = sha(current.content) === patch.newContentSha256 && current.html === patch.html;
            if (action === 'verify' && !applied) throw new Error('Content verification ' + key);
            if (!applied && (sha(current.content) !== patch.expected.contentSha256 || (current.html ?? null) !== patch.expected.html)) throw new Error('Concurrent statement edit ' + key);
            const files = [];
            const names = new Set();
            const payloads = [
                ...(patch.testdata || []).map(file => ({ ...file, kind: 'testdata' })),
                ...(patch.additionalFiles || []).map(file => ({ ...file, kind: 'additional_file' })),
            ];
            for (const file of payloads) {
                if (!file.name || file.name !== path.basename(file.name) || /[\\/\x00]/.test(file.name)) throw new Error('Invalid filename');
                const fileKey = file.kind + '/' + file.name;
                if (names.has(fileKey)) throw new Error('Duplicate file ' + fileKey);
                names.add(fileKey);
                if (file.expectedSha256 !== null && !/^[a-f0-9]{64}$/.test(file.expectedSha256)) throw new Error('Invalid expected checksum ' + fileKey);
                const { bytes, currentSha } = await fileState(patch, file, current);
                const already = currentSha === file.sha256;
                if (action === 'verify' && !already) throw new Error('File verification ' + key + '/' + file.name);
                if (!already && currentSha !== file.expectedSha256) throw new Error('Concurrent testdata edit ' + key + '/' + file.name);
                await payloadBytes(patch, file);
                files.push({ ...file, already, beforeBase64: bytes === null ? null : bytes.toString('base64') });
            }
            await verifyCaseCount(patch, current, action === 'apply' ? (patch.testdata || []).map(file => file.name) : []);
            todo.push({ patch, current, applied, files });
        }
        if (action === 'verify') {
            console.log('DATABASE_VERIFY_COMPLETE', todo.length, 'problems', todo.reduce((n, row) => n + row.files.length, 0), 'files');
            return;
        }
        // Flush every original before the first mutation; preserve BSON types for rollback.
        const backupName = 'before-' + batchStem + '-' + new Date().toISOString().replace(/[:.]/g, '-') + '.json';
        const backupPath = path.join(root, backupName);
        const backup = todo.map(({ current, files }) => ({ current, files: files.map(file => ({ kind: file.kind, name: file.name, base64: file.beforeBase64, uploadedSha256: file.sha256 })) }));
        const descriptor = fs.openSync(backupPath, 'wx', 0o600);
        try {
            fs.writeFileSync(descriptor, BSON.EJSON.stringify(backup, null, 2));
            fs.fsyncSync(descriptor);
        } finally { fs.closeSync(descriptor); }
        console.log('BACKUP', backupPath);
        let statements = 0;
        let fileCount = 0;
        for (const entry of todo) {
            const { patch, current } = entry;
            for (const file of entry.files) {
                if (file.already) continue;
                const fresh = await collection.findOne({ _id: current._id, domainId: patch.domainId, docType: 10, docId: patch.docId });
                const { currentSha } = await fileState(patch, file, fresh);
                if (currentSha !== file.expectedSha256) throw new Error('File changed before write ' + patch.docId + '/' + file.name);
                const add = file.kind === 'testdata' ? problem.addTestdata : problem.addAdditionalFile;
                await add.call(problem, patch.domainId, patch.docId, file.name, await payloadBytes(patch, file));
                if (sha(await fileBytes(patch, file)) !== file.sha256) throw new Error('Uploaded bytes do not match');
                fileCount++;
            }
            if (!entry.applied) {
                const selector = { _id: current._id, domainId: patch.domainId, docType: 10, docId: patch.docId, content: current.content };
                selector.html = current.html === undefined ? { $exists: false } : current.html;
                const result = await collection.updateOne(selector, { $set: { content: patch.content, html: patch.html } });
                if (result.modifiedCount !== 1) throw new Error('Concurrent edit before write ' + patch.docId);
                statements++;
            }
            const after = await collection.findOne({ _id: current._id, domainId: patch.domainId, docType: 10, docId: patch.docId });
            preserveTestdata(patch, after);
            await verifyCaseCount(patch, after);
            console.log('APPLIED', patch.domainId, patch.docId, patch.category);
        }
        console.log('APPLY_COMPLETE', statements, 'statements;', fileCount, 'files; backup', backupPath);
    } finally { await client.close(); }
})();
