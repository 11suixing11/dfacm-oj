'use strict';

// Handler-level wiring tests for plugin-swpu-shop: routes and privileges,
// i18n dictionaries, UI injections, record/change awarding and the backfill
// script. index.ts is bundled with esbuild with `hydrooj` stubbed out — no
// Mongo, no badge plugin, no network.

const assert = require('node:assert/strict');
const { test } = require('node:test');
const path = require('node:path');
const Module = require('node:module');
const esbuild = require('esbuild');

const pluginDir = path.resolve(__dirname, '..');
const pluginPath = path.join(pluginDir, 'index.ts');
const compiled = esbuild.buildSync({
    entryPoints: [pluginPath], bundle: true, platform: 'node', format: 'cjs', write: false,
    external: ['hydrooj'], tsconfigRaw: { compilerOptions: { experimentalDecorators: true } },
}).outputFiles[0].text;

const NOW = new Date('2026-10-04T12:00:00Z');

class FakeLedger {
    constructor() { this.docs = []; }
    async insertOne(doc) {
        if (this.docs.some((d) => d.uid === doc.uid && d.ref === doc.ref)) {
            const e = new Error('E11000 duplicate key'); e.code = 11000; throw e;
        }
        this.docs.push({ ...doc, _id: `oid-${this.docs.length + 1}` });
        return { insertedId: 'ok' };
    }
    find(filter) {
        const rows = this.docs.filter((d) => Object.entries(filter).every(([k, v]) => d[k] === v));
        return {
            _rows: rows,
            sort(spec) {
                const [key, dir] = Object.entries(spec)[0];
                this._rows = [...this._rows].sort((a, b) => (a[key] > b[key] ? 1 : a[key] < b[key] ? -1 : 0) * dir);
                return this;
            },
            skip(n) { this._rows = this._rows.slice(n); return this; },
            limit(n) { this._rows = this._rows.slice(0, n); return this; },
            project() { return this; },
            async toArray() { return [...this._rows]; },
            async close() {},
            [Symbol.asyncIterator]() {
                const rows = [...this._rows];
                let i = 0;
                return { async next() { return i < rows.length ? { value: rows[i++], done: false } : { done: true }; } };
            },
        };
    }
    async countDocuments(filter) {
        return this.docs.filter((d) => Object.entries(filter).every(([k, v]) => d[k] === v)).length;
    }
    aggregate(pipeline) {
        let rows = [...this.docs];
        for (const stage of pipeline) {
            if (stage.$match) rows = rows.filter((d) => Object.entries(stage.$match).every(([k, v]) => d[k] === v));
            if (stage.$group) rows = [{ _id: null, total: rows.reduce((s, d) => s + (d.delta || 0), 0) }];
        }
        return { async toArray() { return [...rows]; } };
    }
}

class FakePrice {
    constructor(docs = []) { this.docs = [...docs]; }
    async findOne(filter) { return this.docs.find((d) => d._id === filter._id) || null; }
    async updateOne(filter, update, options = {}) {
        let doc = this.docs.find((d) => d._id === filter._id);
        if (!doc && options.upsert) { doc = { _id: filter._id }; this.docs.push(doc); }
        if (doc) Object.assign(doc, update.$set || {});
        return { matchedCount: doc ? 1 : 0 };
    }
    find() { const docs = [...this.docs]; return { async toArray() { return docs; } }; }
}

