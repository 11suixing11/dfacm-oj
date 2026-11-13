'use strict';

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { spawnSync } = require('node:child_process');

const RUNTIME_FILES = Object.freeze([
    'package.json', 'index.ts', 'config.cjs', 'time.cjs', 'detector.cjs', 'store.cjs', 'engine.cjs', 'http.cjs',
    'templates/dfacm_ai_watch.html', 'templates/watch_content.html', 'public/watch.css', 'public/watch.js',
]);
const hash = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');

function relativeFile(root, name) {
    if (typeof name !== 'string' || !/^[a-zA-Z0-9_.\/-]+$/.test(name)
        || name.startsWith('/') || name.split('/').some(part => !part || part === '.' || part === '..')) throw new Error('Unsafe release file path');
    const target = path.resolve(root, name);
    if (!target.startsWith(path.resolve(root) + path.sep)) throw new Error('Release file leaves package directory');
    for (let current = target; current !== path.resolve(root); current = path.dirname(current)) {
        if (fs.lstatSync(current).isSymbolicLink()) throw new Error('Release files must not be symbolic links');
    }
    if (!fs.statSync(target).isFile()) throw new Error('Release file is not regular');
    return target;
}

function verify(root, installed) {
    const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
    assert.equal(manifest.name, 'dfacm-ai-watch'); assert.equal(manifest.version, '0.1.0');
    assert.deepEqual(manifest.runtimeFiles, [...RUNTIME_FILES]);
    assert.ok(manifest.files && !Array.isArray(manifest.files) && typeof manifest.files === 'object');
    for (const name of RUNTIME_FILES) assert.ok(manifest.files[name], 'Missing runtime file');
    for (const [name, expected] of Object.entries(manifest.files)) {
        const file = relativeFile(root, name);
        assert.match(expected.sha256, /^[a-f0-9]{64}$/); assert.equal(hash(file), expected.sha256, `Hash mismatch: ${name}`);
        assert.equal(fs.statSync(file).size, expected.bytes, `Size mismatch: ${name}`);
    }
    if (installed) for (const name of RUNTIME_FILES) {
        const file = relativeFile(installed, name);
        assert.equal(hash(file), manifest.files[name].sha256, `Installed file mismatch: ${name}`);
    }
    return { files: Object.keys(manifest.files).length, runtimeFiles: RUNTIME_FILES.length };
}

function versions(hydroPackage) {
    const parent = path.dirname(hydroPackage);
    const uiPackage = path.join(parent, '@hydrooj/ui-default');
    const hydro = JSON.parse(fs.readFileSync(path.join(hydroPackage, 'package.json'), 'utf8'));
    const ui = JSON.parse(fs.readFileSync(path.join(uiPackage, 'package.json'), 'utf8'));
    assert.equal(hydro.name, 'hydrooj'); assert.equal(hydro.version, '5.0.7', 'Hydro version differs from the supported site baseline');
    assert.equal(ui.version, '4.58.5', 'ui-default version differs from the supported site baseline');
    const [major, minor] = process.versions.node.split('.').map(Number);
    assert.ok(major > 22 || (major === 22 && minor >= 13), 'Node.js 22.13 or newer required; do not upgrade automatically');
    return { node: process.versions.node, hydro: hydro.version, ui: ui.version,
        hydroPackageHash: hash(path.join(hydroPackage, 'package.json')), uiPackageHash: hash(path.join(uiPackage, 'package.json')) };
}

