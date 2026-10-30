/* Guarded XCPC-only writeback: exact preconditions, durable originals, official file APIs. */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const { MongoClient, BSON } = require('mongodb');
const storage = require('/usr/local/share/.config/yarn/global/node_modules/hydrooj/src/model/storage').default;
const problem = require('/usr/local/share/.config/yarn/global/node_modules/hydrooj/src/model/problem').default;
const { parseConfig } = require('/usr/local/share/.config/yarn/global/node_modules/hydrooj/src/lib/testdataConfig');
const markdown = require('/usr/local/share/.config/yarn/global/node_modules/@hydrooj/ui-default/backendlib/markdown.js');
const { xss, ensureTag } = require('/usr/local/share/.config/yarn/global/node_modules/@hydrooj/ui-default/backendlib/markdown-it-xss');
const root = process.env.XCPC_REPAIR_ROOT || '/root/backups/xcpc-repair-20261022';
const patchFile = process.env.XCPC_PATCH_BATCH || path.join(root, 'patches.json');
const action = process.env.XCPC_REPAIR_ACTION || 'verify';
const sha = x => crypto.createHash('sha256').update(x).digest('hex');
const write = (file, value) => fs.writeFileSync(file, JSON.stringify(value, null, 2), { mode: 0o600 });
async function readFile(doc, name) {
    const key = `problem/${doc.domainId}/${doc.docId}/testdata/${name}`;
    const meta = await storage.getMeta(key);
    if (!meta) return null;
    const parts = [];
    for await (const chunk of await storage.get(key)) parts.push(Buffer.from(chunk));
    return Buffer.concat(parts);
}
module.exports = (async () => {
    if (!['apply', 'verify'].includes(action)) throw new Error('Invalid action');
    const inventory = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(root, 'inventory.json.gz'))));
    const scope = new Map(inventory.problems.map(p => [p.docId, p]));
    const batchBytes = fs.readFileSync(patchFile);
    const patches = JSON.parse(batchBytes);
    const client = new MongoClient(JSON.parse(fs.readFileSync('/root/.hydro/config.json', 'utf8')).uri);
    await client.connect();
    try {
        const coll = client.db('hydro').collection('document');
        const plans = [], seen = new Set();
        for (const patch of patches.sort((a, b) => scope.get(a.pid).order - scope.get(b.pid).order)) {
            const original = scope.get(patch.pid);
            if (!original || seen.has(patch.pid)) throw new Error('Invalid XCPC patch target');
            seen.add(patch.pid);
            const current = await coll.findOne({ domainId: 'system', docType: 10, docId: patch.pid });
            if (!current || current.title !== original.title) throw new Error('Problem identity changed');
            const fields = patch.fields || {};
            if (Object.keys(fields).some(key => !['content', 'html', 'config'].includes(key))) throw new Error('Unsupported field');
            for (const [key, value] of Object.entries(fields)) {
                const before = patch.fieldPreconditions?.[key] ?? original[key] ?? null;
                if (JSON.stringify(current[key] ?? null) !== JSON.stringify(before) && JSON.stringify(current[key]) !== JSON.stringify(value)) throw new Error(`Concurrent ${key} edit ${patch.pid}`);
            }
            const candidate = { ...current, ...fields };
            let selected = candidate.content;
            try { const value = JSON.parse(selected); if (typeof value === 'object') selected = value.zh ?? Object.values(value)[0]; } catch { /* Plain statement. */ }
            const rendered = ensureTag(candidate.html ? xss.process(selected) : markdown.render(selected));
            if (/katex-error/.test(rendered)) throw new Error('Candidate math rendering failed');
            const files = [];
            for (const file of patch.files || []) {
                if (!file.name || file.name !== path.basename(file.name) || /[^A-Za-z0-9_.-]/.test(file.name)) throw new Error('Unsafe file name');
                const bytes = Buffer.from(file.base64, 'base64');
                if (sha(bytes) !== file.sha256) throw new Error('Payload checksum mismatch');
                const before = await readFile(current, file.name);
                const beforeSha = before === null ? null : sha(before);
                if (beforeSha !== file.expectedSha256 && beforeSha !== file.sha256) throw new Error(`Concurrent data edit ${patch.pid}/${file.name}`);
                if (action === 'verify' && beforeSha !== file.sha256) throw new Error('File not applied');
                files.push({ ...file, bytes, before, already: beforeSha === file.sha256 });
            }
            if (fields.config !== undefined) {
                const configFile = files.find(f => f.name === 'config.yaml');
                if (!configFile || configFile.bytes.toString('utf8') !== fields.config) throw new Error('Config file/field must agree');
            }
            const names = [...new Set([...(current.data || []).map(f => f.name), ...files.map(f => f.name)])];
            const parsed = await parseConfig(candidate.config, names);
            if (patch.expectedCases !== undefined && parsed.count !== patch.expectedCases) throw new Error('Configured case count mismatch');
            if (action === 'verify' && Object.entries(fields).some(([key, value]) => JSON.stringify(current[key]) !== JSON.stringify(value))) throw new Error('Database fields not applied');
            plans.push({ patch, original, current, files, parsed });
        }
        if (action === 'apply') {
            const backupFile = path.join(root, 'before-' + path.basename(patchFile, '.json') + '-' + new Date().toISOString().replace(/[:.]/g, '-') + '.json');
            const fd = fs.openSync(backupFile, 'wx', 0o600);
            try {
                fs.writeFileSync(fd, BSON.EJSON.stringify(plans.map(p => ({ doc: p.current, files: p.files.map(f => ({ name: f.name, base64: f.before === null ? null : f.before.toString('base64'), installedSha256: f.sha256 })) })), null, 2));
                fs.fsyncSync(fd);
            } finally { fs.closeSync(fd); }
            console.log('XCPC_BACKUP', backupFile);
            for (const plan of plans) {
                const { patch, current } = plan;
                for (const file of plan.files) if (!file.already) {
                    const before = await readFile(current, file.name);
                    if ((before === null ? null : sha(before)) !== file.expectedSha256) throw new Error('Data changed before write');
                    await problem.addTestdata(current.domainId, current.docId, file.name, file.bytes);
                    if (sha(await readFile(current, file.name)) !== file.sha256) throw new Error('Uploaded byte mismatch');
                }
                if (Object.keys(patch.fields || {}).length) {
                    const selector = { _id: current._id, domainId: 'system', docType: 10, docId: current.docId, content: current.content };
                    const result = await coll.updateOne(selector, { $set: patch.fields });
                    if (result.matchedCount !== 1) throw new Error('Concurrent statement edit before write');
                }
                console.log('XCPC_PATCH_APPLIED', plan.original.order, current.docId, patch.reason, 'cases', plan.parsed.count);
            }
        }
        write(path.join(root, path.basename(patchFile, '.json') + '-' + action + '-result.json'), { batchSha256: sha(batchBytes), at: new Date().toISOString(), action, problems: plans.map(p => ({ order: p.original.order, pid: p.patch.pid, reason: p.patch.reason, cases: p.parsed.count, files: p.files.map(f => ({ name: f.name, sha256: f.sha256 })) })) });
        console.log('XCPC_PATCH_COMPLETE', action, plans.length);
    } finally { await client.close(); }
})();
