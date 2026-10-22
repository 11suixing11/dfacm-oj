'use strict';

const assert = require('node:assert/strict');
const { test, after } = require('node:test');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');
const esbuild = require('esbuild');
const { validateAnswer, sourceLines } = require('../protocol.cjs');
const { request, answer, STATEMENT, SOURCE, CE_SOURCE, CE_LOG, ceAnswer } = require('./fixtures.cjs');
const { render } = require('./render.cjs');
const framework = require('./hydro-runtime.cjs');

const testDirectories = [];
after(async () => {
    for (const directory of testDirectories) {
        assert.equal(path.dirname(directory), path.resolve(os.tmpdir()));
        assert.ok(path.basename(directory).startsWith('dfacm-account-handlers-'));
        await fs.rm(directory, { recursive: true, force: true });
    }
});

const compiled = esbuild.buildSync({ entryPoints: [path.resolve(__dirname, '../index.ts')], platform: 'node',
    format: 'cjs', bundle: true, write: false, external: ['hydrooj'],
    tsconfigRaw: { compilerOptions: { experimentalDecorators: true } } }).outputFiles[0].text;

async function fixture() {
    const routes = new Map(); const events = {}; const settings = []; const indexes = []; const calls = [];
    const pdoc = { docId: 1001, pid: 'P1001', title: '求和', content: STATEMENT, config: {} };
    const rdoc = { _id: '1234567890abcdef12345678', uid: 42, domainId: 'main', pid: 1001, lang: 'cpp', status: 2, code: SOURCE };
    const memory = require('./fake-collection.cjs').memoryCollection();
    const accounts = require('./fake-collection.cjs').memoryCollection();
    const services = {}; const menus = [];
    const state = { enabled: true, visible: true, apiKey: 'fixture-key' };
    const session = {};
    const stub = {
        Context: class {}, ObjectId: class { constructor(value) { this.value = value; } toString() { return this.value; } },
        PERM: { PERM_VIEW_PROBLEM_SOLUTION: 'solution', PERM_VIEW_PROBLEM_SOLUTION_ACCEPT: 'after-ac' },
        PRIV: { PRIV_USER_PROFILE: 8 }, Types: { ...framework.Types },
        Handler: class {
            constructor() {
                this.args = { domainId: 'main', pid: 'P1001', rid: rdoc._id };
                this.session = session; this.request = { json: false, body: {}, query: {}, headers: {} }; this.UiContext = {};
                this.user = { _id: 42, hasPerm: () => true, hasPriv: () => true };
                this.response = { body: {}, headers: {}, addHeader: (key, value) => { this.response.headers[key] = value; } };
            }
            async limitRate(...args) { calls.push(args); }
            url(name) { return name === 'dfacm_assistant_problem' ? '/p/P1001/assistant' : name === 'dfacm_ai_config' ? '/home/ai/config'
                : name === 'dfacm_ai_settings' ? '/home/ai' : `/record/${rdoc._id}/assistant`; }
            async renderHTML(_name, data) { return render({ answer: data.answer, source: data.source, verdict: data.verdict, diagnostic: data.diagnostic }); }
        },
        param: framework.param, post: framework.post,
        ProblemModel: { get: async () => pdoc, canViewBy: () => state.visible, getStatus: async () => ({ status: 2 }) },
        RecordModel: { get: async () => rdoc, getMulti: () => ({ sort() { return this; }, limit() { return this; }, toArray: async () => [rdoc] }) },
        ContestModel: { get: async () => ({ ended: true }), isDone: () => true },
        db: { collection: name => name === 'dfacm_ai_accounts' ? accounts : memory, ensureIndexes: async (...args) => indexes.push(args) },
        SystemModel: { get: (key) => ({ 'dfacm_assistant.enabled': state.enabled, 'dfacm_assistant.api_key': state.apiKey })[key] },
        SettingModel: { FLAG_SECRET: 4, Setting: (...args) => ({ key: args[1], type: args[3], flag: args[6] }), SystemSetting: (...args) => settings.push(...args) },
    };
    stub.Types.ObjectId = [(value) => new stub.ObjectId(value), (value) => /^[a-f0-9]{24}$/i.test(value)];
    const plugin = new Module(path.resolve(__dirname, '../compiled-test.cjs'), module);
    plugin.filename = path.resolve(__dirname, '../compiled-test.cjs'); plugin.paths = module.paths;
    plugin.require = (id) => id === 'hydrooj' ? stub : require(id);
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'dfacm-account-handlers-'));
    testDirectories.push(directory);
    const originalKeyFile = process.env.DFACM_AI_KEY_FILE;
    process.env.DFACM_AI_KEY_FILE = path.join(directory, 'account.key');
    try { plugin._compile(compiled, plugin.filename); }
    finally {
        if (originalKeyFile === undefined) delete process.env.DFACM_AI_KEY_FILE;
        else process.env.DFACM_AI_KEY_FILE = originalKeyFile;
    }
    await plugin.exports.apply({
        Route: (name, url, Handler, priv) => routes.set(name, { url, Handler, priv }),
        on: (event, callback) => { events[event] = callback; }, effect: (fn) => fn(), i18n: { load() {} },
        provide(name, service) { services[name] = service; }, injectUI(...args) { menus.push(args); },
    });
    return { routes, events, settings, indexes, calls, stub, pdoc, rdoc, state, session, memory, accounts, services, menus, directory };
}