async function fixture({ env = {}, badgeReady = true, badges = [], records = [], prices = [] } = {}) {
    const ledger = new FakeLedger();
    const price = new FakePrice(prices);
    const userBadgeDocs = [];
    const userBadgeAdds = [];
    const routes = new Map();
    const listeners = {};
    const nav = [];
    const locales = [];
    const scripts = new Map();
    const indexes = [];
    const saved = Object.fromEntries(Object.keys(env).map((k) => [k, process.env[k]]));
    Object.assign(process.env, env);

    const badgeModel = {
        badgeGetMulti: () => ({ async toArray() { return [...badges]; } }),
        badgeGet: async (ctx, id) => badges.find((b) => b._id === id) || null,
    };
    const userBadgeModel = {
        userBadgeAdd: async (ctx, uid, badgeId) => { userBadgeAdds.push({ uid, badgeId }); userBadgeDocs.push({ owner: uid, badgeId }); return 'oid'; },
        userBadgeGetMulti: () => ({ async toArray() { return [...userBadgeDocs]; } }),
    };
    const problems = new Map();
    const recordColl = {
        find(filter) {
            const rows = records.filter((d) => Object.entries(filter).every(([k, v]) => d[k] === v));
            return {
                _rows: rows,
                sort(spec) {
                    const [key, dir] = Object.entries(spec)[0];
                    this._rows = [...this._rows].sort((a, b) => (a[key] > b[key] ? 1 : a[key] < b[key] ? -1 : 0) * dir);
                    return this;
                },
                project() { return this; },
                limit(n) { this._rows = this._rows.slice(0, n); return this; },
                async toArray() { return [...this._rows]; },
                async close() {},
                [Symbol.asyncIterator]() {
                    const rows = [...this._rows];
                    let i = 0;
                    return { async next() { return i < rows.length ? { value: rows[i++], done: false } : { done: true }; } };
                },
            };
        },
    };

    const collectionsByName = {
        swpuPointsLedger: ledger,
        swpuBadgePrice: price,
        userBadge: { async findOne(f) { return userBadgeDocs.find((d) => d.owner === f.owner && d.badgeId === f.badgeId) || null; } },
    };
    const stub = {
        db: {
            collection: (name) => collectionsByName[name],
            ensureIndexes: async (coll, ...args) => { indexes.push([coll, args]); },
        },
        Handler: class {
            constructor() {
                this.response = { body: {}, headers: {}, addHeader: (k, v) => { this.response.headers[k] = v; } };
                this.user = { _id: 42, uname: 'student', hasPriv: (bit) => (bit & 4) === 4 };
            }
            async limitRate() {}
        },
        Logger: class { info() {} error() {} },
        param: () => () => {},
        post: () => () => {},
        PRIV: { PRIV_USER_PROFILE: 4, PRIV_MANAGE_ALL_DOMAIN: 4096 },
        Types: { String: [], UnsignedInt: [], PositiveInt: [], Boolean: [] },
        RecordModel: { coll: recordColl },
        Schema: { object: (shape) => shape, string: () => ({ default: (v) => v }) },
    };
    if (badgeReady) {
        global.Hydro = { model: { badge: badgeModel, userBadge: userBadgeModel } };
    } else {
        delete global.Hydro;
    }
    const loaded = new Module(pluginPath, module);
    loaded.filename = pluginPath;
    loaded.paths = module.paths;
    loaded.require = (id) => (id === 'hydrooj' ? { ...stub, ProblemModel: { get: async (d, p) => problems.get(`${d}#${p}`) || null } } : require(id));
    loaded._compile(compiled, pluginPath);
    await loaded.exports.apply({
        Route(name, url, HandlerClass, priv) {
            const entry = { name, HandlerClass, priv };
            if (routes.has(url)) routes.get(url).post = entry;
            else routes.set(url, { ...entry, post: null });
        },
        injectUI: (node, name, args, priv) => nav.push({ node, name, args, priv }),
        i18n: { load: (lang, dict) => locales.push({ lang, dict }) },
        on: (event, fn) => { listeners[event] = fn; },
        addScript: (name, description, schema, run) => { scripts.set(name, { description, schema, run }); },
    });
    for (const [key, value] of Object.entries(saved)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
    }
    const handler = (url, method = 'get', args = undefined) => {
        const entry = routes.get(url);
        const h = new (method === 'post' && entry.post ? entry.post : entry).HandlerClass();
        if (badgeReady) h.ctx = {};
        if (args !== undefined) h.args = args;
        return h;
    };
    return {
        ledger, price, routes, listeners, nav, locales, scripts, indexes, handler,
        userBadgeAdds, problems, badgeModel, userBadgeModel,
        seedProblem: (domainId, pid, doc) => problems.set(`${domainId}#${pid}`, doc),
    };
}

