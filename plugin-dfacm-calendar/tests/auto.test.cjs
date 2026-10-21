'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');
const pluginDir = path.resolve(__dirname, '..');
const parent = process.env.TEST_TMPDIR || os.tmpdir();
const NOW = Date.parse('2026-10-18T12:00:00+08:00');
const CF = { id: 1988, name: 'Codeforces Round 999', phase: 'BEFORE', startTimeSeconds: (NOW + 86400000) / 1000, durationSeconds: 9000 };
const ABC = { id: 'abc468', title: 'AtCoder Beginner Contest 468', start_epoch_second: (NOW + 2 * 86400000) / 1000, duration_second: 6600 };

function fixture(t, { legacy } = {}) {
    const dir = fs.mkdtempSync(path.join(fs.realpathSync(parent), 'dfacm-auto-'));
    const saved = Object.fromEntries(['SWPU_CALENDAR_AUTO_CACHE', 'SWPU_CALENDAR_AUTO_OFF'].map((key) => [key, process.env[key]]));
    const realFetch = globalThis.fetch;
    process.env.SWPU_CALENDAR_AUTO_CACHE = path.join(dir, 'auto-cache.json');
    delete process.env.SWPU_CALENDAR_AUTO_OFF;
    let now = NOW;
    let failCf = false;
    let failAtcoder = false;
    let malformedCf = false;
    const calls = [];
    globalThis.fetch = async (url) => {
        const cf = String(url).includes('codeforces');
        calls.push(cf ? 'cf' : 'atcoder');
        if (cf ? failCf : failAtcoder) throw new Error('Upstream offline');
        return { ok: true, json: async () => cf ? malformedCf ? { status: 'FAILED' } : { status: 'OK', result: [CF] } : [ABC] };
    };
    if (legacy) fs.writeFileSync(process.env.SWPU_CALENDAR_AUTO_CACHE, JSON.stringify(legacy));
    delete require.cache[require.resolve('../auto.cjs')];
    const auto = require('../auto.cjs');
    auto.__resetForTest(() => now);
    t.after(async () => {
        await auto.__settledForTest();
        globalThis.fetch = realFetch;
        for (const [key, value] of Object.entries(saved)) {
            if (value === undefined) delete process.env[key]; else process.env[key] = value;
        }
        fs.rmSync(dir, { recursive: true, force: true });
    });
    return { auto, dir, calls, advance: (ms) => { now += ms; }, fail: (cf, at) => { failCf = cf; failAtcoder = at; }, malformed: () => { malformedCf = true; } };
}

test('source normalization includes recent finished and long ongoing contests, rejects old/bad rows', () => {
    const auto = require('../auto.cjs');
    const recent = { ...CF, id: 1987, phase: 'FINISHED', startTimeSeconds: (NOW - 3 * 3600000) / 1000 };
    const old = { ...CF, id: 1, phase: 'FINISHED', startTimeSeconds: (NOW - 86400000) / 1000 };
    assert.deepEqual(auto.normalizeCf({ status: 'OK', result: [CF, recent, old, { id: 'bad' }] }, NOW).map((e) => e.id), ['cf-1988', 'cf-1987']);
    const long = { ...ABC, id: 'long', start_epoch_second: (NOW - 86400000) / 1000, duration_second: 3 * 86400 };
    assert.deepEqual(auto.normalizeAtcoder([ABC, long, { ...ABC, id: '../unsafe' }], NOW).map((e) => e.id), ['atcoder-abc468', 'atcoder-long']);
    assert.equal(auto.normalizeCf({ status: 'OK', result: [{ ...CF, startTimeSeconds: (NOW + 45 * 86400000) / 1000 }] }, NOW).length, 1);
    assert.equal(auto.normalizeCf({ status: 'OK', result: [{ ...CF, startTimeSeconds: (NOW + 60 * 86400000) / 1000 }] }, NOW).length, 0);
});

