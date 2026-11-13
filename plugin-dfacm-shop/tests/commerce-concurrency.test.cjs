'use strict';

// Load both real modules in ONE bundle so their production imports share state.
// Only Mongo persistence and badge-plugin side effects are local doubles.
const assert = require('node:assert/strict');
const { test } = require('node:test');
const path = require('node:path');
const Module = require('node:module');
const esbuild = require('esbuild');

const pluginDir = path.resolve(__dirname, '..');
const compiled = esbuild.buildSync({
    stdin: {
        contents: "exports.points = require('./points.ts'); exports.titles = require('./titles.ts');",
        resolveDir: pluginDir,
    },
    bundle: true, platform: 'node', format: 'cjs', write: false, external: ['hydrooj'],
}).outputFiles[0].text;

function loadCommerce() {
    const file = path.join(pluginDir, 'commerce-test-entry.cjs');
    const loaded = new Module(file, module);
    loaded.filename = file;
    loaded.paths = module.paths;
    loaded.require = (id) => (id === 'hydrooj' ? {} : require(id));
    loaded._compile(compiled, file);
    return loaded.exports;
}

const UID = 42;
const now = () => new Date('2026-11-13T00:00:00Z');
const turn = () => new Promise((resolve) => setImmediate(resolve));
function gate() {
    let release;
    const promise = new Promise((resolve) => { release = resolve; });
    return { promise, release };
}
function duplicate() { return Object.assign(new Error('E11000 duplicate key'), { code: 11000 }); }
const matches = (doc, filter) => Object.entries(filter).every(([key, value]) => doc[key] === value);

function fixture({ balance = 0, unlocked = true, minted = false, price = 50 } = {}) {
    const api = loadCommerce();
    const ledgerRows = [{ uid: UID, ref: 'seed', delta: balance, kind: 'solve', ts: now() }];
    const titleRows = unlocked ? [{ uid: UID, badgeId: minted ? 1 : null, minted: minted ? 1 : 0,
        text: minted ? '旧称' : '', bg: '', fg: '', active: true, createdAt: now(), updatedAt: now() }] : [];
    const badges = [{ _id: 9, title: '普通徽章' }, ...(minted ? [{ _id: 1, short: '旧称' }] : [])];
    const holdings = minted ? [{ owner: UID, badgeId: 1 }] : [];
    const collections = {
        ledger: {
            async insertOne(doc) {
                if (ledgerRows.some((row) => row.uid === doc.uid && row.ref === doc.ref)) throw duplicate();
                ledgerRows.push(structuredClone(doc));
                return { insertedId: ledgerRows.length };
            },
            async findOne(filter) { return structuredClone(ledgerRows.find((doc) => matches(doc, filter)) || null); },
            aggregate(pipeline) {
                const rows = ledgerRows.filter((doc) => matches(doc, pipeline[0].$match));
                const total = rows.reduce((sum, doc) => sum + doc.delta, 0);
                return { async toArray() { return [{ _id: null, total }]; } };
            },
        },
        titles: {
            async findOne(filter) { return structuredClone(titleRows.find((doc) => matches(doc, filter)) || null); },
            async insertOne(doc) {
                if (titleRows.some((row) => row.uid === doc.uid)) throw duplicate();
                titleRows.push(structuredClone(doc));
                return { insertedId: titleRows.length };
            },
            async updateOne(filter, update) {
                const row = titleRows.find((doc) => matches(doc, filter));
                if (row) Object.assign(row, structuredClone(update.$set));
                return { matchedCount: row ? 1 : 0 };
            },
        },
        price: { async findOne({ _id }) { return _id === 9 ? { _id: 9, price, enabled: true } : null; } },
        userBadge: {
            async findOne(filter) { return structuredClone(holdings.find((doc) => matches(doc, filter)) || null); },
        },
    };
    const models = {
        badge: {
            async badgeGet(ctx, id) { return structuredClone(badges.find((badge) => badge._id === id) || null); },
            async badgeAdd(ctx, short, title, backgroundColor, fontColor, content, users) {
                const _id = Math.max(...badges.map((badge) => badge._id), 0) + 1;
                // Real allocation reads max(_id)+1 before an asynchronous insert.
                await turn();
                if (badges.some((badge) => badge._id === _id)) throw duplicate();
                badges.push({ _id, short, title, backgroundColor, fontColor, content, users: [...users] });
                for (const owner of users) holdings.push({ owner, badgeId: _id });
                return _id;
            },
            async badgeEdit(ctx, badgeId, short, title, backgroundColor, fontColor, content, users) {
                const badge = badges.find((doc) => doc._id === badgeId);
                assert.ok(badge, 'badgeEdit must target a real badge');
                Object.assign(badge, { short, title, backgroundColor, fontColor, content, users: [...users] });
                return 1;
            },
        },
        userBadge: {
            async userBadgeAdd(ctx, owner, badgeId) { holdings.push({ owner, badgeId }); return 1; },
            async userBadgeDel(ctx, owner, badgeId) {
                const index = holdings.findIndex((doc) => doc.owner === owner && doc.badgeId === badgeId);
                if (index >= 0) holdings.splice(index, 1);
                return 1;
            },
        },
    };
    return { ...api, collections, models, ledgerRows, titleRows, badges, holdings };
}

