'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createDemo, GENERATED_CODE, CONTEST } = require('../demo.cjs');
const { createEngine } = require('../engine.cjs');
const { createMongoStore } = require('../store.cjs');
const { listFilters } = require('../config.cjs');

function otherStore(demo, now) { return createMongoStore({ ...demo, config: demo.config, now, objectId: id => id,
    problemModel: { get: async (_domain, pid) => ({ docId: Number(String(pid).replace(/^P/, '')), pid: `P${String(pid).replace(/^P/, '')}` }) } }); }

test('real pipeline captures assistant solutions, scopes comparisons, filters/paginates and stores no submission plaintext', async () => {
    const demo = await createDemo();
    try {
        const data = await demo.store.list('system', listFilters());
        assert.deepEqual([data.stats.total, data.stats.high, data.stats.medium, data.stats.insufficient], [6, 1, 1, 1]);
        const high = data.reports.find(v => v.priority === 'high');
        const detail = await demo.store.evidence('system', high.rid);
        assert.equal(detail.evidence.code, GENERATED_CODE); assert.equal(detail.evidence.assistant.code, GENERATED_CODE);
        for (const report of demo.reports.docs.values()) assert.equal(Object.hasOwn(report, 'code'), false);
        assert.equal(JSON.stringify(data).includes('fingerprint'), false); assert.equal(JSON.stringify(data).includes('Count subarrays'), false);
        const filtered = await demo.store.list('system', listFilters({ priority: 'high' })); assert.equal(filtered.reports.length, 1);
        const first = await demo.store.list('system', listFilters({ limit: 2 }));
        const second = await demo.store.list('system', listFilters({ limit: 2, cursor: first.nextCursor }));
        assert.equal(new Set([...first.reports, ...second.reports].map(v => v.rid)).size, 4);
        assert.equal((await demo.store.list('system', listFilters({ uid: 1061 }))).reports.length, 1);
        assert.equal((await demo.store.list('other', listFilters())).reports.length, 0);
        assert.equal(await demo.store.get('other', high.rid), null);
    } finally { demo.engine.stop(); }
});

test('duplicate events, multiple workers and rejudge reuse a single report and preserve human decisions', async () => {
    const demo = await createDemo();
    try {
        const record = [...demo.records.docs.values()][0];
        const report = await demo.store.get(record.domainId, record._id);
        await demo.store.review('system', record._id, { status: 'cleared', note: '核实为允许的公共模板', revision: 0, reviewer: 2 });
        const count = demo.reports.docs.size;
        const rivals = await Promise.all([demo.store.ensureRecord(record), demo.store.ensureRecord(record)]);
        assert.deepEqual(rivals, [false, false]);
        record.status = 2; record.rejudged = true; demo.engine.enqueue(record);
        demo.records.docs.set(record._id, record); await demo.engine.tick();
        const refreshed = await demo.store.get('system', record._id);
        assert.equal(demo.reports.docs.size, count); assert.equal(refreshed.review.status, 'cleared'); assert.equal(refreshed.verdict, 2);
        assert.equal(refreshed.reviewHistory.length, 1); assert.equal(report.rid, refreshed.rid);
    } finally { demo.engine.stop(); }
});

test('review writes use optimistic concurrency, validate notes, and cannot cross domain or escape retention', async () => {
    let clock = Date.parse('2026-10-31T08:00:00Z'); const demo = await createDemo({ now: () => clock });
    try {
        const [report] = (await demo.store.list('system', listFilters())).reports;
        const changes = { status: 'escalated', note: '需要核实比赛允许范围', revision: 0, reviewer: 2 };
        const outcomes = await Promise.allSettled([demo.store.review('system', report.rid, changes), demo.store.review('system', report.rid, changes)]);
        assert.equal(outcomes.filter(v => v.status === 'fulfilled').length, 1);
        assert.equal(outcomes.find(v => v.status === 'rejected').reason.status, 409);
        await assert.rejects(demo.store.review('other', report.rid, { ...changes, revision: 1 }), { status: 404 });
        await assert.rejects(demo.store.review('system', report.rid, { ...changes, note: '', revision: 1 }));
        clock += 31 * 86400000;
        assert.equal(await demo.store.get('system', report.rid), null);
        assert.equal((await demo.store.list('system', listFilters())).stats.total, 0);
        await assert.rejects(demo.store.evidence('system', report.rid), { status: 404 });
    } finally { demo.engine.stop(); }
});

