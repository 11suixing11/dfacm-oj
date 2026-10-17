'use strict';

// auto.cjs tests: source normalization (Codeforces + AtCoder), the fetch
// window, the CST ISO helper, and the serve-stale/refresh-in-background
// cache discipline. No real network: globalThis.fetch is stubbed per test.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');

const pluginDir = path.resolve(__dirname, '..');
const fixtureParent = process.env.TEST_TMPDIR || (process.platform === 'win32' ? path.dirname(path.dirname(pluginDir)) : os.tmpdir());

function loadAuto(env = {}) {
    const saved = {};
    for (const key of ['SWPU_CALENDAR_AUTO_CACHE', 'SWPU_CALENDAR_AUTO_OFF', ...Object.keys(env)]) {
        if (key in process.env) saved[key] = process.env[key];
    }
    Object.assign(process.env, { SWPU_CALENDAR_AUTO_CACHE: path.join(cacheDir(), 'auto-cache.json'), ...env });
    delete require.cache[require.resolve(path.join(pluginDir, 'auto.cjs'))];
    const auto = require(path.join(pluginDir, 'auto.cjs'));
    auto.__resetForTest();
    return {
        auto,
        restore() {
            for (const key of ['SWPU_CALENDAR_AUTO_CACHE', 'SWPU_CALENDAR_AUTO_OFF', ...Object.keys(env)]) {
                if (key in saved) process.env[key] = saved[key];
                else delete process.env[key];
            }
        },
    };
}

let cacheCounter = 0;
function cacheDir() {
    const dir = path.join(fs.realpathSync(fixtureParent), `.auto-test-${process.pid}-${cacheCounter++}`);
    fs.mkdirSync(dir, { recursive: true });
    return dir;
}

// 2026-10-18 12:00 CST（epoch 秒）
const NOW_MS = Date.parse('2026-10-18T12:00:00+08:00');

const CF_ROUND = {
    id: 1988, name: 'Codeforces Round 999 (Div. 2)', phase: 'BEFORE',
    startTimeSeconds: 1792629000, durationSeconds: 9000,
};
const CF_RUNNING = { ...CF_ROUND, id: 1987, name: 'Codeforces Round 998 (Div. 1)', phase: 'CODING',
    startTimeSeconds: 1792620000, durationSeconds: 7200 };
const CF_OLD = { ...CF_ROUND, id: 100, name: 'Old Round', phase: 'FINISHED', startTimeSeconds: 1600000000 };

const ATCODER_ABC = {
    id: 'abc468', title: 'AtCoder Beginner Contest 468',
    start_epoch_second: 1792636800, duration_second: 6600,
};

test('normalizeCf keeps upcoming and running rounds inside the window only', () => {
    const auto = require('../auto.cjs');
    const events = auto.normalizeCf({ status: 'OK', result: [CF_ROUND, CF_RUNNING, CF_OLD, { id: 'bad' }] }, NOW_MS);
    // 输入顺序保留：BEFORE/CODING 都收，FINISHED 与坏行剔除
    assert.deepEqual(events.map((e) => e.id), ['cf-1988', 'cf-1987']);
    const upcoming = events.find((e) => e.id === 'cf-1988');
    assert.equal(upcoming.type, 'cf');
    assert.equal(upcoming.form, 'online');
    assert.equal(upcoming.url, 'https://codeforces.com/contests/1988');
    // 1792629000 = 2026-10-22T00:30:00Z = 08:30 北京时间
    assert.equal(upcoming.start, '2026-10-22T08:30:00+08:00');
    assert.equal(upcoming.end, '2026-10-22T11:00:00+08:00');
});

test('normalizeAtcoder maps the community feed into calendar events', () => {
    const auto = require('../auto.cjs');
    const events = auto.normalizeAtcoder([ATCODER_ABC, { id: 'x', start_epoch_second: 'nope' }], NOW_MS);
    assert.equal(events.length, 1);
    const abc = events[0];
    assert.equal(abc.id, 'atcoder-abc468');
    assert.equal(abc.name, 'AtCoder Beginner Contest 468');
    assert.equal(abc.type, 'atcoder');
    assert.equal(abc.url, 'https://atcoder.jp/contests/abc468');
});

test('cstIso renders CST wall time with the explicit +08:00 offset', () => {
    const auto = require('../auto.cjs');
    // epoch 0 = 1970-01-01T08:00:00+08:00
    assert.equal(auto.cstIso(0), '1970-01-01T08:00:00+08:00');
    const parsed = new Date(auto.cstIso(1792629000));
    assert.equal(parsed.getTime(), 1792629000 * 1000, 'the ISO string must round-trip to the same instant');
});

