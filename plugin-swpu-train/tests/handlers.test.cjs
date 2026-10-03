'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const path = require('node:path');
const Module = require('node:module');
const esbuild = require('esbuild');
const { FakeCollection } = require('./fake-collection.cjs');

const pluginPath = path.resolve(__dirname, '..', 'index.ts');
// Bundle with esbuild (devDependency of the regcode plugin, resolved from this
// repo's shared node_modules) so `hydrooj` can be stubbed below.
const compiled = esbuild.buildSync({
    entryPoints: [pluginPath], bundle: true, platform: 'node', format: 'cjs', write: false,
    external: ['hydrooj'], tsconfigRaw: { compilerOptions: { experimentalDecorators: true } },
}).outputFiles[0].text;

const rid = (iso) => ({ getTimestamp: () => new Date(iso), toString: () => `r-${iso}` });

async function fixture({ env = {} } = {}) {
    const collection = new FakeCollection();
    const routes = new Map();
    const listeners = {};
    const nav = [];
    const locales = [];
    const limits = [];
    const recordQueries = [];
    const saved = Object.fromEntries(Object.keys(env).map((k) => [k, process.env[k]]));
    Object.assign(process.env, env);
    const recordDocs = [
        { pid: 1001, status: 2, _id: rid('2026-10-07T10:00:00Z') },
        { pid: 1001, status: 3, _id: rid('2026-10-06T10:00:00Z') },
        { pid: 1002, status: 6, _id: rid('2026-10-05T10:00:00Z') },
    ];
    const cursor = (docs) => ({
        docs,
        project() { return this; },
        sort() { return this; },
        limit(n) { this.docs = this.docs.slice(0, n); return this; },
        async toArray() { return this.docs; },
    });
    const stub = {
        db: { collection: () => collection, ensureIndexes: async () => {} },
        Handler: class {
            constructor() {
                this.response = { body: {}, headers: {}, addHeader: (k, v) => { this.response.headers[k] = v; } };
                this.user = { _id: 42, uname: 'student' };
            }
            async limitRate(...args) { limits.push(args); }
        },
        Logger: class { info() {} error() {} },
        param: () => () => {}, post: () => () => {},
        PRIV: { PRIV_USER_PROFILE: 4 },
        Types: { String: [], UnsignedInt: [], Boolean: [] },
        Time: { getObjectID: (d) => `oid-${d.toISOString()}` },
        RecordModel: {
            getMulti: (domainId, query) => {
                recordQueries.push(query);
                return cursor(query._id ? [] : recordDocs); // weekly window vs failure scans
            },
        },
        ProblemModel: {
            getListStatus: async () => ({ 1002: { status: 1 } }),
            getList: async (domainId, pids) => Object.fromEntries(pids.map((pid) => [
                pid,
                pid === 1001 ? { docId: 1001, pid: 'P1001', title: 'A+B 问题' } : { docId: 0, title: '*' },
            ])),
        },
        TrainingModel: {
            getMultiStatus: () => ({ toArray: async () => [] }),
            getList: async () => ({}),
        },
    };
    const loaded = new Module(pluginPath, module);
    loaded.filename = pluginPath;
    loaded.paths = module.paths;
    loaded.require = (id) => (id === 'hydrooj' ? stub : require(id));
    loaded._compile(compiled, pluginPath);
    await loaded.exports.apply({
        Route(name, url, HandlerClass, priv) { routes.set(url, { name, HandlerClass, priv }); },
        injectUI: (node, name, args, priv) => nav.push({ node, name, priv }),
        i18n: { load: (lang, dict) => locales.push({ lang, dict }) },
        on: (event, fn) => { listeners[event] = fn; },
    });
    for (const [key, value] of Object.entries(saved)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
    }
    const handler = (url) => new (routes.get(url).HandlerClass)();
    return {
        collection, routes, listeners, nav, locales, limits, recordQueries, handler,
    };
}

test('routes require login, pages are served no-store, nav and locales are registered', async () => {
    const f = await fixture();
    for (const url of ['/workbench', '/workbench/data', '/mistakes', '/mistakes/data', '/mistakes/update', '/mistakes/remove', '/mistakes/sync']) {
        assert.ok(f.routes.has(url), url);
        assert.equal(f.routes.get(url).priv, 4, url);
    }
    assert.deepEqual(f.nav.map((n) => n.name), ['swpu_workbench', 'swpu_mistakes']);
    assert.ok(f.locales.some((l) => l.lang === 'zh' && l.dict.swpu_workbench === '工作台'));
    const page = f.handler('/workbench');
    await page.get();
    assert.match(page.response.type, /text\/html/);
    assert.equal(page.response.headers['Cache-Control'], 'no-store');
    assert.match(String(page.response.body), /训练工作台/);
    const book = f.handler('/mistakes');
    await book.get();
    assert.match(String(book.response.body), /错题本/);
});