test('Mongo leases recover interrupted workers and third crashed attempt becomes failed', async () => {
    let clock = Date.parse('2026-10-31T08:00:00Z'); const demo = await createDemo({ now: () => clock, seed: false });
    try {
        const record = await demo.submit(); await demo.store.ensureRecord(record); const report = await demo.store.get('system', record._id);
        const rival = otherStore(demo, () => clock);
        const claims = await Promise.all([demo.store.claim(report), rival.claim(report)]);
        assert.equal(claims.filter(Boolean).length, 1);
        clock += 61000; const reclaimed = await rival.claim(report); assert.ok(reclaimed);
        assert.equal(reclaimed.attempts, 2); assert.equal(reclaimed.owner, rival.owner);
        await demo.store.complete(claims[0] || claims[1], { priority: 'high' });
        assert.equal((await demo.store.get('system', record._id)).state, 'analyzing');
        clock += 61000; const last = await rival.claim(reclaimed); assert.equal(last.attempts, 3);
        clock += 61000; const pending = await demo.store.pending(); assert.equal(pending.length, 1);
        assert.equal(await demo.store.claim(pending[0]), null); assert.equal((await demo.store.get('system', record._id)).state, 'failed');
    } finally { demo.engine.stop(); }
});

test('targeted assistant lookup covers scan backlogs; debug responses are not archived', async () => {
    const clock = Date.parse('2026-10-31T08:00:00Z'); const demo = await createDemo({ now: () => clock, seed: false });
    try {
        const job = await demo.addJob(1086, clock - 60000);
        const debug = { ...job, _id: 'debug', answer: { ...job.answer, mode: 'debug' } };
        assert.equal(await demo.store.archiveJob(debug, 'system'), false);
        assert.equal(await demo.store.archiveJob({ ...job, scope: 'other:1086' }, 'system'), false);
        const record = await demo.submit(); await demo.store.ensureRecord(record); const report = await demo.store.get('system', record._id);
        const context = await demo.store.context(report);
        assert.equal(context.sources.length, 1); assert.equal(demo.sources.docs.size, 1);
        assert.equal(context.sources[0].code, undefined); assert.equal(context.sources[0].pid, record.pid);
    } finally { demo.engine.stop(); }
});

test('engine never waits in event callbacks, isolates scan failures, recovers dropped events and stops cleanly', async () => {
    const demo = await createDemo({ seed: false }); const failures = [];
    let scanFails = true; const store = { ...demo.store, scan: async domain => { if (scanFails) throw new Error('temporary'); return demo.store.scan(domain); } };
    const engine = createEngine({ store, config: demo.config, log: stage => failures.push(stage) });
    try {
        const record = await demo.submit({ uid: 300, contest: CONTEST });
        const returned = engine.enqueue(record); assert.equal(returned, undefined);
        await engine.tick(); assert.ok(failures.includes('scan'));
        scanFails = false; await engine.tick();
        assert.equal((await demo.store.get('system', record._id)).state, 'ready');
        await demo.records.insertOne({ ...record, _id: record._id.slice(0, 8) + 'ffffffffffffffff', uid: 301 });
        // No event for this record: the durable scanner still discovers it.
        await engine.tick(); assert.equal(demo.reports.docs.size, 2);
        engine.stop(); assert.deepEqual(await engine.tick(), { stopped: true });
    } finally { engine.stop(); demo.engine.stop(); }
});

test('a judgment event arriving during an earlier record read remains queued', async () => {
    const demo = await createDemo({ seed: false }); let engine; let reads = 0;
    const record = await demo.submit({ status: 20 });
    const store = { ...demo.store, getRecord: async (domainId, rid) => {
        const snapshot = await demo.store.getRecord(domainId, rid);
        if (++reads === 1) {
            await demo.records.updateOne({ _id: record._id }, { $set: { status: 1 } });
            engine.enqueue({ ...record, status: 1 });
        }
        return snapshot;
    } };
    engine = createEngine({ store, config: demo.config });
    try {
        engine.enqueue(record); await engine.tick();
        assert.equal((await demo.store.get('system', record._id)).verdict, 20);
        await engine.tick();
        assert.equal(reads, 2);
        assert.equal((await demo.store.get('system', record._id)).verdict, 1);
    } finally { engine.stop(); demo.engine.stop(); }
});

