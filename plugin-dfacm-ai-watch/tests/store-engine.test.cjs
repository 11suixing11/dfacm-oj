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
