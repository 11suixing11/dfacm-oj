const assert = require('node:assert/strict');
const { test } = require('node:test');
const { createLiveRp } = require('../live-rp.cjs');

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

test('history arrays stay bounded over long uptime', async () => {
    const live = createLiveRp({ debounceMs: 0, script, historyLimit: 2 });
    for (let i = 0; i < 5; i++) {
        live.hook({ domainId: 'system', status: 1 });
        await sleep(5);
    }
    assert.equal(live.runs.length, 2);
    live.stop();
});
