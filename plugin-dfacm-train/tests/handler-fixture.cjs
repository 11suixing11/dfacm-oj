'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const Module = require('node:module');
const esbuild = require('esbuild');
const { FakeCollection } = require('./fake-collection.cjs');

const pluginPath = path.resolve(__dirname, '..', 'index.ts');
// Bundle with esbuild (devDependency of the regcode plugin, resolved from this
// repo's shared node_modules) so `hydrooj` can be stubbed below.
const compiled = esbuild.buildSync({
    entryPoints: [pluginPath], bundle: true, platform: 'node', format: 'cjs', write: false,
    external: ['hydrooj'], tsconfigRaw: { compilerOptions: { experimentalDecorators: true } },
}).outputFiles[0].text;

const rid = (iso) => ({ getTimestamp: () => new Date(iso), toString: () => `r-${iso}` });

async function fixture({ env = {}, domainId = 'system' } = {}) {
    const collection = new FakeCollection();
    const routes = new Map();
    const listeners = {};
    const nav = [];
    const locales = [];
    const limits = [];
    const recordQueries = [];
    const saved = Object.fromEntries(Object.keys(env).map((k) => [k, process.env[k]]));
    Object.assign(process.env, env);
    const recordDocs = [
        { pid: 1001, status: 2, _id: rid('2026-10-07T10:00:00Z') },
        { pid: 1001, status: 3, _id: rid('2026-10-06T10:00:00Z') },
        { pid: 1002, status: 6, _id: rid('2026-10-05T10:00:00Z') },
    ];
    // Plans for /workbench/recent: A and B contain the fixture record pids
    // (1001/1002), C contains none of them.
    const trainingDocs = [
        { docId: 'tdocA', title: '一本通基础', pin: 0, dag: [{ _id: 1, title: '语言基础', requireNids: [], pids: [1001, 1003] }] },
        { docId: 'tdocB', title: '蓝桥杯真题', pin: 0, dag: [{ _id: 1, title: '基础训练', requireNids: [], pids: [1002] }] },
        { docId: 'tdocC', title: 'XCPC 专题', pin: 0, dag: [{ _id: 1, title: '热身综合', requireNids: [], pids: [2001] }] },
    ];
    const cursor = (docs) => ({
        docs,
        project() { return this; },
        sort() { return this; },
        limit(n) { this.docs = this.docs.slice(0, n); return this; },
        async toArray() { return this.docs; },
    });
    const stub = {
        db: { collection: () => collection, ensureIndexes: async () => {} },
        // A shared session object stands in for Hydro's, so a token minted while
        // rendering /mistakes is visible to the POST handlers — which is the
        // property CSRF relies on.
        session: {},
        Handler: class {
            constructor() {
                this.response = { body: {}, headers: {}, addHeader: (k, v) => { this.response.headers[k] = v; } };
                this.user = { _id: 42, uname: 'student', hasPriv: () => true, hasPerm: () => true };
                this.session = stub.session;
                // The real framework resolves route params from this.args;
                // undecorated methods must read this.args.domainId themselves.
                this.args = { domainId };
                this.request = { query: {}, json: false };
                this.UiContext = {};
                this.ctx = { parallel: async () => {} };
            }
            url(name, args = {}) {
                const route = routes.size && [...routes.values()].find((route) => route.name === name);
                const base = ({ homepage: '/', problem_main: '/p', training_main: '/training',
                    training_detail: `/training/${encodeURIComponent(args.tid)}`,
                    problem_detail: `/p/${encodeURIComponent(args.pid)}`,
                    record_detail: `/record/${encodeURIComponent(args.rid)}`,
                    problem_submit: `/p/${encodeURIComponent(args.pid)}/submit` })[name] || route?.url;
                if (!base) throw new Error(`Unknown route ${name}`);
                const prefix = this.args.domainId === 'system' ? '' : `/d/${encodeURIComponent(this.args.domainId)}`;
                return prefix + base + (args.query ? '?' + new URLSearchParams(args.query).toString() : '');
            }

            async limitRate(...args) { limits.push(args); }
        },
        Logger: class { info() {} error() {} },
        param: () => () => {}, post: () => () => {},
        PRIV: { PRIV_USER_PROFILE: 4 },
        PERM: { PERM_VIEW_TRAINING: 8, PERM_VIEW_PROBLEM_HIDDEN: 16 },
        ObjectId: class { constructor(value) { this.value = value; } toString() { return this.value; } },
        Types: { String: [], UnsignedInt: [], Boolean: [] },
        Time: { getObjectID: (d) => `oid-${d.toISOString()}` },
        RecordModel: {
            getMulti: (domainId, query) => {
                recordQueries.push(query);
                return cursor(query._id ? [] : recordDocs); // weekly window vs failure scans
            },
        },
        ProblemModel: {
            canViewBy: (pdoc) => !pdoc.hidden,
            getListStatus: async () => ({ 1002: { status: 1 } }),
            getList: async (domainId, pids) => Object.fromEntries(pids.map((pid) => [
                pid,
                pid === 1001 ? { docId: 1001, pid: 'P1001', title: 'A+B 问题' } : { docId: 0, title: '*' },
            ])),
        },
        TrainingModel: {
            getMulti: () => cursor(trainingDocs),
            getMultiStatus: () => ({ toArray: async () => [] }),
            getList: async (domainId, tids) => Object.fromEntries((tids || [])
                .map((tid) => [String(tid), trainingDocs.find((d) => d.docId === String(tid))])
                .filter(([, v]) => v)),
        },
    };
    const loaded = new Module(pluginPath, module);
    loaded.filename = pluginPath;
    loaded.paths = module.paths;
    loaded.require = (id) => (id === 'hydrooj' ? stub : require(id));
    loaded._compile(compiled, pluginPath);
    await loaded.exports.apply({
        Route(name, url, HandlerClass, priv) { routes.set(url, { name, url, HandlerClass, priv }); },
        injectUI: (node, name, args, priv) => nav.push({ node, name, args, priv }),
        i18n: { load: (lang, dict) => locales.push({ lang, dict }) },
        on: (event, fn) => { listeners[event] = fn; },
    });
    for (const [key, value] of Object.entries(saved)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
    }
    const handler = (url) => new (routes.get(url).HandlerClass)();
    return {
        collection, routes, listeners, nav, locales, limits, recordQueries, stub, handler,
        // Renders /mistakes and returns the CSRF token it embedded, the way a
        // real client obtains one.
        csrf: async () => {
            const page = handler('/mistakes');
            await page.get('system');
            const match = /window\.__SWPU_CSRF__="([0-9a-f]{64})"/.exec(String(page.response.body));
            if (!match) throw new Error('no CSRF token embedded in /mistakes');
            return match[1];
        },
    };
}

module.exports = { fixture };
