const assert = require('node:assert/strict');
const { test } = require('node:test');
const { nativeFixture } = require('./native-callback-fixture.cjs');
let adapter;
try { adapter = require('../controlled-history.cjs'); } catch (e) { if (e.code !== 'MODULE_NOT_FOUND') throw e; adapter = {}; }
function install(t, f) {
    const old = process.env.DFACM_CONTROLLED_HISTORY; process.env.DFACM_CONTROLLED_HISTORY = '1';
    t.after(() => { if (old === undefined) delete process.env.DFACM_CONTROLLED_HISTORY; else process.env.DFACM_CONTROLLED_HISTORY = old; });
    assert.equal(typeof adapter.installControlledHistory, 'function', 'missing native ownership adapter');
    const dispose = adapter.installControlledHistory(f.api); t.after(dispose); return dispose;
}
test('capability requires explicit activation and actual supported wrappers, with repeatable disposal', t => {
    const f = nativeFixture(); assert.equal(typeof adapter.getCapability, 'function', 'missing native capability');
    assert.equal(adapter.getCapability(f.api), null);
    const end = f.api.JudgeResultCallbackContext.prototype._end;
    const a = install(t, f), b = adapter.installControlledHistory(f.api);
    assert.equal(adapter.getCapability(f.api).ownedHistory, true);
    a(); a(); assert.ok(adapter.getCapability(f.api)); b(); b();
    assert.equal(adapter.getCapability(f.api), null); assert.equal(f.api.JudgeResultCallbackContext.prototype._end, end);
    const c = adapter.installControlledHistory(f.api); f.api.JudgeResultCallbackContext.prototype._end = async () => {};
    assert.equal(adapter.getCapability(f.api), null); c();
});
for (const progress of [false, true]) test(`owns actual callback history before ${progress ? 'progress and end' : 'immediate CE end'}`, async t => {
    const f = nativeFixture(); install(t, f); const cb = f.callback();
    if (progress) await cb.next({ status: 20, cases: [{ id: 1, status: 1 }] });
    await cb.end({ status: progress ? 1 : 7 }); assert.equal(await cb, null);
    assert.equal(f.collHistory.rows.length, 1); const row = f.collHistory.rows[0];
    assert.equal(String(row._id), String(cb.relatedId)); assert.equal(String(row.rid), String(f.task.rid));
    assert.equal(row.verificationBatch, 'batch-one'); assert.equal(row.verificationEntry, 'entry-one');
    assert.equal(row.uid, 3); assert.equal(row.verificationUname, 'hydsvc-0074'); assert.ok(row.verificationCodeHash);
    assert.equal(row.status, progress ? 1 : 7); assert.equal(f.ordinary, 0);
});
test('ordinary and unrelated controlled callbacks preserve native behavior', async t => {
    const f = nativeFixture(); install(t, f);
    const ordinary = f.callback({ ...f.task, meta: {} }); await ordinary.end({ status: 1 }); assert.equal((await ordinary).status, 1);
    const unrelated = f.callback({ ...f.task, meta: { rejudge: 'controlled' } }); await unrelated.end({ status: 7 }); await unrelated;
    assert.equal(f.ordinary, 1); assert.equal(f.collHistory.rows[0].rid, undefined);
});
for (const invalid of ['uid', 'domain', 'rid', 'code', 'marker', 'user', 'history', 'mode']) test(`invalid ${invalid} ownership settles the context and cannot produce owned terminal AC`, async t => {
    const f = nativeFixture(); install(t, f);
    if (invalid === 'mode') f.task.meta.rejudge = false;
    if (invalid === 'uid') f.task.uid = 9;
    if (invalid === 'domain') f.task.domainId = 'foreign';
    if (invalid === 'rid') f.task.rid = new f.api.ObjectId();
    if (invalid === 'code') f.task.code += ' changed';
    if (invalid === 'marker') f.task.meta.verificationEntry = 'other';
    if (invalid === 'user') f.api.UserModel.getById = async () => ({ _id: 3, uname: 'person' });
    const cb = f.callback();
    if (invalid === 'history') f.collHistory.rows.push({ _id: cb.relatedId, uid: 9, status: 1 });
    await cb.next({ status: 20 }); await cb.end({ status: 1 });
    assert.equal(await cb, null); assert.equal(f.ordinary, 0);
    assert.equal(f.collHistory.rows.filter(r => r.uid === 3 && r.judgeAt && r.status === 1).length, 0);
});
test('reconnected callback retains ambiguity evidence and releases both native consumer slots', async t => {
    const f = nativeFixture(); install(t, f); const first = f.callback(), second = f.callback();
    await first.next({ status: 20 }); await second.next({ status: 20 });
    await first.end({ status: 1 }); await second.end({ status: 1 });
    assert.equal(await first, null); assert.equal(await second, null);
    assert.equal(f.coll.rows[0].dfacmVerification.ambiguous, true);
    assert.equal(f.collHistory.rows.length, 2); assert.equal(f.collHistory.rows.filter(r => r.judgeAt).length, 0);
});
test('failed metadata persistence settles controlled context while ordinary consumer still runs', async t => {
    const f = nativeFixture(); install(t, f); f.collHistory.insertOne = async () => { throw new Error('database unavailable'); };
    const cb = f.callback(); await cb.next({ status: 20 }); await cb.end({ status: 1 }); assert.equal(await cb, null);
    const ordinary = f.callback({ ...f.task, meta: {} }); await ordinary.end({ status: 1 }); assert.equal((await ordinary).status, 1);
});
for (const incompatible of ['version', 'method', 'instance']) test(`incompatible native ${incompatible} is refused`, async t => {
    const f = nativeFixture();
    if (incompatible === 'version') f.api.version = '5.0.8';
    if (incompatible === 'method') f.api.JudgeResultCallbackContext.prototype._end = async () => {};
    if (incompatible === 'instance') { install(t, f); const cb = f.callback(); delete cb.resolve; await assert.rejects(cb.end({ status: 1 }), /native|shape/i); return; }
    const old = process.env.DFACM_CONTROLLED_HISTORY; process.env.DFACM_CONTROLLED_HISTORY = '1';
    t.after(() => { if (old === undefined) delete process.env.DFACM_CONTROLLED_HISTORY; else process.env.DFACM_CONTROLLED_HISTORY = old; });
    assert.equal(typeof adapter.installControlledHistory, 'function', 'missing native adapter');
    assert.throws(() => adapter.installControlledHistory(f.api), /Hydro|shape|version/i);
});

