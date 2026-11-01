'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { RUNTIME_FILES, hash, verify } = require('./merge-release.cjs');
const source = path.resolve(__dirname, '..');
const output = path.resolve(process.argv[2] || path.join(source, '..', 'qa', 'calendar-ai-merge-2026-10-31'));
fs.mkdirSync(output, { recursive: true });
const work = fs.mkdtempSync(path.join(output, 'release-'));
const root = path.join(work, 'dfacm-calendar-merge');
const manifest = { name: 'dfacm-calendar-merge', builtAt: new Date().toISOString(), runtimeFiles: RUNTIME_FILES, files: {} };
function copy(input, name) {
    const item = fs.lstatSync(input);
    if (item.isSymbolicLink()) throw new Error('Symbolic links cannot be packaged');
    if (item.isDirectory()) for (const child of fs.readdirSync(input).sort()) copy(path.join(input, child), path.posix.join(name, child));
    else if (item.isFile()) {
        const target = path.join(root, name);
        fs.mkdirSync(path.dirname(target), { recursive: true }); fs.copyFileSync(input, target);
        manifest.files[name] = { sha256: hash(target), bytes: fs.statSync(target).size };
    }
}
for (const name of [...RUNTIME_FILES, 'README.md', 'scripts']) copy(path.join(source, name), name);
copy(path.join(source, '..', 'plugin-dfacm-ai-contests/deploy/caddy.inc'), 'collector/caddy.inc');
copy(path.join(source, '..', 'plugin-dfacm-ai-contests/index.ts'), 'collector/index.ts');
copy(path.join(source, '..', 'landing/index.html'), 'reference/home.html');
fs.writeFileSync(path.join(root, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n'); verify(root);
const artifact = path.join(work, 'dfacm-calendar-merge.tar.gz');
const result = spawnSync(process.platform === 'win32' ? 'tar.exe' : 'tar', ['-czf', artifact, '-C', work, 'dfacm-calendar-merge'], { encoding: 'utf8' });
if (result.status !== 0) throw new Error('Archive creation failed: ' + result.stderr);
const sha256 = hash(artifact);
fs.writeFileSync(artifact + '.sha256', sha256 + '  ' + path.basename(artifact) + '\n');
console.log(JSON.stringify({ artifact, checksum: artifact + '.sha256', sha256, runtimeFiles: RUNTIME_FILES.length }, null, 2));
