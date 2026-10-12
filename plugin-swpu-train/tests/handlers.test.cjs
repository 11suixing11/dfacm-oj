'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const path = require('node:path');
const Module = require('node:module');
const esbuild = require('esbuild');
const { FakeCollection } = require('./fake-collection.cjs');
const {
    buildRecentTrainings, indexPlanPids, lastActiveByPlan,
} = require('../workbench.cjs');

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
    // Plans for /workbench/recent: A and B contain the fixture record pids
    // (1001/1002), C contains none of them.
    const trainingDocs = [
        { docId: 'tdocA', title: '一本通基础', pin: 0, dag: [{ _id: 1, title: '语言基础', requireNids: [], pids: [1001, 1003] }] },
        { docId: 'tdocB', title: '蓝桥杯真题', pin: 0, dag: [{ _id: 1, title: '基础训练', requireNids: [], pids: [1002] }] },
        { docId: 'tdocC', title: 'XCPC 专题', pin: 0, dag: [{ _id: 1, title: '热身综合', requireNids: [], pids: [2001] }] },
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
        // A shared session object stands in for Hydro's, so a token minted while
        // rendering /mistakes is visible to the POST handlers — which is the
        // property CSRF relies on.
        session: {},
        Handler: class {
            constructor() {
                this.response = { body: {}, headers: {}, addHeader: (k, v) => { this.response.headers[k] = v; } };
                this.user = { _id: 42, uname: 'student' };
                this.session = stub.session;
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
            getMulti: () => cursor(trainingDocs),
            getMultiStatus: () => ({ toArray: async () => [] }),
            getList: async (domainId, tids) => Object.fromEntries((tids || [])
                .map((tid) => [String(tid), trainingDocs.find((d) => d.docId === String(tid))])
                .filter(([, v]) => v)),
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
        collection, routes, listeners, nav, locales, limits, recordQueries, stub, handler,
        // Renders /mistakes and returns the CSRF token it embedded, the way a
        // real client obtains one.
        csrf: async () => {
            const page = handler('/mistakes');
            await page.get('system');
            const match = /window\.__SWPU_CSRF__="([0-9a-f]{64})"/.exec(String(page.response.body));
            if (!match) throw new Error('no CSRF token embedded in /mistakes');
            return match[1];
        },
    };
}

test('routes require login, pages are served no-store, nav and locales are registered', async () => {
    const f = await fixture();
    for (const url of ['/workbench', '/workbench/data', '/workbench/recent', '/mistakes', '/mistakes/data', '/mistakes/update', '/mistakes/remove', '/mistakes/sync']) {
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

test('/workbench/recent ranks plans by the newest submission inside them', async () => {
    const f = await fixture();
    const h = f.handler('/workbench/recent');
    await h.get('system');
    assert.equal(h.response.body.ok, true);
    assert.ok(f.limits.some((l) => l[0] === 'swpu_train_recent' && l[2] === 30 && l[3] === 'u42'),
        'must spend its own rate-limit budget');
    const trainings = h.response.body.data.trainings;
    // Fixture records: 1001 (plan A) newest on 10-07, 1002 (plan B) on 10-05,
    // plan C contains none of them. Ranking must follow record time, not docId.
    assert.equal(trainings.length, 2);
    assert.equal(trainings[0].tid, 'tdocA');
    assert.equal(trainings[0].url, '/training/tdocA');
    assert.equal(trainings[0].source, 'record');
    assert.equal(trainings[0].lastActiveAt, '2026-10-07T10:00:00.000Z');
    assert.equal(trainings[0].done, 0);
    assert.equal(trainings[0].total, 2);
    assert.equal(trainings[1].tid, 'tdocB');
    assert.equal(trainings[1].done, 1);
    assert.equal(trainings[1].total, 1);
    assert.equal(trainings[1].percent, 100);
    assert.equal(trainings[1].completed, true);
    assert.equal(trainings[1].lastActiveAt, '2026-10-05T10:00:00.000Z');
});

test('/workbench/recent falls back to enrolled plans when no scanned record hits any plan', async () => {
    const f = await fixture();
    const emptyCursor = { project() { return this; }, sort() { return this; }, limit() { return this; }, async toArray() { return []; } };
    f.stub.RecordModel.getMulti = () => emptyCursor;
    f.stub.TrainingModel.getMultiStatus = () => ({
        toArray: async () => [{ docId: 'tdocA', enroll: 1 }, { docId: 'tdocC', enroll: 1 }],
    });
    const h = f.handler('/workbench/recent');
    await h.get('system');
    const trainings = h.response.body.data.trainings;
    assert.equal(trainings.length, 2);
    // Pin tie → newest docId first, mirroring buildWorkbench's enrolment order.
    assert.equal(trainings[0].tid, 'tdocC');
    assert.equal(trainings[0].source, 'enrolled');
    assert.equal(trainings[0].lastActiveAt, null);
    assert.equal(trainings[1].tid, 'tdocA');
});

test('/workbench/recent answers an empty list for a member with no activity at all', async () => {
    const f = await fixture();
    const emptyCursor = { project() { return this; }, sort() { return this; }, limit() { return this; }, async toArray() { return []; } };
    f.stub.RecordModel.getMulti = () => emptyCursor;
    const h = f.handler('/workbench/recent');
    await h.get('system');
    assert.equal(h.response.body.ok, true);
    assert.deepEqual(h.response.body.data.trainings, []);
});

test('lastActiveByPlan: a shared pid marks every plan containing it; junk timestamps are ignored', () => {
    const a = { docId: 'a', dag: [{ pids: [7] }] };
    const b = { docId: 'b', dag: [{ pids: [7, 9] }] };
    const byPid = indexPlanPids([a, b]);
    const last = lastActiveByPlan([
        { pid: 7, at: new Date('2026-10-01T00:00:00Z') },
        { pid: 7, at: 'not a date' },
        { pid: 7, at: new Date('2026-10-03T00:00:00Z') },
        { pid: 42, at: new Date('2026-10-05T00:00:00Z') }, // pid outside every plan
    ], byPid);
    assert.equal(last.get(a).toISOString(), '2026-10-03T00:00:00.000Z');
    assert.equal(last.get(b).toISOString(), '2026-10-03T00:00:00.000Z');
});

test('buildRecentTrainings caps the list at maxTrainings', async () => {
    const plans = [1, 2, 3, 4].map((n) => ({
        docId: `t${n}`, title: `路线${n}`, pin: 0, dag: [{ _id: 1, title: 'c', requireNids: [], pids: [n * 10] }],
    }));
    const data = await buildRecentTrainings({
        domainId: 'system',
        uid: 42,
        trainingModel: {
            getMulti: () => ({ async toArray() { return plans; } }),
            getMultiStatus: () => ({ toArray: async () => [] }),
            getList: async () => ({}),
        },
        problemModel: { getListStatus: async () => ({}) },
        records: [
            { pid: 40, at: new Date('2026-10-04T00:00:00Z') },
            { pid: 30, at: new Date('2026-10-03T00:00:00Z') },
            { pid: 20, at: new Date('2026-10-02T00:00:00Z') },
            { pid: 10, at: new Date('2026-10-01T00:00:00Z') },
        ],
        maxTrainings: 2,
    });
    assert.deepEqual(data.trainings.map((t) => t.tid), ['t4', 't3']);
    assert.equal(data.trainings[0].lastActiveAt, '2026-10-04T00:00:00.000Z');
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
    const token = await f.csrf();
    f.listeners['record/change']({ domainId: 'system', uid: 42, pid: 1001, status: 2, _id: 'rid1' }, null, null, { key: 'end' });
    await new Promise((resolve) => setImmediate(resolve));
    const bad = f.handler('/mistakes/update');
    await bad.post('system', 1001, 'nonsense', undefined, undefined, token);
    assert.equal(bad.response.body.ok, false);
    assert.match(bad.response.body.message, /错误原因/);
    const missing = f.handler('/mistakes/update');
    await missing.post('system', 9999, undefined, 'note', undefined, token);
    assert.equal(missing.response.body.ok, false);
    assert.match(missing.response.body.message, /错题本/);
    const good = f.handler('/mistakes/update');
    await good.post('system', 1001, 'boundary', ' 没考虑 n=1 ', undefined, token);
    assert.equal(good.response.body.ok, true);
    const doc = f.collection.docs.find((d) => d.pid === 1001);
    assert.equal(doc.reason, 'boundary');
    assert.equal(doc.note, '没考虑 n=1');
    const toggle = f.handler('/mistakes/update');
    await toggle.post('system', 1001, undefined, undefined, true, token);
    assert.equal(f.collection.docs.find((d) => d.pid === 1001).resolved, true);
    const remove = f.handler('/mistakes/remove');
    await remove.post('system', 1001, token);
    assert.equal(remove.response.body.ok, true);
    assert.equal(f.collection.docs.filter((d) => d.pid === 1001).length, 0);
});

// The three POSTs change state for the signed-in member using nothing but the
// session cookie, so a cross-site caller must not be able to drive them.
test('mistake-book POSTs reject a missing or wrong CSRF token', async () => {
    const cases = [
        ['update without a token', '/mistakes/update', ['system', 1001, 'boundary', undefined, undefined]],
        ['update with a wrong token', '/mistakes/update', ['system', 1001, 'boundary', undefined, undefined, 'f'.repeat(64)]],
        ['update with a truncated token', '/mistakes/update', ['system', 1001, 'boundary', undefined, undefined, 'abc']],
        ['remove without a token', '/mistakes/remove', ['system', 1001]],
        ['remove with a wrong token', '/mistakes/remove', ['system', 1001, '0'.repeat(64)]],
        ['sync without a token', '/mistakes/sync', ['system']],
        ['sync with a wrong token', '/mistakes/sync', ['system', '0'.repeat(64)]],
    ];
    for (const [label, url, args] of cases) {
        const f = await fixture();
        // Mint a real token so only the submitted value is wrong.
        await f.csrf();
        f.listeners['record/change']({ domainId: 'system', uid: 42, pid: 1001, status: 2, _id: 'rid1' }, null, null, { key: 'end' });
        await new Promise((resolve) => setImmediate(resolve));
        const before = JSON.stringify(f.collection.docs);
        const h = f.handler(url);
        await h.post(...args);
        assert.equal(h.response.body.ok, false, label);
        assert.match(h.response.body.message, /会话已过期/, label);
        assert.equal(JSON.stringify(f.collection.docs), before, `${label}: nothing may change`);
        // A rejected request must not even consume the rate-limit budget.
        assert.equal(f.limits.length, 0, `${label}: must not spend quota`);
    }
});

test('the workbench page carries no token because it never mutates', async () => {
    const f = await fixture();
    const page = f.handler('/workbench');
    await page.get('system');
    assert.ok(!String(page.response.body).includes('__SWPU_CSRF__'));
    assert.equal(f.stub.session.swpuTrainCsrf, undefined, 'no token is minted for a read-only page');
});

// The mistakes page offers a "未分类" option whose value is the empty string.
// The store rejected it, so choosing it returned "错误原因不在可选范围内。".
test('the "unclassified" reason is storable and clearing it is allowed', async () => {
    const f = await fixture();
    const token = await f.csrf();
    f.listeners['record/change']({ domainId: 'system', uid: 42, pid: 1001, status: 2, _id: 'rid1' }, null, null, { key: 'end' });
    await new Promise((resolve) => setImmediate(resolve));
    const set = f.handler('/mistakes/update');
    await set.post('system', 1001, '', undefined, undefined, token);
    assert.equal(set.response.body.ok, true, JSON.stringify(set.response.body));
    assert.equal(f.collection.docs.find((d) => d.pid === 1001).reason, '');
    // Still refuses a genuinely unknown value.
    const bad = f.handler('/mistakes/update');
    await bad.post('system', 1001, 'nonsense', undefined, undefined, token);
    assert.equal(bad.response.body.ok, false);
});

// remove() reported whether a row went away, but the handler discarded it and
// always answered ok, claiming a deletion that never happened.
test('removing a row that is not in the mistake book is reported, not faked', async () => {
    const f = await fixture();
    const token = await f.csrf();
    f.listeners['record/change']({ domainId: 'system', uid: 42, pid: 1001, status: 2, _id: 'rid1' }, null, null, { key: 'end' });
    await new Promise((resolve) => setImmediate(resolve));
    const absent = f.handler('/mistakes/remove');
    await absent.post('system', 9999, token);
    assert.equal(absent.response.body.ok, false);
    assert.match(absent.response.body.message, /不在你的错题本/);
    // Another member's row is out of reach: remove scopes on the session uid.
    const other = f.handler('/mistakes/remove');
    f.collection.docs.push({ domainId: 'system', uid: 99, pid: 1001, resolved: false, lastAt: new Date() });
    await other.post('system', 1001, token);
    assert.equal(other.response.body.ok, true);
    assert.equal(f.collection.docs.some((d) => d.uid === 42), false, 'the caller\'s own row is gone');
    assert.equal(f.collection.docs.some((d) => d.uid === 99 && d.pid === 1001), true, 'another member\'s row is untouched');
});

// /mistakes/sync ran the backfill unguarded while its two siblings caught
// errors, so a database failure surfaced as a 500.
test('a failing sync is reported as a message rather than thrown', async () => {
    const f = await fixture();
    const token = await f.csrf();
    // The backfill reads through RecordModel.getMulti first.
    f.stub.RecordModel.getMulti = () => { throw new Error('db exploded'); };
    const h = f.handler('/mistakes/sync');
    await h.post('system', token);
    assert.equal(h.response.body.ok, false);
    assert.match(h.response.body.message, /同步失败/);
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
    const token = await f.csrf();
    const h = f.handler('/mistakes/sync');
    await h.post('system', token);
    assert.equal(h.response.body.ok, true);
    assert.equal(h.response.body.collected, 2);
    assert.ok(f.limits.some((l) => l[0] === 'swpu_train_sync' && l[2] === 1));
    assert.equal(f.collection.docs.some((d) => d.pid === 0), true);
});