// Removing either entry point's shared UID lock makes the captured 500/50
// balance available to both consumers, so these hand-derived balances go negative.
for (const kind of ['unlock', 'edit']) {
    test(`redeem and title ${kind} cannot spend the same balance`, async () => {
        const cost = kind === 'unlock' ? 500 : 50;
        const f = fixture({ balance: cost, price: cost, unlocked: kind === 'edit', minted: kind === 'edit' });
        const entered = gate();
        const resume = gate();
        const aggregate = f.collections.ledger.aggregate;
        let first = true;
        f.collections.ledger.aggregate = (pipeline) => {
            const cursor = aggregate(pipeline);
            return { async toArray() {
                const rows = await cursor.toArray();
                if (first) { first = false; entered.release(); await resume.promise; }
                return rows;
            } };
        };
        const redeem = f.points.redeem({}, f.models, f.collections, now, UID, 9);
        await entered.promise;
        const title = kind === 'unlock'
            ? f.titles.unlockTitle(f.collections, now, UID)
            : f.titles.saveTitle({}, f.models, f.collections, now, UID, '新称', 'gold');
        const settled = Promise.allSettled([redeem, title]);
        // Drain the competing request; unlike a two-reader barrier this also
        // completes when the repaired request correctly waits behind the lock.
        await turn();
        resume.release();
        const results = await settled;
        assert.equal(await f.points.getBalance(f.collections, UID), 0, 'balance must never become negative');
        assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
        assert.match(String(results.find((result) => result.status === 'rejected').reason), /积分不足/);
        assert.equal(f.points.pendingLockCount(), 0);
    });
}

for (const balance of [0, 50]) {
    test(`concurrent first saves grant one free mint with ${balance} points`, async () => {
        const f = fixture({ balance });
        const results = await Promise.allSettled([
            f.titles.saveTitle({}, f.models, f.collections, now, UID, '甲称', 'gold'),
            f.titles.saveTitle({}, f.models, f.collections, now, UID, '乙称', 'gold'),
        ]);
        const successes = results.filter((result) => result.status === 'fulfilled').map((result) => result.value);
        assert.equal(successes.filter((result) => result.paid === false).length, 1, 'only the first save is free');
        assert.equal(successes.length, balance === 50 ? 2 : 1);
        assert.equal(f.holdings.length, 1, 'all saves use one title badge');
        assert.equal(f.badges.length, 2, 'one shop badge plus one title badge');
        assert.equal(await f.points.getBalance(f.collections, UID), 0);
        if (balance === 50) {
            assert.deepEqual(successes.map((result) => result.paid), [false, true]);
            assert.equal(successes[0].badgeId, successes[1].badgeId);
        } else {
            assert.match(String(results.find((result) => result.status === 'rejected').reason), /积分不足/);
        }
    });
}

// If revoke bypasses the UID lock it returns before badgeAdd, leaving an active
// holding attached to an inactive title. Assert the resulting persistent state.
test('revoke waits for an in-flight mint and removes the newly issued holding', async () => {
    const f = fixture();
    const entered = gate();
    const resume = gate();
    const add = f.models.badge.badgeAdd;
    f.models.badge.badgeAdd = async (...args) => { entered.release(); await resume.promise; return add(...args); };
    const save = f.titles.saveTitle({}, f.models, f.collections, now, UID, '新称', 'gold');
    await entered.promise;
    const revoke = f.titles.revokeTitle({}, f.models, f.collections, now, UID);
    await turn();
    resume.release();
    await Promise.all([save, revoke]);
    assert.equal(f.titleRows[0].active, false);
    assert.equal(f.holdings.length, 0, 'no old request may grant after revoke returns');
    assert.equal(f.points.pendingLockCount(), 0);
});

