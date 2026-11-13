'use strict';
const assert = require('node:assert/strict');
const { test } = require('node:test');
const path = require('node:path');
const Module = require('node:module');
const esbuild = require('esbuild');
// Real production registration, scanner and award logic; only Hydro's external
// model/database boundary is replaced. This suite does not depend on qa source.
const pluginPath = path.resolve(__dirname, '../index.ts');
const compiled = esbuild.buildSync({ entryPoints: [pluginPath], bundle: true, platform: 'node', format: 'cjs', write: false,
    external: ['hydrooj'], tsconfigRaw: { compilerOptions: { experimentalDecorators: true } } }).outputFiles[0].text;
function matches(doc, filter) {
    return Object.entries(filter).every(([key, value]) => {
        if (value && typeof value === 'object') return Object.entries(value).every(([op, operand]) => {
            if (op === '$gt') return doc[key] > operand;
            if (op === '$lte') return doc[key] <= operand;
            throw new Error(`unsupported operator ${op}`);
        });
        return doc[key] === value;
    });
}
class Collection {
    constructor(docs = []) { this.docs = structuredClone(docs); this.queries = []; }
    async findOne(filter) { return structuredClone(this.docs.find((doc) => matches(doc, filter)) || null); }
    async insertOne(doc) {
        if (this.docs.some((row) => doc.ref ? row.uid === doc.uid && row.ref === doc.ref : row._id === doc._id)) {
            const error = new Error('duplicate'); error.code = 11000; throw error;
        }
        this.docs.push(structuredClone(doc));
    }
    async updateOne(filter, update, options = {}) {
        let doc = this.docs.find((row) => matches(row, filter));
        if (!doc && options.upsert) { doc = { ...filter }; this.docs.push(doc); }
        if (doc) Object.assign(doc, structuredClone(update.$set || {}));
        return { matchedCount: doc ? 1 : 0 };
    }
    async countDocuments(filter) { return this.docs.filter((doc) => matches(doc, filter)).length; }
    find(filter) {
        const query = { filter: structuredClone(filter), limit: undefined, time: undefined }; this.queries.push(query);
        let rows = this.docs.filter((doc) => matches(doc, filter));
        return {
            sort(spec) { const [key, direction] = Object.entries(spec)[0]; rows.sort((a, b) => (a[key] > b[key] ? 1 : a[key] < b[key] ? -1 : 0) * direction); return this; },
            project() { return this; }, limit(size) { query.limit = size; rows = rows.slice(0, size); return this; },
            maxTimeMS(time) { query.time = time; return this; }, async toArray() { return structuredClone(rows); }, async close() {},
            async *[Symbol.asyncIterator]() { for (const doc of rows) yield structuredClone(doc); },
        };
    }
}
async function fixture(records) {
    const state = new Collection(), ledger = new Collection(), record = new Collection(records);
    const collections = { swpuPointsLedger: ledger, swpuShopBackfillState: state }, scripts = new Map(), indexes = [];
    const problem = { failPid: null, async get(_domain, pid) { if (this.failPid === pid) throw new Error('problem read interrupted'); return { owner: 9, hidden: false, difficulty: 6, title: `P${pid}` }; } };
    const hydro = {
        db: { collection: (name) => collections[name] || new Collection(), ensureIndexes: async (coll, ...specs) => indexes.push({ coll, specs }) },
        Handler: class {}, Logger: class { info() {} error() {} }, param: () => () => {}, post: () => () => {}, PRIV: {}, Types: {},
        Schema: { object: (shape) => shape, string: () => ({ default: (v) => v }) },
        RecordModel: { coll: record, RECORD_PRETEST: '000000000000000000000000', RECORD_GENERATE: '000000000000000000000001' }, ProblemModel: problem,
    };
    const loaded = new Module(pluginPath, module); loaded.filename = pluginPath; loaded.paths = module.paths;
    loaded.require = (id) => id === 'hydrooj' ? hydro : require(id); loaded._compile(compiled, pluginPath);
    await loaded.exports.apply({ Route() {}, injectUI() {}, i18n: { load() {} }, on() {}, addScript(name, _description, _schema, run) { scripts.set(name, run); } });
    return { state, ledger, record, problem, indexes, run: scripts.get('swpuShopBackfill') };
}
const rec = (id, domainId = 'system', extra = {}) => ({ _id: id, domainId, uid: 42, pid: id, status: 1, ...extra });
// Catches restarting at zero forever after the original cap; expected awards
// are hand-counted from the fixtures, independent of production constants.
test('production backfill resumes beyond 20000 with a fixed round upper bound', async () => {
    const f = await fixture(Array.from({ length: 20001 }, (_, i) => rec(i + 1))), reports = [];
    await f.run({ domainId: 'system' }, (row) => reports.push(row));
    assert.equal(f.ledger.docs.length, 20000);
    assert.ok(!f.ledger.docs.some((row) => row.ref === 'solve:system:20001'));
    f.record.docs.push(rec(20002)); const resumed = []; await f.run({ domainId: 'system' }, (row) => resumed.push(row));
    assert.ok(f.ledger.docs.some((row) => row.ref === 'solve:system:20001'), 'continuation must reach the old truncated tail');
    assert.ok(!f.ledger.docs.some((row) => row.ref === 'solve:system:20002'), 'records above the fixed round upper wait for a fresh round');
    const state = await f.state.findOne({ _id: 'system' });
    assert.equal(state.scanned, 20001); assert.equal(state.awarded, 20001); assert.equal(state.completed, true);
    assert.ok(resumed.some((row) => row.domainId === 'system' && row.scannedThisRun === 1 && row.awardedThisRun === 1));
    assert.ok(f.record.queries.every((q) => q.limit > 0 && q.limit <= 500 && q.time > 0));
    assert.ok(reports.some((row) => row.domainId === 'system' && row.completed === false));
});
test('production backfill domain counters and continuation are independent', async () => {
    const f = await fixture([...Array.from({ length: 20001 }, (_, i) => rec(i + 1)), rec(30000, 'poj'), rec(30001, 'poj')]), reports = [];
    await f.run({}, (row) => reports.push(row));
    const system = await f.state.findOne({ _id: 'system' }), poj = await f.state.findOne({ _id: 'poj' });
    assert.ok(system && poj, 'both domains must persist independent scan state');
    assert.equal(system.scanned, 20000); assert.equal(system.completed, false);
    assert.equal(poj.scanned, 2); assert.equal(poj.awarded, 2); assert.equal(poj.completed, true);
    assert.ok(reports.some((row) => row.domainId === 'poj' && row.scanned === 2 && row.completed === true));
});
test('production backfill failed page keeps its checkpoint and rerun accounts for unique partial awards', async () => {
    const f = await fixture(Array.from({ length: 502 }, (_, i) => rec(i + 1))); f.problem.failPid = 502;
    await assert.rejects(f.run({ domainId: 'system' }, () => {}), /problem read interrupted/);
    const failed = await f.state.findOne({ _id: 'system' });
    assert.equal(failed.after, 500); assert.equal(failed.scanned, 500); assert.equal(failed.completed, false); assert.equal(f.ledger.docs.length, 501);
    f.problem.failPid = null; const resumed = []; await f.run({ domainId: 'system' }, (row) => resumed.push(row));
    const finished = await f.state.findOne({ _id: 'system' });
    assert.equal(finished.round, failed.round); assert.equal(finished.scanned, 502); assert.equal(finished.awarded, 502);
    assert.equal(finished.completed, true); assert.equal(f.ledger.docs.length, 502);
    assert.ok(resumed.some((row) => row.domainId === 'system' && row.scannedThisRun === 2 && row.awardedThisRun === 1));
});
test('production backfill fresh round covers old rejudged records and excludes current non formal AC', async () => {
    const f = await fixture([rec(1, 'system', { status: 2 }), rec(2), rec(3, 'system', { contest: '000000000000000000000000' }),
        rec(4, 'system', { contest: '000000000000000000000001' }), rec(5, 'system', { contest: '000000000000000000000002' }), rec(6, 'system', { status: 2 })]);
    await f.run({ domainId: 'system' }, () => {});
    assert.deepEqual(f.ledger.docs.map((row) => row.ref), ['solve:system:2', 'solve:system:5']);
    const before = await f.state.findOne({ _id: 'system' }); assert.ok(before, 'all-record scan must persist a completed round'); assert.equal(before.scanned, 6, 'cursor covers all records including non AC');
    f.record.docs[0].status = 1; f.record.docs[1].status = 2; await f.run({ domainId: 'system' }, () => {});
    const after = await f.state.findOne({ _id: 'system' });
    assert.notEqual(after.round, before.round); assert.equal(after.scanned, 6); assert.equal(after.awarded, 1);
    assert.equal(f.ledger.docs.length, 3); assert.ok(f.ledger.docs.some((row) => row.ref === 'solve:system:1'));
    assert.ok(!f.ledger.docs.some((row) => row.ref === 'solve:system:6'));
});

