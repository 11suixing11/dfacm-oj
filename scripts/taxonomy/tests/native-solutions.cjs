// Run only via an isolated Hydro 5.0.7 administrator CLI, never against production.
// The compiler worker below executes ONLY these trusted fixture programs. It is
// not a sandbox and is deliberately not exported as a production judge adapter.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { verifySolutions } = require('../verify-solutions.cjs');
const { createStateStore } = require('../verification-state.cjs');
const { getCapability } = require('../../../plugin-dfacm-ops/controlled-history.cjs');
const programs = {
    AC: '#include <iostream>\nint main(){ long long a,b; std::cin>>a>>b; std::cout<<a+b; }',
    WA: '#include <iostream>\nint main(){std::cout<<0;}',
    CE: 'this is not C++',
};
async function buffer(stream) { const chunks = []; for await (const chunk of stream) chunks.push(Buffer.from(chunk)); return Buffer.concat(chunks); }
module.exports = async function nativeSolutions(api, artifactDirectory) {
    const { RecordModel, ProblemModel, DomainModel, UserModel, TaskModel, StorageModel, JudgeResultCallbackContext, db } = api;
    assert.equal(db.db.databaseName, 'dfacm_native_validation', 'fixture requires explicitly isolated database');
    assert.equal(api.version, '5.0.7');
    fs.mkdirSync(artifactDirectory, { recursive: true });
    const domainId = `c2-${randomUUID().slice(0, 8)}`;
    await DomainModel.add(domainId, 1, 'Controlled editorial fixture', 'Isolated test only');
    const oldUser = await UserModel.coll.findOne({ _id: 3 });
    if (!oldUser) await UserModel.create('c2-service@local.invalid', 'hydsvc-0074', randomUUID(), 3);
    else assert.equal(oldUser.uname, 'hydsvc-0074');
    const realUid = 913;
    if (!await UserModel.coll.findOne({ _id: realUid })) await UserModel.create('c2-person@local.invalid', 'c2-real-user', randomUUID(), realUid);
    await ProblemModel.addWithId(domainId, 1, 'C2FULL', 'sum all testdata', 'No statement sample proves all three cases', 1);
    for (const [name, bytes] of Object.entries({ '1.in': '1 2\n', '1.out': '3\n', '2.in': '-17 5\n', '2.out': '-12\n', '3.in': '1000000000 999999999\n', '3.out': '1999999999\n' })) {
        await ProblemModel.addTestdata(domainId, 1, name, Buffer.from(bytes));
    }
    await ProblemModel.edit(domainId, 1, { config: 'type: default\ntime: 1s\nmemory: 64m\n', nSubmit: 10, nAccept: 4 });
    const { awardSolve, isOfficialAcceptedRecord } = require('../../../plugin-dfacm-shop/points.ts');
    const ledger = db.collection('swpuPointsLedger');
    await ledger.createIndex({ uid: 1, ref: 1 }, { unique: true });
    const pendingAwards = [];
    const disposeAward = global.app.on('record/change', (rdoc, _set, _push, body) => {
        if (body?.key === 'end' && rdoc.domainId === domainId && isOfficialAcceptedRecord(rdoc)) pendingAwards.push(awardSolve(
            { problem: ProblemModel }, { ledger }, () => new Date(), { uid: rdoc.uid, domainId, docId: rdoc.pid }));
    });
    assert.deepEqual(await awardSolve({ problem: ProblemModel }, { ledger }, () => new Date(), { uid: 3, domainId, docId: 1 }), { awarded: false, delta: 0 });
    const evidence = { hydro: api.version, domainId, worker: 'trusted C++ fixture worker; production daemon/sandbox NOT exercised', runs: [] };
    let judgeEvents = 0;
    const dispose = global.app.on('record/judge', () => { judgeEvents++; });
    async function snapshot() {
        await Promise.all(pendingAwards);
        const p = await ProblemModel.get(domainId, 1);
        return { counters: [p.nSubmit, p.nAccept], stats: p.stats,
            status: await db.collection('document.status').find({ domainId }).sort({ _id: 1 }).toArray(),
            users: await db.collection('domain.user').find({ domainId }).sort({ _id: 1 }).toArray(),
            ledger: await ledger.find({ ref: `solve:${domainId}:1` }).sort({ uid: 1 }).toArray(), judgeEvents };
    }
    async function worker(task, queueReplay = false) {
        assert.equal(task.type, 'judge'); assert.equal(task.source, `${domainId}/1`);
        assert.equal(task.data.length, 6, 'all six stored testdata files must reach the native payload');
        const callback = new JudgeResultCallbackContext(global.app, task);
        const sourceFile = path.join(artifactDirectory, `${task.rid}.cpp`);
        const binary = path.join(artifactDirectory, `${task.rid}.bin`);
        fs.writeFileSync(sourceFile, task.code);
        const compile = spawnSync('g++', ['-std=c++17', '-O2', sourceFile, '-o', binary], { encoding: 'utf8', timeout: 30000 });
        const cases = [];
        let status = 7;
        if (compile.status === 0) {
            status = 1;
            const inputs = task.data.filter((file) => file.name.endsWith('.in'));
            assert.equal(inputs.length, 3);
            for (let i = 0; i < inputs.length; i++) {
                const input = await buffer(await StorageModel.get(`problem/${task.source}/testdata/${inputs[i].name}`));
                const expected = await buffer(await StorageModel.get(`problem/${task.source}/testdata/${inputs[i].name.replace(/\.in$/, '.out')}`));
                const run = spawnSync(binary, [], { input, timeout: 1000 });
                const accepted = run.status === 0 && run.stdout.toString().trim() === expected.toString().trim();
                cases.push({ id: i + 1, subtaskId: 1, status: accepted ? 1 : 2, score: accepted ? 100 / 3 : 0, time: 1, memory: 1 });
                if (!accepted) status = 2;
            }
            await callback.next({ cases });
        }
        const ending = callback.end({ status, score: status === 1 ? 100 : 0, time: 3, memory: 1, compilerText: compile.status ? compile.stderr : undefined });
        // Native message dispatch does not await end. Queue duplicates while the
        // first end is still running, using the real operationPromise queue.
        const queued = queueReplay ? [callback.end({ status: 2 }), callback.next({ status: 2 })] : [];
        await ending; await Promise.all(queued);
        return { historyId: callback.relatedId, status, cases: cases.length, callback };
    }
    let integration;
    const oldActivation = process.env.DFACM_CONTROLLED_HISTORY;
    try {
        assert.equal(getCapability(api), null, 'stock exports cannot advertise native ownership');
        // Prove the stock path isolates accounting but cannot identify its history by RID.
        const baseline = await snapshot();
        const rawRid = await RecordModel.add(domainId, 1, 3, 'cc.cc17o2', programs.AC, false, { type: 'judge' });
        await RecordModel.judge(domainId, rawRid, 0, {}, { type: 'judge', rejudge: 'controlled' });
        const rawTask = await TaskModel.getFirst({ rid: rawRid });
        const rawResult = await worker(rawTask);
        const rawHistory = await RecordModel.collHistory.findOne({ _id: rawResult.historyId });
        assert.equal((await RecordModel.get(domainId, rawRid)).status, 0, 'controlled callback must not finalize the original record');
        assert.equal(rawHistory.status, 1); assert.equal(rawHistory.rid, undefined); assert.equal(rawHistory.domainId, undefined);
        assert.equal(await RecordModel.collHistory.countDocuments({ rid: rawRid }), 0);
        assert.deepEqual(await snapshot(), baseline);
        evidence.stockHistory = { status: rawHistory.status, missingFields: ['rid', 'domainId', 'uid', 'verificationBatch'], cases: rawResult.cases };
        await RecordModel.collHistory.deleteOne({ _id: rawResult.historyId }); await RecordModel.coll.deleteOne({ _id: rawRid, domainId, uid: 3 });
        process.env.DFACM_CONTROLLED_HISTORY = '1';
        integration = await global.app.plugin(require('../../../plugin-dfacm-ops/index.ts'));
        assert.ok(getCapability(api), 'real ops addon lifecycle must install production wrapper');
        evidence.integration = 'production ops apply lifecycle with strict Hydro 5.0.7 callback adapter';
        for (const concurrent of [false, true]) for (const [kind, code] of Object.entries(programs)) {
            // Every scenario has a fresh original 10/4 baseline, but only fixture docs are reset.
            await ProblemModel.edit(domainId, 1, { nSubmit: 10, nAccept: 4 });
            // A unique real user's record for each concurrency case avoids first-AC dedup.
            const uid = realUid + evidence.runs.length;
            if (!await UserModel.coll.findOne({ _id: uid })) await UserModel.create(`c2-${uid}@local.invalid`, `c2-real-${uid}`, randomUUID(), uid);
            const before = await snapshot(); let workerResult;
            class FixtureRecordModel extends RecordModel {
                static async judge(...args) {
                    await super.judge(...args);
                    const task = await TaskModel.getFirst({ rid: args[1] });
                    workerResult = await worker(task);
                    if (concurrent) {
                        const realRid = await RecordModel.add(domainId, 1, uid, 'cc.cc17o2', programs.AC, false, { type: 'judge' });
                        // The HTTP handler's increment, then the actual ordinary native callback.
                        await ProblemModel.inc(domainId, 1, 'nSubmit', 1);
                        await RecordModel.judge(domainId, realRid, 0, {}, { type: 'judge' });
                        const realTask = await TaskModel.getFirst({ rid: realRid });
                        await worker(realTask);
                    }
                }
            }
            const batch = { id: `native-${domainId}-${kind}-${concurrent}`, domainId, uid: 3, uname: 'hydsvc-0074', entries: [{ id: 'one', docId: 1, t: kind, c: code }] };
            const result = await verifySolutions({ ...api, RecordModel: FixtureRecordModel },
            batch, createStateStore(path.join(artifactDirectory, `${batch.id}.json`)), { timeoutMs: 0 });
            assert.equal(result.ready.length, kind === 'AC' ? 1 : 0); assert.equal(result.pending.length, 0);
            const after = await snapshot();
            assert.deepEqual(after.counters, concurrent ? [11, 5] : [10, 4]);
            if (!concurrent) assert.deepEqual(after, before);
            else {
                assert.equal(after.judgeEvents - before.judgeEvents, 1);
                assert.equal(after.ledger.length - before.ledger.length, 1);
                assert.ok(after.ledger.some((row) => row.uid === uid && row.delta > 0));
            }
            assert.equal(after.ledger.filter((row) => row.uid === 3).length, 0);
            assert.equal(await RecordModel.coll.countDocuments({ domainId, uid: 3 }), 0);
            assert.equal(await RecordModel.collHistory.countDocuments({ domainId, uid: 3 }), 0);
            assert.equal(await db.collection('document.status').countDocuments({ domainId, uid: 3 }), 0);
            evidence.runs.push({ kind, concurrent, status: workerResult.status, testCases: workerResult.cases, counters: after.counters,
                serviceStatusRows: 0, controlledJudgeEvents: 0, realJudgeEvents: concurrent ? 1 : 0, ledgerDeltaRows: after.ledger.length - before.ledger.length });
        }
        evidence.replays = [];
        for (const operation of ['end', 'next']) {
            const batch = { id: `native-${domainId}-replay-${operation}`, domainId, uid: 3, uname: 'hydsvc-0074', entries: [{ id: 'one', docId: 1, t: 'native replay', c: programs.AC }] };
            const store = createStateStore(path.join(artifactDirectory, `${batch.id}.json`));
            const before = await snapshot();
            let callback, replay, release, interception;
            class ReplayRecordModel extends RecordModel {
                static async judge(...args) {
                    await super.judge(...args);
                    const result = await worker(await TaskModel.getFirst({ rid: args[1] }), true);
                    callback = result.callback;
                    assert.equal((await RecordModel.collHistory.findOne({ _id: callback.relatedId })).status, 1, 'queued duplicate end/next must preserve first AC');
                    const lookup = RecordModel.collHistory.findOne;
                    let signalPaused, intercept = true;
                    const gate = new Promise(resolve => { release = resolve; });
                    const paused = new Promise(resolve => { signalPaused = resolve; });
                    RecordModel.collHistory.findOne = async function(query, ...options) {
                        const detachedSnapshot = await lookup.call(this, query, ...options);
                        if (intercept && String(query._id) === String(callback.relatedId)) {
                            intercept = false; signalPaused(); await gate;
                        }
                        return detachedSnapshot;
                    };
                    try {
                        replay = callback[operation]({ status: 2 });
                        interception = await Promise.race([paused.then(() => 'paused-after-claim'), replay.then(() => 'fenced-before-history')]);
                    } finally { RecordModel.collHistory.findOne = lookup; }
                }
            }
            try {
                const result = await verifySolutions({ ...api, RecordModel: ReplayRecordModel }, batch, store, { timeoutMs: 0 });
                assert.equal(result.ready.length, 1); assert.equal((await store.load()).entries.one.phase, 'cleaned');
                release(); await replay;
                assert.equal(await RecordModel.collHistory.countDocuments({ _id: callback.relatedId }), 0, 'same-context replay cannot recreate unowned history after cleanup');
                assert.equal(await RecordModel.coll.countDocuments({ _id: callback.task.rid }), 0);
                const again = await verifySolutions(api, batch, store, { timeoutMs: 0 });
                assert.equal(again.ready.length, 1); assert.deepEqual(await snapshot(), before);
                evidence.replays.push({ operation, queuedBeforeFirstEndFinished: ['end', 'next'], interception, ready: 1, phase: 'cleaned', remainingHistoriesAtNativeId: 0, accountingUnchanged: true });
            } finally { if (release) release(); if (replay) await replay; }
        }
        // Exercise every file checkpoint against real native records/history.
        // A crash after durable scheduling intent intentionally stays pending.
        evidence.restarts = [];
        class RestartRecordModel extends RecordModel {
            static async judge(...args) { await super.judge(...args); await worker(await TaskModel.getFirst({ rid: args[1] })); }
        }
        for (let boundary = 1; boundary <= 10; boundary++) {
            const batch = { id: `native-${domainId}-checkpoint-${boundary}`, domainId, uid: 3, uname: 'hydsvc-0074', entries: [{ id: 'one', docId: 1, t: 'checkpoint', c: programs.AC }] };
            const store = createStateStore(path.join(artifactDirectory, `${batch.id}.json`));
            const before = await snapshot(); let saves = 0;
            await assert.rejects(verifySolutions({ ...api, RecordModel: RestartRecordModel }, batch,
                { ...store, save: async state => { await store.save(state); if (++saves === boundary) throw new Error('fixture checkpoint crash'); } }, { timeoutMs: 0 }), /checkpoint crash/);
            const result = await verifySolutions({ ...api, RecordModel: RestartRecordModel }, batch, store, { timeoutMs: 0 });
            assert.equal(result.ready.length, boundary === 4 ? 0 : 1); assert.equal(result.pending.length, boundary === 4 ? 1 : 0);
            const item = (await store.load()).entries.one;
            assert.equal(await RecordModel.coll.countDocuments({ _id: new api.ObjectId(item.rid), domainId, uid: 3 }), boundary === 4 ? 1 : 0);
            assert.equal(await RecordModel.collHistory.countDocuments({ verificationBatch: batch.id }), 0);
            assert.deepEqual(await snapshot(), before);
            evidence.restarts.push({ boundary, phase: item.phase, ready: result.ready.length, pending: result.pending.length, accountingUnchanged: true });
        }
        for (const target of ['insert', 'history-delete', 'record-delete']) {
            const batch = { id: `native-${domainId}-lost-${target}`, domainId, uid: 3, uname: 'hydsvc-0074', entries: [{ id: 'one', docId: 1, t: 'lost receipt', c: programs.AC }] };
            const store = createStateStore(path.join(artifactDirectory, `${batch.id}.json`)); const before = await snapshot();
            const model = { ...api, RecordModel: RestartRecordModel };
            if (target === 'insert') {
                class LostInsert extends RestartRecordModel {
                    static async add(...args) { await super.add(...args); throw new Error('fixture lost native receipt'); }
                }
                await assert.rejects(verifySolutions({ ...api, RecordModel: LostInsert }, batch, store, { timeoutMs: 0 }), /lost native receipt/);
            } else {
                const coll = target === 'history-delete' ? RecordModel.collHistory : RecordModel.coll;
                const remove = coll.deleteOne;
                coll.deleteOne = async function(...args) { await remove.apply(this, args); throw new Error('fixture lost native receipt'); };
                try { await assert.rejects(verifySolutions(model, batch, store, { timeoutMs: 0 }), /lost native receipt/); }
                finally { coll.deleteOne = remove; }
            }
            const result = await verifySolutions(model, batch, store, { timeoutMs: 0 });
            assert.equal(result.ready.length, 1); assert.equal(result.pending.length, 0);
            assert.equal(await RecordModel.collHistory.countDocuments({ verificationBatch: batch.id }), 0);
            assert.deepEqual(await snapshot(), before);
            evidence.restarts.push({ lostReceipt: target, phase: (await store.load()).entries.one.phase, ready: 1, accountingUnchanged: true });
        }
        // Recreate native callback contexts for the same fetched RID, as on
        // reconnect. Production ownership must preserve both histories and block AC.
        const retryBatch = { id: `native-${domainId}-reconnect`, domainId, uid: 3, uname: 'hydsvc-0074', entries: [{ id: 'one', docId: 1, t: 'reconnect', c: programs.AC }] };
        let retryRid;
        class ReconnectedRecordModel extends RecordModel {
            static async judge(...args) {
                await super.judge(...args); retryRid = args[1];
                const task = await TaskModel.getFirst({ rid: retryRid });
                const first = new JudgeResultCallbackContext(global.app, task), second = new JudgeResultCallbackContext(global.app, task);
                const diagnostics = [], previousWarn = console.warn;
                console.warn = (...args) => diagnostics.push(args.join(' '));
                try {
                    await first.next({ status: 20 }); await second.next({ status: 20 });
                    await first.end({ status: 1, score: 100 }); await second.end({ status: 1, score: 100 });
                    assert.equal(await first, null); assert.equal(await second, null);
                    assert.deepEqual(diagnostics, [
                        'swpu-ops [W] controlled verification pending/manual reconciliation: Ambiguous controlled callback history; manual reconciliation required',
                        'swpu-ops [W] controlled verification pending/manual reconciliation: Controlled history requires manual reconciliation or is sealed',
                    ]);
                    evidence.reconnectDiagnostics = diagnostics;
                } finally { console.warn = previousWarn; }
            }
        }
        const retryStore = createStateStore(path.join(artifactDirectory, `${retryBatch.id}.json`));
        const retryBefore = await snapshot();
        const retryResult = await verifySolutions({ ...api, RecordModel: ReconnectedRecordModel }, retryBatch, retryStore, { timeoutMs: 0 });
        const retryAgain = await verifySolutions(api, retryBatch, retryStore, { timeoutMs: 0 });
        assert.equal(retryResult.ready.length, 0); assert.equal(retryAgain.pending.length, 1);
        assert.match(retryAgain.pending[0].reason, /Ambiguous/);
        assert.equal(await RecordModel.collHistory.countDocuments({ rid: retryRid, verificationBatch: retryBatch.id }), 2);
        assert.ok((await RecordModel.get(domainId, retryRid)).dfacmVerification.ambiguous);
        assert.deepEqual(await snapshot(), retryBefore);
        evidence.reconnect = { rid: String(retryRid), pending: retryAgain.pending[0], retainedOwnedHistories: 2, settledNativeContexts: 2, accountingUnchanged: true };
        // Native scheduling identifies remote questions as remotejudge. No remote result
        // is claimed, and the production helper rejects this unverified family.
        await ProblemModel.edit(domainId, 1, { config: 'type: remote_judge\nsubType: fixture\ntarget: P1\n' });
        const remoteRid = await RecordModel.add(domainId, 1, 3, 'cc.cc17o2', programs.AC, false, { type: 'judge' });
        await RecordModel.judge(domainId, remoteRid, 0, {}, { type: 'judge', rejudge: 'controlled' });
        const remoteTask = await TaskModel.getFirst({ rid: remoteRid });
        assert.equal(remoteTask.type, 'remotejudge'); evidence.remoteTaskType = remoteTask.type;
        await RecordModel.coll.deleteOne({ _id: remoteRid, domainId, uid: 3 });
    } finally {
        if (integration) { await integration.dispose(); assert.equal(getCapability(api), null); }
        if (oldActivation === undefined) delete process.env.DFACM_CONTROLLED_HISTORY; else process.env.DFACM_CONTROLLED_HISTORY = oldActivation;
        dispose(); disposeAward();
    }
    evidence.disposal = 'native Cordis effect removed wrapper and capability';
    fs.writeFileSync(path.join(artifactDirectory, 'evidence.json'), JSON.stringify(evidence, null, 2));
    console.log('C2_NATIVE_OK', JSON.stringify(evidence));
    return evidence;
};