test('a save queued during revoke re-reads inactive state before charging', async () => {
    const f = fixture({ balance: 50, minted: true });
    const entered = gate();
    const resume = gate();
    const del = f.models.userBadge.userBadgeDel;
    f.models.userBadge.userBadgeDel = async (...args) => { entered.release(); await resume.promise; return del(...args); };
    const revoke = f.titles.revokeTitle({}, f.models, f.collections, now, UID);
    await entered.promise;
    const save = f.titles.saveTitle({}, f.models, f.collections, now, UID, '新称', 'gold');
    const settled = Promise.allSettled([revoke, save]);
    await turn();
    resume.release();
    const results = await settled;
    assert.equal(results[0].status, 'fulfilled');
    assert.equal(results[1].status, 'rejected', 'a queued save must observe the completed revocation');
    assert.match(String(results[1].reason), /管理员停用/);
    assert.equal(await f.points.getBalance(f.collections, UID), 50);
    assert.equal(f.titleRows[0].text, '旧称');
    assert.equal(f.holdings.length, 0);
});

test('restore requested during revoke applies after that revocation', async () => {
    const f = fixture({ minted: true });
    const entered = gate();
    const resume = gate();
    const del = f.models.userBadge.userBadgeDel;
    f.models.userBadge.userBadgeDel = async (...args) => { entered.release(); await resume.promise; return del(...args); };
    const revoke = f.titles.revokeTitle({}, f.models, f.collections, now, UID);
    await entered.promise;
    const restore = f.titles.restoreTitle(f.collections, now, UID);
    await turn();
    resume.release();
    await Promise.all([revoke, restore]);
    assert.equal(f.titleRows[0].active, true, 'restore cannot be overwritten by the earlier revoke');
    assert.equal(f.holdings.length, 0, 'restore does not grant a badge');
});

test('a failed title operation releases its queued redemption and lock entry', async () => {
    const f = fixture({ balance: 50 });
    const entered = gate();
    const resume = gate();
    f.models.badge.badgeAdd = async () => { entered.release(); await resume.promise; throw new Error('mint unavailable'); };
    const save = f.titles.saveTitle({}, f.models, f.collections, now, UID, '新称', 'gold');
    await entered.promise;
    const countDuringTitle = f.points.pendingLockCount();
    const redeem = f.points.redeem({}, f.models, f.collections, now, UID, 9);
    const settled = Promise.allSettled([save, redeem]);
    resume.release();
    const results = await settled;
    assert.equal(countDuringTitle, 1, 'title mutations participate in the shared user queue');
    assert.equal(results[0].status, 'rejected');
    assert.match(String(results[0].reason), /mint unavailable/);
    assert.equal(results[1].status, 'fulfilled', 'failure cannot poison the next operation');
    assert.equal(await f.points.getBalance(f.collections, UID), 0);
    assert.deepEqual(f.holdings, [{ owner: UID, badgeId: 9 }]);
    assert.equal(f.points.pendingLockCount(), 0, 'the last waiter releases the UID entry');
});

test('one user waiting for mint does not block another user spending points', async () => {
    const f = fixture({ balance: 50 });
    await f.collections.ledger.insertOne({ uid: 43, ref: 'seed', delta: 50 });
    const entered = gate();
    const resume = gate();
    const add = f.models.badge.badgeAdd;
    f.models.badge.badgeAdd = async (...args) => { entered.release(); await resume.promise; return add(...args); };
    const save = f.titles.saveTitle({}, f.models, f.collections, now, UID, '新称', 'gold');
    await entered.promise;
    let redeemed = false;
    const redeem = f.points.redeem({}, f.models, f.collections, now, 43, 9).then(() => { redeemed = true; });
    await turn();
    const completedBeforeRelease = redeemed;
    resume.release();
    await Promise.all([save, redeem]);
    assert.equal(completedBeforeRelease, true);
    assert.equal(await f.points.getBalance(f.collections, 43), 0);
    assert.equal(f.points.pendingLockCount(), 0);
});

test('different users mint unique badges under the global allocation lock', async () => {
    const f = fixture();
    f.titleRows.push(...[43, 44].map((uid) => ({ ...f.titleRows[0], uid })));
    const results = await Promise.all([42, 43, 44].map((uid) =>
        f.titles.saveTitle({}, f.models, f.collections, now, uid, '新称', 'gold')));
    assert.equal(new Set(results.map((result) => result.badgeId)).size, 3);
    assert.equal(f.holdings.length, 3);
    assert.equal(f.points.pendingLockCount(), 0);
});