test('Hydro routes enforce login; native settings mark key secret; shared jobs have TTL index', async () => {
    const f = await fixture();
    assert.equal(f.routes.size, 4);
    for (const route of f.routes.values()) assert.equal(route.priv, 8);
    const key = f.settings.find((setting) => setting.key === 'dfacm_assistant.api_key');
    assert.equal(key.type, 'password'); assert.equal(key.flag, 4);
    assert.equal(f.indexes[0][1].expireAfterSeconds, 0);
});

test('problem and record entries expose only same-origin endpoint and CSRF token', async () => {
    const f = await fixture(); const h = new f.stub.Handler();
    h.response.template = 'problem_detail.html'; h.response.body = { pdoc: f.pdoc };
    await f.events['handler/after/ProblemDetail#get'](h);
    assert.deepEqual(Object.keys(h.UiContext.dfacmAssistant).sort(), ['accountConfig', 'accountSettings', 'csrf', 'endpoint', 'page', 'userScope']);
    assert.equal(h.UiContext.dfacmAssistant.accountConfig, '/home/ai/config');
    assert.equal(h.UiContext.dfacmAssistant.userScope, 'main:42');
    assert.equal(h.UiContext.dfacmAssistant.csrf.length, 64);
    assert.ok(!JSON.stringify(h.UiContext).includes('fixture-key'));
    assert.equal(h.response.headers['Cache-Control'], 'private, no-store');
    const r = new f.stub.Handler(); r.response.template = 'record_detail.html'; r.response.body = { rdoc: f.rdoc };
    await f.events['handler/after/RecordDetail#get'](r);
    assert.equal(r.UiContext.dfacmAssistant.page, 'record');
    r.UiContext = {}; f.rdoc.uid = 41; await f.events['handler/after/RecordDetail#get'](r);
    assert.equal(r.UiContext.dfacmAssistant, undefined);
});

test('JSON requests, contest problem pages, hidden problems and disabled plugin do not inject buttons', async () => {
    for (const scenario of ['json', 'contest', 'hidden', 'disabled']) {
        const f = await fixture(); const h = new f.stub.Handler();
        h.response.template = 'problem_detail.html'; h.response.body = { pdoc: f.pdoc };
        if (scenario === 'json') h.request.json = true;
        if (scenario === 'contest') h.args.tid = 'contest';
        if (scenario === 'hidden') f.state.visible = false;
        if (scenario === 'disabled') f.state.enabled = false;
        await f.events['handler/after/ProblemDetail#get'](h);
        assert.equal(h.UiContext.dfacmAssistant, undefined);
    }
});

