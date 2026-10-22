'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');

function syncSkill(source, destination) {
    const allowed = new Set(['SKILL.md', 'references', 'scripts', 'assets', 'agents']);
    const files = {};
    function visit(dir, prefix = '') {
        for (const item of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name, 'en'))) {
            if ((!prefix && !allowed.has(item.name)) || item.name === '__pycache__' || /\.py[co]$/.test(item.name)) continue;
            if (item.isSymbolicLink()) throw new Error('Skill source may not contain symbolic links.');
            const relative = prefix + item.name;
            if (item.isDirectory()) visit(path.join(dir, item.name), relative + '/');
            else if (item.isFile()) files[relative] = fs.readFileSync(path.join(dir, item.name));
        }
    }
    visit(source);
    for (const required of ['SKILL.md', 'references/oj.md', 'references/solve.md', 'references/debug.md']) {
        if (!files[required]) throw new Error('Missing skill resource: ' + required);
    }
    for (const [relative, raw] of Object.entries(files)) {
        const target = path.join(destination, 'acm-trainer', relative);
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(target, raw);
    }
    const hashes = Object.fromEntries(Object.entries(files).map(([name, raw]) => [name, createHash('sha256').update(raw).digest('hex')]));
    const manifest = { skill: 'acm-trainer', files: hashes, sha256: createHash('sha256').update(JSON.stringify(hashes)).digest('hex') };
    fs.writeFileSync(path.join(destination, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
    return manifest;
}

if (require.main === module) {
    const source = process.argv[2];
    if (!source) { process.stderr.write('Usage: node scripts/sync-skill.cjs <acm-trainer skill directory>\n'); process.exitCode = 2; }
    else {
        const manifest = syncSkill(path.resolve(source), path.resolve(__dirname, '../skill'));
        process.stdout.write(`Synced ${Object.keys(manifest.files).length} Skill resources (${manifest.sha256.slice(0, 12)}).\n`);
    }
}
module.exports = { syncSkill };
