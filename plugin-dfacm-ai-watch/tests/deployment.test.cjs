'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const { RUNTIME_FILES, verify, versions, registration } = require('../scripts/deployment.cjs');
const plugin = path.resolve(__dirname, '..');

function fixture() {
    const parent = fs.realpathSync(os.tmpdir()); const root = fs.mkdtempSync(path.join(parent, 'dfacm-ai-watch-package-test-'));
    return { root, cleanup() {
        const resolved = fs.realpathSync(root);
        assert.equal(path.dirname(resolved), parent); assert.ok(path.basename(resolved).startsWith('dfacm-ai-watch-package-test-'));
        fs.rmSync(resolved, { recursive: true, force: true });
    } };
}

test('release archive verifies runtime hashes and rejects damaged files and path traversal', () => {
    const f = fixture();
    try {
        const result = spawnSync(process.execPath, [path.join(plugin, 'scripts/package.cjs'), f.root], { encoding: 'utf8' });
        assert.equal(result.status, 0, result.stderr); const release = JSON.parse(result.stdout);
        const root = path.join(path.dirname(release.artifact), 'dfacm-ai-watch');
        assert.equal(verify(root).runtimeFiles, RUNTIME_FILES.length);
        assert.ok(fs.existsSync(path.join(root, 'time.cjs')), 'time helper must ship');
        fs.renameSync(path.join(root, 'time.cjs'), path.join(root, 'time.saved'));
        assert.throws(() => verify(root));
        fs.renameSync(path.join(root, 'time.saved'), path.join(root, 'time.cjs'));
        const listing = spawnSync(process.platform === 'win32' ? 'tar.exe' : 'tar', ['-tzf', release.artifact], { encoding: 'utf8' });
        assert.equal(listing.status, 0); assert.match(listing.stdout, /dfacm-ai-watch\/scripts\/install.sh/);
        assert.equal(listing.stdout.includes('node_modules/'), false); assert.equal(listing.stdout.includes('.ssh/'), false);
        fs.writeFileSync(path.join(root, 'native-staged.log'), 'private deployment output');
        fs.writeFileSync(path.join(root, 'scripts/operator.secret'), 'local only');
        fs.writeFileSync(path.join(root, 'public/private-result.json'), 'real user evidence');
        fs.writeFileSync(path.join(root, 'tests/local-session.json'), 'private session');
        const rebuilt = spawnSync(process.execPath, [path.join(root, 'scripts/package.cjs'), path.join(f.root, 'repacked')], { encoding: 'utf8' });
        assert.equal(rebuilt.status, 0, rebuilt.stderr);
        const rebuiltRoot = path.join(path.dirname(JSON.parse(rebuilt.stdout).artifact), 'dfacm-ai-watch');
        assert.equal(verify(rebuiltRoot).runtimeFiles, RUNTIME_FILES.length);
        assert.equal(fs.existsSync(path.join(rebuiltRoot, 'native-staged.log')), false);
        assert.equal(fs.existsSync(path.join(rebuiltRoot, 'scripts/operator.secret')), false);
        assert.equal(fs.existsSync(path.join(rebuiltRoot, 'public/private-result.json')), false);
        assert.equal(fs.existsSync(path.join(rebuiltRoot, 'tests/local-session.json')), false);
        assert.equal(fs.existsSync(path.join(rebuiltRoot, 'LICENSE')), true);
        assert.equal(JSON.parse(fs.readFileSync(path.join(rebuiltRoot, 'manifest.json'), 'utf8')).files['manifest.json'], undefined);
        const file = path.join(root, 'engine.cjs'); const text = fs.readFileSync(file, 'utf8');
        fs.writeFileSync(file, text + '\n// damaged transfer\n'); assert.throws(() => verify(root), /Hash mismatch/); fs.writeFileSync(file, text);
        const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
        manifest.files['../outside'] = { sha256: '0'.repeat(64), bytes: 0 };
        fs.writeFileSync(path.join(root, 'manifest.json'), JSON.stringify(manifest)); assert.throws(() => verify(root), /Unsafe release file path/);
    } finally { f.cleanup(); }
});

test('deployment rejects a different installed Hydro or UI version instead of upgrading packages', () => {
    const f = fixture();
    try {
        const hydro = path.join(f.root, 'node_modules/hydrooj'); const ui = path.join(f.root, 'node_modules/@hydrooj/ui-default');
        fs.mkdirSync(hydro, { recursive: true }); fs.mkdirSync(ui, { recursive: true });
        fs.writeFileSync(path.join(hydro, 'package.json'), JSON.stringify({ name: 'hydrooj', version: '5.0.7' }));
        fs.writeFileSync(path.join(ui, 'package.json'), JSON.stringify({ version: '4.58.5' }));
        assert.equal(versions(hydro).hydro, '5.0.7');
        fs.writeFileSync(path.join(ui, 'package.json'), JSON.stringify({ version: '4.59.0' }));
        assert.throws(() => versions(hydro), /ui-default version differs/);
        assert.equal(JSON.parse(fs.readFileSync(path.join(ui, 'package.json'), 'utf8')).version, '4.59.0');
    } finally { f.cleanup(); }
});

test('registration check rejects loss or reordering of existing addons and duplicate AI watch registration', () => {
    const f = fixture();
    try {
        const before = path.join(f.root, 'before.json'); const after = path.join(f.root, 'after.json'); const addon = '/root/.hydro/addons/dfacm-ai-watch';
        fs.writeFileSync(before, JSON.stringify(['assistant', 'train', 'shop']));
        fs.writeFileSync(after, JSON.stringify(['assistant', 'train', 'shop', addon])); registration(before, after, addon);
        for (const changed of [['assistant', 'shop', addon], ['train', 'assistant', 'shop', addon], ['assistant', 'train', 'shop', addon, addon]]) {
            fs.writeFileSync(after, JSON.stringify(changed)); assert.throws(() => registration(before, after, addon));
        }
    } finally { f.cleanup(); }
});