test('CSRF rejection happens before any billable model call', async () => {
    const f = await fixture(); const route = f.routes.get('dfacm_assistant_problem'); const h = new route.Handler();
    h.request.body = { mode: 'solve', csrf: 'wrong-token' };
    await h.post({ ...h.args, ...h.request.body });
    assert.equal(h.response.status, 403); assert.equal(h.response.body.code, 'CSRF');
    assert.equal(f.calls.length, 0);
});

async function saveAccount(f, input = {}, revision = '') {
    const handler = new (f.routes.get('dfacm_ai_config').Handler)();
    await handler.get();
    handler.request.body = { action: 'save', csrf: handler.response.body.csrf, revision,
        provider: 'custom', base_url: 'https://model.example.com/v1', model: 'saved-model', ...input };
    if (input.apiKey !== '') handler.request.headers['x-dfacm-ai-key'] = input.apiKey || 'saved-account-key';
    delete handler.request.body.apiKey;
    await handler.post({ ...handler.args, ...handler.request.body });
    assert.equal(handler.response.body.ok, true);
    return handler.response.body.config;
}

test('native account settings preserve ordinary settings and inject no credentials', async () => {
    const f = await fixture(); const h = new f.stub.Handler();
    h.response.template = 'home_settings.html'; h.response.body = { category: 'account', ordinary: 'preserved' };
    await f.events['handler/after/HomeSettings#get'](h);
    assert.equal(h.response.template, 'dfacm_ai_account_settings.html');
    assert.equal(h.response.body.ordinary, 'preserved');
    assert.deepEqual(Object.keys(h.UiContext.dfacmAiSettings).sort(), ['csrf', 'endpoint', 'legacyScope', 'uid']);
    assert.equal(h.UiContext.dfacmAiSettings.uid, 42); assert.equal(h.UiContext.dfacmAiSettings.legacyScope, 'main:42');
    assert.ok(!JSON.stringify(h.UiContext).includes('fixture-key'));
    assert.equal(f.menus[0][0], 'UserDropdown'); assert.equal(f.menus[0][1], 'dfacm_ai_settings');
    const template = await fs.readFile(path.resolve(__dirname, '../templates/dfacm_ai_account_settings.html'), 'utf8');
    assert.match(template, /extends "home_settings.html"/); assert.match(template, /super\(\)/);
    for (const scenario of ['preference', 'json', 'sudo', 'guest']) {
        const other = new f.stub.Handler(); other.response.template = 'home_settings.html'; other.response.body = { category: 'account' };
        if (scenario === 'preference') other.response.body.category = 'preference';
        if (scenario === 'json') other.request.json = true;
        if (scenario === 'sudo') other.session = { sudoUid: 42 };
        if (scenario === 'guest') other.user._id = 1;
        await f.events['handler/after/HomeSettings#get'](other);
        assert.equal(other.response.template, 'home_settings.html'); assert.equal(other.UiContext.dfacmAiSettings, undefined);
    }
});

test('both native generation routes require an account configuration and reject credential overrides', async () => {
    const f = await fixture(); const entry = new f.stub.Handler();
    entry.response.template = 'problem_detail.html'; entry.response.body = { pdoc: f.pdoc };
    await f.events['handler/after/ProblemDetail#get'](entry);
    for (const name of ['dfacm_assistant_problem', 'dfacm_assistant_record']) {
        const Handler = f.routes.get(name).Handler; const h = new Handler();
        h.request.body = { mode: name.includes('record') ? 'debug' : 'solve', csrf: entry.UiContext.dfacmAssistant.csrf };
        await h.post({ ...h.args, ...h.request.body }); assert.equal(h.response.body.code, 'AI_NOT_CONFIGURED');
        h.request.body.provider = 'account'; h.request.headers['x-dfacm-assistant-key'] = 'override-key';
        await h.post({ ...h.args, ...h.request.body }); assert.equal(h.response.body.code, 'INVALID_PROVIDER');
        assert.equal(h.request.headers['x-dfacm-assistant-key'], undefined);
    }
    assert.equal(f.calls.length, 0); assert.equal(f.memory.docs.size, 0);
});