test('production backfill page query failure leaves the preceding whole-page checkpoint', async () => {
    const f = await fixture(Array.from({ length: 501 }, (_, i) => rec(i + 1)));
    const find = f.record.find.bind(f.record);
    f.record.find = (filter) => {
        const cursor = find(filter);
        if (filter._id?.$gt === 500) cursor.toArray = async () => { throw new Error('record page timed out'); };
        return cursor;
    };
    await assert.rejects(f.run({ domainId: 'system' }, () => {}), /record page timed out/);
    const state = await f.state.findOne({ _id: 'system' });
    assert.equal(state.after, 500); assert.equal(state.scanned, 500); assert.equal(state.completed, false);
    assert.equal(f.ledger.docs.length, 500);
    f.record.find = find; await f.run({ domainId: 'system' }, () => {});
    assert.equal(f.ledger.docs.length, 501);
    assert.equal((await f.state.findOne({ _id: 'system' })).completed, true);
});

test('production backfill stale executor cannot overwrite a concurrently changed round', async () => {
    const f = await fixture([rec(1)]);
    const get = f.problem.get.bind(f.problem);
    f.problem.get = async (...args) => {
        const row = await f.state.findOne({ _id: 'system' });
        await f.state.updateOne({ _id: 'system', round: row.round }, { $set: { round: 'replacement-round', after: null, scanned: 0, awarded: 0, completed: false } });
        return get(...args);
    };
    await assert.rejects(f.run({ domainId: 'system' }, () => {}), /checkpoint changed concurrently/);
    const state = await f.state.findOne({ _id: 'system' });
    assert.equal(state.round, 'replacement-round'); assert.equal(state.after, null); assert.equal(state.scanned, 0); assert.equal(state.completed, false);
    assert.equal(f.ledger.docs.length, 1);
    f.problem.get = get; await f.run({ domainId: 'system' }, () => {});
    assert.equal(f.ledger.docs.length, 1); assert.equal((await f.state.findOne({ _id: 'system' })).completed, true);
});
