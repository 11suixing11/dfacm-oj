const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const load = (name) => { try { return require(name); } catch (e) { if (e.code === 'MODULE_NOT_FOUND') return {}; throw e; } };
const verification = load('../verify-solutions.cjs');
const storage = load('../verification-state.cjs');
const clone = (x) => structuredClone(x);
const { nativeFixture, collection } = require('../../../plugin-dfacm-ops/tests/native-callback-fixture.cjs');
const { installControlledHistory } = require('../../../plugin-dfacm-ops/controlled-history.cjs');
function fixture(status = 1) {
    const native = nativeFixture(); const api = native.api;
    const record = api.RecordModel.coll, history = api.RecordModel.collHistory;
    record.rows.splice(0, record.rows.length, { _id: 'real', uid: 9, domainId: 'system', pid: 1, code: 'real user', status: 1 });
    const problem = { _id: 'p1', domainId: 'system', docId: 1, pid: 'P1', owner: 1, config: { type: 'default' }, data: [{ name: '1.in', etag: 'v1' }] };
    let adds = 0, judges = 0;
    const batch = { id: 'batch-one', domainId: 'system', uid: 3, uname: 'hydsvc-0074', entries: [{ id: 'entry-one', docId: 1, t: 'Explanation', c: 'int main() {}' }] };
    const prohibited = () => assert.fail('controlled verification must not write problem/user/status/ledger accounting');
    api.ProblemModel = { get: async () => clone(problem), inc: prohibited, edit: prohibited, updateStatus: prohibited, coll: { updateOne: prohibited, updateMany: prohibited } };
    Object.assign(api.UserModel, { set: prohibited, inc: prohibited, coll: { updateOne: prohibited, updateMany: prohibited } });
    api.DomainModel = { incUserInDomain: prohibited };
    api.db = { collection: () => ({ updateOne: prohibited, updateMany: prohibited, insertOne: prohibited, deleteOne: prohibited }) };
    Object.assign(api.RecordModel, {
        update: prohibited,
        add: async (domainId, pid, uid, lang, code, addTask, args) => {
            assert.equal(addTask, false); assert.deepEqual(args, { type: 'judge' });
            const rid = String(++adds).padStart(24, '0'); record.rows.push({ _id: rid, domainId, pid, uid, lang, code, status: 0 }); return rid;
        },
        judge: async (domainId, rid, priority, config, meta) => {
            judges++; assert.deepEqual(config, {}); assert.equal(meta.rejudge, 'controlled'); assert.equal(meta.type, 'judge');
            if (status !== null) {
                const row = await record.findOne({ _id: rid });
                const callback = native.callback({ ...row, rid, type: 'judge', meta });
                await callback.end({ status }); await callback;
            }
        },
    });
    const prior = process.env.DFACM_CONTROLLED_HISTORY; process.env.DFACM_CONTROLLED_HISTORY = '1';
    const dispose = installControlledHistory(api);
    if (prior === undefined) delete process.env.DFACM_CONTROLLED_HISTORY; else process.env.DFACM_CONTROLLED_HISTORY = prior;
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'solutions-test-'));
    return { api, batch, record, history, problem, dir, dispose, get adds() { return adds; }, get judges() { return judges; } };
}
function ownedHistory(f, historyId = 'hist') {
    const rid = '000000000000000000000001';
    const code = `// dfacm-verification:${f.batch.id}:${f.batch.entries[0].id}\n${f.batch.entries[0].c}`;
    const owner = { rid: new f.api.ObjectId(rid), domainId: 'system', uid: 3, verificationBatch: 'batch-one', verificationEntry: 'entry-one',
        verificationPid: 1, verificationUname: 'hydsvc-0074', verificationCodeHash: require('node:crypto').createHash('sha256').update(code).digest('hex'), verificationAdapter: 1 };
    f.record.rows.find(r => String(r._id) === rid).dfacmVerification = { ...owner, historyId };
    return { _id: historyId, ...owner, status: 1, judgeAt: new Date() };
}
function state(f) { return storage.createStateStore(path.join(f.dir, 'state.json')); }