// These fixtures exercise the real Mongo store and engine. The demo adapter
// clones reads (including findOne), so record updates cannot mutate snapshots.
const E2_NOW = Date.parse('2026-10-31T08:00:00Z');
const e2Id = (at, suffix) => Math.floor(at / 1000).toString(16).padStart(8, '0') + suffix.toString(16).padStart(16, '0');
async function e2Fixture(options = {}) {
    let clock = E2_NOW;
    const demo = await createDemo({ seed: false, now: () => clock }); demo.engine.stop();
    const config = { ...demo.config, batchSize: 2, ...options };
    const makeStore = () => otherStore({ ...demo, config }, () => clock);
    const store = makeStore();
    const engine = createEngine({ store, config, now: () => clock });
    async function insert(suffix, fields = {}) {
        const doc = { _id: e2Id(clock - 1000, suffix), domainId: 'system', uid: 1086, pid: 2104,
            lang: 'cpp', code: GENERATED_CODE, contest: CONTEST, status: 20, ...fields };
        await demo.records.insertOne(doc); return doc;
    }
    return { ...demo, config, store, engine, makeStore, insert, now: () => clock, advance: ms => { clock += ms; } };
}

test('E2 engine recovers a lower same-second late ObjectId without events exactly once', async () => {
    const f = await e2Fixture();
    try {
        const high = await f.insert(900); await f.engine.tick();
        const late = await f.insert(100);
        assert.equal(late._id.slice(0, 8), high._id.slice(0, 8)); assert.ok(late._id < high._id);
        for (let i = 0; i < 5; i++) await f.engine.tick();
        assert.ok(await f.store.get('system', late._id), 'late smaller ObjectId must be recovered');
        assert.equal(f.reports.docs.size, 2);
    } finally { f.engine.stop(); }
});

test('E2 overlap preserves fixed bounds and resumes beyond two pages after restart', async () => {
    const f = await e2Fixture();
    try {
        const records = []; for (let i = 1; i <= 7; i++) records.push(await f.insert(i));
        await f.store.repair('system');
        const before = [...f.state.docs.values()].find(s => s.kind === 'record-overlap');
        assert.ok(before && before.version === 1 && before.after === records[1]._id);
        f.advance(120000);
        const restarted = f.makeStore(); await restarted.repair('system');
        const middle = [...f.state.docs.values()].find(s => s.kind === 'record-overlap');
        assert.equal(middle.lower, before.lower); assert.equal(middle.upper, before.upper);
        assert.equal(middle.after, records[3]._id);
        await restarted.repair('system'); await restarted.repair('system');
        assert.equal(f.reports.docs.size, 7, 'bounded pages must progress past the first and second page');
        const finished = [...f.state.docs.values()].find(s => s.kind === 'record-overlap');
        assert.equal(finished.done, true);
    } finally { f.engine.stop(); }
});

test('E2 restart reconciles a lost final verdict while preserving analysis and human review', async () => {
    const f = await e2Fixture();
    try {
        const record = await f.insert(1); await f.engine.tick();
        await f.store.review('system', record._id, { status: 'cleared', note: '人工核实保留', revision: 0, reviewer: 2 });
        const before = await f.store.get('system', record._id);
        await f.records.updateOne({ _id: record._id }, { $set: { status: 1 } });
        f.advance(700000); f.engine.stop();
        const restarted = createEngine({ store: f.makeStore(), config: f.config, now: f.now });
        try { await restarted.tick(); } finally { restarted.stop(); }
        const after = await f.store.get('system', record._id);
        assert.equal(after.verdict, 1, 'durable waiting report must converge without an event after restart');
        for (const key of ['analysis', 'review', 'reviewHistory', 'state', 'attempts', 'analyzedAt', 'expireAt']) assert.deepEqual(after[key], before[key]);
    } finally { f.engine.stop(); }
});

test('E2 retained verdict reconciliation rotates all pages and recovers an old rejudge', async () => {
    const f = await e2Fixture();
    try {
        const records = [];
        for (let i = 1; i <= 7; i++) { const record = await f.insert(i, { _id: e2Id(E2_NOW - 86400000, i), status: 1 }); records.push(record); await f.store.ensureRecord(record); }
        await f.store.reconcile('system', 'retained');
        const changed = records[6]; await f.records.updateOne({ _id: changed._id }, { $set: { status: 2 } });
        const restarted = f.makeStore();
        for (let i = 0; i < 4; i++) await restarted.reconcile('system', 'retained');
        assert.equal((await restarted.get('system', changed._id)).verdict, 2);
        await f.records.updateOne({ _id: records[0]._id }, { $set: { status: 3 } });
        f.advance(60001); await restarted.reconcile('system', 'retained');
        assert.equal((await restarted.get('system', records[0]._id)).verdict, 3, 'completed retained round must wrap to old reports');
    } finally { f.engine.stop(); }
});