test('shared account resolver follows global UID across domains and refuses guest or impersonated identity', async () => {
    const f = await fixture(); await saveAccount(f);
    const h = new f.stub.Handler(); h.args = { domainId: 'other-domain', uid: 43 };
    assert.equal((await f.services.dfacmAi.getModelConfig(h)).apiKey, 'saved-account-key');
    h.user._id = 43; await assert.rejects(f.services.dfacmAi.getModelConfig(h), { code: 'AI_NOT_CONFIGURED' });
    h.user._id = 1; await assert.rejects(f.services.dfacmAi.getModelConfig(h), { code: 'AI_ACCOUNT_REQUIRED' });
    h.user._id = 42; h.session.sudoUid = 43;
    assert.throws(() => f.services.dfacmAi.getModelConfig(h), { code: 'AI_ACCOUNT_REQUIRED' });
});

test('saved account config supplies both generation routes and latest model without request keys or stored secrets', async () => {
    const https = require('node:https'); const { EventEmitter } = require('node:events');
    const original = https.request; const calls = [];
    https.request = (url, options, receive) => {
        const req = new EventEmitter(); req.end = body => {
            const sent = JSON.parse(body); const input = JSON.parse(sent.messages[1].content);
            calls.push({ url: url.href, headers: options.headers, sent, input });
            const raw = answer(input.mode);
            if (input.mode === 'debug') { raw.issues = []; raw.counterexamples = []; raw.changes = []; }
            queueMicrotask(() => {
                const res = new EventEmitter(); res.statusCode = 200; res.destroy = () => {}; receive(res);
                res.emit('data', Buffer.from(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(raw) } }] }))); res.emit('end');
            });
        }; return req;
    };
    try {
        const f = await fixture(); f.state.apiKey = '';
        let settings = await saveAccount(f);
        const entry = new f.stub.Handler(); entry.response.template = 'problem_detail.html'; entry.response.body = { pdoc: f.pdoc };
        await f.events['handler/after/ProblemDetail#get'](entry);
        for (const [index, name] of ['dfacm_assistant_problem', 'dfacm_assistant_record', 'dfacm_assistant_problem'].entries()) {
            if (index === 2) settings = await saveAccount(f, { model: 'updated-account-model', apiKey: '' }, settings.revision);
            const Handler = f.routes.get(name).Handler; const h = new Handler();
            h.request.body = { mode: name.includes('record') ? 'debug' : 'solve', csrf: entry.UiContext.dfacmAssistant.csrf, provider: 'account' };
            await h.post({ ...h.args, ...h.request.body }); assert.equal(h.response.body.ok, true);
            await new Promise(resolve => setImmediate(resolve));
            const poll = new Handler(); await poll.get({ ...poll.args, job: h.response.body.job.id });
            assert.equal(poll.response.body.job.status, 'ready');
            assert.equal(calls[index].headers.Authorization, 'Bearer saved-account-key');
            assert.equal(calls[index].sent.model, index === 2 ? 'updated-account-model' : 'saved-model');
            for (const value of [h.request, poll.response.body, calls[index].input, [...f.memory.docs.values()], [...f.accounts.docs.values()]]) {
                assert.ok(!JSON.stringify(value).includes('saved-account-key'));
            }
        }
        assert.equal(calls[1].input.submission.code, SOURCE);
    } finally { https.request = original; }
});

