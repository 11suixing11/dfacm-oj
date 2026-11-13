'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const { test } = require('node:test');
const { transformSync } = require('esbuild');

const flush = async () => { for (let i = 0; i < 60; i++) await Promise.resolve(); };

// Compile the real addon entry; only Hydro's external database/framework boundary
// is replaced. The CJS scheduling modules load from their production paths.
async function entryFixture(t, { automatic = true, rpRun, controlled = false } = {}) {
    const envKeys = ['SWPU_SERVICE_UIDS', 'SWPU_SERVICE_UIDS_DRYRUN', 'SWPU_AUTO_JOIN', 'SWPU_RP_SWEEP', 'SWPU_LIVE_RP', 'NODE_APP_INSTANCE', 'DFACM_CONTROLLED_HISTORY'];
    const env = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
    Object.assign(process.env, { SWPU_SERVICE_UIDS: '3', SWPU_SERVICE_UIDS_DRYRUN: '0', SWPU_AUTO_JOIN: '0',
        SWPU_RP_SWEEP: automatic ? '1' : '0', SWPU_LIVE_RP: automatic ? '1' : '0', NODE_APP_INSTANCE: '0', DFACM_CONTROLLED_HISTORY: controlled ? '1' : '0' });
    const previousHydro = global.Hydro;
    global.Hydro = { script: { rp: { run: rpRun || (async () => {}) } } };
    const scripts = {}, events = {}, stages = [];
    const users = [{ _id: 3, uname: 'hydsvc-0074' }, { _id: 42, uname: 'member' }];
    const members = [{ domainId: 'system', uid: 42, role: 'default', join: true },
        { domainId: 'poj', uid: 42, role: 'default', join: true }];
    const statusColl = { deleteMany: async (filter) => {
        assert.deepEqual(filter, { uid: { $in: [3] }, docType: 10 });
        stages.push('purge'); return { deletedCount: 0 };
    } };
    const userColl = { find: (filter) => ({ toArray: async () => {
        if (filter._id.$in) return structuredClone(users.filter((doc) => filter._id.$in.includes(doc._id)));
        assert.deepEqual(filter, { _id: { $gt: 1 } });
        stages.push('reconcile'); return structuredClone(users);
    } }) };
    const domainUserColl = {
        find: (filter) => ({ toArray: async () => structuredClone(members.filter((doc) => doc.domainId === filter.domainId)) }),
        findOne: async (filter) => structuredClone(members.find((doc) => doc.domainId === filter.domainId && doc.uid === filter.uid) || null),
        updateMany: async () => ({ modifiedCount: 0 }),
        updateOne: async () => { throw new Error('joined member must not be recreated'); },
    };
    const collections = { 'document.status': statusColl, 'domain.user': domainUserColl, user: userColl };
    const schema = { default() { return this; } };
    const hydro = { db: { collection(name) { assert.ok(collections[name], `unexpected collection ${name}`); return collections[name]; } },
        Schema: { string: () => schema, number: () => schema, union: () => schema, object: () => schema },
        DomainModel: {}, ObjectId: class {}, RecordModel: {}, TaskModel: {}, UserModel: {} };
    if (controlled) Object.assign(hydro, require('./native-callback-fixture.cjs').nativeFixture().api);
    t.after(() => {
        for (const stop of events.dispose || []) stop();
        global.Hydro = previousHydro;
        for (const [key, value] of Object.entries(env)) {
            if (value === undefined) delete process.env[key]; else process.env[key] = value;
        }
    });
    const filename = path.resolve(__dirname, '../index.ts');
    const output = transformSync(fs.readFileSync(filename, 'utf8'), { loader: 'ts', format: 'cjs', target: 'node22', sourcefile: filename }).code;
    const entry = new Module(filename, module);
    entry.filename = filename; entry.paths = Module._nodeModulePaths(path.dirname(filename));
    entry.require = (id) => id === 'hydrooj' ? hydro : id === 'hydrooj/package.json' ? { version: '5.0.7' } : Module.prototype.require.call(entry, id);
    entry._compile(output, filename);
    await entry.exports.apply({
        addScript(name, _title, _schema, run) { scripts[name] = run; },
        on(name, handler) { (events[name] ||= []).push(handler); },
        effect(factory) { (events.dispose ||= []).push(factory()); },
    });
    return { scripts, events, stages, hydro, dispose() { for (const stop of events.dispose || []) stop(); } };
}

