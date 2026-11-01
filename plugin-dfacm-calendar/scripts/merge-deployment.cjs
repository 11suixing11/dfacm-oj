'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { RUNTIME_FILES, hash, verify } = require('./merge-release.cjs');

const DEST = '/root/.hydro/addons/swpu-calendar';
const COLLECTOR = '/root/.hydro/addons/dfacm-ai-contests';
const CONFIG = { 'Caddyfile': '/root/.hydro/Caddyfile', 'addon.json': '/root/.hydro/addon.json', 'home.html': '/root/.hydro/custom/home.html' };
const TARGETS = new Set([...RUNTIME_FILES.map(name => path.join(DEST, name)), ...Object.values(CONFIG), path.join(COLLECTOR, 'index.ts')]);
const readJson = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const writeJson = (file, value) => fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n', { mode: 0o600 });
const digest = file => fs.existsSync(file) ? hash(file) : null;
function regular(file) {
    for (let current = file; current !== path.dirname(current); current = path.dirname(current)) {
        if (fs.existsSync(current)) assert.ok(!fs.lstatSync(current).isSymbolicLink(), `Unexpected link: ${current}`);
    }
    if (fs.existsSync(file)) assert.ok(fs.statSync(file).isFile(), `Expected regular file: ${file}`);
}
function versions(hydroPackage) {
    const uiPackage = path.join(path.dirname(hydroPackage), '@hydrooj/ui-default');
    const hydro = readJson(path.join(hydroPackage, 'package.json')), ui = readJson(path.join(uiPackage, 'package.json'));
    assert.equal(hydro.version, '5.0.7', 'Hydro differs from the existing site baseline');
    assert.equal(ui.version, '4.58.5', 'ui-default differs from the existing site baseline');
    return { node: process.versions.node, hydro: hydro.version, ui: ui.version,
        hydroHash: hash(path.join(hydroPackage, 'package.json')), uiHash: hash(path.join(uiPackage, 'package.json')) };
}
function processes(raw) {
    return JSON.parse(raw).map(item => ({ name: item.name, pmId: item.pm_id, pid: item.pid,
        status: item.pm2_env.status, restarts: item.pm2_env.restart_time })).sort((a, b) => a.pmId - b.pmId);
}
function service() {
    const result = spawnSync('systemctl', ['show', 'dfacm-ai-contests', '-p', 'MainPID', '-p', 'ActiveState'], { encoding: 'utf8' });
    assert.equal(result.status, 0, 'Cannot inspect the existing collector service');
    assert.ok(result.stdout.includes('ActiveState=active') && !result.stdout.includes('MainPID=0\n'), 'Collector must be active');
    return result.stdout.trim();
}
function patchCaddy(current, snippet) {
    const old = /(?:  # d&f AI competition hub:[^\n]*\n)?  @aiContestRoot path \/ai-contests\n  redir @aiContestRoot \/ai-contests\/ 308\n  handle_path \/ai-contests\/\* \{\n    reverse_proxy http:\/\/127\.0\.0\.1:8765 \{\n      header_up -Cookie\n      header_up -Authorization\n    \}\n  \}\n/g;
    const matches = [...current.matchAll(old)];
    if (!matches.length) {
        assert.ok(current.includes(snippet.trimEnd()), 'AI proxy differs from the known installation');
        assert.ok(!current.includes('@aiContestRoot'), 'Conflicting old AI proxy');
        return current;
    }
    assert.equal(matches.length, 1, 'Expected one old AI proxy block');
    return current.replace(old, () => snippet);
}
function patchHome(current) {
    const old = '<a href="/ai-contests/">AI 赛讯</a>';
    const patched = current.split(old).join('<a href="/calendar">赛事日历</a>');
    assert.ok(!patched.includes('href="/ai-contests'), 'Unexpected remaining AI navigation');
    for (const anchor of ['<nav class="links"', '<nav id="mmenu"']) {
        const start = patched.indexOf(anchor), end = patched.indexOf('</nav>', start);
        assert.ok(start >= 0 && end > start, 'Expected desktop and mobile navigation');
        assert.equal((patched.slice(start, end).match(/href="\/calendar"/g) || []).length, 1, 'Calendar navigation missing or duplicated');
    }
    return patched;
}
function patchAddons(current) {
    const list = JSON.parse(current);
    assert.ok(Array.isArray(list));
    assert.equal(list.filter(item => item === DEST).length, 1, 'Calendar must already be registered exactly once');
    const next = list.filter(item => item !== COLLECTOR);
    return JSON.stringify(next, null, 2) + '\n';
}
function otherAddons() {
    const result = {};
    for (const addon of readJson(CONFIG['addon.json'])) {
        if (typeof addon !== 'string' || !addon.startsWith('/root/.hydro/addons/') || [DEST, COLLECTOR].includes(addon)) continue;
        for (const name of ['index.ts', 'package.json']) {
            const file = path.join(addon, name);
            if (fs.existsSync(file)) result[file] = hash(file);
        }
    }
    return result;
}
async function prepare(root, hydroPackage, qa) {
    const manifest = verify(root), baseline = readJson(path.join(root, 'scripts/merge-baseline.json'));
    fs.mkdirSync(qa, { recursive: true, mode: 0o700 });
    fs.mkdirSync(path.join(qa, 'candidates'), { recursive: true, mode: 0o700 });
    const items = [];
    function add(source, target, expected) {
        assert.ok(TARGETS.has(target), 'Unexpected deployment target'); regular(target);
        const before = digest(target), after = hash(source), stat = before ? fs.statSync(target) : null;
        if (expected !== undefined) assert.ok(before === expected || before === after, `Live file changed since the baseline: ${target}`);
        items.push({ source, target, before, after, mode: stat ? stat.mode & 0o777 : 0o644, uid: stat?.uid || 0, gid: stat?.gid || 0 });
    }
    for (const name of RUNTIME_FILES) add(path.join(root, name), path.join(DEST, name), baseline[name]);
    add(path.join(root, 'collector/index.ts'), path.join(COLLECTOR, 'index.ts'), baseline['collector/index.ts']);
    const patches = {
        'Caddyfile': text => patchCaddy(text, fs.readFileSync(path.join(root, 'collector/caddy.inc'), 'utf8')),
        'addon.json': patchAddons,
        'home.html': patchHome,
    };
    for (const [name, target] of Object.entries(CONFIG)) {
        regular(target);
        const candidate = path.join(qa, 'candidates', name);
        fs.writeFileSync(candidate, patches[name](fs.readFileSync(target, 'utf8')), { mode: 0o600 });
        add(candidate, target);
    }
    regular(path.join(DEST, 'calendar.json'));
    const plan = { name: 'dfacm-calendar-merge', root, hydroPackage, qa, manifestHash: hash(path.join(root, 'manifest.json')),
        createdAt: new Date().toISOString(), versions: versions(hydroPackage), collectorService: service(),
        manualHash: hash(path.join(DEST, 'calendar.json')), otherAddons: otherAddons(), items };
    const esbuild = require(path.join(path.dirname(hydroPackage), 'esbuild'));
    esbuild.buildSync({ entryPoints: [path.join(root, 'index.ts')], bundle: true, platform: 'node', format: 'cjs', write: false,
        external: ['hydrooj'], tsconfigRaw: { compilerOptions: { experimentalDecorators: true } } });
    for (const name of Object.keys(manifest.files).filter(name => /\.(?:c?js)$/.test(name))) {
        const checked = spawnSync(process.execPath, ['--check', path.join(root, name)], { encoding: 'utf8' });
        assert.equal(checked.status, 0, 'Syntax check failed: ' + name + ' ' + checked.stderr);
    }
    fs.copyFileSync(path.join(DEST, 'calendar.json'), path.join(qa, 'calendar.json'));
    const { fetchAiEvents } = require(path.join(root, 'ai.cjs'));
    const events = await fetchAiEvents(); assert.ok(events.length >= 600, 'Existing collector snapshot is incomplete');
    writeJson(path.join(qa, 'collector-cache.json'), { fetchedAt: Date.now(), events });
    plan.collectorEvents = events.length;
    writeJson(path.join(qa, 'plan.json'), plan);
    console.log(JSON.stringify({ stagedFiles: items.length, collectorEvents: events.length, versions: plan.versions, qa }));
}
function assertPlan(plan, current = 'before') {
    assert.equal(plan.name, 'dfacm-calendar-merge');
    assert.deepEqual(versions(plan.hydroPackage), plan.versions, 'Installed dependencies changed');
    assert.equal(service(), plan.collectorService, 'Collector service changed');
    assert.equal(hash(path.join(DEST, 'calendar.json')), plan.manualHash, 'Manual calendar changed during deployment');
    for (const [file, value] of Object.entries(plan.otherAddons)) assert.equal(hash(file), value, 'Other addon changed: ' + file);
    for (const item of plan.items) {
        assert.ok(TARGETS.has(item.target)); regular(item.target);
        assert.equal(digest(item.target), item[current], 'Live file changed during deployment: ' + item.target);
        if (current === 'before') assert.equal(hash(item.source), item.after, 'Candidate changed: ' + item.source);
    }
}
function backupPlan(planFile, backup) {
    const plan = readJson(planFile); verify(plan.root); assertPlan(plan);
    assert.ok(/^\/root\/backups\/calendar-ai-merge\.[A-Za-z0-9]{8}$/.test(backup));
    const state = { ...plan, backup, savedAt: new Date().toISOString(), items: plan.items.map(item => ({ ...item })) };
    for (let i = 0; i < state.items.length; i++) {
        const item = state.items[i]; item.backupFile = path.join(backup, 'original-' + i);
        if (item.before) { fs.copyFileSync(item.target, item.backupFile); fs.chmodSync(item.backupFile, 0o600); }
    }
    writeJson(path.join(backup, 'state.json'), state);
    console.log('Backup saved: ' + backup);
}
function atomicCopy(source, item) {
    assert.ok(TARGETS.has(item.target)); regular(item.target);
    const temp = item.target + `.calendar-merge-${process.pid}.tmp`;
    fs.writeFileSync(temp, fs.readFileSync(source), { flag: 'wx', mode: item.mode });
    fs.chmodSync(temp, item.mode); fs.chownSync(temp, item.uid, item.gid); fs.renameSync(temp, item.target);
}
function activate(backup) {
    const state = readJson(path.join(backup, 'state.json')); verify(state.root); assertPlan(state);
    for (const item of state.items) if (item.before !== item.after) atomicCopy(item.source, item);
    assertPlan(state, 'after');
    writeJson(path.join(backup, 'activated.json'), { at: new Date().toISOString() });
    console.log('Calendar files, two home links, AI navigation compatibility and Caddy API mapping activated.');
}
function restore(backup) {
    assert.ok(/^\/root\/backups\/calendar-ai-merge\.[A-Za-z0-9]{8}$/.test(backup));
    const state = readJson(path.join(backup, 'state.json')); assert.equal(state.backup, backup);
    for (const item of state.items) {
        assert.ok(TARGETS.has(item.target)); regular(item.target);
        const current = digest(item.target);
        assert.ok(current === item.before || current === item.after, 'Live file changed after activation; refusing to overwrite: ' + item.target);
        if (item.before) assert.equal(hash(item.backupFile), item.before, 'Backup checksum mismatch');
    }
    for (const item of state.items) {
        if (item.before) atomicCopy(item.backupFile, item);
        else if (fs.existsSync(item.target)) fs.unlinkSync(item.target);
    }
    writeJson(path.join(backup, 'restored.json'), { at: new Date().toISOString() });
    console.log('Restored this merge; data files and caches preserved.');
}
function postcheck(backup) {
    const state = readJson(path.join(backup, 'state.json')); assertPlan(state, 'after');
    const before = readJson(path.join(backup, 'processes-before.json')), after = readJson(path.join(backup, 'processes-after.json'));
    assert.deepEqual(after.filter(item => item.name !== 'hydrooj'), before.filter(item => item.name !== 'hydrooj'), 'Other PM2 services changed');
    assert.ok(after.some(item => item.name === 'hydrooj' && item.status === 'online'), 'Hydro is not online');
    console.log('Hydro is online. Judge, other addons, collector, manual calendar and installed dependencies verified.');
}
module.exports = { patchCaddy, patchHome, patchAddons, processes, versions, assertPlan, prepare, DEST, COLLECTOR, CONFIG };
if (require.main === module) (async () => {
    const [mode, ...args] = process.argv.slice(2);
    if (mode === 'prepare') await prepare(...args);
    else if (mode === 'ready') {
        const [root, qa] = args, plan = readJson(path.join(qa, 'plan.json')), ok = readJson(path.join(qa, 'native-ok.json'));
        verify(root); assert.equal(hash(path.join(root, 'manifest.json')), plan.manifestHash); assert.equal(ok.manifestHash, plan.manifestHash);
        assert.ok(Date.now() - Date.parse(plan.createdAt) < 30 * 60000, 'Staging expired'); assertPlan(plan);
    } else if (mode === 'native-command') {
        const [root, hydroPackage, qa] = args;
        console.log(`await require(${JSON.stringify(path.join(root, 'scripts/check-native.cjs'))})(require(${JSON.stringify(path.join(hydroPackage, 'src/plugin-api'))}),${JSON.stringify(root)},${JSON.stringify(hydroPackage)},${JSON.stringify(qa)})`);
    } else if (mode === 'processes') {
        let raw = ''; for await (const chunk of process.stdin) raw += chunk;
        console.log(JSON.stringify(processes(raw)));
    } else if (mode === 'backup') backupPlan(...args);
    else if (mode === 'activate') activate(...args);
    else if (mode === 'restore') restore(...args);
    else if (mode === 'postcheck') postcheck(...args);
    else throw new Error('Unknown merge deployment operation');
})().catch(error => { console.error(error.stack); process.exitCode = 1; });
