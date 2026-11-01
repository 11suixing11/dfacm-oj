'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const { hash } = require('./merge-release.cjs');

// Executed by the installed Hydro CLI. All writes stay in the staging QA
// directory; this check never writes users, problems, submissions or settings.
module.exports = async function checkNative(api, root, hydroPackage, qa) {
    const plan = JSON.parse(fs.readFileSync(path.join(qa, 'plan.json'), 'utf8'));
    const env = {
        SWPU_CALENDAR_FILE: path.join(qa, 'calendar.json'), SWPU_CALENDAR_AUTO_OFF: '1',
        DFACM_CALENDAR_AI_OFF: '0', DFACM_CALENDAR_AI_CACHE: path.join(qa, 'collector-cache.json'),
        DFACM_CLIST_USERNAME: '', DFACM_CLIST_API_KEY: '',
    };
    const saved = Object.fromEntries(Object.keys(env).map(key => [key, process.env[key]]));
    Object.assign(process.env, env);
    let ctx;
    try {
        const esbuild = require(path.join(path.dirname(hydroPackage), 'esbuild'));
        const compiled = esbuild.buildSync({ entryPoints: [path.join(root, 'index.ts')], bundle: true,
            platform: 'node', format: 'cjs', write: false, external: ['hydrooj'],
            tsconfigRaw: { compilerOptions: { experimentalDecorators: true } } }).outputFiles[0].text;
        const loaded = new Module(path.join(root, 'native-entry.cjs'), module);
        loaded.filename = path.join(root, 'native-entry.cjs'); loaded.paths = Module._nodeModulePaths(root);
        const originalRequire = loaded.require.bind(loaded);
        loaded.require = name => name === 'hydrooj' ? { ...api,
            SystemModel: { get: key => key.startsWith('dfacm_calendar.') ? '' : api.SystemModel.get(key) } } : originalRequire(name);
        loaded._compile(compiled, loaded.filename);
        const routes = [], menus = [], effects = [];
        await loaded.exports.apply({ Route: (...args) => routes.push(args), injectUI: (...args) => menus.push(args),
            effect: callback => effects.push(callback), i18n: { load() {} } });
        assert.equal(routes.length, 9); assert.equal(menus.length, 1); assert.equal(menus[0][1], 'swpu_calendar');
        assert.ok(routes.every(route => route[3] === undefined), 'Calendar routes must be guest visible');

        const frameworkRequire = Module.createRequire(path.join(path.dirname(hydroPackage), '@hydrooj/framework/package.json'));
        const Router = frameworkRequire('@koa/router'); const router = new Router();
        for (const [name, route] of routes) router.get(name, route, () => {});
        for (const route of ['/calendar', '/ai-contests', '/ai-contests/', '/ai-contests/calendar', '/ai-contests/calendar/',
            '/ai-contests/feed.ics', '/ai-contests/feed.ics/', '/ai-contests/feed.xml']) {
            assert.ok(router.match(route, 'GET').route, 'Installed router does not match: ' + route);
        }
        const identity = { _id: 0, uname: 'Guest', viewLang: 'zh', theme: 'default', timeZone: 'Asia/Shanghai',
            hasPriv: () => false, hasPerm: () => false, serialize: () => ({ _id: 0, uname: 'Guest', viewLang: 'zh' }) };
        const routeMap = Object.fromEntries(routes.map(route => [route[0], route[1]]));
        function handlerFor(route, options = {}) {
            const Type = routes.find(item => item[1] === route)[2];
            const args = { domainId: 'system', __start: Date.now(), ...options };
            const response = { body: {}, headers: {}, addHeader(key, value) { this.headers[key] = value; } };
            const handler = Object.assign(Object.create(Type.prototype), { args, response, user: identity, session: {},
                domain: { _id: 'system', name: 'd&f算法网', ui: {} },
                request: { query: options, body: {}, params: {}, path: route, host: 'dfacm.website', headers: { 'user-agent': 'calendar-release-fixture' } },
                context: { request: { url: route }, acceptsLanguages: () => ['zh'] },
                UiContext: { cdn_prefix: '/', constantVersion: '' }, async limitRate() {},
                translate: text => text, renderTitle: () => '赛事日历' });
            handler.url = (name, values = {}) => {
                if (routeMap[name]) return routeMap[name].replace(/:([a-z]+)/g, (_match, key) => encodeURIComponent(values[key]));
                try { return router.url(name, values).toString(); } catch { return '/'; }
            };
            return handler;
        }
        const { loadCalendar, selectEvents, canonicalUrl } = require(path.join(root, 'calendar.cjs'));
        const { buildIcs, buildRss } = require(path.join(root, 'presentation.cjs'));
        const mergedData = handlerFor('/calendar/data'); await mergedData.get(mergedData.args);
        assert.equal(mergedData.response.body.ok, true);
        assert.ok(mergedData.response.body.events.length >= plan.collectorEvents, 'AI cache did not hydrate into the native data handler');
        const parsed = loadCalendar(JSON.stringify({ events: mergedData.response.body.events }));
        const urlGroups = new Map();
        for (const event of parsed.events) {
            if (!event.url) continue;
            const key = canonicalUrl(event.url), group = urlGroups.get(key) || [];
            group.push(event); urlGroups.set(key, group);
        }
        // Curated rounds/venues may share one announcement page. They remain
        // separate events; collector duplicates must merge into a single row.
        for (const group of urlGroups.values()) if (group.length > 1) {
            assert.ok(group.every(event => event.source === 'manual'), 'Collector contest URL is duplicated');
        }
        const cases = [ {}, { type: 'icpc' }, { scope: 'algorithm' }, { scope: 'ai', interests: 'vibe-coding', status: 'active' },
            { types: 'hackathon,llm_agent', interests: 'agent', source: 'lablab', sort: 'prize' }, { q: 'Coding', sort: 'deadline' },
            { status: 'uncertain' }, { status: 'ended', sort: 'newest' } ];
        const pages = [];
        for (const options of cases) {
            const page = handlerFor('/calendar', options);
            await page.get(page.args); // Use the actual parameter decorator's HTTP call shape.
            const selected = selectEvents(parsed.events, { ...options, now: new Date() });
            assert.equal(page.response.body.total, selected.length, 'Native filter mismatch: ' + JSON.stringify(options));
            assert.equal(page.response.template, 'calendar.html');
            pages.push(page);
            const ics = handlerFor('/calendar/feed.ics', options); await ics.get(ics.args);
            const fixedNow = new Date();
            const normalizeStamp = value => value.replace(/^DTSTAMP:.*$/gm, 'DTSTAMP:FIXED');
            assert.equal(normalizeStamp(ics.response.body), normalizeStamp(buildIcs(parsed, { ...options, now: fixedNow })), 'Native ICS filter mismatch');
            const rss = handlerFor('/calendar/feed.xml', options); await rss.get(rss.args);
            assert.equal((rss.response.body.match(/<item>/g) || []).length, selected.length, 'Native RSS filter mismatch');
            assert.equal((buildRss(parsed, { ...options, now: fixedNow }).match(/<item>/g) || []).length, selected.length);
        }
        for (const [route, options, target] of [ ['/ai-contests', { category: 'vibe-coding' }, '/calendar?interests=vibe-coding'],
            ['/ai-contests/calendar', { category: 'hackathon' }, '/calendar?types=hackathon'],
            ['/ai-contests/feed.ics', { category: 'agent' }, '/calendar/feed.ics?interests=agent&status=active'],
            ['/ai-contests/feed.xml', {}, '/calendar/feed.xml?status=active'] ]) {
            const handler = handlerFor(route, options); await handler.get(handler.args);
            assert.equal(handler.response.status, 308); assert.equal(handler.response.headers.Location, target);
            assert.ok(!handler.response.redirect, 'Hydro redirect helper would downgrade the permanent redirect');
        }
        const assets = handlerFor('/calendar/assets/:file', { file: 'calendar-1.37.1.js' }); await assets.get(assets.args);
        assert.ok(assets.response.body.length > 1000); assert.ok(assets.response.type.includes('javascript'));

        const { TemplateService } = require(path.join(path.dirname(hydroPackage), '@hydrooj/ui-default/backendlib/template.ts'));
        ctx = new api.Context(); let renderer;
        ctx.provide('setting', { get: key => api.SystemModel.get(key) });
        ctx.provide('server', { registerRenderer(_name, value) { renderer = value; } });
        const templates = new TemplateService(ctx);
        function loadTemplates(dir, base = dir) {
            for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
                const file = path.join(dir, item.name);
                if (item.isDirectory()) loadTemplates(file, base);
                else if (item.isFile()) templates.registry[path.relative(base, file).split(path.sep).join('/')] = fs.readFileSync(file, 'utf8');
            }
        }
        for (const addon of [...Object.values(global.addons), root]) {
            const dir = ['template', 'templates'].map(name => path.join(addon, name)).find(file => fs.existsSync(file) && fs.statSync(file).isDirectory());
            if (dir) loadTemplates(dir);
        }
        for (let i = 0; i < pages.length; i++) {
            const page = pages[i]; page.ctx = ctx;
            const html = await renderer.render(page.response.template, page.response.body,
                { handler: page, UserContext: identity, _: page.translate, url: page.url });
            assert.ok(html.includes('id="dfacm-calendar"')); assert.ok(html.includes('/calendar/assets/calendar-1.37.1.js'));
            assert.equal((html.match(/data-calendar-card /g) || []).length, parsed.events.length);
            assert.ok(!html.includes('Cannot get template'));
            if (i === 0) fs.writeFileSync(path.join(qa, 'native-page.html'), html, { mode: 0o600 });
        }
        fs.writeFileSync(path.join(qa, 'native-ok.json'), JSON.stringify({ manifestHash: hash(path.join(root, 'manifest.json')),
            events: parsed.events.length, nativeDecorators: true, nativeRouter: true, nativeTemplate: true,
            filters: cases.length, subscriptions: true, permanentRedirects: true, guest: true }), { mode: 0o600 });
        console.log('CALENDAR_NATIVE_OK: Installed Hydro parameter decorators, router, templates, merged data and subscriptions verified.');
    } finally {
        for (const [key, value] of Object.entries(saved)) {
            if (value === undefined) delete process.env[key]; else process.env[key] = value;
        }
        if (ctx && typeof ctx.dispose === 'function') await ctx.dispose();
    }
};