test('native helper exists and plain Hydro cannot submit or publish without owned history capability', async () => {
    assert.equal(typeof verification.verifySolutions, 'function', 'missing controlled verification helper');
    const f = fixture(); f.dispose();
    await assert.rejects(verification.verifySolutions(f.api, f.batch, state(f)), /history|关联/i);
    assert.equal(f.adds, 0);
});
for (const status of [1, 2, 7]) test(`controlled status ${status} uses native controlled protocol and preserves unrelated records`, async () => {
    assert.equal(typeof storage.createStateStore, 'function', 'missing persistent verification state');
    const f = fixture(status); const store = state(f);
    const result = await verification.verifySolutions(f.api, f.batch, store, { pollMs: 0, timeoutMs: 0 });
    assert.equal(result.ready.length, status === 1 ? 1 : 0); assert.equal(result.pending.length, 0);
    assert.deepEqual(f.record.rows.map((r) => r._id), ['real']); assert.equal(f.history.rows.length, 0);
    const again = await verification.verifySolutions(f.api, f.batch, state(f), { pollMs: 0, timeoutMs: 0 });
    assert.equal(again.ready.length, status === 1 ? 1 : 0); assert.equal(f.adds, 1); assert.equal(f.judges, 1);
});
test('timeout retains the owned record until the controlled history reaches terminal status', async () => {
    assert.equal(typeof verification.verifySolutions, 'function');
    const f = fixture(null); const store = state(f);
    const first = await verification.verifySolutions(f.api, f.batch, store, { timeoutMs: 0 });
    assert.equal(first.pending.length, 1); assert.equal(f.record.rows.length, 2);
    f.history.rows.push(ownedHistory(f));
    const next = await verification.verifySolutions(f.api, f.batch, state(f), { timeoutMs: 0 });
    assert.equal(next.ready.length, 1); assert.equal(f.judges, 1);
    assert.equal(f.record.rows.length, 1);
});
test('unowned AC histories cannot authorize publication or cleanup', async () => {
    assert.equal(typeof verification.verifySolutions, 'function');
    const f = fixture(null);
    f.history.rows.push({ _id: 'foreign', rid: '000000000000000000000001', domainId: 'system', uid: 9, status: 1, judgeAt: new Date() });
    const result = await verification.verifySolutions(f.api, f.batch, state(f), { timeoutMs: 0 });
    assert.equal(result.ready.length, 0); assert.equal(result.pending.length, 1); assert.equal(f.history.rows.length, 1);
});
test('changed original problem or testdata invalidates previously verified publication', async () => {
    assert.equal(typeof verification.verifySolutions, 'function');
    const f = fixture(); await verification.verifySolutions(f.api, f.batch, state(f), { timeoutMs: 0 });
    f.problem.data[0].etag = 'v2';
    const result = await verification.verifySolutions(f.api, f.batch, state(f), { timeoutMs: 0 });
    assert.equal(result.ready.length, 0); assert.match(result.rejected[0].reason, /changed/i);
});
test('remotejudge and non-service accounts fail before creating a verification record', async () => {
    assert.equal(typeof verification.verifySolutions, 'function');
    const f = fixture(); f.problem.config.type = 'remote_judge';
    const result = await verification.verifySolutions(f.api, f.batch, state(f), { timeoutMs: 0 });
    assert.equal(result.ready.length, 0); assert.equal(f.adds, 0);
    const g = fixture(); g.api.UserModel.getById = async () => ({ _id: 3, uname: 'real-person' });
    await assert.rejects(verification.verifySolutions(g.api, g.batch, state(g)), /service|account/i); assert.equal(g.adds, 0);
});
test('every persistent boundary can restart without duplicate submission or deletion of a real record', async () => {
    assert.equal(typeof verification.verifySolutions, 'function');
    for (let failAt = 1; failAt <= 13; failAt++) {
        const f = fixture(); const base = state(f); let writes = 0;
        const crashing = { ...base, save: async (s) => { await base.save(s); if (++writes === failAt) throw new Error('simulated crash'); } };
        try { await verification.verifySolutions(f.api, f.batch, crashing, { timeoutMs: 0 }); } catch (e) { assert.match(e.message, /simulated crash/); }
        const result = await verification.verifySolutions(f.api, f.batch, state(f), { timeoutMs: 0 });
        assert.ok(f.adds <= 1); assert.ok(f.judges <= 1); assert.ok(f.record.rows.some((r) => r._id === 'real'));
        assert.equal(result.ready.length + result.pending.length, 1);
    }
});
test('durable state lock rejects another process and recovers after its holder exits', async () => {
    assert.equal(typeof storage.createStateStore, 'function');
    const f = fixture(); const a = state(f); const release = await a.lock();
    const child = spawnSync(process.execPath, ['-e', `require(${JSON.stringify(path.resolve(__dirname, '../verification-state.cjs'))}).createStateStore(${JSON.stringify(a.path)}).lock().then(()=>process.exit(0),()=>process.exit(7))`]);
    assert.equal(child.status, 7); await release(); const unlock = await state(f).lock(); await unlock();
});

