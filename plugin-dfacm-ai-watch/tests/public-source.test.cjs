'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const { violations, scanPublic } = require('../scripts/check-public.cjs');
const { PUBLIC_FILES } = require('../scripts/public-files.cjs');
const plugin = path.resolve(__dirname, '..');

function fixture() {
    const parent = fs.realpathSync(os.tmpdir());
    const root = fs.mkdtempSync(path.join(parent, 'hydro-ai-watch-public-test-'));
    for (const file of PUBLIC_FILES) {
        const target = path.join(root, file);
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.copyFileSync(path.join(plugin, file), target);
    }
    return { root, cleanup() {
        const resolved = fs.realpathSync(root);
        assert.equal(path.dirname(resolved), parent);
        assert.ok(path.basename(resolved).startsWith('hydro-ai-watch-public-test-'));
        fs.rmSync(resolved, { recursive: true, force: true });
    } };
}

function git(root, args) {
    const result = spawnSync('git', args, { cwd: root, encoding: 'utf8', env: {
        ...process.env, GIT_AUTHOR_NAME: 'test', GIT_COMMITTER_NAME: 'test',
        GIT_AUTHOR_EMAIL: 'test@users.noreply.github.com', GIT_COMMITTER_EMAIL: 'test@users.noreply.github.com',
    } });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout;
}

test('public source scanner rejects credential and deployment canaries while allowing reserved examples', () => {
    const samples = [
        ['private key', '-----BEGIN ' + 'OPENSSH PRIVATE KEY-----'],
        ['GitHub credential', 'gh' + 'p_' + 'A'.repeat(36)],
        ['API credential', 'sk' + '-proj-' + 'a'.repeat(36)],
        ['cloud credential', 'AK' + 'IA' + 'A'.repeat(16)],
        ['credential connection string', 'mongodb:' + '//user:secret@localhost/database'],
        ['personal home path', 'C:' + '\\Users\\developer\\project'],
        ['public or private IPv4 address', [10, 42, 7, 9].join('.')],
        ['real server backup path', '/root/backups/ai-watch-before.' + 'Ab12Cd34'],
        ['email address', 'person' + '@private.test'],
        ['unapproved service address', 'https:' + '//private-oj.test/record/123'],
    ];
    for (const [category, sample] of samples) assert.ok(violations(sample).includes(category), category);
    assert.deepEqual(violations('http://127.0.0.1:4177/manage/ai-watch https://oj.example.org /root/backups/ai-watch-before.XXXXXXXX'), []);
    assert.deepEqual(violations('test@users.noreply.github.com contact@example.com'), []);
});

test('Git ignore rules exclude private files while the blank env example and code remain public', () => {
    const f = fixture();
    try {
        git(f.root, ['init', '--initial-branch=main']);
        const privatePaths = ['.env', '.env.production', '.ssh/id_ed25519', 'deploy.secret', 'session.token',
            'credentials.json', 'qa/results.json', 'screenshots/private.png', 'data/records.bson', 'dump.pm2',
            'version-baseline.json', 'native-staged-ok.json', 'dist/release/result.tar.gz', 'scripts/operator.secret',
            'CODELY.md', 'AGENTS.md', 'node_modules/package/index.js'];
        for (const file of privatePaths) {
            const result = spawnSync('git', ['check-ignore', '--no-index', '-q', file], { cwd: f.root });
            assert.equal(result.status, 0, 'Not ignored: ' + file);
        }
        for (const file of ['.env.example', 'index.ts', 'scripts/install.sh', '.github/workflows/ci.yml']) {
            const result = spawnSync('git', ['check-ignore', '--no-index', '-q', file], { cwd: f.root });
            assert.equal(result.status, 1, 'Public file was ignored: ' + file);
        }
    } finally { f.cleanup(); }
});

test('Git privacy check detects forced private files, staged secrets and old secret history', () => {
    const f = fixture();
    try {
        git(f.root, ['init', '--initial-branch=main']);
        git(f.root, ['config', 'commit.gpgsign', 'false']);
        git(f.root, ['add', '--', ...PUBLIC_FILES]);
        git(f.root, ['commit', '-m', 'Initial public source']);
        assert.equal(scanPublic(f.root, { git: true }).passed, true);
        fs.writeFileSync(path.join(f.root, '.env'), 'PRIVATE=1\n');
        git(f.root, ['add', '-f', '.env']);
        assert.ok(scanPublic(f.root, { git: true }).issues.some(item => item.file === '.env'));
        git(f.root, ['reset', '--', '.env']);
        const original = fs.readFileSync(path.join(f.root, 'README.md'), 'utf8');
        fs.writeFileSync(path.join(f.root, 'README.md'), original + '\n' + 'gh' + 'p_' + 'A'.repeat(36));
        git(f.root, ['add', 'README.md']);
        fs.writeFileSync(path.join(f.root, 'README.md'), original);
        assert.ok(scanPublic(f.root, { git: true }).issues.some(item => item.file === 'index:README.md'));
        git(f.root, ['commit', '-m', 'Synthetic history canary']);
        git(f.root, ['add', 'README.md']);
        git(f.root, ['commit', '-m', 'Remove synthetic canary']);
        assert.ok(scanPublic(f.root, { git: true }).issues.some(item => item.file === 'history:README.md'));
    } finally { f.cleanup(); }
});
