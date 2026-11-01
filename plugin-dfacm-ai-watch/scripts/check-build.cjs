'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { stripTypeScriptTypes } = require('node:module');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const files = ['config.cjs', 'detector.cjs', 'store.cjs', 'engine.cjs', 'http.cjs', 'memory.cjs', 'demo.cjs', 'preview.cjs', 'public/watch.js',
    'scripts/deployment.cjs', 'scripts/package.cjs', 'scripts/check-native.cjs', 'scripts/check-live.cjs',
    'scripts/public-files.cjs', 'scripts/check-public.cjs'];
for (const file of files) {
    const result = spawnSync(process.execPath, ['--check', path.join(root, file)], { encoding: 'utf8' });
    if (result.status !== 0) { console.error(result.stderr); process.exit(1); }
}
const source = stripTypeScriptTypes(fs.readFileSync(path.join(root, 'index.ts'), 'utf8'));
if (!source.includes("from 'hydrooj'")) throw new Error('Hydro entry is missing');
console.log('Hydro entry and all Node/browser JavaScript syntax checks passed. No dependency installation required.');
