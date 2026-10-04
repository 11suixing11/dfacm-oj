'use strict';

// Points-shop pure logic tests. The modules under test are the bundled
// TypeScript sources (points.ts), compiled with esbuild so `hydrooj` stays
// external and stubbed below; no Mongo, no network.

const assert = require('node:assert/strict');
const { test } = require('node:test');
const path = require('node:path');
const Module = require('node:module');
const esbuild = require('esbuild');

const pluginDir = path.resolve(__dirname, '..');
const compiled = {};
for (const name of ['points']) {
    compiled[name] = esbuild.buildSync({
        entryPoints: [path.join(pluginDir, `${name}.ts`)],
        bundle: true, platform: 'node', format: 'cjs', write: false,
        external: ['hydrooj'],
    }).outputFiles[0].text;
}
function loadPoints() {
    const file = path.join(pluginDir, 'points.ts');
    const loaded = new Module(file, module);
    loaded.filename = file;
    loaded.paths = module.paths;
    loaded.require = (id) => (id === 'hydrooj' ? {} : require(id));
    loaded._compile(compiled.points, file);
    return loaded.exports;
}

const NOW = new Date('2026-10-04T12:00:00Z');
const now = () => new Date(NOW.getTime());

class DuplicateKeyError extends Error {
    constructor() { super('E11000 duplicate key'); this.code = 11000; }
}