test('production batch runner publishes only the current verified result and rechecks data before insertion', async () => {
    const runner = load('../solutions-apply.cjs'); assert.equal(typeof runner.runBatch, 'function');
    const f = fixture(); const solutions = collection(); let inserts = 0;
    f.api.SolutionModel = { getMulti: (_domain, pid) => solutions.find({ parentId: pid }),
        add: async (domain, pid, uid, content) => { inserts++; solutions.rows.push({ parentId: pid, content }); return 'solution1'; } };
    const first = await runner.runBatch(f.api, f.batch, state(f), { timeoutMs: 0 });
    assert.equal(first.published.length, 1); assert.equal(inserts, 1);
    await runner.runBatch(f.api, f.batch, state(f), { timeoutMs: 0 }); assert.equal(inserts, 1);
    const g = fixture(); g.api.SolutionModel = f.api.SolutionModel; g.batch.entries[0].docId = 2; g.problem.docId = 2;
    const original = g.api.RecordModel.judge;
    g.api.RecordModel.judge = async (...args) => { await original(...args); g.problem.data[0].etag = 'changed-during-judge'; };
    const next = await runner.runBatch(g.api, g.batch, state(g), { timeoutMs: 0 });
    assert.equal(next.published.length, 0); assert.equal(inserts, 1);
});
test('shell runner ignores stale ready data and fails even when a swallowing Hydro CLI exits zero', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'solutions-cli-'));
    const executable = path.join(dir, 'hydrooj'); fs.writeFileSync(executable, '#!/bin/sh\nexit 0\n', { mode: 0o755 });
    const batchFile = path.join(dir, 'batch.json'); fs.writeFileSync(batchFile, JSON.stringify({}));
    fs.writeFileSync(path.join(dir, 'sol-ready.json'), JSON.stringify([{ pid: 1, content: 'stale' }]));
    const result = spawnSync('bash', [path.resolve(__dirname, '../run-solutions.sh'), batchFile], { env: { ...process.env, HYDRO_CLI: executable }, encoding: 'utf8' });
    assert.notEqual(result.status, 0); assert.match(result.stderr, /receipt|回执/i);
});

test('a crash after native insertion recovers the unique code marker without a second RID', async () => {
    const f = fixture(); const add = f.api.RecordModel.add;
    f.api.RecordModel.add = async (...args) => { await add(...args); throw new Error('lost insert receipt'); };
    await assert.rejects(verification.verifySolutions(f.api, f.batch, state(f), { timeoutMs: 0 }), /lost insert receipt/);
    f.api.RecordModel.add = add;
    const result = await verification.verifySolutions(f.api, f.batch, state(f), { timeoutMs: 0 });
    assert.equal(result.ready.length, 1); assert.equal(f.adds, 1); assert.equal(f.judges, 1);
});
for (const target of ['history', 'record']) test(`cleanup resumes after ${target} deletion loses its receipt`, async () => {
    const f = fixture(); const coll = f[target]; const remove = coll.deleteOne;
    coll.deleteOne = async (...args) => { await remove(...args); throw new Error('lost delete receipt'); };
    await assert.rejects(verification.verifySolutions(f.api, f.batch, state(f), { timeoutMs: 0 }), /lost delete receipt/);
    coll.deleteOne = remove;
    const result = await verification.verifySolutions(f.api, f.batch, state(f), { timeoutMs: 0 });
    assert.equal(result.ready.length, 1); assert.equal(f.history.rows.length, 0); assert.deepEqual(f.record.rows.map((r) => r._id), ['real']);
});
test('a crash after insertion of an editorial recovers through its exact content', async () => {
    const { runBatch } = require('../solutions-apply.cjs'); const f = fixture(); const solutions = collection();
    f.api.SolutionModel = { getMulti: () => solutions.find({}), add: async (d, pid, uid, content) => {
        solutions.rows.push({ content }); throw new Error('lost editorial receipt');
    } };
    await assert.rejects(runBatch(f.api, f.batch, state(f), { timeoutMs: 0 }), /lost editorial receipt/);
    const result = await runBatch(f.api, f.batch, state(f), { timeoutMs: 0 });
    assert.equal(result.published.length, 1); assert.equal(solutions.rows.length, 1); assert.equal(f.adds, 1);
});
test('immutable batch state rejects code edits before any additional native work', async () => {
    const f = fixture(); await verification.verifySolutions(f.api, f.batch, state(f), { timeoutMs: 0 });
    f.batch.entries[0].c = 'changed';
    await assert.rejects(verification.verifySolutions(f.api, f.batch, state(f)), /immutable/); assert.equal(f.adds, 1);
});

