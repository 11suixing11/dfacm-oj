import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

// Test only temporary fixtures and mock commands; no installed OJ is used.
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// Windows sandbox permits new directories in the workspace root, not this checkout.
const fixtureParent = process.env.TEST_TMPDIR || (process.platform === 'win32' ? path.dirname(repo) : os.tmpdir());
function findBash() {
  if (process.env.TEST_BASH) return process.env.TEST_BASH;
  if (process.platform !== 'win32') return 'bash';
  const home = process.env.USERPROFILE ? path.join(process.env.USERPROFILE, 'AppData/Local/Programs') : '';
  const candidates = [
    process.env.ProgramFiles && path.join(process.env.ProgramFiles, 'Git/bin/bash.exe'),
    process.env['ProgramFiles(x86)'] && path.join(process.env['ProgramFiles(x86)'], 'Git/bin/bash.exe'),
    home && path.join(home, 'Git/bin/bash.exe'),
    'C:\\Program Files\\Git\\bin\\bash.exe',
    'C:\\Program Files (x86)\\Git\\bin\\bash.exe',
    'D:\\Git\\bin\\bash.exe',
  ].filter(Boolean);
  for (const candidate of candidates) if (fs.existsSync(candidate)) return candidate;
  // Prefer a Git Bash found on PATH; WSL bash cannot use the /c/... fixture paths.
  for (const dir of (process.env.PATH || '').split(path.delimiter)) {
    if (!/git/i.test(dir)) continue;
    const candidate = path.join(dir, 'bash.exe');
    if (fs.existsSync(candidate)) return candidate;
  }
  throw new Error('bash not found: install Git for Windows or set TEST_BASH to a Git Bash executable');
}
const bash = findBash();
const root = fs.mkdtempSync(path.join(fs.realpathSync(fixtureParent), '.deployment-test-'));
test.after(() => fs.rmSync(root, { recursive: true, force: true }));
const unixPath = (value) => process.platform === 'win32'
  ? value.replace(/\\/g, '/').replace(/^([A-Za-z]):/, (_, letter) => `/${letter.toLowerCase()}`)
  : value;
const home = path.join(root, 'home with spaces');
const output = path.join(root, 'backups with spaces');
const commands = path.join(root, 'commands');
const hydroBin = path.join(root, 'packages/hydrooj/bin');
const judgeBin = path.join(root, 'packages/hydrojudge/bin');
const log = path.join(root, 'command.log');
const caddy = path.join(root, 'Caddyfile');
for (const dir of [home, commands, hydroBin, judgeBin, path.join(home, '.hydro/custom'), path.join(home, '.config/hydro')]) {
  fs.mkdirSync(dir, { recursive: true });
}
fs.writeFileSync(path.join(home, '.hydro/config.json'), '{"name":"hydro"}\n');
fs.writeFileSync(path.join(home, '.hydro/custom/home.html'), 'fixture landing\n');
fs.writeFileSync(path.join(home, '.hydro/addon.json'), '[]\n');
fs.writeFileSync(path.join(home, '.config/hydro/settings.json'), '{}\n');
fs.writeFileSync(path.join(hydroBin, '../package.json'), '{"name":"hydrooj","version":"5.0.7"}\n');
fs.writeFileSync(path.join(judgeBin, '../package.json'), '{"name":"hydrojudge","version":"fixture"}\n');
fs.writeFileSync(caddy, 'localhost { respond "fixture" }\n');
fs.writeFileSync(log, '');
const script = (dir, name, body) => fs.writeFileSync(path.join(dir, name), `#!/usr/bin/env bash\n${body}\n`, { mode: 0o755 });
script(commands, 'flock', '[[ ${TEST_LOCK_FAIL:-0} != 1 ]]');
script(commands, 'pgrep', '[[ ${TEST_PROCESS_MISSING:-0} != 1 ]]');
script(commands, 'tar', 'if [[ ${TEST_TAR_FAIL:-0} != 0 ]]; then exit "$TEST_TAR_FAIL"; fi\nexec /usr/bin/tar "$@"');
script(commands, 'caddy', `printf 'caddy %s\\n' "$*" >> "$TEST_COMMAND_LOG"
case "$1" in
  version) printf 'v2.fixture\\n' ;;
  adapt) printf '{"fixture":"config-secret-value"}\\n'; exit "\${TEST_CADDY_EXIT:-0}" ;;
  *) exit 98 ;;
esac`);
script(commands, 'curl', `printf 'curl GET\\n' >> "$TEST_COMMAND_LOG"
if [[ \${TEST_HTTP_FAIL:-0} != 0 ]]; then exit "$TEST_HTTP_FAIL"; fi
printf 'HTTP/2 %s\\r\\nCache-Control: %s\\r\\nSet-Cookie: fixture-private-token\\r\\n\\r\\n' "\${TEST_HTTP_STATUS:-200}" "\${TEST_HTTP_CACHE:-no-cache}"`);
script(hydroBin, 'hydrooj', `printf 'hydrooj %s\\n' "$*" >> "$TEST_COMMAND_LOG"
[[ "$*" == 'backup --withAddons' ]] || exit 98
printf 'mongodb://fixture-secret-password@localhost/hydro\\n'
if [[ \${TEST_HYDRO_EXIT:-0} != 0 ]]; then exit "$TEST_HYDRO_EXIT"; fi
case \${TEST_ZIP_MODE:-success} in
  success) cp "$TEST_BACKUP_FIXTURE" backup-fixture.zip ;;
  missing) : ;;
  corrupt) printf 'not a zip' > backup-fixture.zip ;;
esac`);
script(judgeBin, 'hydrojudge', 'printf "UNEXPECTED hydrojudge CLI\\n" >> "$TEST_COMMAND_LOG"; exit 98');