test('native HTTP decorators preserve help levels and actual CE evidence through render and polling', async () => {
    const https = require('node:https'); const { EventEmitter } = require('node:events'); const original = https.request; const inputs = [];
    https.request = (_url, _options, receive) => {
        const req = new EventEmitter(); req.end = body => {
            const input = JSON.parse(JSON.parse(body).messages[1].content); inputs.push(input);
            const raw = input.mode === 'debug' ? ceAnswer() : answer('solve', input.level);
            queueMicrotask(() => {
                const res = new EventEmitter(); res.statusCode = 200; res.destroy = () => {}; receive(res);
                res.emit('data', Buffer.from(JSON.stringify({ usage: { prompt_tokens: 9, completion_tokens: 3 }, choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(raw) } }] }))); res.emit('end');
            });
        }; return req;
    };
    try {
        const f = await fixture(); await saveAccount(f);
        const page = new f.stub.Handler(); page.response.template = 'problem_detail.html'; page.response.body = { pdoc: f.pdoc }; await f.events['handler/after/ProblemDetail#get'](page);
        const csrf = page.UiContext.dfacmAssistant.csrf; f.rdoc.code = CE_SOURCE; f.rdoc.status = 7; f.rdoc.compilerTexts = [CE_LOG];
        for (const [name, extra] of [
            ['dfacm_assistant_problem', { mode: 'solve', level: 'hint' }],
            ['dfacm_assistant_problem', { mode: 'solve', level: 'approach' }],
            ['dfacm_assistant_problem', { mode: 'debug', code: CE_SOURCE, verdict: 'CE', compiler_output: CE_LOG }],
            ['dfacm_assistant_record', { mode: 'debug', verdict: 'WA', compiler_output: 'forged compiler evidence' }],
        ]) {
            const Handler = f.routes.get(name).Handler; const h = new Handler(); h.request.body = { csrf, provider: 'account', ...extra };
            await h.post({ ...h.args, ...h.request.body }); assert.equal(h.response.body.ok, true); await new Promise(resolve => setImmediate(resolve));
            const poll = new Handler(); await poll.get({ ...poll.args, job: h.response.body.job.id }); const job = poll.response.body.job;
            assert.equal(job.status, 'ready'); assert.deepEqual(job.usage, { inputTokens: 9, outputTokens: 3, totalTokens: 12, cachedInputTokens: null });
            if (extra.mode === 'solve') { assert.equal(job.level, extra.level); assert.equal(job.answer.code, ''); assert.ok(!job.html.includes('data-solution-code')); }
            else { assert.equal(job.verdict, 'CE'); assert.equal(job.diagnostic.hasCompilerOutput, true); assert.ok(job.html.includes('已结合编译日志')); }
        }
        assert.equal(inputs[2].submission.origin, 'manual'); assert.equal(inputs[3].submission.origin, 'record');
        assert.equal(inputs[3].submission.compilerOutput, CE_LOG); assert.ok(!JSON.stringify(inputs).includes('forged compiler evidence'));
        const invalid = new (f.routes.get('dfacm_assistant_problem').Handler)(); invalid.request.body = { csrf, provider: 'account', mode: 'solve', level: 'wrong' };
        await invalid.post({ ...invalid.args, ...invalid.request.body }); assert.equal(invalid.response.body.code, 'INVALID_LEVEL'); assert.equal(inputs.length, 4);
    } finally { https.request = original; }
});

test('posted job resolves through model and rendered HTML without saving solution files', async () => {
    const f = await fixture(); const page = new f.stub.Handler();
    page.response.template = 'problem_detail.html'; page.response.body = { pdoc: f.pdoc };
    await f.events['handler/after/ProblemDetail#get'](page);
    const token = page.UiContext.dfacmAssistant.csrf;
    const savedFetch = globalThis.fetch;
    const sent = [];
    globalThis.fetch = async (_url, options) => { sent.push(JSON.parse(options.body)); return new Response(JSON.stringify({
        choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(answer()) } }],
    })); };
    try {
        // Client captures fetch when the module is loaded, so this fixture must
        // be created after replacing it.
        const live = await fixture(); const entry = new live.stub.Handler();
        entry.response.template = 'problem_detail.html'; entry.response.body = { pdoc: live.pdoc };
        await live.events['handler/after/ProblemDetail#get'](entry);
        const Handler = live.routes.get('dfacm_assistant_problem').Handler;
        const post = new Handler(); post.request.body = { mode: 'solve', csrf: entry.UiContext.dfacmAssistant.csrf, provider: 'site' };
        await post.post({ ...post.args, ...post.request.body });
        assert.equal(post.response.body.ok, true);
        const job = post.response.body.job;
        await new Promise((resolve) => setImmediate(resolve));
        const get = new Handler(); await get.get({ ...get.args, job: job.id });
        assert.equal(get.response.body.job.status, 'ready');
        assert.match(get.response.body.job.html, /题目大意/);
        assert.match(get.response.body.job.html, /long long sum/);
        assert.equal(sent[0].model, 'gpt-5.6-sol');
        assert.equal(JSON.parse(sent[0].messages[1].content).problem.statement, STATEMENT);
        assert.equal(get.response.headers['Cache-Control'], 'no-store');
        assert.ok(live.calls.some((args) => args[0] === 'dfacm_assistant_user'));
    } finally { globalThis.fetch = savedFetch; }
    assert.equal(token.length, 64);
});

