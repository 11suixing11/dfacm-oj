'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { RUNTIME_FILES, hash, relativeFile, verify } = require('./deployment.cjs');
const { RELEASE_FILES } = require('./public-files.cjs');
const { violations } = require('./check-public.cjs');

const source = path.resolve(__dirname, '..');
const output = path.resolve(process.argv[2] || path.join(source, 'dist'));
fs.mkdirSync(output, { recursive: true });
const work = fs.mkdtempSync(path.join(output, 'release-')); const root = path.join(work, 'dfacm-ai-watch');
const manifest = { name: 'dfacm-ai-watch', version: '0.1.0', builtAt: new Date().toISOString(), runtimeFiles: [...RUNTIME_FILES], files: {} };

function copy(name) {
    const input = relativeFile(source, name); const item = fs.lstatSync(input);
    if (item.isSymbolicLink()) throw new Error('Release source must not contain symbolic links');
    if (!item.isFile()) throw new Error('Release source must be a regular file');
    const data = fs.readFileSync(input);
    const findings = violations(data.toString('utf8'));
    if (findings.length) throw new Error(`Release privacy check failed: ${name} (${findings.join(', ')})`);
    const target = path.join(root, name); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.copyFileSync(input, target);
    manifest.files[name] = { sha256: hash(target), bytes: fs.statSync(target).size };
}

for (const name of RELEASE_FILES) copy(name);
fs.writeFileSync(path.join(root, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n'); verify(root);
const artifact = path.join(work, 'dfacm-ai-watch-0.1.0.tar.gz');
const result = spawnSync(process.platform === 'win32' ? 'tar.exe' : 'tar', ['-czf', artifact, '-C', work, 'dfacm-ai-watch'], { encoding: 'utf8' });
if (result.status !== 0) throw new Error('Release archive failed: ' + result.stderr);
const sha256 = hash(artifact); fs.writeFileSync(artifact + '.sha256', sha256 + '  ' + path.basename(artifact) + '\n');
console.log(JSON.stringify({ artifact, checksum: artifact + '.sha256', sha256, files: Object.keys(manifest.files).length, runtimeFiles: RUNTIME_FILES.length }, null, 2));
