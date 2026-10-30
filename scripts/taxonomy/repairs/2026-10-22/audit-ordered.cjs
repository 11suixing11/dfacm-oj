/* Read-only inventory, rendered with the same pipeline as production problem pages. */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const { MongoClient } = require('mongodb');
const markdown = require('/usr/local/share/.config/yarn/global/node_modules/@hydrooj/ui-default/backendlib/markdown.js');
const { xss, ensureTag } = require('/usr/local/share/.config/yarn/global/node_modules/@hydrooj/ui-default/backendlib/markdown-it-xss');
const root = process.env.PROBLEM_REPAIR_ROOT || '/root/backups/problem-repair-20261022';
module.exports = (async () => {
    const client = new MongoClient(JSON.parse(fs.readFileSync('/root/.hydro/config.json', 'utf8')).uri);
    await client.connect();
    try {
        const docs = await client.db('hydro').collection('document').find({ docType: 10, domainId: { $in: ['system', 'poj'] } }).project({
            domainId: 1, docId: 1, pid: 1, title: 1, content: 1, html: 1, hidden: 1,
            data: 1, additional_file: 1, config: 1, reference: 1,
        }).sort({ domainId: -1, docId: 1 }).toArray();
        const rows = [];
        for (const doc of docs) {
            let selected = doc.content;
            try {
                const parsed = JSON.parse(selected);
                if (parsed && typeof parsed === 'object') selected = Object.values(parsed)[0];
                else if (typeof parsed === 'string') selected = parsed;
            } catch { /* Plain text. */ }
            let rendered = '', renderError = null;
            try {
                rendered = ensureTag(doc.html ? xss.process(selected) : markdown.render(selected));
            } catch (error) { renderError = error.message; }
            rows.push({ ...doc, selected, rendered, renderError });
            if (rows.length % 300 === 0) console.log('ORDERED_RENDER', rows.length, doc.domainId, doc.docId);
        }
        const file = path.join(root, 'ordered-library-rendered.json.gz');
        fs.writeFileSync(file, zlib.gzipSync(JSON.stringify(rows), { level: 9 }), { mode: 0o600 });
        console.log('ORDERED_RENDER_COMPLETE', rows.length, file, fs.statSync(file).size);
    } finally { await client.close(); }
})();
