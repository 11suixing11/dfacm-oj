'use strict';

// Handler-level wiring tests for plugin-dfacm-calendar: routes and privileges,
// nav injection (the injected name must equal a registered route name — the
// 2026-10-13 ui-default lesson), i18n dictionaries, page grouping, the data
// feed shape, and the broken-file fallback. index.ts is bundled with esbuild
// with `hydrooj` stubbed out — no Mongo, no real process.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');
const { test } = require('node:test');
const esbuild = require('esbuild');

const pluginDir = path.resolve(__dirname, '..');
const pluginPath = path.join(pluginDir, 'index.ts');
const repo = path.resolve(pluginDir, '..');
// Handler 测试默认关闭平台赛自动抓取：apply() 的 warmup() 与后续 handler
// 调用都不会发起真实外网请求；需要测合并的用例自行临时打开并桩掉 fetch。
process.env.SWPU_CALENDAR_AUTO_OFF = '1';
const compiled = esbuild.buildSync({
    entryPoints: [pluginPath], bundle: true, platform: 'node', format: 'cjs', write: false,
    external: ['hydrooj'], tsconfigRaw: { compilerOptions: { experimentalDecorators: true } },
}).outputFiles[0].text;

// Windows sandbox may forbid os.tmpdir(); the deployment tests use the same
// fallback: the workspace root next to this checkout.
const fixtureParent = process.env.TEST_TMPDIR || (process.platform === 'win32' ? path.dirname(repo) : os.tmpdir());

// Each fixture re-evaluates index.ts, so module state (DATA_FILE, lastGood)
// starts fresh and the env override applies at load time.
function fixture({ dataFile } = {}) {
    const saved = process.env.SWPU_CALENDAR_FILE;
    if (dataFile !== undefined) process.env.SWPU_CALENDAR_FILE = dataFile;
    const routes = new Map();
    const nav = [];
    const locales = [];
    const stub = {
        Handler: class {
            constructor() {
                this.response = { body: {}, headers: {}, addHeader: () => {} };
                this.user = { _id: 0, uname: 'Guest', hasPriv: () => false };
                this.args = {};
            }
            async limitRate() {}
        },
        Logger: class { info() {} error() {} },
        param: () => () => {},
        post: () => () => {},
        Types: { String: [], UnsignedInt: [] },
    };
    const loaded = new Module(pluginPath, module);
    loaded.filename = pluginPath;
    loaded.paths = module.paths;
    loaded.require = (id) => (id === 'hydrooj' ? stub : require(id));
    loaded._compile(compiled, pluginPath);
    if (dataFile !== undefined) {
        if (saved === undefined) delete process.env.SWPU_CALENDAR_FILE;
        else process.env.SWPU_CALENDAR_FILE = saved;
    }
    loaded.exports.apply({
        Route(name, url, HandlerClass, priv) {
            routes.set(url, { name, HandlerClass, priv });
        },
        injectUI: (node, name, args, priv) => nav.push({ node, name, args, priv }),
        i18n: { load: (lang, dict) => locales.push({ lang, dict }) },
        on: () => {},
        addScript: () => {},
    });
    const handler = (url) => {
        const entry = routes.get(url);
        return new entry.HandlerClass();
    };
    return { routes, nav, locales, handler };
}

test('routes are registered guest-visible and the nav injection matches a route name', async () => {
    const f = await fixture();
    assert.equal(f.routes.get('/calendar').priv, undefined, 'the calendar is an intelligence page: guests included');
    assert.equal(f.routes.get('/calendar/data').priv, undefined, 'the bot feed must be reachable without a session');
    assert.deepEqual(f.routes.get('/calendar').name, 'swpu_calendar');
    // ui-default renders nav hrefs via url(item.name): a name that is not a
    // registered route renders the literal "Error: No route found for name: ...".
    assert.deepEqual(f.nav, [{ node: 'Nav', name: 'swpu_calendar', args: { prefix: 'calendar', before: 'ranking' }, priv: undefined }]);
    const injectedNames = f.nav.map((n) => n.name);
    const routeNames = [...f.routes.values()].map((r) => r.name);
    for (const name of injectedNames) assert.ok(routeNames.includes(name), `${name} must be a registered route`);
});

test('i18n dictionaries name the nav entry in zh and en', async () => {
    const f = await fixture();
    const zh = f.locales.find((l) => l.lang === 'zh');
    const en = f.locales.find((l) => l.lang === 'en');
    assert.equal(zh.dict.swpu_calendar, '赛事日历');
    assert.equal(en.dict.swpu_calendar, 'Contest Calendar');
});

test('the page handler groups the shipped season and narrows by type', async () => {
    const f = await fixture();
    const h = f.handler('/calendar');
    await h.get('system', 'icpc');
    assert.equal(h.response.template, 'calendar.html');
    assert.equal(h.response.body.currentType, 'icpc');
    assert.equal(h.response.body.broken, false);
    assert.ok(h.response.body.total > 0, 'the shipped seed must render something');
    assert.ok(h.response.body.filters[0].key === '');
    // every DTO carries the precomputed display strings the template prints
    for (const group of ['ongoing', 'upcoming', 'ended']) {
        for (const event of h.response.body[group]) {
            assert.ok(event.dateText && event.countdownText && event.typeLabel && event.color);
            assert.ok(!('_start' in event), 'internal Date fields must not leak to the template');
        }
    }
    // an unknown filter falls back to "all" instead of an empty page
    const bogus = f.handler('/calendar');
    await bogus.get('system', 'hackathon');
    assert.equal(bogus.response.body.currentType, '');
});