// A real uncompressed ZIP exercises the system unzip integrity check.
function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function zip(entries) {
  const files = [], central = [];
  let offset = 0;
  for (const [filename, text] of entries) {
    const name = Buffer.from(filename), data = Buffer.from(text), crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4);
    local.writeUInt32LE(crc, 14); local.writeUInt32LE(data.length, 18); local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    const record = Buffer.alloc(46);
    record.writeUInt32LE(0x02014b50, 0); record.writeUInt16LE(20, 4); record.writeUInt16LE(20, 6);
    record.writeUInt32LE(crc, 16); record.writeUInt32LE(data.length, 20); record.writeUInt32LE(data.length, 24);
    record.writeUInt16LE(name.length, 28); record.writeUInt32LE(offset, 42);
    files.push(local, name, data); central.push(record, name);
    offset += local.length + name.length + data.length;
  }
  const directory = Buffer.concat(central), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directory.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...files, directory, end]);
}
const fixture = path.join(root, 'fixture.zip');
fs.writeFileSync(fixture, zip([['dump/hydro/user.bson', 'fixture'], ['file/example.in', '1 2\n']]));
const env = {
  ...process.env,
  HOME: unixPath(home), HYDRO_PROFILE: '',
  TEST_BIN: unixPath(commands), TEST_HYDRO_BIN: unixPath(hydroBin), TEST_JUDGE_BIN: unixPath(judgeBin),
  TEST_COMMAND_LOG: unixPath(log), TEST_BACKUP_FIXTURE: unixPath(fixture),
};
function run(name, args = [], overrides = {}) {
  return spawnSync(bash, ['-c', 'export PATH="$TEST_BIN:$TEST_HYDRO_BIN:$TEST_JUDGE_BIN:$PATH"; exec bash "$TEST_SCRIPT" "$@"', '_', ...args], {
    env: { ...env, TEST_SCRIPT: unixPath(path.join(repo, 'scripts', name)), ...overrides }, encoding: 'utf8',
  });
}
const backupArgs = ['--output-dir', unixPath(output), '--caddy-config', unixPath(caddy)];
const checkArgs = ['--data-dir', unixPath(home), '--caddy-config', unixPath(caddy)];

test('backup creates a complete bundle, preserves an old copy, and hides credential logs', () => {
  fs.mkdirSync(output, { recursive: true });
  fs.writeFileSync(path.join(output, 'keep-old-backup.txt'), 'keep');
  const result = run('backup-hydro.sh', backupArgs);
  assert.equal(result.status, 0, result.stderr);
  assert.doesNotMatch(result.stdout + result.stderr, /fixture-secret-password/);
  assert.equal(fs.readFileSync(path.join(output, 'keep-old-backup.txt'), 'utf8'), 'keep');
  const complete = fs.readdirSync(output).filter(name => name.startsWith('backup-'));
  assert.equal(complete.length, 1);
  const bundle = path.join(output, complete[0]);
  for (const name of ['backup-fixture.zip', 'hydro-state.tar.gz', 'runtime-config.tar.gz', 'Caddyfile', 'SHA256SUMS', 'manifest.txt']) {
    assert.ok(fs.statSync(path.join(bundle, name)).size > 0, name);
  }
  const verification = spawnSync(bash, ['-c', 'cd "$TEST_BUNDLE" && sha256sum -c SHA256SUMS'], {
    env: { ...env, TEST_BUNDLE: unixPath(bundle) }, encoding: 'utf8',
  });
  assert.equal(verification.status, 0, verification.stderr);
});

test('Hydro failure code propagates and incomplete diagnostics do not expose credentials', () => {
  const result = run('backup-hydro.sh', backupArgs, { TEST_HYDRO_EXIT: '23' });
  assert.equal(result.status, 23, result.stderr);
  assert.match(result.stderr, /incomplete files retained/);
  assert.doesNotMatch(result.stdout + result.stderr, /fixture-secret-password/);
});