async function preflight(root, hydroPackage) {
    verify(root); const baseline = versions(hydroPackage);
    const esbuild = require(path.join(path.dirname(hydroPackage), 'esbuild'));
    esbuild.buildSync({ entryPoints: [path.join(root, 'index.ts')], platform: 'node', format: 'cjs',
        bundle: true, write: false, external: ['hydrooj'], tsconfigRaw: { compilerOptions: { experimentalDecorators: true } } });
    for (const name of RUNTIME_FILES.filter(file => file.endsWith('.cjs') || file.endsWith('.js'))) {
        const checked = spawnSync(process.execPath, ['--check', path.join(root, name)], { encoding: 'utf8' });
        assert.equal(checked.status, 0, `Syntax check failed: ${name}`);
    }
    const tests = fs.readdirSync(path.join(root, 'tests')).filter(file => file.endsWith('.test.cjs')).sort();
    const checked = spawnSync(process.execPath, ['--test', ...tests.map(file => path.join(root, 'tests', file))], { encoding: 'utf8' });
    fs.writeFileSync(path.join(root, 'server-unit-tests.log'), checked.stdout + checked.stderr, { mode: 0o600 });
    assert.equal(checked.status, 0, 'Server unit tests failed; see server-unit-tests.log');
    fs.writeFileSync(path.join(root, 'version-baseline.json'), JSON.stringify(baseline), { mode: 0o600 });
    console.log(JSON.stringify({ phase: 'staged', ...baseline, nativeBuild: true, unitTests: true }));
}

function processes(raw) {
    return JSON.parse(raw).filter(item => ['hydrooj', 'hydrojudge'].includes(item.name)).map(item => ({
        name: item.name, pmId: item.pm_id, pid: item.pid, status: item.pm2_env.status, restarts: item.pm2_env.restart_time,
    }));
}

function registration(beforeFile, currentFile, destination) {
    const before = JSON.parse(fs.readFileSync(beforeFile, 'utf8')); const current = JSON.parse(fs.readFileSync(currentFile, 'utf8'));
    assert.ok(Array.isArray(before) && Array.isArray(current));
    assert.deepEqual(current.filter(item => item !== destination), before.filter(item => item !== destination), 'Other addon registrations changed');
    assert.equal(current.filter(item => item === destination).length, 1, 'AI watch registration missing or duplicated');
}

module.exports = { RUNTIME_FILES, hash, relativeFile, verify, versions, preflight, processes, registration };

if (require.main === module) (async () => {
    const [mode, ...args] = process.argv.slice(2);
    if (mode === 'verify') console.log(JSON.stringify(verify(...args)));
    else if (mode === 'preflight') await preflight(...args);
    else if (mode === 'registration') { registration(...args); console.log('Addon registration preserved.'); }
    else if (mode === 'processes') {
        let raw = ''; for await (const chunk of process.stdin) raw += chunk;
        console.log(JSON.stringify(processes(raw)));
    } else if (mode === 'native-command') {
        const [root, hydroPackage, phase] = args;
        console.log(`await require(${JSON.stringify(path.join(root, 'scripts/check-native.cjs'))})(require(${JSON.stringify(path.join(hydroPackage, 'src/plugin-api'))}),${JSON.stringify(root)},${JSON.stringify(phase || 'staged')})`);
    } else if (mode === 'live-command') {
        const [root, hydroPackage] = args;
        console.log(`await require(${JSON.stringify(path.join(root, 'scripts/check-live.cjs'))})(require(${JSON.stringify(path.join(hydroPackage, 'src/plugin-api'))}),${JSON.stringify(root)})`);
    } else if (mode === 'postcheck') {
        const [root, hydroPackage, beforeProcesses, afterProcesses] = args;
        assert.deepEqual(versions(hydroPackage), JSON.parse(fs.readFileSync(path.join(root, 'version-baseline.json'), 'utf8')), 'Dependencies changed');
        const before = JSON.parse(fs.readFileSync(beforeProcesses, 'utf8')); const after = JSON.parse(fs.readFileSync(afterProcesses, 'utf8'));
        assert.ok(after.some(item => item.name === 'hydrooj')); assert.ok(after.every(item => item.status === 'online'));
        assert.deepEqual(after.filter(item => item.name === 'hydrojudge'), before.filter(item => item.name === 'hydrojudge'), 'Judge service changed');
        console.log('Hydro online; judge process and dependency versions preserved.');
    } else throw new Error('Unknown deployment check');
})().catch(error => { console.error(`AI watch deployment check failed: ${error.message}`); process.exitCode = 1; });
