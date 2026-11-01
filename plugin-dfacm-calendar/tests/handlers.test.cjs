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
process.env.DFACM_CALENDAR_AI_OFF = '1';
const compiled = esbuild.buildSync({
    entryPoints: [pluginPath], bundle: true, platform: 'node', format: 'cjs', write: false,
    external: ['hydrooj'], tsconfigRaw: { compilerOptions: { experimentalDecorators: true } },
}).outputFiles[0].text;

// Windows sandbox may forbid os.tmpdir(); the deployment tests use the same
// fallback: the workspace root next to this checkout.
const fixtureParent = process.env.TEST_TMPDIR || (process.platform === 'win32' ? path.dirname(repo) : os.tmpdir());

// Each fixture re-evaluates index.ts, so module state (DATA_FILE, lastGood)
// starts fresh and the env override applies at load time.
async function fixture({ dataFile, settings = {} } = {}) {
    const saved = process.env.SWPU_CALENDAR_FILE;
    if (dataFile !== undefined) process.env.SWPU_CALENDAR_FILE = dataFile;
    const routes = new Map();
    const nav = [];
    const locales = [];
    const registeredSettings = [];
    const stub = {
        Handler: class {
            constructor() {
                this.response = { body: {}, headers: {} };
                this.response.addHeader = (key, value) => { this.response.headers[key] = value; };
                this.user = { _id: 0, uname: 'Guest', hasPriv: () => false };
                this.args = {};
            }
            async limitRate() {}
        },
        Logger: class { info() {} error() {} },
        param: () => () => {},
        post: () => () => {},
        Types: { String: [], UnsignedInt: [] },
        SystemModel: { get: (key) => settings[key] || '' },
        SettingModel: {
            FLAG_SECRET: 4,
            Setting: (family, key, value, type, name, desc, flag) => ({ family, key, value, type, name, desc, flag }),
            SystemSetting: (...items) => { registeredSettings.push(...items); return () => {}; },
        },
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
    await loaded.exports.apply({
        Route(name, url, HandlerClass, priv) {
            routes.set(url, { name, HandlerClass, priv });
        },
        injectUI: (node, name, args, priv) => nav.push({ node, name, args, priv }),
        i18n: { load: (lang, dict) => locales.push({ lang, dict }) },
        on: () => {},
        addScript: () => {},
        effect: (fn) => fn(),
    });
    const handler = (url) => {
        const entry = routes.get(url);
        return new entry.HandlerClass();
    };
    return { routes, nav, locales, handler, registeredSettings };
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
    assert.equal(h.response.body.page_name, 'swpu_calendar');
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
    await bogus.get('system', 'unknown-type');
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
                        startTimeSeconds: Math.floor((Date.now() + 86400000) / 1000),
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


test('system settings register CLIST credentials with a password input', async () => {
    const f = await fixture();
    assert.deepEqual(f.registeredSettings.map((s) => s.key), ['dfacm_calendar.clist_username', 'dfacm_calendar.clist_api_key']);
    for (const s of f.registeredSettings) {
        assert.equal(s.key.split('.').length, 2, 'Hydro expands dotted form names but only saves one nested level');
    }
    assert.equal(f.registeredSettings[1].type, 'password');
    assert.equal(f.registeredSettings[1].flag, 4);
    for (const url of ['/calendar/feed.ics', '/calendar/assets/:file']) assert.equal(f.routes.get(url).priv, undefined);
});

test('ICS handler applies multiple filters, returns raw calendar and rate limits requests', async () => {
    const f = await fixture();
    const h = f.handler('/calendar/feed.ics');
    h.args = { types: 'icpc' };
    let rateCalls = 0;
    h.limitRate = async () => { rateCalls++; };
    await h.get();
    assert.equal(rateCalls, 1);
    assert.equal(h.response.type, 'text/calendar; charset=utf-8');
    assert.match(h.response.body, /^BEGIN:VCALENDAR\r\n/);
    assert.equal(h.response.headers['Cache-Control'], 'public, max-age=300');
    assert.match(h.response.disposition, /dfacm-contests\.ics/);
    assert.ok(!h.response.body.includes('SUMMARY:第十八届蓝桥杯'));
});

test('asset route serves only pinned files, sets MIME/cache, rejects traversal', async () => {
    const f = await fixture();
    for (const [name, mime] of [['calendar-1.37.1.js', 'application/javascript'], ['calendar-1.37.1.css', 'text/css']]) {
        const h = f.handler('/calendar/assets/:file'); await h.get('system', name);
        assert.ok(h.response.body.length > 100);
        assert.ok(h.response.type.startsWith(mime));
        assert.match(h.response.headers['Cache-Control'], /immutable/);
    }
    for (const name of ['../../.env', 'calendar.json', 'clist-cache.json', 'ai-cache.json', 'calendar-1.36.0.js', 'calendar-1.36.1.js', 'calendar-1.36.2.js', 'calendar-1.36.2.css', 'calendar-1.36.3.js', 'fullcalendar-7.1.3.js', 'fullcalendar-7.1.3.css']) {
        const h = f.handler('/calendar/assets/:file'); await h.get('system', name);
        assert.equal(h.response.status, 404);
        assert.equal(h.response.headers['Cache-Control'], undefined);
    }
});

test('old AI page and subscription URLs map categories and interests into the unified calendar', async () => {
    const f = await fixture();
    for (const [route, args, path, expected] of [
        ['/ai-contests', { category: 'vibe-coding', source: 'codeforces', q: 'AI' }, '/calendar', { interests: 'vibe-coding', source: 'cf', q: 'AI' }],
        ['/ai-contests/calendar', { category: 'hackathon' }, '/calendar', { types: 'hackathon' }],
        ['/ai-contests/feed.ics', { category: 'agent' }, '/calendar/feed.ics', { interests: 'agent', status: 'active' }],
        ['/ai-contests/feed.xml', { category: 'datascience', status: 'all' }, '/calendar/feed.xml', { types: 'datascience' }],
    ]) {
        const h = f.handler(route); h.args = args; await h.get();
        assert.equal(h.response.status, 308);
        assert.equal(h.response.redirect, undefined, 'Hydro forces its redirect helper to 302');
        assert.equal(h.response.type, 'text/plain; charset=utf-8');
        const redirect = new URL(h.response.headers.Location, 'https://dfacm.website');
        assert.equal(redirect.pathname, path);
        for (const [key, value] of Object.entries(expected)) assert.equal(redirect.searchParams.get(key), value);
    }
    assert.equal(f.nav.length, 1, 'only the calendar has a public navigation entry');
});

test('AI source reaches real handlers after cached hydration and retains bot fields alongside new metadata', async () => {
    const savedOff = process.env.DFACM_CALENDAR_AI_OFF;
    const savedCache = process.env.DFACM_CALENDAR_AI_CACHE;
    const dir = fs.mkdtempSync(path.join(fs.realpathSync(fixtureParent), '.calendar-ai-'));
    const file = path.join(dir, 'ai-cache.json');
    fs.writeFileSync(file, JSON.stringify({ fetchedAt: Date.now(), events: [{ id: 'ai-lablab-demo', name: 'Vibe Coding Lab',
        type: 'hackathon', source: 'lablab', form: 'online', start: '2026-11-20T12:00:00+08:00', end: '2026-11-21T12:00:00+08:00',
        tags: ['vibe-coding'], organizer: 'Demo Lab', prizeText: '$10,000', prizeAmount: 1, currency: 'USD' }] }));
    process.env.DFACM_CALENDAR_AI_OFF = '0';
    process.env.DFACM_CALENDAR_AI_CACHE = file;
    try {
        const f = await fixture();
        const page = f.handler('/calendar'); page.args = { scope: 'ai', interests: 'vibe-coding' };
        await page.get('system'); assert.equal(page.response.body.total, 1);
        const data = f.handler('/calendar/data'); await data.get();
        const event = data.response.body.events.find((item) => item.id === 'ai-lablab-demo');
        for (const key of ['id', 'name', 'type', 'form', 'approx', 'allDay', 'source', 'location', 'start', 'end', 'regDeadline', 'url', 'note']) assert.ok(Object.hasOwn(event, key));
        assert.equal(event.prizeText, '$10,000'); assert.deepEqual(event.tags, ['vibe-coding']);
        assert.ok(!('_start' in event));
        const rss = f.handler('/calendar/feed.xml'); rss.args = { scope: 'ai', interests: 'vibe-coding' }; await rss.get();
        assert.equal(rss.response.type, 'application/rss+xml; charset=utf-8');
        assert.match(rss.response.body, /Vibe Coding Lab/); assert.equal((rss.response.body.match(/<item>/g) || []).length, 1);
        const ics = f.handler('/calendar/feed.ics'); ics.args = rss.args; await ics.get(); assert.match(ics.response.body, /SUMMARY:Vibe Coding Lab/);
    } finally {
        if (savedOff === undefined) delete process.env.DFACM_CALENDAR_AI_OFF; else process.env.DFACM_CALENDAR_AI_OFF = savedOff;
        if (savedCache === undefined) delete process.env.DFACM_CALENDAR_AI_CACHE; else process.env.DFACM_CALENDAR_AI_CACHE = savedCache;
        fs.rmSync(dir, { recursive: true, force: true });
    }
});