test('E2 failed overlap query does not advance and competing workers share a durable scanner lease', async () => {
    const f = await e2Fixture();
    try {
        for (let i = 1; i <= 5; i++) await f.insert(i);
        await f.store.repair('system');
        const snapshot = [...f.state.docs.values()].find(s => s.kind === 'record-overlap');
        const originalFind = f.records.find; f.records.find = () => { throw new Error('database unavailable'); };
        await assert.rejects(f.store.repair('system'), /database unavailable/);
        assert.equal([...f.state.docs.values()].find(s => s.kind === 'record-overlap').after, snapshot.after);
        let release; let entered; const blocked = new Promise(resolve => { release = resolve; }); const queried = new Promise(resolve => { entered = resolve; });
        f.records.find = (...args) => { const cursor = originalFind(...args); const toArray = cursor.toArray; cursor.toArray = async () => { entered(); await blocked; return toArray(); }; return cursor; };
        const first = f.store.repair('system'); await queried;
        const rival = await f.makeStore().repair('system');
        assert.equal(rival.scanned, 0, 'second owner must not read an already leased overlap page');
        release(); await first; f.records.find = originalFind;
        assert.equal(f.reports.docs.size, 4); await f.makeStore().repair('system'); assert.equal(f.reports.docs.size, 5);
    } finally { f.engine.stop(); }
});

test('E2 repair and reconciliation respect scope changes and report expiry', async () => {
    const f = await e2Fixture({ scope: 'contests', contests: [CONTEST] });
    try {
        const inside = await f.insert(1); const outside = await f.insert(2, { contest: null });
        const other = await f.insert(3, { domainId: 'other' });
        const stale = await f.insert(4, { _id: e2Id(E2_NOW - 700000, 4) });
        await f.store.repair('system'); assert.equal(f.reports.docs.size, 1);
        assert.ok(await f.store.get('system', inside._id)); assert.equal(await f.store.get('system', stale._id), null);
        const broad = otherStore({ ...f, config: { ...f.config, scope: 'all', contests: [] } }, f.now);
        await broad.repair('system'); assert.ok(await broad.get('system', outside._id));
        assert.equal(await broad.get('other', other._id), null);
        const before = await broad.get('system', inside._id);
        await f.reports.updateOne({ _id: before._id }, { $set: { expireAt: new Date(f.now() - 1) } });
        await f.records.updateOne({ _id: inside._id }, { $set: { status: 1 } });
        await broad.reconcile('system', 'waiting'); await broad.repair('system');
        assert.equal(f.reports.docs.get(before._id).verdict, 20); assert.equal(await broad.get('system', inside._id), null);
    } finally { f.engine.stop(); }
});

test('E2 per-tick time budget stops further database work and resumes fair task progress', async () => {
    const f = await e2Fixture();
    try {
        const record = await f.insert(1);
        const originalFind = f.jobs.find;
        f.jobs.find = (...args) => { const cursor = originalFind(...args); const toArray = cursor.toArray; cursor.toArray = async () => { const result = await toArray(); f.advance(2000); return result; }; return cursor; };
        await f.engine.tick();
        assert.equal(await f.store.get('system', record._id), null, 'exhausted source query must not start another work phase');
        f.jobs.find = originalFind;
        for (let i = 0; i < 3; i++) await f.engine.tick();
        assert.equal((await f.store.get('system', record._id)).state, 'ready', 'later work phases must not starve under a tick budget');
    } finally { f.engine.stop(); }
});

test('E2 waiting reconciliation advances beyond unresolved first pages and retries failed reads', async () => {
    const f = await e2Fixture();
    try {
        const records = [];
        for (let i = 1; i <= 6; i++) { const record = await f.insert(i); records.push(record); await f.store.ensureRecord(record); }
        await f.store.reconcile('system');
        const before = [...f.state.docs.values()].find(s => s.kind === 'verdict-waiting');
        const findOne = f.records.findOne; f.records.findOne = async () => { throw new Error('read failed'); };
        await assert.rejects(f.store.reconcile('system'), /read failed/);
        assert.equal([...f.state.docs.values()].find(s => s.kind === 'verdict-waiting').after, before.after);
        f.records.findOne = findOne;
        await f.records.updateOne({ _id: records[5]._id }, { $set: { status: 1 } });
        const restarted = f.makeStore(); await restarted.reconcile('system'); await restarted.reconcile('system');
        assert.equal((await restarted.get('system', records[5]._id)).verdict, 1, 'unresolved earlier reports must not starve later reports');
    } finally { f.engine.stop(); }
});