test('routes, privileges, UI injections and i18n are registered', async () => {
    const f = await fixture();
    assert.equal(f.routes.get('/shop').priv, undefined); // guest-visible
    assert.equal(f.routes.get('/shop/redeem').priv, 4);
    assert.equal(f.routes.get('/shop/history').priv, 4);
    assert.equal(f.routes.get('/manage/shop').priv, 4096);
    assert.deepEqual(f.nav.map((n) => [n.node, n.name, n.priv]), [
        ['UserDropdown', 'shop', 4],
        ['ControlPanel', 'shop_manage', 4096],
    ]);
    const zh = f.locales.find((l) => l.lang === 'zh');
    const en = f.locales.find((l) => l.lang === 'en');
    assert.equal(zh.dict.shop, '积分商店');
    assert.equal(zh.dict.shop_manage, '积分商店管理');
    assert.equal(en.dict.shop, 'Points Shop');
    // unique idempotency index on the ledger is requested at startup
    const ledgerIndexes = f.indexes.filter(([coll]) => coll === f.ledger);
    assert.equal(ledgerIndexes.length, 1);
    assert.equal(ledgerIndexes[0][1][0].unique, true);
});

test('shop page lists badges with prices and marks owned ones for signed-in users', async () => {
    const f = await fixture({
        badges: [
            { _id: 7, short: '队长', title: '队长徽章', backgroundColor: '#2a5caa', fontColor: '#ffffff' },
            { _id: 8, short: '新人', title: '新人徽章', backgroundColor: '#c9a227', fontColor: '#000000' },
        ],
        prices: [{ _id: 7, price: 10, enabled: true }],
    });
    const h = f.handler('/shop');
    await h.get('system');
    assert.equal(h.response.template, 'shop.html');
    assert.equal(h.response.body.signedIn, true);
    assert.equal(h.response.body.balance, 0);
    const listed = h.response.body.badges;
    assert.equal(listed.length, 2);
    const onSale = listed.find((b) => b._id === 7);
    assert.equal(onSale.enabled, true);
    assert.equal(onSale.price, 10);
    assert.equal(onSale.owned, false);
    assert.equal(listed.find((b) => b._id === 8).enabled, false);
    // sorting: on-sale first
    assert.equal(listed[0]._id, 7);
});

test('shop page renders for guests without balance data', async () => {
    const f = await fixture({
        badges: [{ _id: 7, short: '队长', title: '队长徽章', backgroundColor: '#2a5caa', fontColor: '#ffffff' }],
        prices: [{ _id: 7, price: 10, enabled: true }],
    });
    const h = f.handler('/shop');
    h.user = { _id: 0, uname: 'Guest', hasPriv: () => false };
    await h.get('system');
    assert.equal(h.response.body.signedIn, false);
    assert.equal(h.response.body.balance, null);
    assert.equal(h.response.body.badges.length, 1);
});

test('redeem endpoint debits the ledger and redirects to /mybadge', async () => {
    const f = await fixture({
        badges: [{ _id: 7, short: '队长', title: '队长徽章', backgroundColor: '#2a5caa', fontColor: '#ffffff' }],
        prices: [{ _id: 7, price: 10, enabled: true }],
    });
    await f.ledger.insertOne({ uid: 42, delta: 15, ref: 'solve:system:1', kind: 'solve', detail: 'P1', ts: NOW });
    const h = f.handler('/shop/redeem');
    await h.post('system', 7);
    assert.equal(h.response.redirect, '/mybadge');
    assert.equal(f.ledger.docs.length, 2);
    assert.equal(f.ledger.docs[1].delta, -10);
    assert.deepEqual(f.userBadgeAdds, [{ uid: 42, badgeId: 7 }]);
});

