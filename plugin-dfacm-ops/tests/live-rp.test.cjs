const assert = require('node:assert/strict');
const { test } = require('node:test');
const { createLiveRp } = require('../live-rp.cjs');
const { createRpLock } = require('../rp-sweep.cjs');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const script = { run: async ({ domainId }) => ({ domainId }) };

test('judged records trigger one debounced rp run per domain', async () => {
    const live = createLiveRp({ debounceMs: 10, script });
    live.hook({ domainId: 'system', status: 1 });
    live.hook({ domainId: 'system', status: 2 });
    live.hook({ domainId: 'system', status: 1 });
    live.hook({ domainId: 'poj', status: 1 });
    assert.equal(live.runs.length, 0);
    await sleep(40);
    assert.deepEqual(live.runs.map((r) => r.domainId).sort(), ['poj', 'system']);
    live.stop();
});

test('non-judged progress events never schedule a run', async () => {
    const live = createLiveRp({ debounceMs: 10, script });
    live.hook({ domainId: 'system', status: 0 });
    for (const status of [20, 21, 22, -1, 99, '1']) live.hook({ domainId: 'system', status });
    live.hook({ domainId: 'system', status: 1 }, {}, {}, { key: 'next' });
    live.hook({ domainId: 'system', status: 1, contest: '000000000000000000000000' });
    live.hook({ domainId: 'system', status: 1, contest: { toString: () => '000000000000000000000001' } });
    live.hook({ domainId: 'system', status: 1, uid: -1, pid: 0 });
    live.hook({ domainId: 'system' });
    live.hook(null);
    await sleep(40);
    assert.equal(live.runs.length, 0);
    live.stop();
});

test('a judged record right after a run re-arms the debounce', async () => {
    const live = createLiveRp({ debounceMs: 10, script });
    live.hook({ domainId: 'system', status: 1 });
    await sleep(40);
    live.hook({ domainId: 'system', status: 1 });
    await sleep(40);
    assert.equal(live.runs.length, 2);
    live.stop();
});

test('script failures are contained and do not throw', async () => {
    const failing = { run: async () => { throw new Error('boom'); } };
    const live = createLiveRp({ debounceMs: 10, script: failing });
    live.hook({ domainId: 'system', status: 1 });
    await sleep(40);
    assert.equal(live.failures.length, 1);
    assert.equal(live.failures[0].domainId, 'system');
    live.stop();
});

test('missing script registry is a no-op', async () => {
    const live = createLiveRp({ debounceMs: 10, script: null });
    delete global.Hydro;
    live.hook({ domainId: 'system', status: 1 });
    await sleep(40);
    assert.equal(live.runs.length, 0);
    live.stop();
});

test('non-zero pm2 instances stay idle', async () => {
    const live = createLiveRp({ debounceMs: 10, script, instance: '1' });
    live.hook({ domainId: 'system', status: 1 });
    await sleep(40);
    assert.equal(live.runs.length, 0);
    live.stop();
});

test('slow RP runs never overlap and coalesce changes into one follow-up per domain', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const started = [], releases = [];
    let active = 0, maximum = 0;
    const live = createLiveRp({ debounceMs: 30, instance: '0', script: { run: async ({ domainId }) => {
        started.push(domainId);
        maximum = Math.max(maximum, ++active);
        await new Promise((resolve) => releases.push(resolve));
        active--;
    } } });
    t.after(live.stop);
    const flush = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };
    live.hook({ domainId: 'system', status: 1 });
    t.mock.timers.tick(30);
    for (let i = 0; i < 10; i++) live.hook({ domainId: 'system', status: 1 });
    live.hook({ domainId: 'other', status: 2 });
    t.mock.timers.tick(300);
    assert.deepEqual(started, ['system']);
    releases.shift()(); await flush();
    t.mock.timers.tick(30);
    assert.deepEqual(started, ['system', 'system']);
    releases.shift()(); await flush();
    assert.deepEqual(started, ['system', 'system', 'other']);
    releases.shift()(); await flush();
    t.mock.timers.tick(300);
    assert.equal(started.length, 3);
    assert.equal(maximum, 1);
});