test('E2 stale reconciliation cannot overwrite a newer verdict event', async () => {
    const f = await e2Fixture();
    try {
        const record = await f.insert(1); await f.store.ensureRecord(record);
        const findOne = f.records.findOne;
        f.records.findOne = async (...args) => {
            const snapshot = await findOne(...args);
            await f.records.updateOne({ _id: record._id }, { $set: { status: 1 } });
            await f.store.updateVerdict({ ...record, status: 1 });
            return snapshot;
        };
        await f.store.reconcile('system');
        assert.equal((await f.store.get('system', record._id)).verdict, 1);
    } finally { f.engine.stop(); }
});

test('E2 a long overlap round retains coverage for inserts behind its cursor', async () => {
    const f = await e2Fixture();
    try {
        for (const suffix of [100, 200, 300, 400, 500]) await f.insert(suffix);
        await f.store.repair('system');
        const late = await f.insert(50); f.advance(660000);
        for (let i = 0; i < 5; i++) await f.makeStore().repair('system');
        assert.ok(await f.store.get('system', late._id), 'completing a slow cycle must not skip the overlap preceding its fixed upper bound');
        assert.equal(f.reports.docs.size, 6);
    } finally { f.engine.stop(); }
});

test('E2 overlap includes its lower boundary and never reads beyond its fixed upper bound', async () => {
    const f = await e2Fixture({ batchSize: 10 });
    try {
        const lower = await f.insert(0, { _id: e2Id(E2_NOW - 600000, 0) });
        const future = await f.insert(1, { _id: e2Id(E2_NOW + 1000, 1) });
        await f.store.repair('system');
        assert.ok(await f.store.get('system', lower._id)); assert.equal(await f.store.get('system', future._id), null);
        f.advance(2000); await f.store.repair('system'); assert.ok(await f.store.get('system', future._id));
    } finally { f.engine.stop(); }
});