test('workbench data is assembled for the signed-in user with rate limits', async () => {
    const f = await fixture();
    const h = f.handler('/workbench/data');
    await h.get('system');
    assert.equal(h.response.body.ok, true);
    assert.equal(h.response.body.data.user.uname, 'student');
    assert.equal(Array.isArray(f.recordQueries), true);
    assert.ok(f.limits.some((l) => l[0] === 'swpu_train_data' && l[3] === 'u42'));
});

test('first mistakes visit backfills from recent failures, later visits skip it', async () => {
    const f = await fixture();
    const h = f.handler('/mistakes/data');
    await h.get('system', 'all', 1);
    assert.equal(h.response.body.ok, true);
    assert.equal(f.recordQueries.length, 1); // backfill scan
    // 1001 failed twice in the window; 1002 was AC in problem status → resolved
    const items = h.response.body.items;
    assert.equal(items.length, 2);
    const one = items.find((i) => i.pid === 1001);
    assert.equal(one.title, 'A+B 问题');
    assert.equal(one.url, '/p/P1001');
    assert.equal(one.attempts, 2);
    assert.equal(one.statusLabel, 'WA'); // newest record in the scan wins
    assert.equal(one.resolved, false);
    assert.equal(one.recordUrl, '/record/r-2026-10-07T10:00:00Z');
    const two = items.find((i) => i.pid === 1002);
    assert.equal(two.resolved, true);
    assert.equal(two.url, null); // not visible in problem list
    assert.equal(h.response.body.open, 1);
    const again = f.handler('/mistakes/data');
    await again.get('system', 'done', 1);
    assert.equal(f.recordQueries.length, 1); // marker present → no rescan
    assert.equal(again.response.body.items[0].pid, 1002);
});

test('update validates input, saves review fields and toggles resolution', async () => {
    const f = await fixture();
    f.listeners['record/change']({ domainId: 'system', uid: 42, pid: 1001, status: 2, _id: 'rid1' }, null, null, { key: 'end' });
    await new Promise((resolve) => setImmediate(resolve));
    const bad = f.handler('/mistakes/update');
    await bad.post('system', 1001, 'nonsense', undefined, undefined);
    assert.equal(bad.response.body.ok, false);
    assert.match(bad.response.body.message, /错误原因/);
    const missing = f.handler('/mistakes/update');
    await missing.post('system', 9999, undefined, 'note', undefined);
    assert.equal(missing.response.body.ok, false);
    assert.match(missing.response.body.message, /错题本/);
    const good = f.handler('/mistakes/update');
    await good.post('system', 1001, 'boundary', ' 没考虑 n=1 ', undefined);
    assert.equal(good.response.body.ok, true);
    const doc = f.collection.docs.find((d) => d.pid === 1001);
    assert.equal(doc.reason, 'boundary');
    assert.equal(doc.note, '没考虑 n=1');
    const toggle = f.handler('/mistakes/update');
    await toggle.post('system', 1001, undefined, undefined, true);
    assert.equal(f.collection.docs.find((d) => d.pid === 1001).resolved, true);
    const remove = f.handler('/mistakes/remove');
    await remove.post('system', 1001);
    assert.equal(remove.response.body.ok, true);
    assert.equal(f.collection.docs.filter((d) => d.pid === 1001).length, 0);
});

test('record/change hook collects failures live and AC resolves them', async () => {
    const f = await fixture();
    const emit = (...args) => f.listeners['record/change'](...args);
    emit({ domainId: 'system', uid: 42, pid: 1001, status: 2, _id: 'rid1' }, null, null, { key: 'next' });
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(f.collection.docs.length, 0);
    emit({ domainId: 'system', uid: 42, pid: 1001, status: 2, _id: 'rid1' }, null, null, { key: 'end' });
    emit({ domainId: 'system', uid: 42, pid: 1002, status: 3, _id: 'rid2', contest: '000000000000000000000000' }, null, null, { key: 'end' });
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(f.collection.docs.length, 1);
    emit({ domainId: 'system', uid: 42, pid: 1001, status: 1, _id: 'rid3' }, null, null, { key: 'end' });
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(f.collection.docs.find((d) => d.pid === 1001).resolved, true);
});

test('hook registration honors SWPU_TRAIN_MISTAKES=0 and non-zero pm2 instances', async () => {
    const off = await fixture({ env: { SWPU_TRAIN_MISTAKES: '0' } });
    assert.equal(off.listeners['record/change'], undefined);
    const worker = await fixture({ env: { NODE_APP_INSTANCE: '1' } });
    assert.equal(worker.listeners['record/change'], undefined);
    const main = await fixture({ env: { NODE_APP_INSTANCE: '0' } });
    assert.equal(typeof main.listeners['record/change'], 'function');
});

test('manual sync is rate limited and writes the marker', async () => {
    const f = await fixture();
    const h = f.handler('/mistakes/sync');
    await h.post('system');
    assert.equal(h.response.body.ok, true);
    assert.equal(h.response.body.collected, 2);
    assert.ok(f.limits.some((l) => l[0] === 'swpu_train_sync' && l[2] === 1));
    assert.equal(f.collection.docs.some((d) => d.pid === 0), true);
});