test('explicit activation is required before native wrappers can be installed', t => {
    const f = nativeFixture(), old = process.env.DFACM_CONTROLLED_HISTORY;
    delete process.env.DFACM_CONTROLLED_HISTORY;
    t.after(() => { if (old !== undefined) process.env.DFACM_CONTROLLED_HISTORY = old; });
    const original = f.api.JudgeResultCallbackContext.prototype._end;
    adapter.installControlledHistory(f.api)();
    assert.equal(adapter.getCapability(f.api), null); assert.equal(f.api.JudgeResultCallbackContext.prototype._end, original);
});
test('sealed cleanup prevents late callbacks from creating any new owned history', async t => {
    const f = nativeFixture(); install(t, f); const first = f.callback();
    await first.end({ status: 1 }); await first;
    f.coll.rows[0].dfacmVerification.sealed = true;
    const late = f.callback(); await late.next({ status: 20 }); await late.end({ status: 1 }); assert.equal(await late, null);
    assert.equal(f.collHistory.rows.length, 1); assert.equal(f.coll.rows[0].dfacmVerification.failed, undefined);
});

test('repeat installation rejects a mismatched advertised Hydro version', t => {
    const f = nativeFixture(); install(t, f);
    assert.throws(() => adapter.installControlledHistory({ ...f.api, version: '5.0.8' }), /version|Hydro/i);
});

test('history metadata type changes cannot authorize native terminal writes', async t => {
    const f = nativeFixture(); install(t, f); const cb = f.callback();
    await cb.next({ status: 20 }); f.collHistory.rows[0].uid = '3';
    await cb.end({ status: 1 }); assert.equal(await cb, null);
    assert.equal(f.collHistory.rows[0].status, 20); assert.equal(f.collHistory.rows[0].judgeAt, undefined);
});
