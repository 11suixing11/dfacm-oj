/* Audit the requested training DAG in order; preserve an immutable private snapshot. */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const { MongoClient, ObjectId } = require('mongodb');
const markdown = require('/usr/local/share/.config/yarn/global/node_modules/@hydrooj/ui-default/backendlib/markdown.js');
const { xss, ensureTag } = require('/usr/local/share/.config/yarn/global/node_modules/@hydrooj/ui-default/backendlib/markdown-it-xss');
const storage = require('/usr/local/share/.config/yarn/global/node_modules/hydrooj/src/model/storage').default;
const { parseConfig } = require('/usr/local/share/.config/yarn/global/node_modules/hydrooj/src/lib/testdataConfig');
const root = process.env.TRAINING_REPAIR_ROOT || '/root/backups/lanqiao-repair-20261022';
const includeReferences = process.env.TRAINING_INCLUDE_PRIVATE_REFERENCES === '1';
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const safe = name => typeof name === 'string' && name === path.basename(name) && !/[\\/\x00]/.test(name);

module.exports = (async () => {
    fs.mkdirSync(root, { recursive: true, mode: 0o700 });
    if (fs.existsSync(path.join(root, 'inventory.json.gz'))) throw new Error('Snapshot already exists; choose a fresh TRAINING_REPAIR_ROOT');
    const client = new MongoClient(JSON.parse(fs.readFileSync('/root/.hydro/config.json', 'utf8')).uri);
    await client.connect();
    try {
        const db = client.db('hydro');
        const plan = await db.collection('document').findOne({ domainId: 'system', docType: 40, _id: new ObjectId('6abf552caaa235606eedfbee') });
        if (!plan || !Array.isArray(plan.dag) || !/蓝桥杯/.test(plan.title)) throw new Error('Training plan identity changed');
        if (plan.dag.reduce((n, chapter) => n + chapter.pids.length, 0) !== 253) throw new Error('Training problem count changed');
        const rows = [];
        const dir = path.join(root, 'data');
        fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
        for (const chapter of plan.dag) {
            for (const pid of chapter.pids) {
                const doc = await db.collection('document').findOne({ domainId: plan.domainId, docType: 10, docId: Number(pid) });
                const order = rows.length + 1;
                if (!doc) throw new Error(`Missing TRAINING problem ${order}/${pid}`);
                const row = { order, chapter: chapter._id, chapterTitle: chapter.title, ...doc };
                let selected = doc.content;
                try {
                    const content = JSON.parse(selected);
                    if (typeof content === 'string') selected = content;
                    else if (content && typeof content === 'object') selected = content.zh ?? Object.values(content)[0];
                } catch { /* Plain content. */ }
                row.selected = selected;
                row.contentSha256 = sha(doc.content);
                try { row.rendered = ensureTag(doc.html ? xss.process(selected) : markdown.render(selected)); }
                catch (error) { row.renderError = error.message; row.rendered = ''; }
                try { row.parsedConfig = await parseConfig(doc.config, (doc.data || []).map(f => f.name)); }
                catch (error) { row.configError = error.message; }
                row.fileAudit = [];
                const problemDir = path.join(dir, String(pid));
                fs.mkdirSync(problemDir, { recursive: true, mode: 0o700 });
                for (const [kind, files] of [['testdata', doc.data || []], ['additional_file', doc.additional_file || []]]) {
                    const kindDir = path.join(problemDir, kind);
                    fs.mkdirSync(kindDir, { recursive: true, mode: 0o700 });
                    for (const file of files) {
                        const name = file.name || file._id;
                        const item = { kind, name, listedSize: file.size };
                        try {
                            if (!safe(name)) throw new Error('Unsafe filename');
                            const key = `problem/${doc.domainId}/${doc.docId}/${kind}/${name}`;
                            const meta = await storage.getMeta(key);
                            if (!meta) throw new Error('Storage metadata missing');
                            const stream = await storage.get(key);
                            const chunks = [];
                            for await (const chunk of stream) chunks.push(Buffer.from(chunk));
                            const bytes = Buffer.concat(chunks);
                            item.size = bytes.length;
                            item.sha256 = sha(bytes);
                            item.prefixBase64 = bytes.subarray(0, 32).toString('base64');
                            item.sizeMatches = bytes.length === file.size;
                            fs.writeFileSync(path.join(kindDir, name), bytes, { mode: 0o600 });
                        } catch (error) { item.error = error.message; }
                        row.fileAudit.push(item);
                    }
                }
                row.solutions = await db.collection('document').find({ domainId: doc.domainId, docType: 11, parentId: doc.docId }).project({ content: 1, owner: 1, docId: 1 }).sort({ docId: 1 }).toArray();
                const references = includeReferences ? await db.collection('record').find({ domainId: doc.domainId, pid: doc.docId, status: 1, score: 100, lang: /^cc/ }).project({ code: 1, lang: 1, time: 1, memory: 1, judgeAt: 1, uid: 1, contest: 1, testCases: 1 }).sort({ judgeAt: -1 }).limit(2).toArray() : [];
                if (includeReferences) row.acceptedReferences = references;
                rows.push(row);
                console.log('TRAINING_INVENTORY', order, chapter._id, pid, JSON.stringify(doc.title), row.parsedConfig?.type, row.parsedConfig?.count, row.fileAudit.length, 'solutions', row.solutions.length, 'refs', references.length);
            }
        }
        const audit = { at: new Date().toISOString(), order: 'training.dag chapter and pids array order', plan, problems: rows,
            queue: await db.collection('task').countDocuments({ type: 'judge' }),
            pending: await db.collection('record').find({ status: { $in: [0, 20, 21, 22, 23, 24, 25] } }).project({ _id: 1, domainId: 1, pid: 1, uid: 1, status: 1 }).limit(20).toArray(),
        };
        fs.writeFileSync(path.join(root, 'inventory.json.gz'), zlib.gzipSync(JSON.stringify(audit), { level: 9 }), { mode: 0o600 });
        console.log('TRAINING_INVENTORY_COMPLETE', rows.length, 'files', rows.reduce((n, r) => n + r.fileAudit.length, 0), 'queue', audit.queue, 'pending', audit.pending.length);
    } finally { await client.close(); }
})();
