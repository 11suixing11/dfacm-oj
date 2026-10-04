const assert = require('node:assert/strict');
const { test } = require('node:test');
const {
    createPurgeDoc, createRpLock, createRpSweep, createSanitize,
    serviceUidsFromEnv, SWEEP_INTERVAL_MS, SWEEP_STARTUP_DELAY_MS,
} = require('../rp-sweep.cjs');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const script = { run: async () => true };

test('sweep defaults cover the judge account once per hour after boot', () => {
    assert.equal(SWEEP_INTERVAL_MS, 60 * 60 * 1000);
    assert.equal(SWEEP_STARTUP_DELAY_MS, 3 * 60 * 1000);
    assert.deepEqual(serviceUidsFromEnv({}), [3]);
});

test('SWPU_SERVICE_UIDS parses, dedupes and can disable the purge', () => {
    assert.deepEqual(serviceUidsFromEnv({ SWPU_SERVICE_UIDS: '' }), []);
    assert.deepEqual(serviceUidsFromEnv({ SWPU_SERVICE_UIDS: ' 7,3, 3,0,-2,x ' }), [3, 7]);
});

test('sanitize deletes service-account status rows across all domains', async () => {
    const deleted = [];
    const coll = { deleteMany: async (filter) => { deleted.push(filter); return { deletedCount: 2 }; } };
    const result = await createSanitize(coll, [3, 7])();
    assert.equal(result.deletedCount, 2);
    assert.deepEqual(deleted, [{ uid: { $in: [3, 7] } }]);
});

test('sanitize with an empty list is a disabled no-op', async () => {
    const coll = { deleteMany: async () => { throw new Error('must not be called'); } };
    const result = await createSanitize(coll, [])();
    assert.equal(result.deletedCount, 0);
    assert.equal(result.disabled, true);
});

test('purgeDoc targets exactly the problem status row of the record', async () => {
    const deleted = [];
    const coll = { deleteMany: async (filter) => { deleted.push(filter); return { deletedCount: 1 }; } };
    await createPurgeDoc(coll)('system', 3, '4326');
    assert.deepEqual(deleted, [{ domainId: 'system', docType: 10, docId: '4326', uid: 3 }]);
});

test('a manual pass purges before computing', async () => {
    const order = [];
    const sweep = createRpSweep({
        script: { run: async () => { order.push('rp'); } },
        sanitize: async () => { order.push('purge'); return { deletedCount: 3 }; },
    });
    assert.equal(await sweep.runOnce('manual'), true);
    assert.deepEqual(order, ['purge', 'rp']);
    assert.equal(sweep.sweeps.length, 1);
    assert.equal(sweep.sweeps[0].trigger, 'manual');
});

test('a failed purge aborts the pass without computing', async () => {
    const ran = [];
    const sweep = createRpSweep({
        script: { run: async () => { ran.push(1); } },
        sanitize: async () => { throw new Error('db down'); },
    });
    assert.equal(await sweep.runOnce('manual'), false);
    assert.deepEqual(ran, []);
    assert.equal(sweep.sweeps.length, 0);
    assert.equal(sweep.failures.length, 1);
    assert.match(sweep.failures[0].message, /db down/);
});

test('missing script registry is a no-op and never touches the database', async () => {
    delete global.Hydro;
    const sweep = createRpSweep({ sanitize: async () => { throw new Error('must not purge without a script'); } });
    assert.equal(await sweep.runOnce('manual'), false);
    assert.equal(sweep.failures.length, 0);
});

test('a pass never overlaps itself', async () => {
    let blocked = true;
    const waiters = [];
    const sweep = createRpSweep({
        script: { run: async () => {
            if (!blocked) return;
            await new Promise((r) => waiters.push(r));
        } },
    });
    const first = sweep.runOnce('scheduled');
    assert.equal(await sweep.runOnce('manual'), false);
    blocked = false;
    for (const resolve of waiters.splice(0)) resolve();
    assert.equal(await first, true);
    assert.equal(await sweep.runOnce('manual'), true);
    sweep.stop();
});

test('scheduled passes start after the startup delay and re-arm at the interval', async () => {
    const order = [];
    const sweep = createRpSweep({
        startupDelayMs: 10,
        intervalMs: 40,
        script: { run: async () => { order.push('rp'); await sleep(5); } },
        sanitize: async () => { order.push('purge'); return { deletedCount: 0 }; },
        instance: '0',
    });
    sweep.start();
    await sleep(30);
    assert.deepEqual(order, ['purge', 'rp']);
    await sleep(50);
    assert.deepEqual(order, ['purge', 'rp', 'purge', 'rp']);
    sweep.stop();
    await sleep(60);
    assert.deepEqual(order, ['purge', 'rp', 'purge', 'rp']);
});

test('non-zero pm2 instances never arm the timer', async () => {
    const ran = [];
    const sweep = createRpSweep({
        startupDelayMs: 5, intervalMs: 10,
        script: { run: async () => { ran.push(1); } },
        instance: '1',
    });
    sweep.start();
    await sleep(40);
    assert.deepEqual(ran, []);
    sweep.stop();
});

test('stop cancels the armed pass before it fires', async () => {
    const ran = [];
    const sweep = createRpSweep({
        startupDelayMs: 10, intervalMs: 10,
        script: { run: async () => { ran.push(1); } },
        instance: '0',
    });
    sweep.start();
    sweep.stop();
    await sleep(40);
    assert.deepEqual(ran, []);
});

test('createRpLock serializes concurrent RP computations', async () => {
    const order = [];
    const lock = createRpLock();
    const first = lock(async () => { order.push('a-start'); await sleep(10); order.push('a-end'); });
    const second = lock(async () => { order.push('b-start'); order.push('b-end'); });
    await first;
    await second;
    assert.deepEqual(order, ['a-start', 'a-end', 'b-start', 'b-end']);
});

test('the lock chain survives a failed job', async () => {
    const lock = createRpLock();
    await assert.rejects(() => lock(async () => { throw new Error('boom'); }), /boom/);
    assert.equal(await lock(async () => 'ok'), 'ok');
});