test('helper rejects an AC if original data changed while it was being judged', async () => {
    const f = fixture(); const judge = f.api.RecordModel.judge;
    f.api.RecordModel.judge = async (...args) => { await judge(...args); f.problem.data[0].etag = 'v2'; };
    const result = await verification.verifySolutions(f.api, f.batch, state(f), { timeoutMs: 0 });
    assert.equal(result.ready.length, 0); assert.match(result.rejected[0].reason, /changed/i);
});
test('cleanup refuses to report complete when a RID no longer belongs to the batch', async () => {
    const f = fixture(); const judge = f.api.RecordModel.judge;
    f.api.RecordModel.judge = async (...args) => { await judge(...args); f.record.rows.find((r) => r._id === '000000000000000000000001').uid = 9; };
    await assert.rejects(verification.verifySolutions(f.api, f.batch, state(f), { timeoutMs: 0 }), /ownership|identity/i);
    assert.equal(f.record.rows.length, 2); assert.ok(f.record.rows.some((r) => r._id === 'real'));
});

for (const invalid of ['missing', 'unsupported', 'empty', 'changed']) test(`existing terminal work is cleaned after problem becomes ${invalid}`, async () => {
    const f = fixture(null); const store = state(f);
    await verification.verifySolutions(f.api, f.batch, store, { timeoutMs: 0 });
    f.history.rows.push(ownedHistory(f));
    if (invalid === 'missing') f.api.ProblemModel.get = async () => null;
    if (invalid === 'unsupported') f.problem.config.type = 'remote_judge';
    if (invalid === 'empty') f.problem.data = [];
    if (invalid === 'changed') f.problem.data[0].etag = 'v2';
    const result = await verification.verifySolutions(f.api, f.batch, store, { timeoutMs: 0 });
    assert.equal(result.ready.length, 0); assert.equal(result.pending.length, 0);
    assert.equal(result.rejected[0].rid, '000000000000000000000001'); assert.equal(f.history.rows.length, 0);
    assert.deepEqual(f.record.rows.map(r => r._id), ['real']); assert.equal((await store.load()).entries['entry-one'].phase, 'cleaned');
});
test('invalidated in-flight work remains pending with its RID and invalidation reason', async () => {
    const f = fixture(null); const store = state(f);
    await verification.verifySolutions(f.api, f.batch, store, { timeoutMs: 0 });
    f.api.ProblemModel.get = async () => null;
    const result = await verification.verifySolutions(f.api, f.batch, store, { timeoutMs: 0 });
    assert.equal(result.pending.length, 1); assert.equal(result.pending[0].rid, '000000000000000000000001');
    assert.match(result.pending[0].reason, /missing/i); assert.equal(f.judges, 1); assert.equal(f.record.rows.length, 2);
});
for (const target of ['history', 'record']) test(`interrupted ${target} cleanup resumes when original problem is missing`, async () => {
    const f = fixture(); const store = state(f); const remove = f[target].deleteOne;
    f[target].deleteOne = async (...args) => { await remove(...args); throw new Error('lost delete receipt'); };
    await assert.rejects(verification.verifySolutions(f.api, f.batch, store, { timeoutMs: 0 }), /lost delete receipt/);
    f[target].deleteOne = remove; f.api.ProblemModel.get = async () => null;
    const result = await verification.verifySolutions(f.api, f.batch, store, { timeoutMs: 0 });
    assert.equal(result.ready.length, 0); assert.equal(result.rejected[0].rid, '000000000000000000000001');
    assert.equal(f.history.rows.length, 0); assert.deepEqual(f.record.rows.map(r => r._id), ['real']);
    assert.equal((await store.load()).entries['entry-one'].phase, 'cleaned');
});

