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

async function fixture(options) {
    const demo = await createDemo(options); const session = {}; const calls = [];
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

// Minimal browser boundary: execute the complete shipped UI against real HTTP
// handler payloads. Only DOM/timers/fetch are local doubles; detector/store and
// all page rendering code remain real. No browser packages required in releases.
async function renderDetail(payload) {
    class Element {
        constructor(tag = 'div') { this.tagName = tag; this.dataset = {}; this.children = []; this.listeners = {}; this.isConnected = true;
            this.classList = { add() {}, toggle() {} }; this._text = ''; }
        set textContent(value) { this._text = String(value); this.children = []; }
        get textContent() { return this._text + this.children.map(v => v.textContent).join(''); }
        append(...children) { this.children.push(...children); }
        replaceChildren(...children) { this._text = ''; this.children = children; }
        setAttribute() {}
        addEventListener(type, callback) { this.listeners[type] = callback; }
        showModal() { this.open = true; }
    }
    const template = fs.readFileSync(path.join(__dirname, '../templates/watch_content.html'), 'utf8');
    const elements = Object.fromEntries([...template.matchAll(/id="([^"]+)"/g)].map(v => [v[1], new Element()]));
    elements['ai-watch'].dataset = { endpoint: '/data' }; elements['aw-filters'].elements = { days: { value: '1' } };
    const document = { getElementById: id => elements[id], createElement: tag => new Element(tag),
        createTextNode: text => { const node = new Element(); node.textContent = text; return node; },
        addEventListener() {}, documentElement: new Element(), hidden: false };
    const list = { reports: [payload.report], stats: { total: 1, high: 0, pending: 1, cleared: 0, escalated: 0 },
        health: { scope: 'all', contests: [], retentionDays: 30, intervalMs: 1000 }, generatedAt: '2026-10-31T08:00:02Z' };
    const vm = require('node:vm');
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../public/watch.js'), 'utf8'), {
        document, window: { addEventListener() {} }, location: { href: 'http://localhost/', origin: 'http://localhost' },
        URL, URLSearchParams, AbortController, setTimeout: () => 1, clearTimeout() {},
        fetch: async url => ({ ok: true, json: async () => url.pathname === '/data' ? list : payload }),
    });
    await new Promise(setImmediate);
    elements['aw-rows'].listeners.click({ target: { closest: () => ({ dataset: { rid: payload.report.rid } }) } });
    await new Promise(setImmediate);
    return elements['aw-detail-content'];
}

test('E3 HTTP and UI retain same-second comparison with precision and neutral timing labels', async () => {
    const at = Date.parse('2026-10-31T08:00:00Z'); const f = await fixture({ now: () => at + 2000, seed: false });
    try {
        await f.demo.addJob(1086, at + 100); const record = await f.demo.submit({ time: at + 900 }); await f.demo.engine.tick();
        const detail = new f.WatchReportHandler(); detail.args.rid = record._id; await detail.get();
        assert.equal(detail.response.status, 200); const payload = detail.response.body;
        assert.equal(payload.evidence.assistant.timing, 'uncertain'); assert.equal(payload.report.submissionTime.precision, 'second');
        assert.equal(payload.report.analysis.conclusion, 'undetermined'); assert.equal(payload.report.score, 0);
        const page = await renderDetail(payload);
        const sourceSection = page.children.find(child => child.children[0]?.textContent === '源码对照');
        assert.match(sourceSection.textContent, /同秒.*先后未知/);
        assert.doesNotMatch(sourceSection.textContent, /本人先前获取/);
        assert.match(page.textContent, /提交时间区间/); assert.match(page.textContent, /不含上界/);
        assert.match(page.textContent, /\.100/); // Source milliseconds remain visible beside the second-wide interval.
        assert.equal(f.demo.records.docs.get(record._id).status, 1);
    } finally { f.demo.engine.stop(); }
});

test('E3 legacy same-second high report is readable without repeating an earlier-source claim while reanalysis is pending', async () => {
    const at = Date.parse('2026-10-31T08:00:00Z'); const f = await fixture({ now: () => at + 2000, seed: false });
    try {
        await f.demo.addJob(1086, at); const record = await f.demo.submit({ time: at + 900 }); await f.demo.engine.tick();
        const report = await f.demo.store.get('system', record._id); const signal = report.analysis.signals[0];
        const old = { ...report.analysis, version: '0.1.0', priority: 'high', score: 90, signals: [{ ...signal, strength: 'traceable', weight: 90,
            title: '匹配本人先前获取的站内 AI 代码', detail: '先前返回的题解', reference: { ...signal.reference, timing: undefined } }] };
        await f.demo.reports.updateOne({ _id: report._id }, { $set: { analysis: old }, $unset: { submissionTime: '' } });
        const detail = new f.WatchReportHandler(); detail.args.rid = record._id; await detail.get();
        const payload = detail.response.body;
        assert.equal(payload.report.analysisStale, true); assert.equal(payload.report.priority, 'low');
        assert.equal(payload.report.analysis.signals[0].reference.timing, 'uncertain');
        assert.equal(payload.evidence.assistant.timing, 'uncertain');
        const page = await renderDetail(payload); assert.match(page.textContent, /旧规则.*重算/);
        assert.doesNotMatch(page.textContent, /先前返回|本人先前获取/);
        assert.equal((await f.demo.store.get('system', record._id)).analysis.version, '0.1.0', 'read compatibility does not rewrite persisted history');
    } finally { f.demo.engine.stop(); }
});