test('dispose cancels queued work and ignores future events, including during a run', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    let release, count = 0;
    const live = createLiveRp({ debounceMs: 10, script: { run: async () => {
        count++;
        await new Promise((resolve) => { release = resolve; });
    } } });
    live.hook({ domainId: 'system', status: 1 });
    t.mock.timers.tick(10);
    live.hook({ domainId: 'other', status: 1 });
    live.stop();
    release();
    for (let i = 0; i < 10; i++) await Promise.resolve();
    live.hook({ domainId: 'system', status: 1 });
    t.mock.timers.tick(100);
    assert.equal(count, 1);
    const queued = createLiveRp({ debounceMs: 10, script: { run: async () => { count++; } } });
    queued.hook({ domainId: 'system', status: 1 });
    queued.stop();
    t.mock.timers.tick(100);
    assert.equal(count, 1);
});

test('a service-account record purges its status row on sight and still schedules a run', async () => {
    const purged = [];
    const live = createLiveRp({
        debounceMs: 10, script,
        serviceUids: [3],
        purgeDoc: async (domainId, uid, pid) => { purged.push([domainId, uid, pid]); return { deletedCount: 1 }; },
    });
    live.hook({ domainId: 'system', status: 1, uid: 3, pid: 4326 });
    assert.deepEqual(purged, [['system', 3, 4326]]);
    await sleep(40);
    assert.deepEqual(live.runs.map((r) => r.domainId), ['system']);
    live.stop();
});

test('non-service records never trigger a purge', async () => {
    const purged = [];
    const live = createLiveRp({
        debounceMs: 10, script, serviceUids: [3],
        purgeDoc: async (...args) => { purged.push(args); },
    });
    live.hook({ domainId: 'system', status: 1, uid: 2, pid: 4326 });
    assert.deepEqual(purged, []);
    await sleep(40);
    live.stop();
});

test('an immediate purge failure never blocks the recalculation path', async () => {
    const live = createLiveRp({
        debounceMs: 10, script, serviceUids: [3],
        purgeDoc: async () => { throw new Error('boom'); },
    });
    live.hook({ domainId: 'system', status: 1, uid: 3, pid: 1 });
    await sleep(40);
    assert.equal(live.runs.length, 1);
    live.stop();
});

test('every run purges service-account rows before recomputing', async () => {
    const order = [];
    const live = createLiveRp({
        debounceMs: 10,
        script: { run: async ({ domainId }) => { order.push('rp:' + domainId); } },
        sanitize: async () => { order.push('purge'); return { deletedCount: 2 }; },
    });
    live.hook({ domainId: 'system', status: 1 });
    live.hook({ domainId: 'poj', status: 1 });
    await sleep(40);
    assert.deepEqual(order, ['purge', 'rp:system', 'rp:poj']);
    live.stop();
});

test('a failed pre-run sanitize aborts the run and requeues the domains', async () => {
    const ran = [];
    let healthy = false;
    const live = createLiveRp({
        debounceMs: 10,
        script: { run: async () => { ran.push(1); } },
        sanitize: async () => {
            if (!healthy) throw new Error('db down');
            return { deletedCount: 0 };
        },
    });
    live.hook({ domainId: 'system', status: 1 });
    await sleep(40);
    assert.deepEqual(ran, [], 'must not compute on a possibly dirty source');
    assert.ok(live.failures.some((f) => /db down/.test(f.message || '')));
    healthy = true;
    await sleep(60);
    assert.deepEqual(ran, [1], 'the requeued domains retry after the purge recovers');
    live.stop();
});

test('the shared lock keeps live runs out of a concurrent RP computation', async () => {
    const lock = createRpLock();
    let release;
    const blocker = lock(async () => { await new Promise((r) => { release = r; }); });
    const live = createLiveRp({ debounceMs: 10, script, lock });
    live.hook({ domainId: 'system', status: 1 });
    await sleep(40);
    assert.equal(live.runs.length, 0, 'queued behind the external RP work');
    release();
    await blocker;
    await sleep(30);
    assert.equal(live.runs.length, 1);
    live.stop();
});
