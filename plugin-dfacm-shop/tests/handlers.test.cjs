'use strict';

// Handler-level wiring tests for plugin-dfacm-shop: routes and privileges,
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
    async findOne(filter) {
        return this.docs.find((d) => Object.entries(filter).every(([k, v]) => d[k] === v)) || null;
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

// swpuTitles 桩：uid 唯一（解锁幂等第二道闸）+ 常规 CRUD/find 游标。
class FakeTitles {
    constructor(docs = []) { this.docs = [...docs]; }
    async findOne(filter) {
        return this.docs.find((d) => Object.entries(filter).every(([k, v]) => d[k] === v)) || null;
    }
    async insertOne(doc) {
        if (this.docs.some((d) => d.uid === doc.uid)) {
            const e = new Error('E11000 duplicate key'); e.code = 11000; throw e;
        }
        this.docs.push({ ...doc, _id: `toid-${this.docs.length + 1}` });
        return { insertedId: 'ok' };
    }
    async updateOne(filter, update) {
        const doc = this.docs.find((d) => Object.entries(filter).every(([k, v]) => d[k] === v));
        if (doc) Object.assign(doc, update.$set || {});
        return { matchedCount: doc ? 1 : 0 };
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
            async toArray() { return [...this._rows]; },
        };
    }
}

