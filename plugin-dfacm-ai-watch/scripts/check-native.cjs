'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const { randomBytes } = require('node:crypto');

// Run through `hydrooj cli execute`. All fixture writes use random, isolated
// collections. No real contest, submission, assistant job or user is modified.
module.exports = async function checkNative(api, root, phase = 'staged') {
    const parent = path.dirname(require.resolve('hydrooj/package.json', { paths: [root] }));
    const esbuild = require(path.join(path.dirname(parent), 'esbuild'));
    const checkDomain = process.env.AI_WATCH_CHECK_DOMAIN || 'system';
    const checkProblem = process.env.AI_WATCH_CHECK_PROBLEM || 'P1000';
    const checkAdmin = Number(process.env.AI_WATCH_CHECK_ADMIN_UID || 2);
    assert.ok(Number.isSafeInteger(checkAdmin) && checkAdmin > 0, 'Invalid verification administrator UID');
    const pdoc = await api.ProblemModel.get(checkDomain, checkProblem);
    const user = await api.UserModel.getById(checkDomain, checkAdmin);
    assert.ok(pdoc && pdoc.docId > 0, 'Configured verification problem is unavailable');
    assert.ok(user?.hasPriv(api.PRIV.PRIV_MANAGE_ALL_DOMAIN), 'Configured verification administrator is unavailable');
    const fixtureProblemModel = { get: (_domain, pid) => api.ProblemModel.get(checkDomain, pid) };
    const prefix = `dfacm_ai_watch_qa_${randomBytes(8).toString('hex')}_`;
    const fixtures = Object.fromEntries(['reports', 'sources', 'state', 'records', 'jobs'].map(name => [name, api.db.collection(prefix + name)]));
    const collections = { dfacm_ai_watch_reports: fixtures.reports, dfacm_ai_watch_sources: fixtures.sources,
        dfacm_ai_watch_state: fixtures.state, dfacm_assistant_jobs: fixtures.jobs };
    const routes = []; const menus = []; const hooks = []; const effects = [];
    const fakeDb = {
        collection(name) { assert.ok(collections[name], 'Unexpected collection'); return collections[name]; },
        async ensureIndexes(collection, ...indexes) { await collection.createIndexes(indexes.map(item => ({ ...item }))); },
    };
    let engine;
    try {
        const compiled = esbuild.buildSync({ entryPoints: [path.join(root, 'index.ts')], bundle: true,
            format: 'cjs', platform: 'node', write: false, external: ['hydrooj'] }).outputFiles[0].text;
        const runtime = new Module(path.join(root, 'native-entry.cjs'), module); runtime.filename = path.join(root, 'native-entry.cjs');
        runtime.paths = Module._nodeModulePaths(root); const originalRequire = runtime.require.bind(runtime);
        runtime.require = name => name === 'hydrooj' ? { ...api, db: fakeDb, RecordModel: { coll: fixtures.records }, ProblemModel: fixtureProblemModel } : originalRequire(name);
        runtime._compile(compiled, runtime.filename);
        const envKeys = ['ENABLED', 'DOMAINS', 'SCOPE', 'CONTESTS', 'RETENTION_DAYS', 'INTERVAL_MS', 'BATCH_SIZE'].map(name => 'DFACM_AI_WATCH_' + name);
        const savedEnv = Object.fromEntries(envKeys.map(key => [key, process.env[key]]));
        try {
            envKeys.forEach(key => delete process.env[key]);
            await runtime.exports.apply({ Route: (...args) => routes.push(args), injectUI: (...args) => menus.push(args),
                on: (...args) => hooks.push(args), effect: callback => effects.push(callback), i18n: { load() {} } });
        } finally { for (const [key, value] of Object.entries(savedEnv)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } }
        assert.equal(routes.length, 4); assert.equal(menus[0][0], 'ControlPanel');
        assert.ok(routes.every(route => route[3] === api.PRIV.PRIV_MANAGE_ALL_DOMAIN));
        // CLI validation must not launch a second collector against live data.
        assert.equal(effects.length, 0); assert.equal(hooks.length, 0);

        const { configFromEnv, listFilters } = require(path.join(root, 'config.cjs'));
        const { createMongoStore } = require(path.join(root, 'store.cjs'));
        const { createEngine } = require(path.join(root, 'engine.cjs'));
        const { GENERATED_CODE } = require(path.join(root, 'demo.cjs'));
        const config = configFromEnv({});
        const makeStore = () => createMongoStore({ ...fixtures, config, problemModel: fixtureProblemModel, objectId: id => new api.ObjectId(id) });
        const store = makeStore(); engine = createEngine({ store, config });
        const at = Date.now(); const idAt = delta => new api.ObjectId(Math.floor((at + delta) / 1000).toString(16).padStart(8, '0') + randomBytes(8).toString('hex'));
        const contest = idAt(-86400000); const record = { _id: idAt(-1000), domainId: 'system', uid: user._id,
            pid: pdoc.docId, code: GENERATED_CODE, lang: 'cc.cc17o2', status: 20, contest };
        await fixtures.jobs.insertOne({ _id: randomBytes(16).toString('hex'), type: 'job', status: 'ready',
            scope: `system:${user._id}`, target: `p:${pdoc.pid || pdoc.docId}`, completedAt: new Date(at - 60000), expireAt: new Date(at + 600000),
            answer: { mode: 'solve', status: 'ok', level: 'solution', code: GENERATED_CODE } });
        await fixtures.records.insertOne(record); engine.enqueue(record); await engine.tick();
        const rid = String(record._id); let report = await store.get('system', rid);
        assert.equal(report.state, 'ready'); assert.equal(report.analysis.priority, 'high'); assert.equal(report.analysis.conclusion, 'undetermined');
        const evidence = await store.evidence('system', rid); assert.equal(evidence.evidence.code, evidence.evidence.assistant.code);
        assert.equal((await store.list('system', listFilters())).stats.total, 1);
        assert.equal(await store.ensureRecord(record), false);
        await store.review('system', rid, { status: 'cleared', note: '部署验收模拟证据', revision: 0, reviewer: user._id });
        await assert.rejects(store.review('system', rid, { status: 'escalated', note: '部署验收冲突', revision: 0, reviewer: user._id }), { status: 409 });
        await fixtures.records.updateOne({ _id: record._id }, { $set: { status: 1 } });
        engine.enqueue({ ...record, status: 1 }); await engine.tick(); report = await store.get('system', rid);
        assert.equal(report.verdict, 1); assert.equal(report.review.status, 'cleared'); assert.equal(report.reviewHistory.length, 1);
        const second = { ...record, _id: idAt(0) }; await fixtures.records.insertOne(second); await store.ensureRecord(second);
        const pending = await store.get('system', String(second._id)); const rival = makeStore();
        const leases = await Promise.all([store.claim(pending), rival.claim(pending)]); assert.equal(leases.filter(Boolean).length, 1);
        await assert.rejects(store.evidence('other', rid), { status: 404 });

        const session = {}; const routeMap = Object.fromEntries(routes.map(route => [route[0], route[1]]));
        function handlerFor(Type, identity = user) {
            const response = { body: {}, headers: {}, addHeader(key, value) { this.headers[key] = value; } };
            const handler = Object.assign(Object.create(Type.prototype), { user: identity, session,
                domain: { _id: 'system', name: 'Hydro OJ', ui: {} }, args: { domainId: 'system', rid, __start: Date.now() },
                response, request: { query: {}, body: {}, host: 'oj.example.org', path: '/manage/ai-watch', headers: { 'user-agent': 'release-template-fixture' } }, UiContext: {},
                async limitRate() {}, translate: text => text, renderTitle: () => 'AI 作答线索审核' });
            handler.url = (name, args = {}) => routeMap[name] ? routeMap[name].replace(/:([a-z]+)/g, (_match, key) => encodeURIComponent(args[key]))
                : api.Handler.prototype.url.call(handler, name, { domainId: 'system', ...args });
            return handler;
        }
        const Page = routes.find(route => route[0] === 'dfacm_ai_watch')[2]; const Detail = routes.find(route => route[0] === 'dfacm_ai_watch_report')[2];
        const page = handlerFor(Page); await page.get(); assert.equal(page.response.template, 'dfacm_ai_watch.html');
        for (const [, , Type] of routes) {
            const denied = handlerFor(Type, { _id: 999, hasPriv: () => false }); await denied.get(); assert.equal(denied.response.status, 403);
        }
        const badPost = handlerFor(Detail); badPost.request.body = { csrf: 'bad', status: 'pending', note: '', revision: 1 };
        await badPost.post(); assert.equal(badPost.response.status, 403);
        const goodPost = handlerFor(Detail); goodPost.request.body = { ...badPost.request.body, csrf: page.response.body.csrf };
        await goodPost.post(); assert.equal(goodPost.response.status, 200); assert.equal(goodPost.response.body.report.review.revision, 2);

        const uiPackage = path.join(path.dirname(parent), '@hydrooj/ui-default');
        const { TemplateService } = require(path.join(uiPackage, 'backendlib/template.ts'));
        const ctx = new api.Context(); let renderer;
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
        page.ctx = ctx; const html = await renderer.render(page.response.template, page.response.body,
            { handler: page, UserContext: user, _: page.translate, url: page.url });
        assert.ok(html.includes('id="ai-watch"')); assert.ok(html.includes('data-demo="false"'));
        assert.ok(html.includes('/manage/ai-watch/data')); assert.ok(html.includes('/manage/ai-watch/assets/watch-0.1.0.js'));
        assert.ok(!html.includes('Cannot get template'));
        fs.writeFileSync(path.join(root, `native-${phase}-ok.json`), JSON.stringify({ phase, nativeMongo: true, nativeTemplate: true,
            protectedHandlers: true, csrf: true, sourceMatch: true, reviewConflict: true, rejudge: true, leases: true }), { mode: 0o600 });
        console.log(`AI_WATCH_NATIVE_OK ${phase}: Hydro templates, real Mongo leases/source evidence, permissions and review verified.`);
    } finally {
        if (engine) { engine.stop(); await engine.idle(); }
        for (const collection of Object.values(fixtures)) {
            assert.ok(collection.collectionName.includes(prefix), 'Refusing to drop a non-fixture collection');
            await collection.drop().catch(error => { if (error.code !== 26 && error.codeName !== 'NamespaceNotFound') throw error; });
        }
    }
};