// Opt-in real Mongo test. Every write targets a random isolated database and the
// URI is restricted to the local QA server; this never connects to production.
test('E2 native Mongo processes exclude competing scanners and recover a killed owner',
    { skip: !process.env.DFACM_AI_WATCH_TEST_MONGO, timeout: 30000 }, async () => {
        const uri = process.env.DFACM_AI_WATCH_TEST_MONGO;
        assert.match(uri, /^mongodb:\/\/127\.0\.0\.1:27713\/?$/);
        const path = require('node:path'); const { fork } = require('node:child_process');
        const { randomBytes } = require('node:crypto');
        const driverPath = path.resolve(__dirname, '../../qa/native-hydro/node_modules/mongodb');
        const { MongoClient, ObjectId } = require(driverPath);
        const client = new MongoClient(uri); await client.connect();
        const dbName = `dfacm_watch_e2_${randomBytes(10).toString('hex')}`; const db = client.db(dbName);
        const children = new Set();
        const worker = `
            const { MongoClient, ObjectId } = require(process.argv[1]);
            const { createMongoStore } = require(process.argv[2] + '/store.cjs');
            const { configFromEnv } = require(process.argv[2] + '/config.cjs');
            (async () => {
                const client = new MongoClient(process.argv[3]); await client.connect();
                const db = client.db(process.argv[4]);
                const collections = Object.fromEntries(['reports', 'sources', 'state', 'jobs', 'records'].map(name => [name, db.collection(name)]));
                if (process.argv[5] === 'hold') {
                    const find = collections.records.find.bind(collections.records);
                    collections.records.find = (...args) => {
                        const cursor = find(...args); const toArray = cursor.toArray.bind(cursor);
                        cursor.toArray = async () => { process.send({ leased: true }); await new Promise(() => {}); return toArray(); }; return cursor;
                    };
                }
                const store = createMongoStore({ ...collections, config: { ...configFromEnv({ DFACM_AI_WATCH_SCOPE: 'all' }), batchSize: 2 },
                    objectId: id => new ObjectId(id), problemModel: { get: async () => null } });
                try { process.send({ result: await store.repair('system') }); }
                finally { await client.close(); process.disconnect(); }
            })().catch(error => { process.send({ error: error.stack }); process.exit(1); });`;
        function launch(mode) {
            const child = fork('-e', [worker, driverPath, path.resolve(__dirname, '..'), uri, dbName, mode], { silent: true });
            children.add(child); let stderr = ''; child.stderr.on('data', chunk => { stderr += chunk; });
            const message = new Promise((resolve, reject) => {
                child.once('message', value => value.error ? reject(new Error(value.error)) : resolve(value));
                child.once('error', reject); child.once('exit', code => { if (code) reject(new Error(`Worker exited ${code}: ${stderr}`)); });
            });
            const exit = new Promise(resolve => child.once('exit', code => { children.delete(child); resolve(code); }));
            return { child, message, exit };
        }
        try {
            const at = Date.now();
            await db.collection('reports').createIndex({ domainId: 1, verdict: 1, rid: 1 }, { name: 'verdict_reconcile' });
            await db.collection('reports').createIndex({ domainId: 1, rid: -1 }, { name: 'domain_rid', unique: true });
            await db.collection('records').insertMany([1, 2, 3, 4, 5].map(i => ({ _id: new ObjectId(e2Id(at - 1000, i)),
                domainId: 'system', uid: 1086, pid: 2104, lang: 'cpp', code: GENERATED_CODE, status: 20 })));
            const holder = launch('hold'); assert.deepEqual(await holder.message, { leased: true });
            const rival = launch('scan'); assert.equal((await rival.message).result.scanned, 0); assert.equal(await rival.exit, 0);
            assert.equal(await db.collection('reports').countDocuments(), 0);
            holder.child.kill('SIGKILL'); await holder.exit;
            await db.collection('state').updateOne({ kind: 'record-overlap' }, { $set: { leaseUntil: new Date(0) } });
            for (let i = 0; i < 3; i++) { const resumed = launch('scan'); await resumed.message; assert.equal(await resumed.exit, 0); }
            assert.equal(await db.collection('reports').countDocuments(), 5);
            const state = await db.collection('state').findOne({ kind: 'record-overlap' });
            assert.equal(state.done, true); assert.equal(state.after, e2Id(at - 1000, 5));
            const collections = Object.fromEntries(['reports', 'sources', 'state', 'jobs', 'records'].map(name => [name, db.collection(name)]));
            const config = { ...require('../config.cjs').configFromEnv({ DFACM_AI_WATCH_SCOPE: 'all' }), batchSize: 2 };
            const store = createMongoStore({ ...collections, config, objectId: id => new ObjectId(id), problemModel: { get: async () => null } });
            await db.collection('records').updateOne({ _id: new ObjectId(e2Id(at - 1000, 5)) }, { $set: { status: 1 } });
            for (let i = 0; i < 3; i++) await store.reconcile('system');
            assert.equal((await store.get('system', e2Id(at - 1000, 5))).verdict, 1);
            const plan = await db.collection('reports').find({ domainId: 'system', verdict: { $in: [0, 20, 21, 22, null] },
                rid: { $gte: '000000000000000000000000', $lte: 'ffffffffffffffffffffffff' }, expireAt: { $gt: new Date() } })
                .sort({ rid: 1 }).limit(2).explain('executionStats');
            assert.match(JSON.stringify(plan.queryPlanner.winningPlan), /verdict_reconcile|domain_rid/);
            assert.equal(plan.executionStats.nReturned, 2);
        } finally {
            for (const child of children) child.kill('SIGKILL');
            assert.match(dbName, /^dfacm_watch_e2_[a-f0-9]{20}$/); await db.dropDatabase(); await client.close();
        }
    });

test('E2 retained round finishes while newer reports keep arriving', async () => {
    const f = await e2Fixture();
    try {
        const first = await f.insert(1, { status: 1 }); await f.store.ensureRecord(first);
        await f.store.reconcile('system', 'retained');
        f.advance(60001);
        for (let i = 2; i <= 5; i++) await f.store.ensureRecord(await f.insert(i, { status: 1 }));
        await f.store.reconcile('system', 'retained');
        await f.records.updateOne({ _id: first._id }, { $set: { status: 2 } });
        for (let round = 0; round < 7; round++) {
            for (let i = 0; i < 2; i++) await f.store.ensureRecord(await f.insert(100 + round * 2 + i, { status: 1 }));
            f.advance(60001); await f.store.reconcile('system', 'retained');
        }
        assert.equal((await f.store.get('system', first._id)).verdict, 2, 'fixed retained upper bound must permit wraparound despite arrivals');
    } finally { f.engine.stop(); }
});