test('the data feed serves raw ISO events without internal fields', async () => {
    const f = await fixture();
    const h = f.handler('/calendar/data');
    await h.get('system');
    assert.equal(h.response.body.ok, true);
    assert.match(h.response.body.generatedAt, /^\d{4}-\d{2}-\d{2}T/);
    assert.ok(h.response.body.events.length > 0);
    for (const event of h.response.body.events) {
        assert.ok(event.id && event.name && event.type && event.start);
        assert.ok(!('_start' in event) && !('_end' in event), 'internal fields must not leak to the feed');
    }
});

test('a broken data file falls back to the last good copy and flags itself', async () => {
    const dir = fs.mkdtempSync(path.join(fs.realpathSync(fixtureParent), '.calendar-test-'));
    const file = path.join(dir, 'calendar.json');
    fs.writeFileSync(file, JSON.stringify({
        updated: '2026-10-18',
        events: [{ id: 'custom', name: '自定义赛事', type: 'school', start: '2026-11-20T00:00:00+08:00', end: '2026-11-20T23:59:59+08:00' }],
    }));
    try {
        // The env override itself: the page serves the custom file, not the seed.
        const custom = await fixture({ dataFile: file });
        const first = custom.handler('/calendar');
        await first.get('system', '');
        assert.equal(first.response.body.broken, false);
        assert.equal(first.response.body.total, 1);
        assert.equal(first.response.body.upcoming[0].id, 'custom');

        // Now corrupt the file: the next request serves the last good copy.
        fs.writeFileSync(file, '{ "events": [oops');
        const second = custom.handler('/calendar');
        await second.get('system', '');
        assert.equal(second.response.body.broken, true);
        assert.equal(second.response.body.total, 1, 'last good data must keep serving');
        assert.equal(second.response.body.upcoming[0].id, 'custom');
        const feed = custom.handler('/calendar/data');
        await feed.get('system');
        assert.equal(feed.response.body.ok, false);
        assert.equal(feed.response.body.events.length, 1);

        // A fresh process with a broken file and no history degrades to an
        // empty page instead of a 500.
        const cold = await fixture({ dataFile: path.join(dir, 'missing.json') });
        const page = cold.handler('/calendar');
        await page.get('system', '');
        assert.equal(page.response.body.broken, true);
        assert.equal(page.response.body.total, 0);
        const coldFeed = cold.handler('/calendar/data');
        await coldFeed.get('system');
        assert.equal(coldFeed.response.body.ok, false);
        assert.deepEqual(coldFeed.response.body.events, []);
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});

// 平台自动抓取打开时，CF/AtCoder 条目与官方赛共用同一条时间轴，
// 页面、数据端点与筛选 chips 三处都能看到它们。
test('platform auto events merge into the page, the feed and the filter chips', async () => {
    const savedOff = process.env.SWPU_CALENDAR_AUTO_OFF;
    const savedCache = process.env.SWPU_CALENDAR_AUTO_CACHE;
    delete process.env.SWPU_CALENDAR_AUTO_OFF;
    const dir = fs.mkdtempSync(path.join(fs.realpathSync(fixtureParent), '.calendar-auto-'));
    process.env.SWPU_CALENDAR_AUTO_CACHE = path.join(dir, 'auto-cache.json');
    const realFetch = globalThis.fetch;
    globalThis.fetch = async (url) => {
        if (String(url).includes('codeforces')) {
            return {
                ok: true, status: 200,
                json: async () => ({
                    status: 'OK',
                    result: [{
                        id: 1988, name: 'Codeforces Round 999 (Div. 2)', phase: 'BEFORE',
                        startTimeSeconds: Math.floor(Date.parse('2026-10-22T08:30:00+08:00') / 1000),
                        durationSeconds: 9000,
                    }],
                }),
            };
        }
        return { ok: true, status: 200, json: async () => [] };
    };
    try {
        const f = await fixture();
        // warmup() 的后台刷新要过几个事件循环（真实磁盘 I/O 的宏任务），
        // 这正是"冷启动先返回、后台补齐"的设计行为：等它落地再断言。
        await new Promise((r) => setTimeout(r, 150));
        const h = f.handler('/calendar');
        await h.get('system', '');
        const ids = [...h.response.body.upcoming].map((e) => e.id);
        assert.ok(ids.includes('cf-1988'), 'the auto CF round must appear in the timeline');
        const cf = h.response.body.upcoming.find((e) => e.id === 'cf-1988');
        assert.equal(cf.typeLabel, 'CF');
        assert.equal(cf.color, '#4a90d9');
        assert.equal(cf.placeText, '线上');
        const chipKeys = h.response.body.filters.map((x) => x.key);
        assert.ok(chipKeys.includes('cf'), 'a CF filter chip must be offered');
        const data = f.handler('/calendar/data');
        await data.get('system');
        const feedIds = data.response.body.events.map((e) => e.id);
        assert.ok(feedIds.includes('cf-1988'), 'auto events must reach the bot feed');
        // 官方赛不会被平台条目挤掉
        assert.ok(feedIds.includes('icpc51-chengdu'), 'the curated season stays in the feed');
    } finally {
        globalThis.fetch = realFetch;
        if (savedOff === undefined) delete process.env.SWPU_CALENDAR_AUTO_OFF;
        else process.env.SWPU_CALENDAR_AUTO_OFF = savedOff;
        if (savedCache === undefined) delete process.env.SWPU_CALENDAR_AUTO_CACHE;
        else process.env.SWPU_CALENDAR_AUTO_CACHE = savedCache;
        fs.rmSync(dir, { recursive: true, force: true });
    }
});
