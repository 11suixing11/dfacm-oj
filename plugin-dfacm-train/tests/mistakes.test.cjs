'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { createMistakeStore, REASONS, NOTE_MAX_LENGTH } = require('../mistakes.cjs');
const { FakeCollection } = require('./fake-collection.cjs');

const END = { key: 'end' };
const NEXT = { key: 'next' };

function fixture() {
    const collection = new FakeCollection();
    const store = createMistakeStore(collection, { now: () => new Date('2026-10-07T12:00:00Z') });
    return { collection, store };
}

const failed = (over = {}) => ({
    domainId: 'system', uid: 42, pid: 1001, status: 2, _id: 'rid1', ...over,
});

test('only judge-end payloads with learner failure statuses are collected', async () => {
    const { collection, store } = fixture();
    // progress events, bare broadcasts and non-failure statuses never touch the store
    assert.equal(await store.onRecordChange(failed(), undefined), false);
    assert.equal(await store.onRecordChange(failed(), NEXT), false);
    assert.equal(await store.onRecordChange(failed({ status: 0 }), END), false);
    assert.equal(await store.onRecordChange(failed({ status: 20 }), END), false);
    assert.equal(await store.onRecordChange(failed({ status: 8 }), END), false);
    assert.equal(await store.onRecordChange(failed({ status: 9 }), END), false);
    assert.equal(await store.onRecordChange(failed({ status: 30 }), END), false);
    assert.equal(await store.onRecordChange(failed({ status: 1 }), END), false); // AC without an entry
    // pretest / generate pseudo-contests are excluded
    assert.equal(await store.onRecordChange(failed({ contest: '000000000000000000000000' }), END), false);
    assert.equal(await store.onRecordChange(failed({ contest: { toString: () => '000000000000000000000001' } }), END), false);
    // malformed records are dropped
    assert.equal(await store.onRecordChange(null, END), false);
    assert.equal(await store.onRecordChange(failed({ uid: 0 }), END), false);
    assert.equal(await store.onRecordChange(failed({ pid: 0 }), END), false);
    assert.equal(await store.onRecordChange(failed({ pid: '1001' }), END), false);
    assert.equal(collection.docs.length, 0);
    // a real contest final IS collected (赛后补题 scenario)
    assert.equal(await store.onRecordChange(failed({ contest: '66f6a1b2c3d4e5f60718293a' }), END), true);
    assert.equal(collection.docs.length, 1);
});

test('failed finals upsert one entry per problem and preserve user notes', async () => {
    const { collection, store } = fixture();
    await store.onRecordChange(failed(), END);
    await store.update('system', 42, 1001, { reason: 'boundary', note: '没考虑 n=1 的情况' });
    await store.onRecordChange(failed({ status: 3, _id: 'rid2' }), END);
    const doc = collection.docs.find((d) => d.pid === 1001);
    assert.equal(doc.attempts, 2);
    assert.equal(doc.status, 3);
    assert.equal(doc.rid, 'rid2');
    assert.equal(doc.reason, 'boundary');
    assert.equal(doc.note, '没考虑 n=1 的情况');
    assert.equal(doc.resolved, false);
    assert.equal(doc.firstAt.toISOString(), '2026-10-07T12:00:00.000Z');
    // another user / domain gets an independent entry
    await store.onRecordChange(failed({ uid: 7 }), END);
    await store.onRecordChange(failed({ domainId: 'contest-domain' }), END);
    assert.equal(collection.docs.filter((d) => d.pid === 1001).length, 3);
});

test('AC resolves an existing entry and a later failure reopens it', async () => {
    const { collection, store } = fixture();
    await store.onRecordChange(failed(), END);
    assert.equal(await store.onRecordChange(failed({ status: 1, _id: 'rid-ac' }), END), true);
    let doc = collection.docs.find((d) => d.pid === 1001);
    assert.equal(doc.resolved, true);
    assert.equal(doc.resolvedRid, 'rid-ac');
    assert.ok(doc.resolvedAt instanceof Date);
    // a second AC on an already-resolved entry is a no-op
    assert.equal(await store.onRecordChange(failed({ status: 1 }), END), false);
    // failing again reopens the entry and clears the resolution
    await store.onRecordChange(failed({ status: 6 }), END);
    doc = collection.docs.find((d) => d.pid === 1001);
    assert.equal(doc.resolved, false);
    assert.equal('resolvedAt' in doc, false);
    assert.equal('resolvedRid' in doc, false);
    assert.equal(doc.attempts, 2);
});

