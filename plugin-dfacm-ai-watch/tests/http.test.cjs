'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const Module = require('node:module');
const { stripTypeScriptTypes } = require('node:module');
const { createDemo } = require('../demo.cjs');
const { createHandlers, csrfToken } = require('../http.cjs');
const { createPreviewServer } = require('../preview.cjs');

async function fixture() {
    const demo = await createDemo(); const session = {}; const calls = [];
    class Handler {
        constructor() { this.args = { domainId: 'system' }; this.domain = { _id: 'system' }; this.session = session;
            this.request = { body: {}, query: {} }; this.user = { _id: 2, hasPriv: () => true };
            this.response = { headers: {}, addHeader(key, value) { this.headers[key] = value; } }; }
        async limitRate(...args) { calls.push(args); }
        url(name, args = {}) { return name === 'record_detail' ? `/record/${args.rid}` : name === 'dfacm_ai_watch_report' ? `/manage/ai-watch/report/${args.rid}`
            : name === 'dfacm_ai_watch_asset' ? `/manage/ai-watch/assets/${args.file}` : '/manage/ai-watch/data'; }
    }
    return { demo, Handler, session, calls, ...createHandlers({ Handler, store: demo.store, config: demo.config, adminPrivilege: 64, root: path.resolve(__dirname, '..') }) };
}

test('every handler checks administrator privilege and configured route domain before reading data', async () => {
    const f = await fixture();
    try {
        for (const Type of [f.WatchPageHandler, f.WatchDataHandler, f.WatchReportHandler, f.WatchAssetHandler]) {
            const anonymous = new Type(); anonymous.user.hasPriv = () => false; await anonymous.get();
            assert.equal(anonymous.response.status, 403); assert.equal(anonymous.response.body.code, 'FORBIDDEN');
            const other = new Type(); other.domain._id = 'other'; await other.get();
            assert.equal(other.response.status, 403); assert.equal(other.response.body.code, 'DOMAIN_DISABLED');
        }
        const queryDomain = new f.WatchDataHandler(); queryDomain.request.query = { domainId: 'other' }; await queryDomain.get();
        assert.equal(queryDomain.response.body.stats.total, 6);
        assert.equal(queryDomain.response.headers['Cache-Control'], 'private, no-store');
        assert.equal(JSON.stringify(queryDomain.response.body).includes('Count subarrays'), false);
    } finally { f.demo.engine.stop(); }
});

test('review requires a user-bound session CSRF token and validates revision without changing judgment', async () => {
    const f = await fixture();
    try {
        const report = [...f.demo.reports.docs.values()][0]; const original = f.demo.records.docs.get(report.rid).status;
        const page = new f.WatchPageHandler(); await page.get(); assert.equal(page.response.template, 'dfacm_ai_watch.html');
        const bad = new f.WatchReportHandler(); bad.args.rid = report.rid;
        bad.request.body = { status: 'cleared', note: '核实为允许模板', revision: 0, csrf: 'bad' }; await bad.post();
        assert.equal(bad.response.status, 403); assert.equal((await f.demo.store.get('system', report.rid)).review.revision, 0);
        const good = new f.WatchReportHandler(); good.args.rid = report.rid; good.request.body = { ...bad.request.body, csrf: page.response.body.csrf }; await good.post();
        assert.equal(good.response.status, 200); assert.equal(good.response.body.report.review.status, 'cleared');
        assert.equal(f.demo.records.docs.get(report.rid).status, original);
        const changedUser = new f.WatchReportHandler(); changedUser.args.rid = report.rid; changedUser.user._id = 3;
        changedUser.request.body = { ...good.request.body, revision: 1 }; await changedUser.post(); assert.equal(changedUser.response.status, 403);
        const invalid = new f.WatchReportHandler(); invalid.args.rid = report.rid;
        invalid.request.body = { ...good.request.body, revision: '1' }; await invalid.post(); assert.equal(invalid.response.status, 400);
    } finally { f.demo.engine.stop(); }
});

test('asset endpoint has a filename allowlist and detail responses only carry scoped evidence', async () => {
    const f = await fixture();
    try {
        const attack = new f.WatchAssetHandler(); attack.args.file = '../../index.ts'; await attack.get(); assert.equal(attack.response.status, 404);
        const asset = new f.WatchAssetHandler(); asset.args.file = 'watch-0.1.0.js'; await asset.get(); assert.match(asset.response.body, /textContent/);
        const detail = new f.WatchReportHandler(); detail.args.rid = [...f.demo.reports.docs.values()].find(v => v.analysis.priority === 'high').rid; await detail.get();
        assert.equal(detail.response.body.evidence.assistant.code.includes('countTargetSubarrays'), true);
        assert.equal(detail.response.body.report.fingerprint, undefined);
    } finally { f.demo.engine.stop(); }
});