// Both shop clients are plain HTML form POSTs, so a JSON error body is never
// rendered: the redirect wins and the browser would show raw JSON. A failed
// redemption therefore sends the member back with the reason in the query.
test('a failed redemption returns the member to /shop with the reason', async () => {
    for (const [label, prices, balance] of [
        ['insufficient', [{ _id: 7, price: 10, enabled: true }], 2],
        ['not listed', [{ _id: 7, price: 10, enabled: false }], 99],
        ['no such badge', [{ _id: 8, price: 10, enabled: true }], 99],
    ]) {
        const f = await fixture({
            badges: [{ _id: 7, short: '队长', title: '队长徽章' }],
            prices,
        });
        await f.ledger.insertOne({ uid: 42, delta: balance, ref: 'solve:system:1', kind: 'solve', detail: 'P1', ts: NOW });
        const h = f.handler('/shop/redeem');
        const target = label === 'no such badge' ? 8 : 7;
        await assert.rejects(() => h.post('system', target));
        assert.match(h.response.redirect, /^\/shop\?error=/, label);
        const message = decodeURIComponent(h.response.redirect.split('error=')[1]);
        assert.ok(message.length > 0, label);
        assert.equal(h.response.body.ok, false);
        assert.equal(f.userBadgeAdds.length, 0, `${label} must not grant a badge`);
        // The GET handler hands the message to the template.
        const page = f.handler('/shop', 'get', { error: message });
        await page.get('system');
        assert.equal(page.response.body.error, message);
    }
});

// A badge-plugin failure after the debit must not destroy the member's points.
test('a failed badge grant refunds the debit and explains itself', async () => {
    const f = await fixture({
        badges: [{ _id: 7, short: '队长', title: '队长徽章' }],
        prices: [{ _id: 7, price: 10, enabled: true }],
    });
    await f.ledger.insertOne({ uid: 42, delta: 15, ref: 'solve:system:1', kind: 'solve', detail: 'P1', ts: NOW });
    f.userBadgeModel.userBadgeAdd = async () => { throw new Error('badge plugin exploded'); };
    const h = f.handler('/shop/redeem');
    await assert.rejects(() => h.post('system', 7));
    assert.match(h.response.redirect, /^\/shop\?error=/);
    assert.match(decodeURIComponent(h.response.redirect.split('error=')[1]), /积分已退回/);
    // Debit plus its compensating credit, so the balance is unchanged.
    assert.equal(f.ledger.docs.length, 3);
    assert.equal(f.ledger.docs[1].delta, -10);
    assert.equal(f.ledger.docs[2].delta, 10);
    assert.equal(f.ledger.docs[2].kind, 'refund');
    // The refund ref must be unique per attempt, not colliding with the debit key.
    assert.notEqual(f.ledger.docs[2].ref, f.ledger.docs[1].ref);
});

test('history page shows prefix-sum balances with pagination', async () => {
    const f = await fixture();
    for (let i = 1; i <= 22; i++) {
        await f.ledger.insertOne({
            uid: 42, delta: 2, ref: `solve:system:${i}`, kind: 'solve',
            detail: `P${i}`, ts: new Date(NOW.getTime() + i * 60000),
        });
    }
    const h = f.handler('/shop/history');
    await h.get('system', 2);
    assert.equal(h.response.template, 'history.html');
    assert.equal(h.response.body.page, 2);
    assert.equal(h.response.body.pages, 2);
    assert.equal(h.response.body.balance, 44);
    const items = h.response.body.items;
    assert.equal(items.length, 2);
    assert.equal(items[0].balance, 42); // prefix sum continues across pages (40 before + 2)
    assert.equal(items[1].balance, 44);
});

test('manage page lists every badge including unpriced ones', async () => {
    const f = await fixture({
        badges: [
            { _id: 7, short: '队长', title: '队长徽章', backgroundColor: '#2a5caa', fontColor: '#ffffff' },
            { _id: 8, short: '新人', title: '新人徽章', backgroundColor: '#c9a227', fontColor: '#000000' },
        ],
        prices: [{ _id: 7, price: 10, enabled: true }],
    });
    const h = f.handler('/manage/shop');
    await h.get('system');
    assert.equal(h.response.template, 'manage.html');
    assert.equal(h.response.body.badges.length, 2);
    const priced = h.response.body.badges.find((b) => b._id === 7);
    const unpriced = h.response.body.badges.find((b) => b._id === 8);
    assert.equal(priced.price, 10);
    assert.equal(priced.enabled, true);
    assert.equal(unpriced.price, null);
    assert.equal(unpriced.enabled, false);
});