test('native Hydro decorators preserve pasted whitespace and record-page diagnosis uses original source', async () => {
    const savedFetch = globalThis.fetch; const sent = [];
    globalThis.fetch = async (_url, options) => {
        const body = JSON.parse(options.body); sent.push(JSON.parse(body.messages[1].content));
        const result = answer('debug'); result.issues = []; result.counterexamples = []; result.changes = [];
        result.code = ''; result.summary = '当前代码未定位到可证缺陷，需要失败输入进一步诊断。';
        return new Response(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(result) } }] }));
    };
    try {
        const f = await fixture(); const entry = new f.stub.Handler();
        entry.response.template = 'problem_detail.html'; entry.response.body = { pdoc: f.pdoc };
        await f.events['handler/after/ProblemDetail#get'](entry);
        const Problem = f.routes.get('dfacm_assistant_problem').Handler;
        const manual = new Problem(); const code = '\n  // original header\n\nint main() {}\n';
        manual.request.body = { mode: 'debug', csrf: entry.UiContext.dfacmAssistant.csrf, code, verdict: 'CE', provider: 'site' };
        await manual.post({ ...manual.args, ...manual.request.body });
        assert.equal(manual.response.body.ok, true);
        await new Promise((resolve) => setImmediate(resolve));
        assert.equal(sent[0].submission.code, code);
        assert.deepEqual(sent[0].submission.sourceLines[0], { line: 1, text: '' });
        assert.equal(sent[0].submission.verdict, 'CE');
        const Record = f.routes.get('dfacm_assistant_record').Handler;
        const record = new Record(); record.request.body = { mode: 'debug', csrf: entry.UiContext.dfacmAssistant.csrf, provider: 'site' };
        await record.post({ ...record.args, ...record.request.body });
        assert.equal(record.response.body.ok, true);
        await new Promise((resolve) => setImmediate(resolve));
        assert.equal(sent[1].submission.code, SOURCE);
        const poll = new Record(); await poll.get({ ...poll.args, job: record.response.body.job.id });
        assert.equal(poll.response.body.job.status, 'ready');
        assert.deepEqual(poll.response.body.job.answer.issues, []);
    } finally { globalThis.fetch = savedFetch; }
});

test('personal config on both routes rejects missing keys without using site credentials or storing headers', async () => {
    const f = await fixture(); const entry = new f.stub.Handler();
    entry.response.template = 'problem_detail.html'; entry.response.body = { pdoc: f.pdoc };
    await f.events['handler/after/ProblemDetail#get'](entry);
    for (const name of ['dfacm_assistant_problem', 'dfacm_assistant_record']) {
        const Handler = f.routes.get(name).Handler;
        const h = new Handler();
        h.request.body = { mode: name.includes('record') ? 'debug' : 'solve', csrf: entry.UiContext.dfacmAssistant.csrf,
            provider: 'custom', base_url: 'https://model.example.com/v1', model: 'my-model' };
        await h.post({ ...h.args, ...h.request.body });
        assert.equal(h.response.status, 400);
        assert.equal(h.response.body.code, 'INVALID_PROVIDER');
    }
    assert.equal(f.calls.length, 0);
    assert.equal(f.memory.docs.size, 0);
    const Handler = f.routes.get('dfacm_assistant_problem').Handler;
    const bad = new Handler();
    bad.request.headers['x-dfacm-assistant-key'] = 'private-personal-key';
    bad.request.body = { mode: 'solve', csrf: 'expired', provider: 'custom', base_url: 'https://model.example.com/v1', model: 'custom' };
    await bad.post({ ...bad.args, ...bad.request.body });
    assert.equal(bad.response.body.code, 'CSRF');
    assert.equal(bad.request.headers['x-dfacm-assistant-key'], undefined);
    assert.ok(!JSON.stringify(bad.response.body).includes('private-personal-key'));
});

