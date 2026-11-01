'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const RUNTIME_FILES = ['ai.cjs', 'auto.cjs', 'cache.cjs', 'calendar.cjs', 'clist.cjs', 'index.ts', 'package.json', 'presentation.cjs',
    'templates/calendar.html', 'public/calendar.js', 'public/calendar.css'];
const hash = (file) => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
function relativeFile(root, name) {
    if (typeof name !== 'string' || !/^[a-zA-Z0-9_.\/-]+$/.test(name)
        || name.startsWith('/') || name.split('/').some(part => !part || part === '.' || part === '..')) throw new Error('Unsafe release file path');
    const file = path.resolve(root, name);
    if (!file.startsWith(path.resolve(root) + path.sep)) throw new Error('Release path leaves package');
    for (let current = file; current !== path.resolve(root); current = path.dirname(current)) {
        if (fs.lstatSync(current).isSymbolicLink()) throw new Error('Release files must not be links');
    }
    if (!fs.statSync(file).isFile()) throw new Error('Release file must be regular');
    return file;
}
function verify(root) {
    const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
    if (manifest.name !== 'dfacm-calendar-merge' || JSON.stringify(manifest.runtimeFiles) !== JSON.stringify(RUNTIME_FILES)) throw new Error('Unexpected merge manifest');
    const listed = new Set(Object.keys(manifest.files));
    for (const name of RUNTIME_FILES) if (!listed.has(name)) throw new Error('Missing runtime file: ' + name);
    for (const [name, info] of Object.entries(manifest.files)) {
        const file = relativeFile(root, name);
        if (!/^[a-f0-9]{64}$/.test(info.sha256) || hash(file) !== info.sha256 || fs.statSync(file).size !== info.bytes) throw new Error('Invalid release file: ' + name);
    }
    function walk(dir) {
        for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
            const file = path.join(dir, item.name), name = path.relative(root, file).split(path.sep).join('/');
            if (name === 'node_modules' || name === 'manifest.json') continue;
            if (item.isSymbolicLink()) throw new Error('Unexpected release link');
            if (item.isDirectory()) walk(file);
            else if (!listed.has(name)) throw new Error('Unlisted release file: ' + name);
        }
    }
    walk(root);
    return manifest;
}
module.exports = { RUNTIME_FILES, hash, relativeFile, verify };
if (require.main === module) { verify(path.resolve(process.argv[2])); console.log('Merge release checksum manifest verified'); }