// Ledger fake: unique {uid, ref} index emulation + aggregation $sum + cursor
// sort/skip/limit, matching the surface points.ts actually calls.
class FakeLedger {
    constructor({ duplicateRef } = {}) {
        this.docs = [];
        this.duplicateRef = duplicateRef; // ref string forced to collide once
    }
    async insertOne(doc) {
        const ref = doc.ref;
        if (this.duplicateRef === ref || this.docs.some((d) => d.uid === doc.uid && d.ref === ref)) {
            throw new DuplicateKeyError();
        }
        this.docs.push({ ...doc, _id: `oid-${this.docs.length + 1}` });
        return { insertedId: `oid-${this.docs.length}` };
    }
    find(filter) {
        const rows = this.docs.filter((d) => Object.entries(filter)
            .every(([k, v]) => d[k] === v));
        const cursor = {
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
        return cursor;
    }
    async countDocuments(filter) {
        return this.docs.filter((d) => Object.entries(filter).every(([k, v]) => d[k] === v)).length;
    }
    aggregate(pipeline) {
        const stages = [...pipeline];
        let rows = [...this.docs];
        while (stages.length) {
            const stage = stages.shift();
            if (stage.$match) {
                rows = rows.filter((d) => Object.entries(stage.$match)
                    .every(([k, v]) => d[k] === v));
            } else if (stage.$group) {
                const total = rows.reduce((sum, d) => sum + (d.delta || 0), 0);
                rows = [{ _id: null, total }];
            }
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
    find() { return { async toArray() { return [...this.docs]; } }; }
}

class FakeUserBadge {
    constructor() { this.docs = []; this.added = []; }
    async findOne(filter) { return this.docs.find((d) => d.owner === filter.owner && d.badgeId === filter.badgeId) || null; }
    async userBadgeAdd(ctx, uid, badgeId) { this.added.push({ uid, badgeId }); this.docs.push({ owner: uid, badgeId }); return `oid-${this.docs.length}`; }
}

function models(overrides = {}) {
    const problems = new Map();
    const badges = new Map();
    const api = {
        badge: {
            badgeGetMulti: () => ({ async toArray() { return [...badges.values()]; } }),
            async badgeGet(ctx, id) { return badges.get(id) || null; },
        },
        userBadge: new FakeUserBadge(),
        problem: {
            async get(domainId, pid) { return problems.get(`${domainId}#${pid}`) || null; },
        },
        ...overrides,
    };
    api.seedProblem = (domainId, pid, doc) => problems.set(`${domainId}#${pid}`, doc);
    api.seedBadge = (id, doc) => badges.set(id, doc);
    return api;
}

test('difficulty algorithm: ported Hydro lib, explicit difficulty wins, empty data falls back to 5', () => {
    const points = loadPoints();
    // nSubmit=0 → difficultyAlgorithm returns null → fallback 5
    assert.equal(points.problemDifficulty({ nSubmit: 0, nAccept: 0 }), 5);
    assert.equal(points.problemDifficulty(null), 5);
    // explicit difficulty takes precedence
    assert.equal(points.problemDifficulty({ difficulty: 7, nSubmit: 100, nAccept: 50 }), 7);
    // derived values stay within the 1..10 contract
    for (const [nSubmit, nAccept] of [[10, 1], [50, 5], [100, 90], [1000, 3], [300, 42]]) {
        const d = points.problemDifficulty({ nSubmit, nAccept });
        assert.ok(Number.isInteger(d) && d >= 1 && d <= 10, `${nSubmit}/${nAccept} -> ${d}`);
    }
    // very high acceptance rate on few submissions is easy; rare AC is hard
    assert.ok(points.problemDifficulty({ nSubmit: 10, nAccept: 10 }) <= points.problemDifficulty({ nSubmit: 500, nAccept: 5 }));
});

test('awardSolve: difficulty comes from the problem doc and the ledger row is shaped per spec', async () => {
    const points = loadPoints();
    const m = models();
    m.seedProblem('system', 1000, { docId: 1000, title: 'A+B问题', hidden: false, owner: 9, difficulty: 6, nSubmit: 10, nAccept: 5 });
    const ledger = new FakeLedger();
    const result = await points.awardSolve(m, { ledger, price: new FakePrice(), userBadge: m.userBadge }, now,
        { uid: 42, domainId: 'system', docId: 1000 });
    assert.deepEqual(result, { awarded: true, delta: 6 });
    assert.equal(ledger.docs.length, 1);
    const row = ledger.docs[0];
    assert.equal(row.uid, 42);
    assert.equal(row.delta, 6);
    assert.equal(row.kind, 'solve');
    assert.equal(row.ref, 'solve:system:1000');
    assert.equal(row.detail, 'A+B问题');
    assert.ok(row.ts instanceof Date);
});

test('awardSolve: derived difficulty when pdoc.difficulty is empty, title falls back to docId', async () => {
    const points = loadPoints();
    const m = models();
    m.seedProblem('poj', 2000, { docId: 2000, title: '', hidden: false, owner: 9, difficulty: null, nSubmit: 40, nAccept: 4 });
    const ledger = new FakeLedger();
    const result = await points.awardSolve(m, { ledger, price: new FakePrice(), userBadge: m.userBadge }, now,
        { uid: 42, domainId: 'poj', docId: 2000 });
    assert.equal(result.awarded, true);
    assert.ok(result.delta >= 1 && result.delta <= 10);
    assert.equal(ledger.docs[0].detail, '2000');
});

test('awardSolve idempotency: a second insert on the same (uid, ref) is silently absorbed', async () => {
    const points = loadPoints();
    const m = models();
    m.seedProblem('system', 1000, { title: 'A+B问题', hidden: false, owner: 9, difficulty: 3, nSubmit: 10, nAccept: 5 });
    const ledger = new FakeLedger();
    const collections = { ledger, price: new FakePrice(), userBadge: m.userBadge };
    const first = await points.awardSolve(m, collections, now, { uid: 42, domainId: 'system', docId: 1000 });
    assert.equal(first.awarded, true);
    const second = await points.awardSolve(m, collections, now, { uid: 42, domainId: 'system', docId: 1000 });
    assert.deepEqual(second, { awarded: false, delta: 0 });
    assert.equal(ledger.docs.length, 1); // replay / re-submission never double-credits
});

test('awardSolve exclusions: hidden problems, self-owned problems and uid<=1 never credit', async () => {
    const points = loadPoints();
    const m = models();
    m.seedProblem('system', 1001, { title: '隐藏题', hidden: true, owner: 9, difficulty: 5 });
    m.seedProblem('system', 1002, { title: '自建题', hidden: false, owner: 42, difficulty: 5 });
    m.seedProblem('system', 1003, { title: '正常题', hidden: false, owner: 9, difficulty: 5 });
    const ledger = new FakeLedger();
    const collections = { ledger, price: new FakePrice(), userBadge: m.userBadge };
    assert.deepEqual(await points.awardSolve(m, collections, now, { uid: 42, domainId: 'system', docId: 1001 }),
        { awarded: false, delta: 0 });
    assert.deepEqual(await points.awardSolve(m, collections, now, { uid: 42, domainId: 'system', docId: 1002 }),
        { awarded: false, delta: 0 });
    assert.deepEqual(await points.awardSolve(m, collections, now, { uid: 0, domainId: 'system', docId: 1003 }),
        { awarded: false, delta: 0 });
    assert.deepEqual(await points.awardSolve(m, collections, now, { uid: 1, domainId: 'system', docId: 1003 }),
        { awarded: false, delta: 0 });
    assert.deepEqual(await points.awardSolve(m, collections, now, { uid: 42, domainId: 'system', docId: 404404 }),
        { awarded: false, delta: 0 });
    assert.equal(ledger.docs.length, 0);
});

test('balance aggregation: mixed positive and negative deltas sum correctly', async () => {
    const points = loadPoints();
    const ledger = new FakeLedger();
    const collections = { ledger, price: new FakePrice(), userBadge: new FakeUserBadge() };
    for (const [delta, ref] of [[5, 'solve:system:1'], [10, 'solve:system:2'], [-12, 'redeem:7'], [3, 'solve:poj:3']]) {
        await ledger.insertOne({ uid: 42, delta, ref, kind: 'solve', detail: 'x', ts: now() });
    }
    await ledger.insertOne({ uid: 43, delta: 99, ref: 'solve:system:9', kind: 'solve', detail: 'x', ts: now() });
    assert.equal(await points.getBalance(collections, 42), 6);
    assert.equal(await points.getBalance(collections, 43), 99);
    assert.equal(await points.getBalance(collections, 44), 0); // no rows -> 0
});

test('redeem: rejects unlisted, nonexistent and already-owned badges before touching the ledger', async () => {
    const points = loadPoints();
    const m = models();
    m.seedBadge(7, { _id: 7, title: '队长' });
    m.seedBadge(8, { _id: 8, title: '未上架徽章' });
    const ledger = new FakeLedger();
    const collections = {
        ledger,
        // 9 has a price row but no badge document -> "徽章不存在"
        price: new FakePrice([{ _id: 7, price: 10, enabled: true }, { _id: 9, price: 5, enabled: true }]),
        userBadge: m.userBadge,
    };
    await ledger.insertOne({ uid: 42, delta: 30, ref: 'solve:system:1', kind: 'solve', detail: 'x', ts: now() });
    await assert.rejects(points.redeem({}, m, collections, now, 42, 8), /未上架/);
    await assert.rejects(points.redeem({}, m, collections, now, 42, 99), /未上架/); // unpriced -> also refused
    await assert.rejects(points.redeem({}, m, collections, now, 42, 9), /不存在/);
    m.userBadge.docs.push({ owner: 42, badgeId: 7 });
    await assert.rejects(points.redeem({}, m, collections, now, 42, 7), /已拥有/);
    assert.equal(ledger.docs.length, 1);
    assert.equal(m.userBadge.added.length, 0);
});

test('redeem: insufficient balance is refused with both numbers in the message', async () => {
    const points = loadPoints();
    const m = models();
    m.seedBadge(7, { _id: 7, title: '队长' });
    const ledger = new FakeLedger();
    const collections = {
        ledger,
        price: new FakePrice([{ _id: 7, price: 50, enabled: true }]),
        userBadge: m.userBadge,
    };
    await ledger.insertOne({ uid: 42, delta: 12, ref: 'solve:system:1', kind: 'solve', detail: 'x', ts: now() });
    await assert.rejects(points.redeem({}, m, collections, now, 42, 7), /积分不足：当前 12 分，兑换需 50 分/);
    assert.equal(ledger.docs.length, 1);
    assert.equal(m.userBadge.added.length, 0);
});

// The {uid, ref} unique key only stops the same badge being bought twice. Two
// different badges could both pass the balance check and both insert, driving
// the balance negative.
test('redeem: concurrent redemptions of different badges cannot overdraw', async () => {
    const points = loadPoints();
    const m = models();
    m.seedBadge(7, { _id: 7, title: 'A' });
    m.seedBadge(8, { _id: 8, title: 'B' });
    const ledger = new FakeLedger();
    const collections = {
        ledger,
        price: new FakePrice([{ _id: 7, price: 10, enabled: true }, { _id: 8, price: 10, enabled: true }]),
        userBadge: m.userBadge,
    };
    await ledger.insertOne({ uid: 42, delta: 10, ref: 'solve:system:1', kind: 'solve', detail: 'x', ts: now() });
    const results = await Promise.allSettled([
        points.redeem({}, m, collections, now, 42, 7),
        points.redeem({}, m, collections, now, 42, 8),
    ]);
    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    assert.equal(fulfilled.length, 1, 'only one of two 10-point redemptions may succeed on a 10-point balance');
    assert.match(String(results.find((r) => r.status === 'rejected').reason), /积分不足/);
    // The balance never goes negative.
    const balance = ledger.docs.reduce((sum, d) => sum + d.delta, 0);
    assert.equal(balance, 0);
    assert.equal(m.userBadge.added.length, 1);
});

// A different member must not be blocked by another member's redemption.
test('redeem: the per-user lock does not serialise across accounts', async () => {
    const points = loadPoints();
    const m = models();
    m.seedBadge(7, { _id: 7, title: 'A' });
    const ledger = new FakeLedger();
    const collections = {
        ledger,
        price: new FakePrice([{ _id: 7, price: 10, enabled: true }]),
        userBadge: m.userBadge,
    };
    await ledger.insertOne({ uid: 42, delta: 10, ref: 'solve:system:1', kind: 'solve', detail: 'x', ts: now() });
    await ledger.insertOne({ uid: 43, delta: 10, ref: 'solve:system:1', kind: 'solve', detail: 'y', ts: now() });
    const results = await Promise.all([
        points.redeem({}, m, collections, now, 42, 7),
        points.redeem({}, m, collections, now, 43, 7),
    ]);
    assert.equal(results.length, 2);
    assert.ok(results.every((r) => r.price === 10));
});

test('redeem: a failed badge grant refunds the points instead of losing them', async () => {
    const points = loadPoints();
    const m = models();
    m.seedBadge(7, { _id: 7, title: '队长' });
    m.userBadge.userBadgeAdd = async () => { throw new Error('badge plugin down'); };
    const ledger = new FakeLedger();
    const collections = {
        ledger,
        price: new FakePrice([{ _id: 7, price: 10, enabled: true }]),
        userBadge: m.userBadge,
    };
    await ledger.insertOne({ uid: 42, delta: 25, ref: 'solve:system:1', kind: 'solve', detail: 'x', ts: now() });
    await assert.rejects(points.redeem({}, m, collections, now, 42, 7), /积分已退回/);
    assert.equal(ledger.docs.length, 3);
    assert.equal(ledger.docs[1].delta, -10);
    assert.equal(ledger.docs[2].delta, 10);
    assert.equal(ledger.docs[2].kind, 'refund');
    assert.equal(ledger.docs.reduce((sum, d) => sum + d.delta, 0), 25, 'balance is unchanged');
    // Each retry gets a fresh refund key, so a repeated failure still balances.
    assert.notEqual(ledger.docs[2].ref, ledger.docs[1].ref);
});

test('redeem: success debits once and grants the badge exactly once', async () => {
    const points = loadPoints();
    const m = models();
    m.seedBadge(7, { _id: 7, title: '队长' });
    const ledger = new FakeLedger();
    const collections = {
        ledger,
        price: new FakePrice([{ _id: 7, price: 10, enabled: true }]),
        userBadge: m.userBadge,
    };
    await ledger.insertOne({ uid: 42, delta: 25, ref: 'solve:system:1', kind: 'solve', detail: 'x', ts: now() });
    const result = await points.redeem({}, m, collections, now, 42, 7);
    assert.deepEqual(result, { badgeTitle: '队长', price: 10, refunded: false });
    assert.equal(ledger.docs.length, 2);
    const debit = ledger.docs[1];
    assert.equal(debit.delta, -10);
    assert.equal(debit.kind, 'redeem');
    assert.equal(debit.ref, 'redeem:7');
    assert.equal(debit.detail, '兑换徽章：队长');
    assert.deepEqual(m.userBadge.added, [{ uid: 42, badgeId: 7 }]);
    assert.equal(await points.getBalance(collections, 42), 15);
    // The duplicate-key path (double-spend race) is reported as already redeemed.
    ledger.duplicateRef = 'redeem:7';
    m.userBadge.docs.length = 0; // simulate the owned check not firing
    await assert.rejects(points.redeem({}, m, collections, now, 42, 7), /已拥有/);
    assert.equal(m.userBadge.added.length, 1);
});

test('redeem idempotency: a second call is intercepted by the ownership check', async () => {
    const points = loadPoints();
    const m = models();
    m.seedBadge(7, { _id: 7, title: '队长' });
    const ledger = new FakeLedger();
    const collections = {
        ledger,
        price: new FakePrice([{ _id: 7, price: 5, enabled: true }]),
        userBadge: m.userBadge,
    };
    await ledger.insertOne({ uid: 42, delta: 20, ref: 'solve:system:1', kind: 'solve', detail: 'x', ts: now() });
    await points.redeem({}, m, collections, now, 42, 7);
    await assert.rejects(points.redeem({}, m, collections, now, 42, 7), /已拥有/);
    assert.equal(ledger.docs.length, 2);
    assert.equal(await points.getBalance(collections, 42), 15);
});

test('listLedger: chronological order with running balance prefix sums and pagination', async () => {
    const points = loadPoints();
    const ledger = new FakeLedger();
    const collections = { ledger, price: new FakePrice(), userBadge: new FakeUserBadge() };
    for (let i = 1; i <= 25; i++) {
        await ledger.insertOne({
            uid: 42, delta: i % 7 === 0 ? -5 : 2, ref: `solve:system:${i}`, kind: 'solve',
            detail: `P${i}`, ts: new Date(NOW.getTime() + i * 60000),
        });
    }
    const first = await points.listLedger(collections, 42, 1);
    assert.equal(first.total, 25);
    assert.equal(first.pages, 2);
    assert.equal(first.docs.length, 20);
    assert.equal(first.docs[0].ref, 'solve:system:1'); // ascending by time
    assert.equal(first.docs[19].ref, 'solve:system:20');
    const second = await points.listLedger(collections, 42, 2);
    assert.equal(second.docs.length, 5);
    assert.equal(second.docs[0].ref, 'solve:system:21');
    assert.equal((await points.listLedger(collections, 42, 99)).page, 2); // clamp
    assert.equal((await points.listLedger(collections, 42, 0)).page, 1);
    assert.equal((await points.listLedger(collections, 43, 1)).total, 0);
});

test('setPrice: upserts price and enabled flags for a badge', async () => {
    const points = loadPoints();
    const price = new FakePrice();
    await points.setPrice({ ledger: new FakeLedger(), price, userBadge: new FakeUserBadge() }, now, 7, 30, true);
    assert.deepEqual(price.docs, [{ _id: 7, price: 30, enabled: true, updatedAt: NOW }]);
    await points.setPrice({ ledger: new FakeLedger(), price, userBadge: new FakeUserBadge() }, now, 7, 12, false);
    assert.equal(price.docs.length, 1);
    assert.equal(price.docs[0].price, 12);
    assert.equal(price.docs[0].enabled, false);
    const points2 = loadPoints();
    await assert.rejects(points2.setPrice({ ledger: new FakeLedger(), price, userBadge: new FakeUserBadge() }, now, 7, 0, true), /正整数/);
    await assert.rejects(points2.setPrice({ ledger: new FakeLedger(), price, userBadge: new FakeUserBadge() }, now, 7, 2.5, true), /正整数/);
    await assert.rejects(points2.setPrice({ ledger: new FakeLedger(), price, userBadge: new FakeUserBadge() }, now, 0, 5, true), /徽章无效/);
});