test('personal keys reach the custom model on both native routes while the site has no key', async () => {
    const https = require('node:https'); const { EventEmitter } = require('node:events');
    const originalRequest = https.request; const calls = [];
    https.request = (url, options, receive) => {
        const req = new EventEmitter();
        req.end = body => {
            const sent = JSON.parse(body); const input = JSON.parse(sent.messages[1].content);
            calls.push({ url: url.href, headers: options.headers, sent, input });
            const raw = answer(input.mode);
            if (input.mode === 'debug') { raw.issues = []; raw.counterexamples = []; raw.changes = []; }
            queueMicrotask(() => {
                const res = new EventEmitter(); res.statusCode = 200; res.destroy = () => {};
                receive(res);
                res.emit('data', Buffer.from(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(raw) } }] })));
                res.emit('end');
            });
        };
        return req;
    };
    try {
        const f = await fixture(); f.state.apiKey = '';
        const entry = new f.stub.Handler(); entry.response.template = 'problem_detail.html'; entry.response.body = { pdoc: f.pdoc };
        await f.events['handler/after/ProblemDetail#get'](entry);
        for (const [index, name] of ['dfacm_assistant_problem', 'dfacm_assistant_record'].entries()) {
            const Handler = f.routes.get(name).Handler; const h = new Handler();
            h.request.headers['x-dfacm-assistant-key'] = 'personal-route-key';
            h.request.body = { mode: index === 0 ? 'solve' : 'debug', csrf: entry.UiContext.dfacmAssistant.csrf,
                provider: 'custom', base_url: 'https://model.example.com/v1/chat/completions', model: 'chosen-model' };
            await h.post({ ...h.args, ...h.request.body });
            assert.equal(h.response.body.ok, true);
            await new Promise(resolve => setImmediate(resolve));
            const poll = new Handler(); await poll.get({ ...poll.args, job: h.response.body.job.id });
            assert.equal(poll.response.body.job.status, 'ready');
            assert.equal(calls[index].url, 'https://model.example.com/v1/chat/completions');
            assert.equal(calls[index].headers.Authorization, 'Bearer personal-route-key');
            assert.equal(calls[index].sent.model, 'chosen-model');
            assert.equal(h.request.headers['x-dfacm-assistant-key'], undefined);
            assert.ok(!JSON.stringify(calls[index].input).includes('personal-route-key'));
            assert.ok(!JSON.stringify(poll.response.body).includes('personal-route-key'));
        }
        assert.equal(calls[1].input.submission.code, SOURCE);
        assert.ok(!JSON.stringify([...f.memory.docs.values()]).includes('personal-route-key'));
    } finally { https.request = originalRequest; }
});