test('E2 an expired scanner cannot rewind its successor checkpoint', async () => {
    const f = await e2Fixture();
    try {
        for (let i = 1; i <= 5; i++) await f.insert(i);
        let release; let entered;
        const blocked = new Promise(resolve => { release = resolve; }); const queried = new Promise(resolve => { entered = resolve; });
        const find = f.records.find;
        f.records.find = (...args) => { const cursor = find(...args); const toArray = cursor.toArray; cursor.toArray = async () => { entered(); await blocked; return toArray(); }; return cursor; };
        const stale = f.store.repair('system'); await queried;
        f.records.find = find; f.advance(61000);
        await f.makeStore().repair('system');
        const successor = [...f.state.docs.values()].find(s => s.kind === 'record-overlap');
        release(); await stale;
        assert.equal([...f.state.docs.values()].find(s => s.kind === 'record-overlap').after, successor.after);
        assert.equal(f.reports.docs.size, 2);
        await f.makeStore().repair('system'); assert.equal(f.reports.docs.size, 4);
    } finally { f.engine.stop(); }
});

test('E3 .100 source survives actual .900 submission with only ObjectId .000 known through store and evidence', async () => {
    const f = await e2Fixture({ batchSize: 10 });
    try {
        const at = E2_NOW - 1000;
        const same = await f.addJob(1086, at + 100); const later = await f.addJob(1086, at + 1000);
        const record = await f.submit({ time: at + 900 });
        await f.store.ensureRecord(record);
        const report = await f.store.get('system', record._id);
        const context = await f.store.context(report);
        assert.deepEqual(context.sources.map(s => s.jobId), [same._id]);
        assert.deepEqual(report.submissionTime, { precision: 'second', origin: 'objectId', lower: new Date(at), upper: new Date(at + 1000) });
        const claimed = await f.store.claim(report); await f.store.complete(claimed, require('../detector.cjs').analyze(context));
        const detail = await f.store.evidence('system', record._id);
        assert.equal(detail.evidence.assistant.jobId, same._id); assert.equal(detail.evidence.assistant.code, GENERATED_CODE);
        assert.equal(detail.evidence.assistant.timing, 'uncertain'); assert.equal(detail.report.analysis.conclusion, 'undetermined');
        assert.notEqual(detail.report.priority, 'high'); assert.equal((await f.records.findOne({ _id: record._id })).status, 1);
        // Legacy reports lacking the additive interval still expose the evidence.
        await f.reports.updateOne({ _id: report._id }, { $unset: { submissionTime: '' } });
        assert.equal((await f.store.evidence('system', record._id)).evidence.assistant.timing, 'uncertain');
        await f.sources.updateOne({ jobId: same._id }, { $set: { completedAt: later.completedAt } });
        assert.equal((await f.store.evidence('system', record._id)).evidence.assistant, null);
    } finally { f.engine.stop(); }
});

test('E3 retained rule migration is bounded, resumes after restart, preserves review and does not steal leases', async () => {
    const f = await e2Fixture();
    try {
        const original = [];
        for (let i = 1; i <= 7; i++) {
            const record = await f.insert(i, { _id: e2Id(E2_NOW - 40 * 86400000, i), status: 1 });
            await f.store.ensureRecord(record);
            await f.store.review('system', record._id, { status: 'cleared', note: '已核实', revision: 0, reviewer: 2 });
            await f.reports.updateOne({ rid: record._id }, { $set: { state: 'ready', analysis: { version: '0.1.0', conclusion: 'undetermined', signals: [] } } });
            original.push(await f.store.get('system', record._id));
        }
        await f.reports.updateOne({ _id: original[0]._id }, { $set: { state: 'analyzing', owner: 'other-worker', leaseUntil: new Date(f.now() + 60000) } });
        await f.reports.updateOne({ _id: original[1]._id }, { $set: { expireAt: new Date(f.now() - 1) } });
        const first = await f.store.reanalyze('system'); assert.ok(first.scanned <= 2);
        assert.equal((await f.store.get('system', original[0].rid)).owner, 'other-worker');
        const restarted = createEngine({ store: f.makeStore(), config: f.config, now: f.now });
        try { for (let i = 0; i < 8; i++) await restarted.tick(); } finally { restarted.stop(); }
        for (const before of original.slice(2)) {
            const after = await f.store.get('system', before.rid);
            assert.equal(after.analysis.version, require('../detector.cjs').VERSION);
            for (const key of ['review', 'reviewHistory', 'expireAt', 'verdict']) assert.deepEqual(after[key], before[key]);
        }
        assert.equal(f.reports.docs.get(original[1]._id).analysis.version, '0.1.0');
        f.advance(61000);
        for (let i = 0; i < 8; i++) await f.engine.tick();
        assert.equal((await f.store.get('system', original[0].rid)).analysis.version, require('../detector.cjs').VERSION);
    } finally { f.engine.stop(); }
});

