'use strict';
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const { execFileSync } = require('node:child_process');
const root = process.env.TRAINING_REPAIR_ROOT || '/root/backups/lanqiao-repair-20261022';
const inventory = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(root, 'inventory.json.gz'))));
const findings = [];
for (const row of inventory.problems) {
    const files = row.fileAudit.filter(f => f.kind === 'testdata' && /\.(in|out|ans|txt)$/.test(f.name));
    const hashes = new Map();
    const inputs = files.filter(f => /\.in$/.test(f.name));
    const outputs = files.filter(f => /\.(out|ans)$/.test(f.name));
    const issues = [];
    for (const f of files) {
        const bytes = fs.readFileSync(path.join(root, 'data', String(row.docId), 'testdata', f.name));
        const text = bytes.toString('utf8');
        if (text.includes('\ufffd')) issues.push({ name: f.name, kind: 'invalid-utf8', count: text.split('\ufffd').length - 1 });
        if (bytes.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf]))) issues.push({ name: f.name, kind: 'utf8-bom' });
        if (/\x00/.test(text)) issues.push({ name: f.name, kind: 'nul-byte' });
        if (!hashes.has(f.sha256)) hashes.set(f.sha256, []);
        hashes.get(f.sha256).push(f.name);
    }
    const duplicates = [...hashes.values()].filter(names => names.length > 1 && names.every(n => /\.in$/.test(n)));
    const item = { order: row.order, pid: row.docId, title: row.title, type: row.parsedConfig.type,
        cases: row.parsedConfig.count, inputCount: inputs.length, outputCount: outputs.length,
        inputMin: inputs.length ? Math.min(...inputs.map(f => f.size)) : null,
        inputMax: inputs.length ? Math.max(...inputs.map(f => f.size)) : null,
        uniqueInputs: new Set(inputs.map(f => f.sha256)).size,
        checker: /checker_type:\s*testlib/.test(row.config || '') ? 'testlib' : 'default', duplicates, issues,
    };
    findings.push(item);
    if (issues.length || duplicates.length || item.cases === 1) console.log('TRAINING_DATA_FINDING', JSON.stringify(item));
}
fs.writeFileSync(path.join(root, 'data-scan.json'), JSON.stringify(findings, null, 2), { mode: 0o600 });
execFileSync('tar', ['-czf', path.join(root, 'data.tar.gz'), '-C', root, 'data']);
console.log('TRAINING_DATA_SCAN_COMPLETE', findings.length, 'archive', fs.statSync(path.join(root, 'data.tar.gz')).size);