test('both native routes send personal and saved-account AgentRouter keys only to the isolated Codex client', async context => {
    const fs = require('node:fs/promises'); const os = require('node:os');
    const { PassThrough } = require('node:stream'); const { EventEmitter } = require('node:events');
    const childProcess = require('node:child_process'); const savedSpawn = childProcess.spawn;
    const savedRuntime = process.env.DFACM_ASSISTANT_CODEX_JS;
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'dfacm-route-runtime-'));
    context.after(async () => {
        assert.equal(path.dirname(directory), path.resolve(os.tmpdir()));
        assert.ok(path.basename(directory).startsWith('dfacm-route-runtime-'));
        await fs.rm(directory, { recursive: true, force: true });
    });
    await fs.mkdir(path.join(directory, 'bin'));
    await fs.writeFile(path.join(directory, 'package.json'), '{"name":"@openai/codex","version":"0.163.0"}');
    await fs.writeFile(path.join(directory, 'bin/codex.js'), '');
    process.env.DFACM_ASSISTANT_CODEX_JS = path.join(directory, 'bin/codex.js');
    const calls = [];
    childProcess.spawn = (command, args, options) => {
        const child = new EventEmitter();
        child.stdin = new PassThrough(); child.stdout = new PassThrough(); child.stderr = new PassThrough(); child.kill = () => {};
        let input = '';
        child.stdin.on('data', chunk => { input += chunk; });
        child.stdin.on('finish', () => {
            const parsed = JSON.parse(input); calls.push({ command, args, options, input: parsed });
            child.stdout.write(JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', text: JSON.stringify(answer(parsed.mode)) } }) + '\n');
            child.stdout.write('{"type":"turn.completed"}\n'); child.emit('close', 0);
        });
        return child;
    };
    try {
        const f = await fixture(); f.state.apiKey = '';
        await saveAccount(f, { provider: 'agentrouter', model: 'gpt-5.6-sol', apiKey: 'agentrouter-account-fixture-key' });
        const entry = new f.stub.Handler(); entry.response.template = 'problem_detail.html'; entry.response.body = { pdoc: f.pdoc };
        await f.events['handler/after/ProblemDetail#get'](entry);
        for (const [index, name] of ['dfacm_assistant_problem', 'dfacm_assistant_record', 'dfacm_assistant_problem', 'dfacm_assistant_record'].entries()) {
            const Handler = f.routes.get(name).Handler; const h = new Handler();
            if (index < 2) h.request.headers['x-dfacm-assistant-key'] = 'agentrouter-native-fixture-key';
            h.request.body = { mode: index % 2 === 0 ? 'solve' : 'debug', csrf: entry.UiContext.dfacmAssistant.csrf,
                provider: index < 2 ? 'agentrouter' : 'account', ...(index < 2 ? { model: 'gpt-5.6-sol' } : {}) };
            await h.post({ ...h.args, ...h.request.body });
            assert.equal(h.response.body.ok, true);
            let poll;
            for (let retry = 0; retry < 100; retry++) {
                await new Promise(resolve => setTimeout(resolve, 10));
                poll = new Handler(); await poll.get({ ...poll.args, job: h.response.body.job.id });
                if (poll.response.body.job.status !== 'pending') break;
            }
            assert.equal(poll.response.body.job.status, 'ready');
            const secret = index < 2 ? 'agentrouter-native-fixture-key' : 'agentrouter-account-fixture-key';
            assert.equal(calls[index].options.env.CODEX_GATEWAY_API_KEY, secret);
            assert.ok(calls[index].args.includes('model_providers.AgentRouter.wire_api="responses"'));
            assert.ok(!JSON.stringify(calls[index].args).includes(secret));
            assert.ok(!JSON.stringify(calls[index].input).includes(secret));
            assert.equal(h.request.headers['x-dfacm-assistant-key'], undefined);
            assert.ok(!JSON.stringify(poll.response.body).includes(secret));
        }
        assert.equal(calls[1].input.submission.code, SOURCE);
        assert.equal(calls[1].input.submission.sourceLines[5].text, '    int sum = 0;');
        assert.ok(!JSON.stringify([...f.memory.docs.values()]).includes('agentrouter-native-fixture-key'));
        assert.ok(!JSON.stringify([...f.memory.docs.values()]).includes('agentrouter-account-fixture-key'));
        assert.ok(!JSON.stringify([...f.accounts.docs.values()]).includes('agentrouter-account-fixture-key'));
    } finally {
        childProcess.spawn = savedSpawn;
        if (savedRuntime === undefined) delete process.env.DFACM_ASSISTANT_CODEX_JS;
        else process.env.DFACM_ASSISTANT_CODEX_JS = savedRuntime;
    }
});