test('missing or corrupt ZIP and configuration archive failures never report success', () => {
  assert.equal(run('backup-hydro.sh', backupArgs, { TEST_ZIP_MODE: 'missing' }).status, 65);
  assert.notEqual(run('backup-hydro.sh', backupArgs, { TEST_ZIP_MODE: 'corrupt' }).status, 0);
  const incomplete = path.join(root, 'database-only.zip');
  fs.writeFileSync(incomplete, zip([['dump/hydro/user.bson', 'fixture']]));
  assert.equal(run('backup-hydro.sh', backupArgs, { TEST_BACKUP_FIXTURE: unixPath(incomplete) }).status, 65);
  assert.equal(run('backup-hydro.sh', backupArgs, { TEST_TAR_FAIL: '37' }).status, 37);
});

test('busy lock and recursive output directory are refused', () => {
  assert.equal(run('backup-hydro.sh', backupArgs, { TEST_LOCK_FAIL: '1' }).status, 75);
  assert.equal(run('backup-hydro.sh', ['--output-dir', unixPath(path.join(home, '.hydro/backups')), '--caddy-config', unixPath(caddy)]).status, 64);
});

test('backup refuses an output directory inside the Hydro file store', () => {
  const fileStore = path.join(root, 'filestore');
  const result = run('backup-hydro.sh', [
    '--output-dir', unixPath(path.join(fileStore, 'backups')),
    '--file-store', unixPath(fileStore),
    '--caddy-config', unixPath(caddy),
  ]);
  assert.equal(result.status, 64, result.stderr);
  assert.match(result.stderr, /file store/);
});

test('default checks read package metadata without starting CLIs or making GETs', () => {
  const previous = fs.readFileSync(log, 'utf8').length;
  const result = run('check-deployment.sh', checkArgs);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /hydrooj: 5\.0\.7/);
  assert.doesNotMatch(result.stdout + result.stderr, /config-secret-value/);
  const added = fs.readFileSync(log, 'utf8').slice(previous);
  assert.doesNotMatch(added, /hydrooj|hydrojudge|curl|restart|reload|validate/);
  assert.match(added, /caddy adapt/);
});

test('missing processes and failed Caddy adaptation fail the deployment check', () => {
  assert.equal(run('check-deployment.sh', checkArgs, { TEST_PROCESS_MISSING: '1' }).status, 1);
  assert.equal(run('check-deployment.sh', checkArgs, { TEST_CADDY_EXIT: '17' }).status, 1);
});

test('HTTP is opt-in, uses GET, and does not print session headers', () => {
  const result = run('check-deployment.sh', [...checkArgs, '--url', 'https://fixture.example']);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /GET \/: 200, no-cache/);
  assert.doesNotMatch(result.stdout + result.stderr, /fixture-private-token/);
  assert.equal(run('check-deployment.sh', [...checkArgs, '--url', 'https://fixture.example'], { TEST_HTTP_FAIL: '17' }).status, 1);
  assert.equal(run('check-deployment.sh', [...checkArgs, '--url', 'https://fixture.example'], { TEST_HTTP_STATUS: '403' }).status, 1);
  assert.equal(run('check-deployment.sh', [...checkArgs, '--url', 'https://fixture.example'], { TEST_HTTP_CACHE: 'max-age=604800' }).status, 1);
});

test('judge role accepts a hydrojudge host without hydrooj, config.json or /data', () => {
  const judgeRoot = fs.mkdtempSync(path.join(fs.realpathSync(fixtureParent), '.deployment-judge-'));
  const judgeHome = path.join(judgeRoot, 'home');
  const judgeCommands = path.join(judgeRoot, 'commands');
  const judgePackageBin = path.join(judgeRoot, 'packages/hydrojudge/bin');
  for (const dir of [path.join(judgeHome, '.hydro'), judgeCommands, judgePackageBin]) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(judgeHome, '.hydro/judge.yaml'), 'mongo: fixture\n');
  fs.writeFileSync(path.join(judgePackageBin, '../package.json'), '{"name":"hydrojudge","version":"4.0.6"}\n');
  script(judgePackageBin, 'hydrojudge', 'exit 0');
  script(judgeCommands, 'pgrep', 'exit 0');
  try {
    const result = run('check-deployment.sh', ['--role', 'judge'], {
      HOME: unixPath(judgeHome),
      TEST_BIN: unixPath(judgeCommands),
      TEST_HYDRO_BIN: unixPath(judgeRoot),
      TEST_JUDGE_BIN: unixPath(judgePackageBin),
    });
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /hydrojudge: 4\.0\.6/);
    assert.match(result.stdout, /config readable: .*judge\.yaml/);
    assert.doesNotMatch(result.stdout, /config\.json/);
  } finally {
    fs.rmSync(judgeRoot, { recursive: true, force: true });
  }
});