test('manage save upserts the price row and rejects bad operations', async () => {
    const f = await fixture();
    const h = f.handler('/manage/shop', 'post');
    await h.post('system', 'price', 7, 30, true);
    assert.equal(h.response.redirect, '/manage/shop');
    assert.equal(f.price.docs.length, 1);
    assert.equal(f.price.docs[0]._id, 7);
    assert.equal(f.price.docs[0].price, 30);
    assert.equal(f.price.docs[0].enabled, true);
    assert.ok(f.price.docs[0].updatedAt instanceof Date);
    // A rejected operation returns the admin to the page with the reason.
    const bad = f.handler('/manage/shop', 'post');
    await assert.rejects(bad.post('system', 'destroy', 7, 1, true), /不支持的操作/);
    assert.match(bad.response.redirect, /^\/manage\/shop\?error=/);
});

test('record/change hook awards on AC end events only, with instance-0 guard', async () => {
    const base = { records: [], badges: [], prices: [] };
    const f = await fixture(base);
    f.seedProblem('system', 1000, { title: 'A+B问题', hidden: false, owner: 9, difficulty: 6 });
    const emit = (...args) => f.listeners['record/change'](...args);
    const settle = () => new Promise((resolve) => setImmediate(resolve));
    emit({ domainId: 'system', uid: 42, pid: 1000, status: 2 }, null, null, { key: 'end' }); // WA: no award
    emit({ domainId: 'system', uid: 42, pid: 1000, status: 1 }, null, null, { key: 'next' }); // not final
    emit({ domainId: 'system', uid: 42, pid: 1000, status: 1 }); // no body
    await settle();
    assert.equal(f.ledger.docs.length, 0);
    emit({ domainId: 'system', uid: 42, pid: 1000, status: 1 }, null, null, { key: 'end' });
    await settle();
    assert.equal(f.ledger.docs.length, 1);
    assert.equal(f.ledger.docs[0].delta, 6);
    assert.equal(f.ledger.docs[0].ref, 'solve:system:1000');
    emit({ domainId: 'system', uid: 42, pid: 1000, status: 1 }, null, null, { key: 'end' }); // replay: idempotent
    await settle();
    assert.equal(f.ledger.docs.length, 1);

    const worker = await fixture({ env: { NODE_APP_INSTANCE: '1' }, ...base });
    assert.equal(worker.listeners['record/change'], undefined);
    const main = await fixture({ env: { NODE_APP_INSTANCE: '0' }, ...base });
    assert.equal(typeof main.listeners['record/change'], 'function');
});

test('backfill script deduplicates by (uid, pid) and stays idempotent with live awards', async () => {
    const records = [
        { domainId: 'system', uid: 42, pid: 1000, status: 1, _id: 'r1' },
        { domainId: 'system', uid: 42, pid: 1001, status: 1, _id: 'r2' },
        { domainId: 'system', uid: 42, pid: 1000, status: 1, _id: 'r3' }, // duplicate pair
        { domainId: 'system', uid: 43, pid: 1000, status: 1, _id: 'r4' },
        { domainId: 'system', uid: 42, pid: 1002, status: 2, _id: 'r5' }, // not AC
    ];
    const f = await fixture({ records });
    f.seedProblem('system', 1000, { title: 'P1000', hidden: false, owner: 9, difficulty: 4 });
    f.seedProblem('system', 1001, { title: 'P1001', hidden: false, owner: 9, nSubmit: 20, nAccept: 4 });
    f.seedProblem('system', 1002, { title: 'P1002', hidden: false, owner: 9, difficulty: 9 });
    const messages = [];
    const run = f.scripts.get('swpuShopBackfill');
    assert.ok(run, 'swpuShopBackfill registered');
    assert.equal(await run.run({ domainId: '' }, (m) => messages.push(m)), true);
    // 42:1000, 42:1001, 43:1000 — the duplicate pair and the non-AC record do not credit
    assert.equal(f.ledger.docs.length, 3);
    assert.ok(f.ledger.docs.every((d) => d.kind === 'backfill'));
    assert.deepEqual(f.ledger.docs.map((d) => d.ref).sort(),
        ['solve:system:1000', 'solve:system:1000', 'solve:system:1001']);
    // a second run credits nothing new
    const before = f.ledger.docs.length;
    await run.run({ domainId: 'system' }, () => {});
    assert.equal(f.ledger.docs.length, before);
    assert.ok(messages.some((m) => (m.message || '').includes('回填完成')));
});