test('CST ISO output round-trips to the same instant', () => {
    const { cstIso } = require('../auto.cjs');
    assert.equal(cstIso(0), '1970-01-01T08:00:00+08:00');
    assert.equal(Date.parse(cstIso(CF.startTimeSeconds)), CF.startTimeSeconds * 1000);
});

test('cold start returns promptly, concurrent refresh deduplicates, TTL refreshes both sources', async (t) => {
    const { auto, calls, advance } = fixture(t);
    assert.deepEqual(await auto.getAutoEvents(), []);
    await auto.__settledForTest();
    assert.equal((await auto.getAutoEvents()).length, 2);
    assert.equal(calls.length, 2);
    advance(auto.TTL_MS + 1);
    await Promise.all([auto.getAutoEvents(), auto.getAutoEvents()]);
    await auto.__settledForTest();
    assert.equal(calls.length, 4);
    assert.ok(auto.getAutoStatus().every((s) => s.status === 'fresh'));
});

test('one source outage keeps its stale events while the other refreshes', async (t) => {
    const { auto, dir, calls, advance, fail } = fixture(t);
    await auto.getAutoEvents(); await auto.__settledForTest();
    const cfCache = fs.readFileSync(path.join(dir, 'auto-cache-cf.json'), 'utf8');
    fail(true, false); advance(auto.TTL_MS + 1);
    await auto.getAutoEvents(); await auto.__settledForTest();
    assert.equal((await auto.getAutoEvents()).length, 2);
    assert.equal(fs.readFileSync(path.join(dir, 'auto-cache-cf.json'), 'utf8'), cfCache);
    assert.deepEqual(auto.getAutoStatus().map((s) => s.status), ['stale', 'fresh']);
    for (let i = 0; i < 5; i++) await auto.getAutoEvents();
    assert.equal(calls.length, 4, 'an outage must not cause one API request per visitor');
    fail(false, false); advance(auto.RETRY_MS + 1);
    await auto.getAutoEvents(); await auto.__settledForTest();
    assert.deepEqual(auto.getAutoStatus().map((s) => s.status), ['fresh', 'fresh']);
});

test('malformed payload does not overwrite a successful source cache', async (t) => {
    const { auto, advance, malformed } = fixture(t);
    await auto.getAutoEvents(); await auto.__settledForTest();
    malformed(); advance(auto.TTL_MS + 1);
    await auto.getAutoEvents(); await auto.__settledForTest();
    assert.ok((await auto.getAutoEvents()).some((event) => event.id === 'cf-1988'));
    assert.equal(auto.getAutoStatus()[0].status, 'stale');
});

test('both sources unavailable expire after 24h and recover after the retry interval', async (t) => {
    const { auto, advance, fail } = fixture(t);
    await auto.getAutoEvents(); await auto.__settledForTest();
    fail(true, true); advance(auto.STALE_MAX_MS + 1);
    assert.deepEqual(await auto.getAutoEvents(), []);
    await auto.__settledForTest();
    assert.ok(auto.getAutoStatus().every((s) => s.status === 'unavailable'));
    fail(false, false); advance(auto.RETRY_MS + 1);
    await auto.getAutoEvents(); await auto.__settledForTest();
    assert.equal((await auto.getAutoEvents()).length, 2);
});

test('legacy disk cache hydrates each source without waiting for network', async (t) => {
    const { normalizeCf, normalizeAtcoder } = require('../auto.cjs');
    const { auto, calls } = fixture(t, { legacy: { fetchedAt: NOW - 600000, events: [...normalizeCf({ status: 'OK', result: [CF] }, NOW), ...normalizeAtcoder([ABC], NOW)] } });
    assert.equal((await auto.getAutoEvents()).length, 2);
    assert.equal(calls.length, 0);
});

test('disabled source pipeline makes no API requests', async (t) => {
    const { auto, calls } = fixture(t);
    process.env.SWPU_CALENDAR_AUTO_OFF = '1';
    auto.warmup();
    assert.deepEqual(await auto.getAutoEvents(), []);
    assert.equal(calls.length, 0);
    assert.ok(auto.getAutoStatus().every((s) => s.status === 'disabled'));
});