test('E3 migration cannot reset the exhausted retry budget of a report attempted under current rules', async () => {
    const f = await e2Fixture();
    try {
        const record = await f.insert(1); await f.store.ensureRecord(record);
        for (let attempt = 0; attempt < 3; attempt++) {
            const claimed = await f.store.claim(await f.store.get('system', record._id));
            assert.ok(claimed); await f.store.fail(claimed); f.advance(10000);
        }
        assert.equal((await f.store.get('system', record._id)).state, 'failed');
        await f.store.reanalyze('system');
        const after = await f.store.get('system', record._id);
        assert.equal(after.state, 'failed', 'version migration must not grant another retry budget to current-rules failures');
        assert.equal(after.attempts, 3);
    } finally { f.engine.stop(); }
});

test('E3 native Mongo uses half-open source bounds and reanalyzes retained reports without changing manual review',
    { skip: !process.env.DFACM_AI_WATCH_TEST_MONGO, timeout: 30000 }, async () => {
        const uri = process.env.DFACM_AI_WATCH_TEST_MONGO;
        assert.match(uri, /^mongodb:\/\/127\.0\.0\.1:27713\/?$/);
        const { MongoClient, ObjectId } = require(require('node:path').resolve(__dirname, '../../qa/native-hydro/node_modules/mongodb'));
        const client = new MongoClient(uri); await client.connect();
        const dbName = `dfacm_watch_e3_${require('node:crypto').randomBytes(10).toString('hex')}`; const db = client.db(dbName);
        const collections = Object.fromEntries(['reports', 'sources', 'state', 'jobs', 'records'].map(name => [name, db.collection(name)]));
        const at = Date.parse('2026-10-31T08:00:00Z');
        const config = { ...require('../config.cjs').configFromEnv({ DFACM_AI_WATCH_SCOPE: 'all' }), batchSize: 2 };
        const makeStore = () => createMongoStore({ ...collections, config, now: () => at + 2000,
            objectId: id => new ObjectId(id), problemModel: { get: async () => ({ docId: 2104, pid: 'P2104' }) } });
        const store = makeStore();
        try {
            const record = { _id: new ObjectId(e2Id(at + 900, 1)), domainId: 'system', uid: 1086, pid: 2104,
                code: GENERATED_CODE, lang: 'cpp', status: 1 };
            await collections.records.insertOne(record); await store.ensureRecord(record);
            for (const offset of [100, 1000]) await collections.jobs.insertOne({ _id: `native-${offset}`, type: 'job', status: 'ready',
                scope: 'system:1086', target: 'p:2104', answer: { status: 'ok', mode: 'solve', level: 'solution', code: GENERATED_CODE },
                completedAt: new Date(at + offset), expireAt: new Date(at + 60000) });
            const rid = String(record._id); const before = await store.get('system', rid);
            const context = await store.context(before);
            assert.deepEqual(context.sources.map(s => s.jobId), ['native-100']);
            const claimed = await store.claim(before); await store.complete(claimed, require('../detector.cjs').analyze(context));
            const detail = await store.evidence('system', rid);
            assert.equal(detail.report.score, 0); assert.equal(detail.evidence.assistant.timing, 'uncertain');
            assert.equal(detail.evidence.assistant.code, GENERATED_CODE);
            await store.review('system', rid, { status: 'cleared', note: '本地原生测试人工记录', revision: 0, reviewer: 2 });
            const reviewed = await store.get('system', rid);
            await collections.reports.updateOne({ rid }, { $set: { 'analysis.version': '0.1.0', analysisTargetVersion: '0.1.0' }, $unset: { submissionTime: '' } });
            const resumedStore = makeStore(); await resumedStore.reanalyze('system');
            const queued = await store.get('system', rid); assert.equal(queued.state, 'pending');
            const resumed = await resumedStore.claim(queued); const analysis = require('../detector.cjs').analyze(await resumedStore.context(resumed));
            assert.equal((await store.complete(resumed, analysis)).matchedCount, 0, 'another owner cannot complete migrated analysis');
            assert.equal((await resumedStore.complete(resumed, analysis)).matchedCount, 1);
            const after = await store.get('system', rid); assert.equal(after.analysis.version, require('../detector.cjs').VERSION);
            for (const key of ['review', 'reviewHistory', 'expireAt', 'verdict']) assert.deepEqual(after[key], reviewed[key]);
            assert.equal((await collections.records.findOne({ _id: record._id })).status, 1);
        } finally {
            assert.match(dbName, /^dfacm_watch_e3_[a-f0-9]{20}$/); await db.dropDatabase(); await client.close();
        }
    });