test('a capability flag without installed native wrappers cannot submit', async () => {
    const f = fixture(); f.dispose();
    f.api.controlledVerification = { version: 1, hydroVersion: '5.0.7', ownedHistory: true, taskTypes: ['judge'] };
    await assert.rejects(verification.verifySolutions(f.api, f.batch, state(f)), /history|capability|wrapper/i);
    assert.equal(f.adds, 0);
});
test('ambiguous durable callback claim keeps even a single terminal history pending', async () => {
    const f = fixture(null); const store = state(f);
    await verification.verifySolutions(f.api, f.batch, store, { timeoutMs: 0 });
    f.history.rows.push(ownedHistory(f));
    f.record.rows.find(r => r._id === '000000000000000000000001').dfacmVerification.ambiguous = true;
    const result = await verification.verifySolutions(f.api, f.batch, store, { timeoutMs: 0 });
    assert.equal(result.ready.length, 0); assert.equal(result.pending.length, 1); assert.match(result.pending[0].reason, /ambiguous|reconciliation/i);
    assert.equal(f.history.rows.length, 1); assert.equal(f.record.rows.length, 2);
});

test('conflicting history ownership for the exact RID stays pending without deleting either history', async () => {
    const f = fixture(); const judge = f.api.RecordModel.judge;
    f.api.RecordModel.judge = async (...args) => {
        await judge(...args); f.history.rows.push({ _id: 'conflict', rid: args[1], uid: 9, domainId: 'system', status: 1, judgeAt: new Date() });
    };
    const result = await verification.verifySolutions(f.api, f.batch, state(f), { timeoutMs: 0 });
    assert.equal(result.ready.length, 0); assert.equal(result.pending.length, 1); assert.match(result.pending[0].reason, /ownership|reconciliation/i);
    assert.equal(f.history.rows.length, 2); assert.equal(f.record.rows.length, 2);
});

for (const operation of ['end', 'next']) test(`same controlled context ${operation} replay cannot recreate history across cleanup`, async () => {
    const f = fixture(null), store = state(f);
    await verification.verifySolutions(f.api, f.batch, store, { timeoutMs: 0 });
    const rid = new f.api.ObjectId('000000000000000000000001');
    const callback = new f.api.JudgeResultCallbackContext({ broadcast() {} }, {
        ...await f.record.findOne({ _id: rid }), rid, type: 'judge',
        meta: { rejudge: 'controlled', verificationBatch: f.batch.id, verificationEntry: f.batch.entries[0].id },
    });
    await callback.end({ status: 1 }); assert.equal(await callback, null);
    const lookup = f.history.findOne;
    let release, signalPaused, intercept = true;
    const gate = new Promise(resolve => { release = resolve; });
    const paused = new Promise(resolve => { signalPaused = resolve; });
    f.history.findOne = async function(query) {
        const snapshot = await lookup.call(this, query);
        if (intercept && String(query._id) === String(callback.relatedId)) {
            intercept = false; signalPaused(); await gate;
        }
        return snapshot;
    };
    const replay = callback[operation]({ status: 2 });
    try {
        // Before the fix, this deterministically pauses after the unsealed claim
        // read. A terminal fence blocks replay before any history lookup.
        await Promise.race([paused, replay]);
        f.history.findOne = lookup;
        const result = await verification.verifySolutions(f.api, f.batch, store, { timeoutMs: 0 });
        assert.equal(result.ready.length, 1); assert.equal((await store.load()).entries['entry-one'].phase, 'cleaned');
        release(); await replay;
        assert.equal(f.history.rows.length, 0, 'replay must not recreate an unowned native history after cleanup');
        assert.deepEqual(f.record.rows.map(r => r._id), ['real']);
        const again = await verification.verifySolutions(f.api, f.batch, store, { timeoutMs: 0 });
        assert.equal(again.ready.length, 1); assert.equal(f.history.rows.length, 0);
    } finally { f.history.findOne = lookup; release(); await replay; }
});