test('fetch + cache: cold start fetches once, serves from memory within TTL, then refreshes', async () => {
    const { auto, restore } = loadAuto();
    const realFetch = globalThis.fetch;
    let fetches = 0;
    globalThis.fetch = async (url) => {
        fetches++;
        if (String(url).includes('codeforces')) {
            return { ok: true, status: 200, json: async () => ({ status: 'OK', result: [CF_ROUND] }) };
        }
        return { ok: true, status: 200, json: async () => [ATCODER_ABC] };
    };
    try {
        // 冷启动：先空手而归，后台刷新毫秒级完成后落盘进内存
        assert.deepEqual(await auto.getAutoEvents(), []);
        await new Promise((r) => setTimeout(r, 300));
        const events = await auto.getAutoEvents();
        assert.ok(events.some((e) => e.id === 'cf-1988'), 'CF round present after refresh');
        assert.ok(events.some((e) => e.id === 'atcoder-abc468'), 'AtCoder round present after refresh');
        assert.equal((await auto.getAutoEvents()).length, 2, 'TTL 内直接吃内存缓存');
        assert.equal(fetches, 2, 'both sources fetched exactly once');
        // 超过 TTL（用未来 nowMs 模拟时间流逝）：先返回旧数据，再后台刷新
        await auto.getAutoEvents(Date.now() + auto.TTL_MS + 5000);
        await auto.getAutoEvents(Date.now() + auto.TTL_MS + 5000);
        await new Promise((r) => setTimeout(r, 300));
        assert.ok(fetches >= 4, 'refresh runs again after the TTL');
    } finally {
        globalThis.fetch = realFetch;
        restore();
    }
});

test('both sources failing keeps the previous cache untouched', async () => {
    const { auto, restore } = loadAuto();
    const realFetch = globalThis.fetch;
    globalThis.fetch = async () => {
        throw new Error('edge down');
    };
    try {
        await auto.getAutoEvents(NOW_MS);
        await new Promise((r) => setTimeout(r, 300));
        assert.deepEqual(await auto.getAutoEvents(NOW_MS + 1000), [], 'nothing usable during the outage');
    } finally {
        globalThis.fetch = async (url) => {
            if (String(url).includes('codeforces')) {
                return { ok: true, status: 200, json: async () => ({ status: 'OK', result: [CF_ROUND] }) };
            }
            return { ok: true, status: 200, json: async () => [] };
        };
        try {
            await auto.getAutoEvents(NOW_MS);
            await new Promise((r) => setTimeout(r, 300));
            assert.ok((await auto.getAutoEvents(NOW_MS + 1000)).some((e) => e.id === 'cf-1988'), 'recovers once a source answers');
        } finally {
            globalThis.fetch = realFetch;
            restore();
        }
    }
});

test('the disk cache survives a module reload (simulated restart)', async () => {
    // 夹具必须写进 loadAuto 将要读的同一个缓存文件：先建目录与文件，
    // 再把路径经环境变量传给 loadAuto。
    const cacheFile = path.join(cacheDir(), 'auto-cache.json');
    fs.writeFileSync(cacheFile, JSON.stringify({
        fetchedAt: Date.now() - 10 * 60 * 1000, // 10 分钟前：新鲜
        events: [{ id: 'cf-1', name: 'Round', type: 'cf', form: 'online', location: '',
            start: '2026-10-20T20:00:00+08:00', end: '2026-10-20T22:00:00+08:00',
            regDeadline: null, url: 'https://codeforces.com/contests/1', note: '' }],
    }));
    const { auto, restore } = loadAuto({ SWPU_CALENDAR_AUTO_CACHE: cacheFile });
    const realFetch = globalThis.fetch;
    let fetches = 0;
    globalThis.fetch = async () => { fetches++; throw new Error('still down'); };
    try {
        // 磁盘缓存可直接服务，不阻塞也不发请求
        const events = await auto.getAutoEvents();
        assert.equal(events.length, 1);
        assert.equal(events[0].id, 'cf-1');
        assert.equal(fetches, 0, 'fresh disk cache must not trigger a fetch');
    } finally {
        globalThis.fetch = realFetch;
        restore();
    }
});

test('SWPU_CALENDAR_AUTO_OFF disables the whole pipeline', async () => {
    const { auto, restore } = loadAuto({ SWPU_CALENDAR_AUTO_OFF: '1' });
    try {
        assert.deepEqual(await auto.getAutoEvents(), []);
        auto.warmup();
        assert.deepEqual(await auto.getAutoEvents(), []);
    } finally {
        restore();
    }
});