test('update validates input and never touches the sync marker', async () => {
    const { store } = fixture();
    await store.onRecordChange(failed(), END);
    await assert.rejects(store.update('system', 42, 1001, { reason: 'nope' }), /错误原因/);
    await assert.rejects(store.update('system', 42, 1001, { note: 'x'.repeat(NOTE_MAX_LENGTH + 1) }), /复盘笔记/);
    await assert.rejects(store.update('system', 42, 1001, {}), /没有需要保存的修改/);
    await assert.rejects(store.update('system', 42, 0, { note: 'x' }), /无效/);
    assert.equal(await store.update('system', 42, 9999, { note: 'x' }), false); // not collected
    assert.equal(await store.update('system', 42, 1001, { reason: REASONS[0], note: '  边界条件写错  ' }), true);
    const doc = (await store.list('system', 42, { filter: 'all' })).items[0];
    assert.equal(doc.note, '边界条件写错');
    // manual resolve toggle
    assert.equal(await store.update('system', 42, 1001, { resolved: true }), true);
    assert.equal(await store.countOpen('system', 42), 0);
    assert.equal(await store.update('system', 42, 1001, { resolved: false }), true);
    assert.equal(await store.countOpen('system', 42), 1);
});

test('list filters, paginates with clamping and hides the sync marker', async () => {
    const { collection, store } = fixture();
    for (let pid = 1; pid <= 25; pid++) await store.onRecordChange(failed({ pid }), END);
    await store.update('system', 42, 5, { resolved: true });
    await store.backfill('system', 42, [], new Set()); // writes the marker doc
    assert.equal(collection.docs.some((d) => d.pid === 0), true);
    const open1 = await store.list('system', 42, { filter: 'open', page: 1 });
    assert.equal(open1.total, 24);
    assert.equal(open1.items.length, 20);
    const open2 = await store.list('system', 42, { filter: 'open', page: 2 });
    assert.equal(open2.items.length, 4);
    const clamped = await store.list('system', 42, { filter: 'open', page: 99 });
    assert.equal(clamped.page, 2);
    const zero = await store.list('system', 42, { filter: 'open', page: 0 });
    assert.equal(zero.page, 1);
    const done = await store.list('system', 42, { filter: 'done' });
    assert.deepEqual(done.items.map((d) => d.pid), [5]);
    const all = await store.list('system', 42, { filter: 'whatever' }); // invalid falls back to open
    assert.equal(all.filter, 'open');
    assert.equal(all.items.every((d) => d.pid > 0), true);
    const empty = await store.list('system', 77, { filter: 'open', page: 5 });
    assert.equal(empty.page, 1);
    assert.equal(empty.total, 0);
});

test('backfill groups newest-first records, marks AC and never clobbers live entries', async () => {
    const { store } = fixture();
    const at = (s) => new Date(`2026-10-0${s}T10:00:00Z`);
    // live entry created by the hook before backfill runs
    await store.onRecordChange(failed({ pid: 1001, status: 2, _id: 'live' }), END);
    const records = [
        { pid: 1001, status: 3, rid: 'b2', at: at(6) }, // newer in window, but live entry wins
        { pid: 1001, status: 2, rid: 'b1', at: at(5) },
        { pid: 1002, status: 6, rid: 'b3', at: at(4) },
        { pid: 1003, status: 7, rid: 'b4', at: at(3) },
        { pid: 1003, status: 7, rid: 'b5', at: at(2) },
        { pid: 1003, status: 7, rid: 'b6', at: at(1) },
        { pid: 0, status: 2 }, // malformed rows are skipped
        { pid: 1004, status: 8 }, // non-learner status is skipped
    ];
    const result = await store.backfill('system', 42, records, new Set([1003]));
    // 1001 already has a live entry; only 1002 and 1003 are inserted.
    assert.deepEqual(result, { scanned: 8, collected: 2, resolved: 1 });
    const live = (await store.list('system', 42, { filter: 'all', pageSize: 50 })).items
        .reduce((acc, doc) => ({ ...acc, [doc.pid]: doc }), {});
    assert.equal(live[1001].status, 2); // live hook data preserved
    assert.equal(live[1001].attempts, 1);
    assert.equal(live[1002].attempts, 1);
    assert.equal(live[1003].attempts, 3);
    assert.equal(live[1003].resolved, true); // AC found in problem status
    assert.equal(live[1003].firstAt.toISOString(), at(1).toISOString());
    assert.equal(live[1003].lastAt.toISOString(), at(3).toISOString());
    assert.equal(await store.isSynced('system', 42), true);
    assert.equal(await store.isSynced('system', 77), false);
    // a later AC resolves a backfilled entry too
    await store.onRecordChange(failed({ pid: 1002, status: 1, _id: 'ac2' }), END);
    assert.equal(await store.countOpen('system', 42), 1); // only 1001 remains open
});

test('remove deletes only the targeted entry', async () => {
    const { store } = fixture();
    await store.onRecordChange(failed(), END);
    await store.onRecordChange(failed({ pid: 1002 }), END);
    assert.equal(await store.remove('system', 7, 1001), false); // other user
    assert.equal(await store.remove('system', 42, 1001), true);
    assert.deepEqual((await store.list('system', 42, { filter: 'all' })).items.map((d) => d.pid), [1002]);
    await assert.rejects(store.remove('system', 42, 0), /无效/);
});