async function fixture({ env = {}, badgeReady = true, badges = [], records = [], prices = [], titleDocs = [] } = {}) {
    const ledger = new FakeLedger();
    const price = new FakePrice(prices);
    const titles = new FakeTitles(titleDocs);
    const userBadgeDocs = [];
    const userBadgeAdds = [];
    const userBadgeDels = [];
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
        // badgeAdd 源码同款：max(_id)+1 分配，insert 后把 users 逐个写入持有。
        badgeAdd: async (ctx, short, title, backgroundColor, fontColor, content, users) => {
            const id = badges.reduce((m, b) => Math.max(m, b._id), 0) + 1;
            badges.push({ _id: id, short, title, backgroundColor, fontColor, content, users: [...users] });
            for (const uid of users) await userBadgeModel.userBadgeAdd(null, uid, id);
            return id;
        },
        // badgeEdit 只改徽章文档（真实实现还会给佩戴者重序列化 user.badge，
        // 那是调用方不可见的副作用，不在 handler 测试的断言范围）。
        badgeEdit: async (ctx, id, short, title, backgroundColor, fontColor) => {
            const b = badges.find((x) => x._id === id);
            if (!b) throw new Error('badge missing');
            Object.assign(b, { short, title, backgroundColor, fontColor });
            return 1;
        },
    };
    const userBadgeModel = {
        userBadgeAdd: async (ctx, uid, badgeId) => { userBadgeAdds.push({ uid, badgeId }); userBadgeDocs.push({ owner: uid, badgeId }); return 'oid'; },
        userBadgeGetMulti: () => ({ async toArray() { return [...userBadgeDocs]; } }),
        userBadgeDel: async (ctx, uid, badgeId) => {
            userBadgeDels.push({ uid, badgeId });
            const i = userBadgeDocs.findIndex((d) => d.owner === uid && d.badgeId === badgeId);
            if (i >= 0) userBadgeDocs.splice(i, 1);
            return 1;
        },
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
        swpuTitles: titles,
        userBadge: { async findOne(f) { return userBadgeDocs.find((d) => d.owner === f.owner && d.badgeId === f.badgeId) || null; } },
    };
    const stub = {
        db: {
            collection: (name) => collectionsByName[name],
            ensureIndexes: async (coll, ...args) => { indexes.push([coll, args]); },
        },
        // A shared session object stands in for Hydro's, so a token minted by one
        // handler is visible to the next — which is exactly the property CSRF
        // depends on.
        session: {},
        Handler: class {
            constructor() {
                this.response = { body: {}, headers: {}, addHeader: (k, v) => { this.response.headers[k] = v; } };
                this.user = { _id: 42, uname: 'student', hasPriv: (bit) => (bit & 4) === 4 };
                this.session = stub.session;
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
        // user.getList 是 badge 插件与 Hydro 本体同款的管理端名单接口；
        // 管理页用它把 uid 渲染成 uname，这里给恒空映射走 #uid 回退。
        global.Hydro = { model: { badge: badgeModel, userBadge: userBadgeModel, user: { getList: async () => ({}) } } };
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
        ledger, price, titles, routes, listeners, nav, locales, scripts, indexes, handler,
        userBadgeAdds, userBadgeDels, problems, badgeModel, userBadgeModel,
        seedProblem: (domainId, pid, doc) => problems.set(`${domainId}#${pid}`, doc),
    };
}

test('routes, privileges, UI injections and i18n are registered', async () => {
    const f = await fixture();
    assert.equal(f.routes.get('/shop').priv, undefined); // guest-visible
    assert.equal(f.routes.get('/shop/redeem').priv, 4);
    assert.equal(f.routes.get('/shop/history').priv, 4);
    assert.equal(f.routes.get('/manage/shop').priv, 4096);
    // 菜单入口的注入名必须是已注册路由名：ui-default 用 url(item.name) 生成
    // href，名字对不上路由表时会渲染出字面量 "Error: No route found ..."。
    assert.deepEqual(f.nav.map((n) => [n.node, n.name, n.priv]), [
        ['UserDropdown', 'swpu_shop', 4],
        ['ControlPanel', 'swpu_shop_manage', 4096],
    ]);
    const zh = f.locales.find((l) => l.lang === 'zh');
    const en = f.locales.find((l) => l.lang === 'en');
    assert.equal(zh.dict.swpu_shop, '积分商店');
    assert.equal(zh.dict.swpu_shop_manage, '积分商店管理');
    assert.equal(en.dict.swpu_shop, 'Points Shop');
    // unique idempotency index on the ledger is requested at startup
    const ledgerIndexes = f.indexes.filter(([coll]) => coll === f.ledger);
    assert.equal(ledgerIndexes.length, 1);
    assert.equal(ledgerIndexes[0][1][0].unique, true);
});

test('shop page shelves on-sale badges only, cheapest first, with progress and the next goal', async () => {
    const f = await fixture({
        badges: [
            { _id: 7, short: '队长', title: '队长徽章', backgroundColor: '#2a5caa', fontColor: '#ffffff' },
            { _id: 8, short: '新人', title: '新人徽章', backgroundColor: '#c9a227', fontColor: '#000000' },
            { _id: 9, short: '身份', title: '未上架徽章', backgroundColor: '#111111', fontColor: '#ffffff' },
        ],
        // #9 是管理员直发的身份徽章：未上架，不进学生货架。
        prices: [
            { _id: 8, price: 30, enabled: true },
            { _id: 7, price: 10, enabled: true },
            { _id: 9, price: 5, enabled: false },
        ],
    });
    await f.ledger.insertOne({ uid: 42, delta: 8, ref: 'solve:system:1', kind: 'solve', detail: 'P1', ts: NOW });
    // uid 42 已拥有 #8（直接发过），owned 卡不再带进度数据。
    f.userBadgeModel.userBadgeAdd(null, 42, 8);
    const h = f.handler('/shop');
    await h.get('system');
    assert.equal(h.response.template, 'shop.html');
    assert.equal(h.response.body.signedIn, true);
    assert.equal(h.response.body.balance, 8);
    const listed = h.response.body.badges;
    // 未上架的 #9 不列；卡序 = 阶梯价升序（10 分的 #7 在 30 分的 #8 前）。
    assert.deepEqual(listed.map((b) => b._id), [7, 8]);
    const goal = listed[0];
    assert.equal(goal.price, 10);
    assert.equal(goal.owned, false);
    assert.equal(goal.can, false); // 8 < 10
    assert.equal(goal.need, 2);
    assert.equal(goal.progress, 80); // floor(8 * 100 / 10)
    const owned = listed[1];
    assert.equal(owned.owned, true);
    assert.equal(owned.need, null);
    assert.equal(owned.can, null);
    assert.equal(owned.progress, null);
    // 下一目标跳过已拥有的 #8，指向最便宜的未拥有徽章 #7。
    assert.deepEqual(h.response.body.next, { title: '队长徽章', need: 2 });
});

test('shop page progress math: an affordable card shows can=true and never becomes the next goal', async () => {
    const f = await fixture({
        badges: [
            { _id: 7, short: '队长', title: '队长徽章' },
            { _id: 8, short: '新人', title: '新人徽章' },
        ],
        prices: [
            { _id: 7, price: 10, enabled: true },
            { _id: 8, price: 30, enabled: true },
        ],
    });
    await f.ledger.insertOne({ uid: 42, delta: 12, ref: 'solve:system:1', kind: 'solve', detail: 'P1', ts: NOW });
    const h = f.handler('/shop');
    await h.get('system');
    const [affordable, outOfReach] = h.response.body.badges;
    assert.equal(affordable.can, true);
    assert.equal(affordable.need, 0);
    assert.equal(affordable.progress, 100);
    assert.equal(outOfReach.can, false);
    assert.equal(outOfReach.need, 18);
    assert.equal(outOfReach.progress, 40);
    // 够得着的 #7 不算「下一目标」，#8 才是。
    assert.deepEqual(h.response.body.next, { title: '新人徽章', need: 18 });
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
    assert.equal(h.response.body.next, null);
    const [card] = h.response.body.badges;
    assert.equal(card._id, 7);
    assert.equal(card.owned, false);
    assert.equal(card.need, null);
    assert.equal(card.can, null);
    assert.equal(card.progress, null);
});

test('redeem endpoint debits the ledger and redirects to /mybadge', async () => {
    const f = await fixture({
        badges: [{ _id: 7, short: '队长', title: '队长徽章', backgroundColor: '#2a5caa', fontColor: '#ffffff' }],
        prices: [{ _id: 7, price: 10, enabled: true }],
    });
    await f.ledger.insertOne({ uid: 42, delta: 15, ref: 'solve:system:1', kind: 'solve', detail: 'P1', ts: NOW });
    const page = f.handler('/shop');
    await page.get('system');
    const h = f.handler('/shop/redeem');
    await h.post('system', 7, page.response.body.csrf);
    assert.equal(h.response.redirect, '/mybadge');
    assert.equal(f.ledger.docs.length, 2);
    assert.equal(f.ledger.docs[1].delta, -10);
    assert.deepEqual(f.userBadgeAdds, [{ uid: 42, badgeId: 7 }]);
});

// Both POSTs spend points or rewrite pricing using nothing but the session
// cookie, so a cross-site form post would otherwise go through.
test('state-changing POSTs reject a missing or wrong CSRF token', async () => {
    for (const [label, url, args] of [
        ['redeem without a token', '/shop/redeem', ['system', 7]],
        ['redeem with a wrong token', '/shop/redeem', ['system', 7, 'f'.repeat(64)]],
        ['redeem with a truncated token', '/shop/redeem', ['system', 7, 'abc']],
        ['pricing without a token', '/manage/shop', ['system', 'price', 7, 30, true]],
        ['pricing with a wrong token', '/manage/shop', ['system', 'price', 7, 30, true, '0'.repeat(64)]],
    ]) {
        const f = await fixture({
            badges: [{ _id: 7, short: '队长', title: '队长徽章' }],
            prices: [{ _id: 7, price: 10, enabled: true }],
        });
        await f.ledger.insertOne({ uid: 42, delta: 15, ref: 'solve:system:1', kind: 'solve', detail: 'P1', ts: NOW });
        // Mint a legitimate token so only the submitted value is wrong.
        const page = f.handler(url === '/shop/redeem' ? '/shop' : '/manage/shop');
        await page.get('system');
        assert.equal(page.response.body.csrf.length, 64, label);
        const h = f.handler(url, 'post');
        await assert.rejects(() => h.post(...args), label);
        // The message travels URL-encoded in the query string.
        assert.match(decodeURIComponent(h.response.redirect), /会话已过期/, label);
        assert.equal(f.userBadgeAdds.length, 0, `${label}: must not grant a badge`);
        assert.equal(f.ledger.docs.length, 1, `${label}: must not debit`);
        assert.equal(f.price.docs.length, 1, `${label}: must not change pricing`);
    }
});

// The token must be per-session and stable across requests, or every POST fails.
test('the CSRF token is stable within a session and absent for guests', async () => {
    const f = await fixture({ badges: [{ _id: 7, short: 'a', title: 'A' }], prices: [] });
    const first = f.handler('/shop');
    await first.get('system');
    const second = f.handler('/shop');
    await second.get('system');
    assert.equal(first.response.body.csrf, second.response.body.csrf);
    assert.match(first.response.body.csrf, /^[0-9a-f]{64}$/);
    // A guest has no redeem form, so no token is minted for them.
    const guest = f.handler('/shop');
    guest.user = { _id: 0, uname: 'Guest', hasPriv: () => false };
    await guest.get('system');
    assert.equal(guest.response.body.csrf, '');
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
        const page = f.handler('/shop');
        await page.get('system');
        const h = f.handler('/shop/redeem');
        const target = label === 'no such badge' ? 8 : 7;
        await assert.rejects(() => h.post('system', target, page.response.body.csrf));
        assert.match(h.response.redirect, /^\/shop\?error=/, label);
        const message = decodeURIComponent(h.response.redirect.split('error=')[1]);
        assert.ok(message.length > 0, label);
        assert.equal(h.response.body.ok, false);
        assert.equal(f.userBadgeAdds.length, 0, `${label} must not grant a badge`);
        // The GET handler hands the message to the template.
        const bounced = f.handler('/shop', 'get', { error: message });
        await bounced.get('system');
        assert.equal(bounced.response.body.error, message);
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
    const page = f.handler('/shop');
    await page.get('system');
    const h = f.handler('/shop/redeem');
    await assert.rejects(() => h.post('system', 7, page.response.body.csrf));
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
    const page = f.handler('/manage/shop');
    await page.get('system');
    const h = f.handler('/manage/shop', 'post');
    await h.post('system', 'price', 7, 30, true, page.response.body.csrf);
    assert.equal(h.response.redirect, '/manage/shop');
    assert.equal(f.price.docs.length, 1);
    assert.equal(f.price.docs[0]._id, 7);
    assert.equal(f.price.docs[0].price, 30);
    assert.equal(f.price.docs[0].enabled, true);
    assert.ok(f.price.docs[0].updatedAt instanceof Date);
    // A rejected operation returns the admin to the page with the reason.
    const bad = f.handler('/manage/shop', 'post');
    await assert.rejects(bad.post('system', 'destroy', 7, 1, true, page.response.body.csrf), /不支持的操作/);
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

// --- 称号工坊（DIY 称号：合成徽章，全站用户名旁展示） -----------------------

test('title workshop routes registered with the right privileges', async () => {
    const f = await fixture();
    assert.equal(f.routes.get('/shop/title').priv, 4);
    assert.equal(f.routes.get('/shop/title/unlock').priv, 4);
    assert.equal(f.routes.get('/shop/title/save').priv, 4);
    assert.equal(f.routes.get('/manage/shop/title').priv, 4096);
});

test('workshop page shows the locked state with prices, palette and the ok flag', async () => {
    const f = await fixture();
    const h = f.handler('/shop/title');
    await h.get('system');
    assert.equal(h.response.template, 'title.html');
    assert.equal(h.response.body.unlocked, false);
    assert.equal(h.response.body.canUnlock, false);
    assert.equal(h.response.body.unlockPrice, 500);
    assert.equal(h.response.body.editPrice, 50);
    assert.equal(h.response.body.maxChars, 4);
    assert.equal(h.response.body.palettes.length, 6);
    assert.match(h.response.body.csrf, /^[0-9a-f]{64}$/);
    const ok = f.handler('/shop/title', 'get', { ok: '1' });
    await ok.get('system');
    assert.equal(ok.response.body.ok, true);
});

test('shop page carries the title privilege card state for guests and members', async () => {
    const guest = await fixture();
    const g = guest.handler('/shop');
    g.user = { _id: 0, uname: 'Guest', hasPriv: () => false };
    await g.get('system');
    assert.deepEqual(g.response.body.titlePriv, { unlocked: false, price: 500 });
    const member = await fixture({ titleDocs: [{ uid: 42, active: true, minted: 0 }] });
    const m = member.handler('/shop');
    await m.get('system');
    assert.deepEqual(m.response.body.titlePriv, { unlocked: true, price: 500 });
});

test('unlock debits 500 and creates the state row; insufficient funds bounce back', async () => {
    const f = await fixture();
    await f.ledger.insertOne({ uid: 42, delta: 600, ref: 'solve:system:1', kind: 'solve', detail: 'P1', ts: NOW });
    const page = f.handler('/shop/title');
    await page.get('system');
    const h = f.handler('/shop/title/unlock');
    await h.post('system', page.response.body.csrf);
    assert.equal(h.response.redirect, '/shop/title');
    assert.equal(f.ledger.docs.length, 2);
    assert.deepEqual(
        { delta: f.ledger.docs[1].delta, kind: f.ledger.docs[1].kind, ref: f.ledger.docs[1].ref },
        { delta: -500, kind: 'title', ref: 'title_unlock' },
    );
    assert.equal(f.titles.docs.length, 1);
    assert.equal(f.titles.docs[0].minted, 0);
    // 余额不足：不扣分、不建行，原因带回查询串
    const f2 = await fixture();
    await f2.ledger.insertOne({ uid: 42, delta: 300, ref: 'solve:system:1', kind: 'solve', detail: 'P1', ts: NOW });
    const p2 = f2.handler('/shop/title');
    await p2.get('system');
    const h2 = f2.handler('/shop/title/unlock');
    await assert.rejects(() => h2.post('system', p2.response.body.csrf));
    assert.match(decodeURIComponent(h2.response.redirect), /积分不足/);
    assert.equal(f2.titles.docs.length, 0);
    assert.equal(f2.ledger.docs.length, 1);
});

test('save mints the first title free, then charges 50 per edit', async () => {
    const f = await fixture();
    await f.ledger.insertOne({ uid: 42, delta: 600, ref: 'solve:system:1', kind: 'solve', detail: 'P1', ts: NOW });
    const page = f.handler('/shop/title');
    await page.get('system');
    const unlock = f.handler('/shop/title/unlock');
    await unlock.post('system', page.response.body.csrf);
    const save = f.handler('/shop/title/save');
    await save.post('system', '卷王', 'gold', page.response.body.csrf);
    assert.equal(save.response.redirect, '/shop/title?ok=1');
    // 首铸免费：只有解锁那一笔扣费
    assert.equal(f.ledger.docs.length, 2);
    assert.deepEqual(f.userBadgeAdds, [{ uid: 42, badgeId: 1 }], 'badgeAdd 写入持有');
    assert.equal(f.titles.docs[0].minted, 1);
    assert.equal(f.titles.docs[0].text, '卷王');
    assert.equal(f.titles.docs[0].bg, '#c9a227');
    // 第二次保存 = 修改，扣 50
    const save2 = f.handler('/shop/title/save');
    await save2.post('system', '摆烂', 'midnight', page.response.body.csrf);
    assert.equal(f.ledger.docs.length, 3);
    assert.equal(f.ledger.docs[2].delta, -50);
    assert.equal(f.titles.docs[0].text, '摆烂');
    assert.equal(f.titles.docs[0].bg, '#16233d');
});

test('save rejects invalid text and unknown palettes without debiting', async () => {
    const f = await fixture();
    await f.ledger.insertOne({ uid: 42, delta: 600, ref: 'solve:system:1', kind: 'solve', detail: 'P1', ts: NOW });
    const page = f.handler('/shop/title');
    await page.get('system');
    const unlock = f.handler('/shop/title/unlock');
    await unlock.post('system', page.response.body.csrf);
    for (const [label, text, palette] of [
        ['too long', '今天也要加油鸭', 'gold'],
        ['blocked word', '官方认证', 'gold'],
        ['empty', '  ', 'gold'],
        ['unknown palette', '卷王', 'hotpink'],
    ]) {
        const save = f.handler('/shop/title/save');
        await assert.rejects(() => save.post('system', text, palette, page.response.body.csrf), null, label);
        assert.match(save.response.redirect, /^\/shop\/title\?error=/, label);
    }
    assert.equal(f.ledger.docs.length, 2, '无效保存不扣分（只有解锁那一笔）');
    assert.equal(f.userBadgeAdds.length, 0, '无效保存不发徽章');
});

// The three new state-changing POSTs spend points or rewrite member-visible
// state using nothing but the session cookie — same CSRF contract as redeem.
test('title state-changing POSTs reject a missing or wrong CSRF token', async () => {
    const f = await fixture();
    await f.ledger.insertOne({ uid: 42, delta: 600, ref: 'solve:system:1', kind: 'solve', detail: 'P1', ts: NOW });
    const page = f.handler('/shop/title');
    await page.get('system');
    const token = page.response.body.csrf;
    for (const [label, url, args] of [
        ['unlock without a token', '/shop/title/unlock', ['system']],
        ['unlock with a wrong token', '/shop/title/unlock', ['system', '0'.repeat(64)]],
        ['save without a token', '/shop/title/save', ['system', '卷王', 'gold']],
        ['save with a wrong token', '/shop/title/save', ['system', '卷王', 'gold', 'x'.repeat(64)]],
        ['revoke without a token', '/manage/shop/title', ['system', 'revoke', 42]],
    ]) {
        const h = f.handler(url, 'post');
        await assert.rejects(() => h.post(...args), null, label);
        assert.equal(f.ledger.docs.length, 1, `${label}: must not debit`);
        assert.equal(f.titles.docs.length, 0, `${label}: must not change state`);
    }
    // 校验桩没有把 POST 整体吞掉：正确的 token 应当成功
    const unlock = f.handler('/shop/title/unlock');
    await unlock.post('system', token);
    assert.equal(f.titles.docs.length, 1);
});

test('manage page lists title rows and revoke/restore round-trip', async () => {
    const f = await fixture({
        titleDocs: [{
            uid: 42, badgeId: 1, minted: 1, text: '卷王', bg: '#c9a227', fg: '#ffffff',
            active: true, createdAt: NOW, updatedAt: NOW,
        }],
    });
    f.userBadgeModel.userBadgeAdd(null, 42, 1); // 持有在，摘除才可观察
    const page = f.handler('/manage/shop');
    await page.get('system');
    assert.equal(page.response.body.titleRows.length, 1);
    const row = page.response.body.titleRows[0];
    assert.equal(row.uid, 42);
    assert.equal(row.uname, '#42'); // getList 桩返回空映射 → #uid 回退
    assert.equal(row.text, '卷王');
    assert.equal(row.active, true);
    // 停用：摘持有 + active=false
    const revoke = f.handler('/manage/shop/title', 'post');
    await revoke.post('system', 'revoke', 42, page.response.body.csrf);
    assert.equal(revoke.response.redirect, '/manage/shop');
    assert.deepEqual(f.userBadgeDels, [{ uid: 42, badgeId: 1 }]);
    assert.equal(f.titles.docs[0].active, false);
    // 恢复：只翻回资格
    const restore = f.handler('/manage/shop/title', 'post');
    await restore.post('system', 'restore', 42, page.response.body.csrf);
    assert.equal(f.titles.docs[0].active, true);
    // 未知操作带回原因
    const bad = f.handler('/manage/shop/title', 'post');
    await assert.rejects(bad.post('system', 'destroy', 42, page.response.body.csrf), /不支持的操作/);
    assert.match(bad.response.redirect, /^\/manage\/shop\?error=/);
});

