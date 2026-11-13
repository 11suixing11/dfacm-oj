import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import vm from 'node:vm';
import { createRequire } from 'node:module';

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
  version) printf '%s\\n' "\${TEST_CADDY_VERSION:-v2.11.4 h1:fixture-hash}" ;;
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
    env: { ...env, TEST_SCRIPT: unixPath(path.join(repo, 'scripts', name)), ...overrides }, encoding: 'utf8', timeout: 30000,
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
    env: { ...env, TEST_BUNDLE: unixPath(bundle) }, encoding: 'utf8', timeout: 30000,
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

test('Caddy below the documented minimum version fails the deployment check', () => {
  const result = run('check-deployment.sh', checkArgs, { TEST_CADDY_VERSION: 'v2.8.4 h1:old-build' });
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.match(result.stdout + result.stderr, /below the required minimum 2\.9\.1/);
});

test('an unparsable Caddy version does not fail the deployment check', () => {
  const result = run('check-deployment.sh', checkArgs, { TEST_CADDY_VERSION: 'custom build' });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /unparsed/);
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

test('clean-auth-entries.js installs a one-line script with embed-free escape routes', () => {
  const source = fs.readFileSync(path.join(repo, 'deploy', 'clean-auth-entries.js'), 'utf8');
  const installer = new Function('db', 'print', 'quit', source);
  const runInstall = (existing) => {
    const installed = [];
    const db = {
      system: {
        findOne: () => ({ value: existing }),
        updateOne: (filter, update) => installed.push(update.$set.value),
      },
    };
    installer(db, () => {}, () => { throw new Error('quit called'); });
    assert.equal(installed.length, 1);
    return installed[0];
  };
  // Fresh install and replacement of a previous mark both end with exactly
  // one block: the marker comment plus the script line.
  const fresh = runInstall('<li>footer item</li>');
  const replaced = runInstall('stale\n<!-- swpu-clean-auth -->\n<script>/* swpu-clean-auth */old()</script>');
  for (const value of [fresh, replaced]) {
    assert.equal(value.includes('stale'), value === replaced);
    assert.equal((value.match(/swpu-clean-auth/g) || []).length, 2);
    const scriptLine = value.split('\n').filter((line) => line.startsWith('<script>'));
    assert.equal(scriptLine.length, 1);
    // Hydro shreds multi-line scripts into inert <ol> items.
    assert.doesNotMatch(scriptLine[0], /\n/);
  }
  const script = fresh.split('\n').find((line) => line.startsWith('<script>'));
  // Loading state is usable before the iframe reveals anything.
  assert.match(script, /swpu-auth-loading/);
  assert.match(script, /swpu-auth-direct/);
  assert.match(script, /swpu-auth-close/);
  // The escape link must not carry the embed flag: a top-level page booted in
  // iframe mode has no host for the in-card close/success postMessage.
  assert.match(script, /direct\.href=topUrl/);
  assert.match(script, /fallback\.href=topUrl/);
  assert.match(script, /var topUrl='\/reg\?tab=pwd&return='/);
  assert.doesNotMatch(script, /fallback\.href=url/);
  assert.doesNotMatch(script, /direct\.href=url/);
  // The iframe is only revealed for the real /reg page, not any same-URL
  // Caddy/Hydro error document. Passwordless single-flow UI: #m-mail is the
  // always-present email input (the old #tab-reg marker is gone with the tabs).
  assert.match(script, /getElementById\('m-mail'\)/);
  assert.doesNotMatch(script, /d\.body\}/);
  // The gate depends on that marker existing in reg.html — lock the cross-file
  // wiring so a rename cannot silently break the overlay.
  const page = fs.readFileSync(path.join(repo, 'plugin-dfacm-regcode', 'reg.html'), 'utf8');
  assert.match(page, /id="m-mail"/);
  // The payload must be syntactically valid browser JavaScript.
  new Function(script.replace(/^<script>/, '').replace(/<\/script>$/, ''));
});

function themeFixture() {
  const directory = fs.mkdtempSync(path.join(root, 'theme-'));
  const backupDir = fs.mkdtempSync(path.join(root, 'theme-bak-'));
  const files = Object.fromEntries(['STATIC_THEME', 'SOURCE_THEME', 'STATIC_SW', 'SOURCE_SW']
    .map((key) => [key, path.join(directory, key + (key.endsWith('THEME') ? '.css' : '.js'))]));
  // No trailing newline: typical minified upstream assets must survive reinstallation.
  for (const [key, filename] of Object.entries(files)) fs.writeFileSync(filename, key.endsWith('THEME') ? 'body{color:blue}' : 'originalWorker()');
  return {
    directory,
    backupDir,
    files,
    overrides: {
      ...Object.fromEntries(Object.entries(files).map(([key, filename]) => [key, unixPath(filename)])),
      BACKUP_DIR: unixPath(backupDir),
    },
  };
}

// Every file Caddy publishes from /root/.hydro/static is reachable over HTTP, so
// a *.bak-* file sitting next to it is a public download. install-theme.sh must
// keep its backups outside the asset tree.
test('theme backups are written outside the served asset directory', () => {
  const fixture = themeFixture();
  const result = run('../deploy/install-theme.sh', [], fixture.overrides);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const inServedDir = fs.readdirSync(fixture.directory).filter((n) => n.includes('.bak-'));
  assert.deepEqual(inServedDir, [], 'no backup may land next to a served asset');
  assert.deepEqual(fs.readdirSync(fixture.directory).sort(), Object.values(fixture.files).map((f) => path.basename(f)).sort());
  assert.ok(fs.readdirSync(fixture.backupDir).length > 0, 'backups must exist somewhere');
});

// The interesting cases need paths that do not exist yet, which is the normal
// first-run situation: a guard that canonicalises with a bare `cd` yields an
// empty string there and then matches, or fails to match, unpredictably.
test('the BACKUP_DIR guard handles existing, nested and not-yet-created paths', () => {
  const fixture = themeFixture();
  const inside = (dir) => ({ ...fixture.overrides, BACKUP_DIR: unixPath(path.join(fixture.directory, dir)) });
  // Equal to a served directory: refused.
  for (const dir of ['', 'backups', 'deeply/nested']) {
    const result = run('../deploy/install-theme.sh', [], inside(dir));
    assert.equal(result.status, 66, `${dir || '<itself>'}: ${result.stdout}${result.stderr}`);
    assert.match(result.stderr, /inside the directory serving/);
  }
  // A path that does not exist yet, and sits outside every target: accepted.
  const outside = fs.mkdtempSync(path.join(root, 'theme-out-'));
  const fresh = path.join(outside, 'not', 'created', 'yet');
  const ok = run('../deploy/install-theme.sh', [], { ...fixture.overrides, BACKUP_DIR: unixPath(fresh) });
  assert.equal(ok.status, 0, `${ok.stdout}${ok.stderr}`);
  assert.ok(fs.existsSync(fresh));
  assert.ok(fs.readdirSync(fresh).length > 0);
});

