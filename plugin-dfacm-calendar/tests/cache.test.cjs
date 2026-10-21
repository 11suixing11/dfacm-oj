'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');
const { createCachedSource, TTL_MS, STALE_MAX_MS, RETRY_MS } = require('../cache.cjs');
const NOW = Date.parse('2026-10-21T00:00:00Z');

function fixture(t, disk) {
    const dir = fs.mkdtempSync(path.join(fs.realpathSync(process.env.TEST_TMPDIR || os.tmpdir()), 'dfacm-cache-'));
    const file = path.join(dir, 'cache.json');
    if (disk) fs.writeFileSync(file, JSON.stringify(disk));
    let now = NOW;
    let fails = false;
    let calls = 0;
    const source = createCachedSource({ id: 'test', label: 'Test', file, now: () => now,
        validate: (event) => event && typeof event.id === 'string',
        fetchEvents: async () => { calls++; if (fails) throw new Error('offline'); return [{ id: 'good' }]; },
    });
    t.after(async () => { await source.settled(); fs.rmSync(dir, { recursive: true, force: true }); });
    return { source, file, advance: (ms) => { now += ms; }, fail: () => { fails = true; }, calls: () => calls };
}

test('invalid or future disk data never enters the cache', async (t) => {
    for (const value of [
        { fetchedAt: NOW, events: [{ unexpected: true }] },
        { fetchedAt: NOW + TTL_MS, events: [{ id: 'future' }] },
        { fetchedAt: NOW - STALE_MAX_MS, events: [{ id: 'expired' }] },
    ]) {
        const f = fixture(t, value);
        assert.deepEqual(await f.source.get(), []);
        await f.source.settled();
        assert.equal((await f.source.get())[0].id, 'good');
    }
});

test('good disk data survives outages unchanged and retries only after the backoff', async (t) => {
    const f = fixture(t, { fetchedAt: NOW - TTL_MS - 1, events: [{ id: 'cached' }] });
    const original = fs.readFileSync(f.file, 'utf8');
    f.fail();
    assert.equal((await f.source.get())[0].id, 'cached'); await f.source.settled();
    assert.equal(fs.readFileSync(f.file, 'utf8'), original);
    assert.equal(f.source.status().status, 'stale');
    await f.source.get(); await f.source.settled();
    assert.equal(f.calls(), 1);
    f.advance(RETRY_MS + 1); await f.source.get(); await f.source.settled();
    assert.equal(f.calls(), 2);
});