test('Hydro entry registers four protected routes and disposable record event worker with only addon indexes', async () => {
    const routes = []; const indexes = []; const events = []; const effects = []; const memory = require('../memory.cjs');
    const stub = { Context: class {}, Handler: class {}, Logger: class { info() {} warn() {} }, ObjectId: class {},
        PRIV: { PRIV_MANAGE_ALL_DOMAIN: 64 }, ProblemModel: {}, RecordModel: { coll: memory.memoryCollection() },
        db: { collection: name => { const collection = memory.memoryCollection(); collection.name = name; return collection; }, ensureIndexes: async (collection, ...specs) => indexes.push({ name: collection.name, specs }) } };
    const root = path.resolve(__dirname, '..'); const filename = path.join(root, 'compiled-check.cjs');
    const text = stripTypeScriptTypes(fs.readFileSync(path.join(root, 'index.ts'), 'utf8'))
        .replace(/import \{([\s\S]*?)\} from 'hydrooj';/, "const {$1} = require('hydrooj');").replace(/export (const|async function)/g, '$1') + '\nmodule.exports = { apply };';
    const runtime = new Module(filename, module); runtime.filename = filename; runtime.paths = Module._nodeModulePaths(root);
    const originalRequire = runtime.require.bind(runtime); runtime.require = id => id === 'hydrooj' ? stub : originalRequire(id); runtime._compile(text, filename);
    await runtime.exports.apply({ Route: (...args) => routes.push(args), on: (...args) => events.push(args), effect: callback => { effects.push(callback); }, injectUI() {}, i18n: { load() {} } });
    assert.equal(routes.length, 4); for (const route of routes) assert.equal(route[3], 64);
    assert.equal(events[0][0], 'record/change'); assert.equal(effects.length, 1);
    assert.deepEqual(indexes.map(v => v.name), ['dfacm_ai_watch_reports', 'dfacm_ai_watch_sources', 'dfacm_ai_watch_state']);
    const originalCli = process.env.HYDRO_CLI; events.length = 0; effects.length = 0;
    try {
        process.env.HYDRO_CLI = '1';
        await runtime.exports.apply({ Route() {}, on: (...args) => events.push(args), effect: callback => effects.push(callback), injectUI() {}, i18n: { load() {} } });
        assert.equal(events.length, 0); assert.equal(effects.length, 0);
    } finally { if (originalCli === undefined) delete process.env.HYDRO_CLI; else process.env.HYDRO_CLI = originalCli; }
});

test('standalone preview serves real analysis, new submit events, CSRF review and rejects cross-origin posts', async () => {
    const { server, demo } = await createPreviewServer(); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    try {
        const html = await (await fetch(`${base}/manage/ai-watch`)).text(); assert.match(html, /data-demo="true"/); const token = html.match(/data-csrf="([a-f0-9]+)"/)[1];
        const data = await (await fetch(`${base}/manage/ai-watch/data`)).json(); assert.equal(data.stats.high, 1);
        const high = data.reports.find(v => v.priority === 'high'); const detail = await (await fetch(base + high.detailUrl)).json(); assert.equal(detail.evidence.code, detail.evidence.assistant.code);
        const rejected = await fetch(`${base}/manage/ai-watch/demo-submit`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://foreign.example' }, body: JSON.stringify({ csrf: token }) }); assert.equal(rejected.status, 403);
        const response = await fetch(`${base}/manage/ai-watch/demo-submit`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base }, body: JSON.stringify({ csrf: token }) });
        const created = await response.json(); assert.equal(created.ok, true); await demo.engine.tick();
        assert.equal((await demo.store.get('system', created.rid)).analysis.priority, 'high');
        const reviewed = await fetch(base + high.detailUrl, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base }, body: JSON.stringify({ csrf: token, status: 'escalated', note: '需要核实来源使用规则', revision: 0 }) });
        assert.equal(reviewed.status, 200); assert.equal((await reviewed.json()).report.review.status, 'escalated');
    } finally { demo.engine.stop(); await new Promise(resolve => server.close(resolve)); }
});