for (const order of [
    ['manual', 'live'], ['live', 'manual'], ['manual', 'scheduled'], ['scheduled', 'manual'],
    ['live', 'scheduled'], ['scheduled', 'live'], ['manual', 'live', 'scheduled'],
]) {
    test(`real apply serializes ${order.join(' then ')} within one worker`, async (t) => {
        t.mock.timers.enable({ apis: ['setTimeout'] });
        let release;
        const gate = new Promise((resolve) => { release = resolve; });
        const starts = [];
        let active = 0, maxActive = 0;
        const fixture = await entryFixture(t, { rpRun: async (args) => {
            starts.push(args); maxActive = Math.max(maxActive, ++active);
            try { await gate; } finally { active--; }
        } });
        t.after(() => { fixture.dispose(); release(); });
        const manual = [];
        for (const trigger of order) {
            if (trigger === 'manual') manual.push(fixture.scripts.swpuRpSweep({}));
            else if (trigger === 'live') {
                fixture.events['record/change'][0]({ domainId: 'system', uid: 42, pid: 1, status: 1 }, {}, {}, { key: 'end' });
                t.mock.timers.tick(30000);
            } else t.mock.timers.tick(180000);
            await flush();
        }
        const blockedMaximum = maxActive;
        release(); await Promise.all(manual); await flush();
        assert.equal(blockedMaximum, 1, 'manual web script and automatic RP must share the same queue');
        assert.equal(maxActive, 1);
        assert.equal(starts.length, order.length, 'each queued source must eventually run');
        assert.equal(starts.filter((args) => args.domainId === 'system').length, order.includes('live') ? 1 : 0);
    });
}

for (const automatic of [true, false]) {
    test(`real apply disposal stops the manual script with automatic scheduling ${automatic ? 'enabled' : 'disabled'}`, async (t) => {
        t.mock.timers.enable({ apis: ['setTimeout'] });
        let rpCalls = 0;
        const fixture = await entryFixture(t, { automatic, rpRun: async () => { rpCalls++; } });
        fixture.dispose(); fixture.dispose();
        const result = await fixture.scripts.swpuRpSweep({});
        t.mock.timers.tick(3600000); await flush();
        assert.equal(result.recalculated, false);
        assert.deepEqual(result.failures, []);
        assert.deepEqual(fixture.stages, []);
        assert.equal(rpCalls, 0);
    });
}

test('real apply disposal cancels manual work queued behind an active live run', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    let release, rpCalls = 0;
    const gate = new Promise((resolve) => { release = resolve; });
    const fixture = await entryFixture(t, { rpRun: async () => {
        rpCalls++;
        await gate;
    } });
    t.after(() => { fixture.dispose(); if (release) release(); });
    fixture.events['record/change'][0]({ domainId: 'system', uid: 42, pid: 1, status: 1 }, {}, {}, { key: 'end' });
    t.mock.timers.tick(30000); await flush();
    assert.equal(rpCalls, 1);
    const manual = fixture.scripts.swpuRpSweep({});
    await flush();
    fixture.dispose(); fixture.stages.length = 0;
    release(); await flush();
    const result = await manual;
    assert.equal(result.recalculated, false);
    assert.deepEqual(fixture.stages, []);
    assert.equal(rpCalls, 1);
});

test('real apply lets live work queued after a failed manual RP run complete', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    const starts = [];
    const fixture = await entryFixture(t, { rpRun: async (args) => {
        starts.push(args);
        if (starts.length === 1) { await gate; throw new Error('manual RP failed'); }
    } });
    t.after(() => { fixture.dispose(); release(); });
    const manual = fixture.scripts.swpuRpSweep({});
    await flush();
    fixture.events['record/change'][0]({ domainId: 'system', uid: 42, pid: 1, status: 1 }, {}, {}, { key: 'end' });
    t.mock.timers.tick(30000); await flush();
    assert.deepEqual(starts, [{}]);
    release();
    const result = await manual; await flush();
    assert.equal(result.recalculated, false);
    assert.match(result.failures[0].message, /manual RP failed/);
    assert.deepEqual(starts, [{}, { domainId: 'system' }]);
});

test('real ops apply advertises native capability only while opted-in lifecycle wrapper is installed', async t => {
    const { getCapability } = require('../controlled-history.cjs');
    const f = await entryFixture(t, { automatic: false, controlled: true });
    assert.ok(getCapability(f.hydro)); f.dispose(); assert.equal(getCapability(f.hydro), null);
});