test('theme deployment fails before mutation when any required target is absent', () => {
  for (const legacy of ['0', '1']) {
    const fixture = themeFixture();
    const missing = path.join(fixture.directory, 'missing.css');
    const result = run('../deploy/install-theme.sh', [], { ...fixture.overrides, SOURCE_THEME: unixPath(missing), SWPU_THEME_LEGACY: legacy });
    assert.equal(result.status, 66, result.stdout + result.stderr);
    assert.match(result.stderr, /required target missing/);
    assert.equal(fs.existsSync(missing), false);
    assert.equal(fs.readFileSync(fixture.files.STATIC_THEME, 'utf8'), 'body{color:blue}');
    assert.equal(fs.readdirSync(fixture.directory).length, 4);
  }
});

test('first and repeated theme installs preserve upstream CSS and unique backups', () => {
  const fixture = themeFixture();
  const first = run('../deploy/install-theme.sh', [], fixture.overrides);
  assert.equal(first.status, 0, first.stdout + first.stderr);
  const firstCss = fs.readFileSync(fixture.files.STATIC_THEME, 'utf8');
  assert.ok(firstCss.startsWith('body{color:blue}\n'));
  assert.equal([...firstCss.matchAll(/\/\* ==== DFACM brand overlay/g)].length, 1);
  const second = run('../deploy/install-theme.sh', [], fixture.overrides);
  assert.equal(second.status, 0, second.stdout + second.stderr);
  assert.equal(fs.readFileSync(fixture.files.STATIC_THEME, 'utf8'), firstCss);
  for (const [key, filename] of Object.entries(fixture.files)) {
    // Full paths are encoded into backup names, so the two same-basename theme
    // targets and the two service-worker targets stay distinguishable.
    const prefix = unixPath(filename).replace(/\//g, '_');
    const backups = fs.readdirSync(fixture.backupDir).filter((name) => name.startsWith(prefix + '.bak-'));
    assert.equal(backups.length, 2, `${key}: ${JSON.stringify(fs.readdirSync(fixture.backupDir))}`);
    assert.ok(backups.some((name) => fs.readFileSync(path.join(fixture.backupDir, name), 'utf8') === (key.endsWith('THEME') ? 'body{color:blue}' : 'originalWorker()')));
  }
  assert.equal(fs.readFileSync(fixture.files.STATIC_SW, 'utf8'), fs.readFileSync(path.join(repo, 'deploy/service-worker-killswitch.js'), 'utf8'));
});

test('theme deployment migrates the historical brand marker', () => {
  const fixture = themeFixture();
  const legacy = 'body{color:blue}\n/* ==== SWPU ACM brand overlay (legacy) ==== */\nold overlay\n';
  fs.writeFileSync(fixture.files.STATIC_THEME, legacy);
  fs.writeFileSync(fixture.files.SOURCE_THEME, legacy);
  const result = run('../deploy/install-theme.sh', [], fixture.overrides);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  for (const filename of [fixture.files.STATIC_THEME, fixture.files.SOURCE_THEME]) {
    const css = fs.readFileSync(filename, 'utf8');
    assert.equal(css.includes('SWPU ACM brand overlay'), false);
    assert.equal([...css.matchAll(/\/\* ==== DFACM brand overlay/g)].length, 1);
    assert.equal(css.startsWith('body{color:blue}\n'), true);
  }
});

test('old theme backups are pruned to the retention limit', () => {
  const fixture = themeFixture();
  for (let i = 0; i < 5; i++) assert.equal(run('../deploy/install-theme.sh', [], { ...fixture.overrides, SWPU_THEME_BACKUP_KEEP: '2' }).status, 0);
  const prefix = unixPath(fixture.files.STATIC_THEME).replace(/\//g, '_');
  const kept = fs.readdirSync(fixture.backupDir).filter((n) => n.startsWith(prefix + '.bak-'));
  assert.equal(kept.length, 2, JSON.stringify(kept));
  // Every target keeps its own quota: the four prefixes are distinct even
  // though two pairs share a basename.
  assert.equal(fs.readdirSync(fixture.backupDir).filter((n) => n.endsWith('.css.bak-') || n.includes('THEME.css.bak-')).length >= 4, true);
});

// Each target keeps its own quota, and pruning never reaches a file that is not
// one of its own backups.
test('pruning is scoped to the target it is pruning', () => {
  const dir = fs.mkdtempSync(path.join(root, 'theme-collide-'));
  const backupDir = fs.mkdtempSync(path.join(root, 'theme-collide-bak-'));
  const files = {
    STATIC_THEME: path.join(dir, 'a.css'),
    SOURCE_THEME: path.join(dir, 'b.css'),
    STATIC_SW: path.join(dir, 'sw.js'),
    SOURCE_SW: path.join(dir, 'service-worker.js'),
  };
  for (const [key, f] of Object.entries(files)) fs.writeFileSync(f, key.endsWith('THEME') ? 'body{color:blue}' : 'originalWorker()');
  const env = Object.fromEntries(Object.entries(files).map(([k, f]) => [k, unixPath(f)]));
  env.BACKUP_DIR = unixPath(backupDir);
  for (let i = 0; i < 4; i++) assert.equal(run('../deploy/install-theme.sh', [], { ...env, SWPU_THEME_BACKUP_KEEP: '3' }).status, 0);
  const all = fs.readdirSync(backupDir);
  // Exactly four targets, each keeping three: nothing extra was deleted and
  // nothing was left unbounded.
  assert.equal(all.length, 12, JSON.stringify(all));
  for (const [key, f] of Object.entries(files)) {
    const prefix = unixPath(f).replace(/\//g, '_') + '.bak-';
    const kept = all.filter((n) => n.startsWith(prefix));
    assert.equal(kept.length, 3, `${key}: ${JSON.stringify(all)}`);
  }
  // An unrelated file in the backup directory is never touched.
  fs.writeFileSync(path.join(backupDir, 'README-do-not-delete'), 'keep me');
  assert.equal(run('../deploy/install-theme.sh', [], { ...env, SWPU_THEME_BACKUP_KEEP: '1' }).status, 0);
  assert.equal(fs.existsSync(path.join(backupDir, 'README-do-not-delete')), true);
});

// A failure detected before any mutation must leave the asset tree pristine and
// must not create backups — there is nothing to roll back.
test('a pre-validation failure touches nothing at all', () => {
  const fixture = themeFixture();
  const missing = path.join(fixture.directory, 'missing.css');
  const result = run('../deploy/install-theme.sh', [], { ...fixture.overrides, SOURCE_SW: unixPath(missing) });
  assert.equal(result.status, 66, result.stdout + result.stderr);
  assert.doesNotMatch(result.stderr, /restoring/);
  for (const [key, filename] of Object.entries(fixture.files)) {
    const original = key.endsWith('THEME') ? 'body{color:blue}' : 'originalWorker()';
    assert.equal(fs.readFileSync(filename, 'utf8'), original, key);
  }
  assert.deepEqual(fs.readdirSync(fixture.directory).sort(), Object.values(fixture.files).map((f) => path.basename(f)).sort());
  assert.deepEqual(fs.readdirSync(fixture.backupDir), []);
});

// install-theme.sh used to have forward-only backups: a run that failed during
// verification left the server on a half-written theme with no way back.
test('a post-write verification failure rolls every file back', () => {
  const fixture = themeFixture();
  // An empty brand css makes the post-write marker check fail with exit 65,
  // after all four targets have already been rewritten.
  const brand = path.join(repo, 'theme', '00-brand.css');
  const original = fs.readFileSync(brand, 'utf8');
  fs.writeFileSync(brand, '/* no marker here */\n');
  try {
    const result = run('../deploy/install-theme.sh', [], fixture.overrides);
    assert.equal(result.status, 65, result.stdout + result.stderr);
    assert.match(result.stderr, /restoring 4 file\(s\)/);
    for (const [key, filename] of Object.entries(fixture.files)) {
      const pristine = key.endsWith('THEME') ? 'body{color:blue}' : 'originalWorker()';
      assert.equal(fs.readFileSync(filename, 'utf8'), pristine, `${key} must be rolled back`);
    }
    // No staging files left behind.
    assert.deepEqual(fs.readdirSync(fixture.directory).filter((n) => n.includes('.tmp.')), []);
    // Backups are retained so an operator can still recover by hand.
    assert.ok(fs.readdirSync(fixture.backupDir).length >= 4);
  } finally {
    fs.writeFileSync(brand, original);
  }
});

test('documented addon installations contain every module and asset the entries load', () => {
  const instructions = fs.readFileSync(path.join(repo, 'deploy', 'deployment.md'), 'utf8');
  for (const addon of ['plugin-dfacm-ops', 'plugin-dfacm-train', 'plugin-dfacm-calendar']) {
    const names = [...instructions.matchAll(new RegExp(`cp /root/swpu-oj/${addon}/\\{([^}]+)\\}`, 'g'))]
      .flatMap((match) => match[1].split(','));
    const installed = fs.mkdtempSync(path.join(root, 'installed-addon-'));
    for (const name of names) {
      fs.mkdirSync(path.dirname(path.join(installed, name)), { recursive: true });
      fs.copyFileSync(path.join(repo, addon, name), path.join(installed, name));
    }
    const entry = path.join(installed, 'index.ts');
    const source = fs.readFileSync(entry, 'utf8');
    const requireInstalled = createRequire(entry);
    for (const match of source.matchAll(/require\('([.]\/[^']+)'\)/g)) {
      assert.doesNotThrow(() => requireInstalled(match[1]), `deployment omitted ${match[1]}`);
    }
    for (const match of source.matchAll(/readFileSync\(join\(__dirname, '([^']+)'\)/g)) {
      assert.ok(fs.existsSync(path.join(installed, match[1])), `deployment omitted ${match[1]}`);
    }
    if (addon === 'plugin-dfacm-train') {
      for (const name of ['training-hooks.ts', 'training-context.cjs', 'catalog-hooks.ts', 'catalog.cjs', 'frontend/training.page.ts', 'frontend/training.js', 'frontend/training.css', 'frontend/catalog.js', 'frontend/catalog.css']) {
        assert.ok(fs.existsSync(path.join(installed, name)), `deployment omitted ${name}`);
      }
    }
  }
});

test('points-shop plugin ships every documented file and its templates render the badge table', () => {
  // The shop addon resolves templates through ui-default's addon template
  // registry, so the documented cp blocks must cover index.ts, points.ts,
  // package.json and all three templates — anything missing breaks the
  // deploy.sh manifest, which parses the same blocks.
  const instructions = fs.readFileSync(path.join(repo, 'deploy/deployment.md'), 'utf8');
  const documented = [];
  for (const match of instructions.matchAll(/cp \/root\/swpu-oj\/plugin-dfacm-shop\/\{([^}]+)\}/g)) {
    documented.push(...match[1].split(',').map((name) => name.trim()));
  }
  // Array.sort() 字典序里 templates/* < titles.ts（'e' < 'i'），期望数组必须
  // 与 documented.sort() 的真实顺序逐项一致——v1.33.0 首次把 titles.ts 排错位
  // 挂过整个套件（另一会话实测 58/59 唯一失败），此后按真实序写死。
  assert.deepEqual(documented.sort(), [
    'backfill.ts', 'index.ts', 'package.json', 'points.ts',
    'templates/history.html', 'templates/manage.html', 'templates/shop.html', 'templates/title.html',
    'titles.ts', 'user-lock.ts',
  ]);
  for (const name of documented) {
    assert.ok(fs.existsSync(path.join(repo, 'plugin-dfacm-shop', name)), `missing ${name}`);
  }
  // Template wiring: Nunjucks pages extend the site layout and use the shared
  // section component; the two data pages keep the data-table, the shop is a
  // branded card shelf (swpu- prefixed, scoped styles).
  for (const template of ['shop.html', 'history.html', 'manage.html']) {
    const source = fs.readFileSync(path.join(repo, 'plugin-dfacm-shop', 'templates', template), 'utf8');
    assert.match(source, /\{% extends "layout\/basic.html" %\}/, `${template} must extend the site layout`);
    assert.match(source, /class="section"/, `${template} must use the section component`);
  }
  for (const template of ['history.html', 'manage.html']) {
    const source = fs.readFileSync(path.join(repo, 'plugin-dfacm-shop', 'templates', template), 'utf8');
    assert.match(source, /data-table/, `${template} must use the data-table component`);
  }
  const shop = fs.readFileSync(path.join(repo, 'plugin-dfacm-shop', 'templates', 'shop.html'), 'utf8');
  assert.match(shop, /swpu-shelf/, 'the shop must shelf badges as a card grid');
  assert.match(shop, /swpu-card__art/, 'each card must preview the badge color block');
  assert.match(shop, /user-profile-badge v-center/, 'badge preview must reuse the badge DOM contract');
  assert.match(shop, /href="\/badge\/{{ bdoc\._id }}"/, 'badge title must link to the badge plugin detail page');
  assert.match(shop, /href="\/reg\?tab=login"/, 'guests must be sent to the branded login tab');
  // The badge ladder and the ledger hygiene scripts ship with the deploy tree.
  assert.ok(fs.existsSync(path.join(repo, 'deploy', 'shop', 'badges-seed.js')), 'missing deploy/shop/badges-seed.js');
  assert.ok(fs.existsSync(path.join(repo, 'deploy', 'shop', 'ledger-cleanup.js')), 'missing deploy/shop/ledger-cleanup.js');
  const seed = fs.readFileSync(path.join(repo, 'deploy', 'shop', 'badges-seed.js'), 'utf8');
  assert.match(seed, /swpuBadgePrice/, 'the seed must price the ladder into swpuBadgePrice');
  assert.match(fs.readFileSync(path.join(repo, 'deploy', 'shop', 'ledger-cleanup.js'), 'utf8'), /hydsvc/, 'the cleanup must guard the service-account purge');
  const manage = fs.readFileSync(path.join(repo, 'plugin-dfacm-shop', 'templates', 'manage.html'), 'utf8');
  assert.match(manage, /name="operation" value="price"/, 'manage form must post operation=price');
  assert.match(manage, /name="badgeId"/, 'manage form must carry badgeId');
  // Integration wiring: smoke battery, CI matrix, addon registry example.
  const smoke = fs.readFileSync(path.join(repo, 'deploy', 'smoke.sh'), 'utf8');
  assert.match(smoke, /\/shop/) && assert.match(smoke, /shop\/history/) && assert.match(smoke, /shop\/title/);
  const ci = fs.readFileSync(path.join(repo, '.github', 'workflows', 'ci.yml'), 'utf8');
  assert.match(ci, /node --test plugin-dfacm-shop\/tests\/\*\.test\.cjs/);
  const addonExample = fs.readFileSync(path.join(repo, 'plugin-dfacm-shop', 'addon.json.example'), 'utf8');
  assert.match(addonExample, /swpu-shop/);
  const orchestrator = fs.readFileSync(path.join(repo, 'deploy', 'deploy.sh'), 'utf8');
  assert.match(orchestrator, /plugin-dfacm-shop/, 'deploy.sh must ship the shop addon');
  // Nav entries resolve their href via url(item.name), so every injectUI node
  // name must be a registered route name — the 2026-10-13 bug shipped a menu
  // item whose href was the literal string "Error: No route found for name: shop".
  const indexSource = fs.readFileSync(path.join(repo, 'plugin-dfacm-shop', 'index.ts'), 'utf8');
  for (const nodeName of ['swpu_shop', 'swpu_shop_manage']) {
    assert.match(indexSource, new RegExp(`ctx\\.Route\\('${nodeName}'`), `${nodeName} must be a registered route name`);
    assert.match(indexSource, new RegExp(`injectUI\\('[^']+', '${nodeName}'`), `${nodeName} must be injected under its route name`);
  }
  // Title workshop (DIY 称号) wiring: the workshop page ships with the deploy
  // tree, its state POSTs carry CSRF, the preview never touches innerHTML,
  // history labels the new ledger kind, and every route name is registered.
  const titlePage = fs.readFileSync(path.join(repo, 'plugin-dfacm-shop', 'templates', 'title.html'), 'utf8');
  assert.match(titlePage, /\{% extends "layout\/basic.html" %\}/, 'title.html must extend the site layout');
  assert.match(titlePage, /class="section"/, 'title.html must use the section component');
  assert.match(titlePage, /swpu-title-preview/, 'title.html must render the preview chip');
  assert.match(titlePage, /url\('swpu_shop_title_unlock'\)/, 'title.html must post to the unlock route');
  assert.match(titlePage, /url\('swpu_shop_title_save'\)/, 'title.html must post to the save route');
  assert.ok(!/innerHTML\s*=/.test(titlePage), 'the preview updater must never assign innerHTML (textContent only)');
  assert.match(manage, /swpu_shop_title_manage/, 'manage.html must post title ops to the manage route');
  assert.match(manage, /value="revoke"/, 'manage.html must carry the revoke operation');
  assert.match(fs.readFileSync(path.join(repo, 'plugin-dfacm-shop', 'templates', 'history.html'), 'utf8'), /doc\.kind == 'title'/, 'history must label title ledger rows');
  for (const routeName of ['swpu_shop_title', 'swpu_shop_title_unlock', 'swpu_shop_title_save', 'swpu_shop_title_manage']) {
    assert.match(indexSource, new RegExp(`ctx\\.Route\\('${routeName}'`), `${routeName} must be a registered route name`);
  }
  assert.match(indexSource, /swpuTitles/, 'the shop must own the swpuTitles state collection');
  assert.match(shop, /swpu_shop_title/, 'the shop shelf must link the title workshop card');
});

test('contest-calendar plugin ships its data, template and bot-feed wiring', () => {
  // The calendar addon serves every page render straight from calendar.json on
  // disk (updates ship via deploy.sh --sync-only without a restart), so the
  // documented cp blocks must cover the data file as well as the code.
  const instructions = fs.readFileSync(path.join(repo, 'deploy', 'deployment.md'), 'utf8');
  const documented = [];
  for (const match of instructions.matchAll(/cp \/root\/swpu-oj\/plugin-dfacm-calendar\/\{([^}]+)\}/g)) {
    documented.push(...match[1].split(',').map((name) => name.trim()));
  }
  assert.deepEqual(documented.sort(), [
    'ai.cjs', 'auto.cjs', 'cache.cjs', 'calendar.cjs', 'calendar.json', 'clist.cjs', 'index.ts', 'package.json', 'presentation.cjs',
    'public/calendar.css', 'public/calendar.js', 'templates/calendar.html',
  ]);
  for (const name of documented) {
    assert.ok(fs.existsSync(path.join(repo, 'plugin-dfacm-calendar', name)), `missing ${name}`);
  }
  // The shipped season must validate cleanly with the plugin's own loader.
  const requirePlugin = createRequire(path.join(repo, 'plugin-dfacm-calendar', 'index.ts'));
  const calendar = requirePlugin('./calendar.cjs');
  const parsed = calendar.loadCalendar(
    fs.readFileSync(path.join(repo, 'plugin-dfacm-calendar', 'calendar.json'), 'utf8'),
  );
  assert.equal(parsed.skipped.length, 0, parsed.skipped.join('; '));
  assert.ok(parsed.events.length > 0, 'the shipped season must not be empty');
  // The auto-fetch module must stay wiring-consistent: it powers the platform
  // contest merge and must keep its env escape hatches (tests + ops).
  const autoSource = fs.readFileSync(path.join(repo, 'plugin-dfacm-calendar', 'auto.cjs'), 'utf8');
  assert.match(autoSource, /SWPU_CALENDAR_AUTO_CACHE/, 'auto.cjs must keep the cache-path override');
  assert.match(autoSource, /SWPU_CALENDAR_AUTO_OFF/, 'auto.cjs must keep the kill switch');
  assert.match(autoSource, /codeforces\.com\/api\/contest\.list/, 'CF API upstream pinned');
  assert.match(autoSource, /kenkoooo\.com\/atcoder\/resources\/contests\.json/, 'AtCoder upstream pinned');
  // Template wiring: extends the site layout, uses the section component, the
  // branded scoped styles, and no client-side date math.
  const tpl = fs.readFileSync(path.join(repo, 'plugin-dfacm-calendar', 'templates', 'calendar.html'), 'utf8');
  assert.match(tpl, /\{% extends "layout\/basic.html" %\}/, 'calendar.html must extend the site layout');
  assert.match(tpl, /class="section(?: [^"]+)?"/, 'calendar.html must use the section component');
  assert.match(tpl, /swpu-cal-chip/, 'calendar.html must render the type filter chips');
  assert.match(tpl, /swpu-cal-card/, 'calendar.html must render contest rows');
  assert.match(tpl, /<details[^>]+dfacm-cal__archive/, 'ended events must use the native collapsible archive');
  assert.doesNotMatch(tpl, /fullcalendar-|data-calendar-view|dfacm-calendar-grid/, 'the contest list must not load or render a month/week calendar');
  // Route/injectUI wiring: ui-default resolves nav hrefs via url(item.name),
  // so the injected name must equal the registered route name.
  const index = fs.readFileSync(path.join(repo, 'plugin-dfacm-calendar', 'index.ts'), 'utf8');
  assert.match(index, /ctx\.Route\('swpu_calendar', '\/calendar', CalendarPageHandler\)/);
  assert.match(index, /ctx\.Route\('swpu_calendar_data', '\/calendar\/data', CalendarDataHandler\)/);
  assert.match(index, /injectUI\('Nav', 'swpu_calendar'/);
  // The bot feed projects raw events (manual + auto merged) — internal Date
  // fields must not leak, and the merge must actually reach the projection.
  assert.match(index, /events: merged\.events\.map/);
  assert.match(index, /mergeCalendar\(parsed, \[\.\.\.auto, \.\.\.extra, \.\.\.ai\]\)/);
  assert.match(index, /ctx\.Route\('swpu_calendar_rss', '\/calendar\/feed\.xml'/);
  assert.match(index, /ctx\.Route\('swpu_calendar_feed', '\/calendar\/feed\.ics'/);
  assert.match(index, /ctx\.Route\('swpu_calendar_asset', '\/calendar\/assets\/:file'/);
  assert.match(index, /dfacm_calendar\.clist_api_key/);
  // Integration wiring: smoke battery, CI matrix, orchestrator, addon registry.
  const smoke = fs.readFileSync(path.join(repo, 'deploy', 'smoke.sh'), 'utf8');
  assert.match(smoke, /\/calendar"/);
  assert.match(smoke, /calendar\/data/);
  assert.match(smoke, /calendar\/feed\.ics/);
  assert.match(smoke, /calendar\/assets/);
  const ci = fs.readFileSync(path.join(repo, '.github', 'workflows', 'ci.yml'), 'utf8');
  assert.match(ci, /plugin-dfacm-calendar/);
  const orchestrator = fs.readFileSync(path.join(repo, 'deploy', 'deploy.sh'), 'utf8');
  assert.match(orchestrator, /plugin-dfacm-calendar/, 'deploy.sh must ship the calendar addon');
  const addonExample = fs.readFileSync(path.join(repo, 'plugin-dfacm-calendar', 'addon.json.example'), 'utf8');
  assert.match(addonExample, /swpu-calendar/);
});

test('light default initialization supports a new site and preserves user choices on rerun', () => {
  const docs = new Map();
  const users = [{ uid: 1, theme: 'dark' }, { uid: 2, theme: 'light' }];
  const originalUsers = structuredClone(users);
  const context = vm.createContext({
    print() {}, printjson() {},
    db: {
      system: {
        findOne: ({ _id }) => docs.get(_id) || null,
        updateOne({ _id }, update, options) {
          assert.ok(docs.has(_id) || options?.upsert);
          docs.set(_id, { _id, ...docs.get(_id), ...update.$set });
        },
      },
      user: { updateMany() { assert.fail('must not clear user preferences'); } },
    },
  });
  const source = fs.readFileSync(path.join(repo, 'deploy/set-theme-light.js'), 'utf8');
  const runMigration = () => vm.runInContext(`(function(){\n${source}\n})()`, context);
  runMigration();
  assert.equal(docs.get('preference.theme').value, 'light');
  const footer = docs.get('ui-default.footer_extra_html').value;
  assert.match(footer, /swpu-theme-toggle/);
  runMigration();
  assert.equal(docs.get('ui-default.footer_extra_html').value, footer);
  assert.deepEqual(users, originalUsers);
});

// End-to-end activation/order assertions below replace the former source-text
// ordering test, since restart and installed verification now share one lock.

// The two subsetted fonts and the icon set are served from custom/ but were
// never in deploy.sh's manifest, so changing one needed a manual
// install-landing.sh that the orchestrator would never run.
test('the deploy manifest ships the whole landing tree, not just index.html', () => {
  const source = fs.readFileSync(path.join(repo, 'deploy', 'deploy.sh'), 'utf8');
  const manifest = source.slice(source.indexOf('stage_manifest()'), source.indexOf('preflight()'));
  assert.match(manifest, /find \. -type f/, 'the landing tree must be enumerated');
  assert.match(manifest, /'landing\/%s\\t%s\/landing\/%s\\n'/);
  for (const asset of ['landing/swpu-display.woff2', 'landing/swpu-mono.woff2', 'landing/assets/logo.png', 'landing/index.html']) {
    assert.ok(fs.existsSync(path.join(repo, asset)), `${asset} must exist to be shipped`);
  }
  // And smoke asserts they are actually reachable, not merely uploaded.
  const smoke = fs.readFileSync(path.join(repo, 'deploy', 'smoke.sh'), 'utf8');
  assert.match(smoke, /swpu-display\.woff2/);
  assert.match(smoke, /swpu-mono\.woff2/);
  assert.match(smoke, /og-cover\.png/);
});

test('smoke battery locks the boot injection, auth gates and security headers', () => {
  const source = fs.readFileSync(path.join(repo, 'deploy', 'smoke.sh'), 'utf8');
  const patterns = [
    [/--resolve/, 'loopback discipline (SNI-less curl -k -H Host dies)'],
    [/m-mail/, 'branded auth card wiring'],
    [/__SWPU_BOOT\.oauth=\[\{/, 'oauth providers injected (2026-10-04 regression)'],
    [/guest cannot boot the gated pwd pane/, 'passwordless gate: students never boot the pwd pane'],
    [/__SWPU_BOOT\.embed=true/, 'embed boot injection'],
    [/reg\/code/, 'regcode POST path exercised'],
    [/验证码用途不合法/, 'bad purpose rejected without side effects'],
    [/sameorigin/i, '/reg framing policy'],
    [/deny/i, 'site framing policy'],
    [/strict-transport-security/, 'HSTS'],
    [/no-cache/, 'landing must not be cached'],
    [/max-age=600/, 'theme css short cache'],
    [/max-age=604800/, 'hashed app shell long cache'],
    [/cache-control/i, '404 must not carry a cache header'],
    [/308/, 'http to https redirect'],
    [/unregister/, 'service-worker killswitch alive'],
    [/exit 1/, 'any failure fails the battery'],
  ];
  for (const [pattern, why] of patterns) assert.match(source, pattern, why);
  // The overlay gate needs the brand marker twice (start + end comment) in
  // the served css; anything else means the brand layer was lost.
  assert.match(source, /DFACM brand overlay/);
});

// Activation tests execute the real orchestrator, uploaded shell scripts and
// filesystem operations. Only SSH, HTTP/pm2 and one-shot OS failures are local
// substitutes; every destination is under this temporary fixture.
function activationFixture(liveName = 'live') {
  const dir = fs.mkdtempSync(path.join(root, 'activation-'));
  const live = path.join(dir, liveName), bin = path.join(dir, 'bin');
  const addons = path.join(live, 'addons'), custom = path.join(live, 'custom');
  const deployed = path.join(live, 'deployed'), backups = path.join(dir, 'private-backups');
  for (const p of [bin, addons, custom, deployed]) fs.mkdirSync(p, { recursive: true });
  const originals = new Map(), shipped = [];
  const put = (target, value, mode = 0o640) => {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, value, { mode });
    originals.set(target, { bytes: Buffer.from(value), mode });
  };
  const docs = fs.readFileSync(path.join(repo, 'deploy/deployment.md'), 'utf8');
  for (const match of docs.matchAll(/cp \/root\/swpu-oj\/(plugin-dfacm-(?:regcode|ops|train|shop|calendar))\/\{([^}]+)\}/g)) {
    for (const file of match[2].split(',')) {
      const target = path.join(addons, match[1].replace('plugin-dfacm-', 'swpu-'), file);
      shipped.push(target);
      // New files must disappear after rollback, existing modes must survive.
      if (!file.endsWith('package.json')) put(target, `original ${file}\n`);
    }
  }
  const walk = (dir, prefix = '') => fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? walk(path.join(dir, entry.name), prefix + entry.name + '/') : [prefix + entry.name]);
  for (const file of walk(path.join(repo, 'landing'))) {
    shipped.push(path.join(deployed, 'landing', file));
    put(path.join(deployed, 'landing', file), `old source ${file}\n`);
  }
  for (const file of ['theme/00-brand.css', 'deploy/install-theme.sh', 'deploy/install-landing.sh', 'deploy/service-worker-killswitch.js', 'deploy/smoke.sh', 'deploy/activate.sh']) {
    shipped.push(path.join(deployed, file));
    put(path.join(deployed, file), `old source ${file}\n`);
  }
  for (const file of ['home.html', 'swpu-display.woff2', 'swpu-mono.woff2']) put(path.join(custom, file), `old custom ${file}\n`, 0o600);
  put(path.join(custom, 'unrelated.txt'), 'unrelated asset\n');
  const theme = Object.fromEntries(['STATIC_THEME', 'SOURCE_THEME', 'STATIC_SW', 'SOURCE_SW'].map((key) => {
    const target = path.join(live, key.startsWith('STATIC') ? 'static' : 'upstream', key.endsWith('THEME') ? 'theme-4.58.5.css' : 'service-worker.js');
    put(target, key.endsWith('THEME') ? 'body{color:blue}' : 'originalWorker()', 0o640);
    return [key, unixPath(target)];
  }));
  const log = path.join(dir, 'events');
  fs.writeFileSync(log, '');
  script(bin, 'ssh', `set -euo pipefail
while [[ "$1" == -* ]]; do shift 2; done
shift
cmd="$*"
# Map only the legacy orchestrator's fixed paths, before evaluating anything.
[ "$cmd" != 'bash -s' ] || cmd="$(cat)"
old='/root/.hydro/addons'; cmd="\${cmd//$old/$ACT_LIVE/addons}"
old='/root/.hydro/custom'; cmd="\${cmd//$old/$ACT_LIVE/custom}"
old='/root/swpu-theme-deploy'; cmd="\${cmd//$old/$ACT_LIVE/deployed}"
case "$cmd" in *'/root/'*) echo 'unsafe fixture SSH command' >&2; exit 99;; esac
case "$cmd" in
  "bash $ACT_LIVE/deployed/deploy/install-landing.sh") echo 'legacy leaf reached' >&2; exit 88;;
  "bash $ACT_LIVE/deployed/deploy/smoke.sh") printf 'smoke\\n' >> "$ACT_LOG"; exit "\${FAIL_SMOKE:-0}";;
esac
exec bash -c "$cmd"`);
  script(bin, 'pm2', `printf 'restart %s\\n' "$*" >> "$ACT_LOG"
if [ -n "\${SIGNAL_DURING_RESTART:-}" ]; then kill "-$SIGNAL_DURING_RESTART" "$PPID"; fi
exit "\${FAIL_RESTART:-0}"`);
  script(bin, 'curl', `[ \"\${FAIL_READY:-0}\" != 1 ] || exit 1\ncase "$*" in *--resolve*) printf 'm-mail';; *) printf '%s' "\${OUTSIDE_STATUS:-200}";; esac`);
  script(bin, 'sleep', ':');
  script(bin, 'install', `set -euo pipefail
target="\${@: -1}"
if [[ "$target" == "$ACT_LIVE/"* ]] && [[ "$1" != -d ]]; then
  count=0; [ ! -f "$ACT_DIR/count" ] || read -r count < "$ACT_DIR/count"
  count=$((count+1)); printf '%s\\n' "$count" > "$ACT_DIR/count"
  printf 'install %s %s\\n' "$count" "$target" >> "$ACT_LOG"
  if [ "$count" = 1 ] && [ -n "\${CONFLICT_BEFORE:-}" ]; then printf 'concurrent edit\\n' > "$CONFLICT_BEFORE"; fi
  if [ "$count" = "\${FAIL_INSTALL:-none}" ]; then
    [ -z "\${CONFLICT_TARGET:-}" ] || printf 'concurrent edit\\n' > "$CONFLICT_TARGET"
    echo 'injected install failure' >&2; exit 73
  fi
fi
case "$target" in
  *'/prepared-landing/'*) [ "\${FAIL_LEAF:-}" != landing ] || { echo 'injected landing failure' >&2; exit 74; };;
  *'/prepared-theme/'*) [ "\${FAIL_LEAF:-}" != theme ] || { echo 'injected theme failure' >&2; exit 75; };;
esac
exec /usr/bin/install "$@"`);
  script(bin, 'mv', `set -euo pipefail
source="\${@: -2:1}"; target="\${@: -1}"
if [[ "$target" == "$ACT_LIVE/"* ]]; then
  if [[ "$source" == *'.swpu-restore.'* ]] && [ "\${FAIL_ROLLBACK:-0}" = 1 ]; then echo 'injected restore failure' >&2; exit 76; fi
  /usr/bin/mv "$@"
  printf 'published %s\\n' "$target" >> "$ACT_LOG"
  : > "$ACT_DIR/published"
  [ "$target" != "$SOURCE_SW" ] || : > "$ACT_DIR/all-published"
  if [ "\${SIGNAL_AFTER_PUBLISH:-0}" = 1 ] && [ ! -f "$ACT_DIR/signal-sent" ]; then : > "$ACT_DIR/signal-sent"; kill -TERM "$PPID"; fi
else exec /usr/bin/mv "$@"; fi`);
  script(bin, 'sha256sum', `set -euo pipefail
file="\${@: -1}"
if [ "\${FAIL_STAGE_HASH:-0}" = 1 ] && [[ "$file" == /tmp/swpu-deploy-stage.* ]]; then printf '%064d  %s\\n' 0 "$file"; exit 0; fi
if [ "\${FAIL_HASH:-0}" = 1 ] && [ -f "$ACT_DIR/all-published" ] && [ ! -f "$ACT_DIR/hash-failed" ] && [[ "$file" == "$ACT_LIVE/"* ]] && [[ "$file" != *'.swpu-'* ]]; then
  : > "$ACT_DIR/hash-failed"; echo 'injected installed hash failure' >&2; exit 77
fi
if [ "\${FAIL_COMMIT_JOURNAL:-0}" = 1 ] && [ -f "$ACT_DIR/all-published" ] && [ ! -f "$ACT_DIR/journal-failed" ] && [ "$file" = "$SOURCE_SW" ]; then
  : > "$ACT_DIR/journal-failed"
  for journal in "$ACTIVATION_BACKUP_DIR"/batch.*/journal.tsv; do
    /usr/bin/mv "$journal" "$journal.before-failure.tsv"
    mkdir "$journal"
  done
fi
exec /usr/bin/sha256sum "$@"`);
  const variables = {
    ...process.env, PATH: `${unixPath(bin)}:${process.env.PATH}`, SSH_BIN: unixPath(path.join(bin, 'ssh')),
    SSH_TARGET: 'fixture', REMOTE_ADDONS: unixPath(addons), REMOTE_CUSTOM: unixPath(custom), REMOTE_DEPLOY: unixPath(deployed),
    ACTIVATION_BACKUP_DIR: unixPath(backups), BACKUP_DIR: unixPath(path.join(dir, 'theme-backups')),
    ...theme, STATIC_DIR: unixPath(path.join(live, 'static')), THEME_VERSION: '4.58.5',
    ACT_DIR: unixPath(dir), ACT_LIVE: unixPath(live), ACT_LOG: unixPath(log), WAIT_SECONDS: '3',
  };
  return {
    dir, live, bin, custom, deployed, backups, originals, shipped, variables,
    events: () => fs.readFileSync(log, 'utf8'),
    run: (args = [], extra = {}) => spawnSync(bash, [unixPath(path.join(repo, 'deploy/deploy.sh')), ...args], { env: { ...variables, ...extra }, encoding: 'utf8', timeout: 30000 }),
    unchanged(except) {
      for (const [target, original] of originals) {
        if (target === except) continue;
        assert.ok(fs.readFileSync(target).equals(original.bytes), `restored bytes: ${target}`);
        if (process.platform !== 'win32') assert.equal(fs.statSync(target).mode & 0o777, original.mode, `restored mode: ${target}`);
      }
      for (const target of shipped) if (!originals.has(target) && target !== except) assert.equal(fs.existsSync(target), false, `removed new target: ${target}`);
      const unexpected = walk(live).filter((file) => !originals.has(path.join(live, file)) && path.join(live, file) !== except);
      assert.deepEqual(unexpected, [], 'no new derived files or temporary writes remain live');
    },
  };
}

for (const position of ['first', 'middle', 'last']) test(`activation rolls back and stops at the ${position} runtime install failure`, () => {
  const f = activationFixture();
  const nth = position === 'first' ? 1 : position === 'middle' ? Math.floor(f.shipped.length / 2) : f.shipped.length;
  const result = f.run([], { FAIL_INSTALL: String(nth) });
  assert.notEqual(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stderr, /injected install failure/);
  assert.equal(f.events().split('\n').filter((line) => line.startsWith('install ')).length, nth, 'must stop at the first failing install');
  f.unchanged();
  assert.doesNotMatch(f.events(), /^(restart |smoke$)/m);
});

for (const failure of ['landing', 'theme', 'hash']) test(`activation keeps the original batch after ${failure} failure`, () => {
  const f = activationFixture();
  const result = f.run([], failure === 'hash' ? { FAIL_HASH: '1' } : { FAIL_LEAF: failure });
  assert.notEqual(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stderr, new RegExp(`injected ${failure === 'hash' ? 'installed hash' : failure} failure`));
  f.unchanged();
  assert.doesNotMatch(f.events(), /^(restart |smoke$)/m);
});

test('activation refuses to overwrite concurrent edits during rollback and names retained recovery evidence', () => {
  const f = activationFixture(), target = f.shipped[0];
  const result = f.run([], { FAIL_INSTALL: '3', CONFLICT_TARGET: unixPath(target) });
  assert.notEqual(result.status, 0);
  assert.equal(fs.readFileSync(target, 'utf8'), 'concurrent edit\n');
  f.unchanged(target);
  assert.match(result.stderr, /CONFLICT/);
  assert.ok(result.stderr.includes(target));
  assert.match(result.stderr, /recovery.tsv/);
  assert.doesNotMatch(f.events(), /^restart /m);
});

test('activation reports incomplete rollback instead of restarting or deleting backups', () => {
  const f = activationFixture();
  const result = f.run([], { FAIL_INSTALL: '3', FAIL_ROLLBACK: '1' });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /FAILED.*restore|restore.*FAILED/);
  assert.match(result.stderr, /recovery.tsv/);
  assert.ok(fs.readdirSync(f.backups).some((name) => name.startsWith('batch.')));
  assert.doesNotMatch(f.events(), /^restart /m);
});

test('activation stage-only leaves live files intact and sync-only installs every derived target without restart', () => {
  const f = activationFixture();
  const staged = f.run(['--stage-only']);
  assert.equal(staged.status, 0, staged.stdout + staged.stderr);
  f.unchanged();
  assert.equal(f.events(), '');
  const synced = f.run(['--sync-only']);
  assert.equal(synced.status, 0, synced.stdout + synced.stderr);
  assert.deepEqual(fs.readFileSync(path.join(f.custom, 'home.html')), fs.readFileSync(path.join(repo, 'landing/index.html')));
  assert.deepEqual(fs.readFileSync(path.join(f.custom, 'logo.png')), fs.readFileSync(path.join(repo, 'landing/assets/logo.png')));
  assert.deepEqual(fs.readFileSync(path.join(f.live, 'addons/swpu-shop/user-lock.ts')), fs.readFileSync(path.join(repo, 'plugin-dfacm-shop/user-lock.ts')));
  assert.match(fs.readFileSync(f.variables.STATIC_THEME, 'utf8'), /body\{color:blue\}[\s\S]*DFACM brand overlay/);
  assert.deepEqual(fs.readFileSync(f.variables.SOURCE_SW), fs.readFileSync(path.join(repo, 'deploy/service-worker-killswitch.js')));
  assert.doesNotMatch(f.events(), /^(restart |smoke$)/m);
  const batches = fs.readdirSync(f.backups).filter((name) => name.startsWith('batch.'));
  assert.equal(batches.length, 1);
  const batch = path.join(f.backups, batches[0]);
  if (process.platform !== 'win32') assert.equal(fs.statSync(batch).mode & 0o777, 0o700);
  const journal = fs.readFileSync(path.join(batch, 'journal.tsv'), 'utf8');
  assert.match(journal, /WRITTEN/);
  const inventory = fs.readFileSync(path.join(batch, 'inventory.tsv'), 'utf8');
  assert.ok(inventory.includes(f.shipped[0]));
  assert.match(inventory, /\t640\t[a-f0-9]{64}\t/);
});

test('activation restarts once after all writes, retains readiness/smoke and outside probe failures', () => {
  const f = activationFixture();
  const result = f.run([], { OUTSIDE_STATUS: '503' });
  assert.equal(result.status, 69, result.stdout + result.stderr);
  const lines = f.events().trim().split('\n');
  assert.equal(lines.filter((line) => line.startsWith('restart ')).length, 1);
  assert.ok(lines.findIndex((line) => line.startsWith('restart ')) > lines.findLastIndex((line) => line.startsWith('published ')));
  assert.ok(lines.indexOf('smoke') > lines.findIndex((line) => line.startsWith('restart ')));
});

test('activation stage hash mismatch refuses live writes and restart', () => {
  const f = activationFixture();
  const result = f.run([], { FAIL_STAGE_HASH: '1' });
  assert.equal(result.status, 65, result.stdout + result.stderr);
  f.unchanged();
  assert.equal(f.events(), '');
});

test('activation refuses a public backup directory before creating backups or writing live files', () => {
  const f = activationFixture();
  const result = f.run([], { ACTIVATION_BACKUP_DIR: unixPath(path.join(f.custom, 'backups')) });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /refusing public activation backup/);
  f.unchanged();
  assert.equal(fs.existsSync(path.join(f.custom, 'backups')), false);
});

test('activation retains concurrent content in a target that was absent before the batch', () => {
  const f = activationFixture();
  const target = f.shipped.find((file) => file.endsWith('package.json'));
  const result = f.run([], { FAIL_INSTALL: '10', CONFLICT_TARGET: unixPath(target) });
  assert.equal(result.status, 71, result.stdout + result.stderr);
  assert.equal(fs.readFileSync(target, 'utf8'), 'concurrent edit\n');
  f.unchanged(target);
  assert.match(result.stderr, /CONFLICT/);
  const second = f.run(['--sync-only']);
  assert.equal(second.status, 71, second.stdout + second.stderr);
  assert.match(second.stderr, /unfinished activation/);
  assert.equal(fs.readFileSync(target, 'utf8'), 'concurrent edit\n');
});

test('activation restores a rename interrupted before its completion journal entry', () => {
  const f = activationFixture();
  const result = f.run([], { SIGNAL_AFTER_PUBLISH: '1' });
  assert.equal(result.status, 143, result.stdout + result.stderr);
  f.unchanged();
  assert.doesNotMatch(f.events(), /^restart /m);
});

test('activation refuses another process holding the deployment lock', async () => {
  const f = activationFixture();
  fs.mkdirSync(f.backups);
  const locker = spawn(bash, ['-c', 'exec 9>"$ACTIVATION_BACKUP_DIR/activation.lock"; flock -n 9; echo locked; read -r release'], { env: f.variables, stdio: ['pipe', 'pipe', 'pipe'], timeout: 10000 });
  try {
    await new Promise((resolve, reject) => {
      locker.stdout.once('data', resolve);
      locker.once('error', reject);
      locker.once('exit', () => reject(new Error('lock owner exited before test')));
    });
    const result = f.run(['--sync-only']);
    assert.equal(result.status, 70, result.stdout + result.stderr);
    f.unchanged();
    assert.equal(f.events(), '');
  } finally {
    locker.stdin.end('release\n');
    await new Promise((resolve) => locker.once('close', resolve));
  }
});

test('activation records a conflict found immediately before publication without overwriting it', () => {
  const f = activationFixture(), target = f.shipped[0];
  const result = f.run([], { CONFLICT_BEFORE: unixPath(target) });
  assert.equal(result.status, 71, result.stdout + result.stderr);
  assert.equal(fs.readFileSync(target, 'utf8'), 'concurrent edit\n');
  f.unchanged(target);
  assert.match(result.stderr, /CONFLICT/);
  assert.match(result.stderr, /recovery.tsv/);
  assert.doesNotMatch(f.events(), /^restart /m);
});

test('activation treats configured paths containing spaces and shell metacharacters as literal paths', () => {
  const f = activationFixture("live space's $literal");
  const result = f.run(['--sync-only']);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.ok(fs.readFileSync(path.join(f.custom, 'home.html')).equals(fs.readFileSync(path.join(repo, 'landing/index.html'))));
});

for (const [failure, code] of [['FAIL_READY', 67], ['FAIL_SMOKE', 68]]) test(`activation retains ${failure} probe failure status after its single restart`, () => {
  const f = activationFixture();
  const result = f.run([], { [failure]: '1' });
  assert.equal(result.status, code, result.stdout + result.stderr);
  assert.equal(f.events().split('\n').filter((line) => line.startsWith('restart ')).length, 1);
});

for (const [label, offset] of [['landing publication', 7], ['final theme publication', 16]]) test(`activation restores the whole batch after ${label} fails`, () => {
  const f = activationFixture();
  // The fixture has 12 landing outputs and four theme/service-worker outputs.
  const nth = f.shipped.length + offset;
  const result = f.run([], { FAIL_INSTALL: String(nth) });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /injected install failure/);
  assert.equal(f.events().split('\n').filter((line) => line.startsWith('install ')).length, nth);
  f.unchanged();
  assert.doesNotMatch(f.events(), /^(restart |smoke$)/m);
});

test('activation rejects a backup root containing live trees without changing their directory permissions', () => {
  const f = activationFixture();
  const originalMode = fs.statSync(f.live).mode & 0o777;
  const result = f.run(['--sync-only'], { ACTIVATION_BACKUP_DIR: unixPath(f.live) });
  assert.notEqual(result.status, 0, result.stdout + result.stderr);
  assert.equal(fs.statSync(f.live).mode & 0o777, originalMode);
  f.unchanged();
});

test('activation keeps verified files when restart itself reports failure and blocks another batch pending process inspection', () => {
  const f = activationFixture();
  const result = f.run([], { FAIL_RESTART: '79' });
  assert.notEqual(result.status, 0);
  assert.equal(f.events().split('\n').filter((line) => line.startsWith('restart ')).length, 1);
  assert.ok(fs.readFileSync(path.join(f.custom, 'home.html')).equals(fs.readFileSync(path.join(repo, 'landing/index.html'))));
  assert.match(result.stderr, /restart failed.*process state/);
  assert.ok(fs.existsSync(path.join(f.backups, 'INCOMPLETE')));
  assert.doesNotMatch(f.events(), /^smoke$/m);
});


test('activation rolls back verified files if writing its commit journal fails before restart', () => {
  const f = activationFixture();
  const result = f.run([], { FAIL_COMMIT_JOURNAL: '1' });
  assert.notEqual(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stderr, /journal\.tsv.*[Ii]s a directory/);
  f.unchanged();
  assert.doesNotMatch(f.events(), /^(restart |smoke$)/m);
});


test('activation rolls back a signal immediately after file commit before any restart begins', () => {
  const f = activationFixture();
  // Observe the existing command boundary using Bash instrumentation rather
  // than adding a test-only hook to the production helper.
  script(f.dir, 'signal-before-restart.sh', `
if [[ "$0" == */deploy/activate.sh ]]; then
  trap 'if [[ "$BASH_COMMAND" == echo*restarting*hydrooj* ]] && [ ! -f "$ACT_DIR/commit-signal-sent" ]; then : > "$ACT_DIR/commit-signal-sent"; kill -TERM "$$"; fi' DEBUG
fi`);
  const result = f.run([], { BASH_ENV: unixPath(path.join(f.dir, 'signal-before-restart.sh')) });
  assert.equal(result.status, 143, result.stdout + result.stderr);
  assert.ok(fs.existsSync(path.join(f.dir, 'commit-signal-sent')), 'signal injected after COMMITTED append');
  f.unchanged();
  assert.equal(fs.existsSync(path.join(f.backups, 'INCOMPLETE')), false, 'safe rollback clears the guard');
  assert.doesNotMatch(f.events(), /^(restart |smoke$)/m);
});

for (const signal of ['TERM', 'HUP', 'INT']) test(`activation retains process inspection guard after ${signal} during restart`, () => {
  const f = activationFixture();
  const result = f.run([], { SIGNAL_DURING_RESTART: signal });
  assert.ok(fs.existsSync(path.join(f.backups, 'INCOMPLETE')), 'ambiguous restart blocks another batch');
  assert.equal(result.status, 71, result.stdout + result.stderr);
  assert.ok(fs.readFileSync(path.join(f.custom, 'home.html')).equals(fs.readFileSync(path.join(repo, 'landing/index.html'))));
  const batch = fs.readFileSync(path.join(f.backups, 'INCOMPLETE'), 'utf8').trim();
  const journal = fs.readFileSync(path.join(batch, 'journal.tsv'), 'utf8');
  assert.match(journal, /COMMITTED\nRESTART_PENDING\n/);
  assert.doesNotMatch(journal, /RESTART_SUCCEEDED|RESTORED/);
  assert.match(result.stderr, /restart.*process state/);
  assert.ok(result.stderr.includes(path.join(batch, 'journal.tsv')), 'names retained process recovery evidence');
  assert.equal(f.events().split('\n').filter((line) => line.startsWith('restart ')).length, 1);
  assert.doesNotMatch(f.events(), /^smoke$/m);
  const second = f.run(['--sync-only']);
  assert.equal(second.status, 71, second.stdout + second.stderr);
  assert.match(second.stderr, /unfinished activation/);
  assert.equal(f.events().split('\n').filter((line) => line.startsWith('restart ')).length, 1);
});
