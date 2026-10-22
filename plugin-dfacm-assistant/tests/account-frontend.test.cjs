'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { parseHTML } = require('linkedom');
const { mountAccountSettings } = require('../frontend/account-settings.js');
const { mountAssistant } = require('../frontend/panel.js');
const { publicAccount, localPath } = require('../frontend/account-view.js');
const { DEFAULT_BASE, DEFAULT_MODEL, ACCOUNT_KEY_HEADER } = require('../provider-config.cjs');

const csrf = 'b'.repeat(64);
const metadata = (overrides = {}) => ({ uid: 42, configured: false, hasKey: false, provider: 'agentrouter',
    baseUrl: DEFAULT_BASE, model: DEFAULT_MODEL, revision: '', updatedAt: null, ...overrides });
const saved = (overrides = {}) => metadata({ configured: true, hasKey: true, revision: 'a'.repeat(32),
    updatedAt: '2026-10-22T12:00:00.000Z', ...overrides });
const response = (config = metadata()) => ({ ok: true, json: async () => ({ ok: true, config, csrf }) });
function memory() {
    const values = new Map();
    return { values, getItem: name => values.get(name) || null, setItem: (name, value) => values.set(name, value), removeItem: name => values.delete(name) };
}
function fixture({ fetchImpl = async () => response(), storage, uid = 42 } = {}) {
    const { document, window } = parseHTML('<html><body><article>基础账户设置</article><div data-dfacm-ai-settings></div></body></html>');
    const config = { endpoint: '/home/ai/config', csrf, uid, legacyScope: `main:${uid}` };
    const root = mountAccountSettings({ document, config, fetchImpl, storage });
    return { document, window, root, config };
}
function event(f, node, type = 'click') { node.dispatchEvent(new f.window.Event(type, { bubbles: true, cancelable: true })); }
function choose(f, value) {
    const provider = f.root.querySelector('select');
    for (const option of provider.querySelectorAll('option')) option.selected = false;
    provider.querySelector(`option[value="${value}"]`).selected = true;
    event(f, provider, 'change');
}
function submit(f) { event(f, f.root.querySelector('form'), 'submit'); return f.root.task; }
function status(f) { return f.root.querySelector('[role=status]').textContent; }

test('account form loads metadata once and preserves native settings without storing or fetching credentials', async () => {
    const calls = []; const storage = memory();
    const f = fixture({ storage, fetchImpl: async (url, options) => { calls.push({ url, options }); return response(saved()); } });
    await f.root.task;
    assert.equal(f.document.querySelector('article').textContent, '基础账户设置'); assert.equal(calls.length, 1);
    assert.equal(calls[0].url, '/home/ai/config'); assert.equal(calls[0].options.method, undefined);
    assert.equal(calls[0].options.cache, 'no-store'); assert.equal(calls[0].options.credentials, 'same-origin');
    assert.deepEqual([...f.root.querySelectorAll('select option')].map(option => option.value), ['agentrouter', 'custom']);
    assert.equal(f.root.querySelector('a').href, 'https://agentrouter.org/register?aff=SeEq');
    assert.equal(f.root.querySelector('#dfacm-ai-api-key').value, ''); assert.match(status(f), /已保存/);
    assert.equal(storage.values.size, 0); assert.equal(mountAccountSettings({ document: f.document, config: f.config }), null);
});

test('saving a new key sends it only in the settings header and clears the field after success', async () => {
    const calls = []; const storage = memory();
    const f = fixture({ storage, fetchImpl: async (url, options) => { calls.push({ url, options }); return response(options.method ? saved() : metadata()); } });
    await f.root.task; f.root.querySelector('#dfacm-ai-api-key').value = 'new-personal-key'; await submit(f);
    assert.equal(calls.length, 2); const sent = calls[1].options;
    assert.equal(sent.method, 'POST'); assert.equal(sent.headers[ACCOUNT_KEY_HEADER], 'new-personal-key');
    assert.equal(sent.body.get('csrf'), csrf); assert.equal(sent.body.get('revision'), ''); assert.equal(sent.body.get('provider'), 'agentrouter');
    assert.ok(!sent.body.toString().includes('new-personal-key')); assert.ok(!sent.body.has('api_key'));
    assert.equal(f.root.querySelector('#dfacm-ai-api-key').value, ''); assert.equal(storage.values.size, 0); assert.match(status(f), /已保存到账户/);
});

test('blank-key model changes preserve credentials without sending a placeholder or a key header', async () => {
    const calls = []; const f = fixture({ fetchImpl: async (_url, options) => {
        calls.push(options); return response(saved({ model: options.method ? 'changed-model' : DEFAULT_MODEL }));
    } });
    await f.root.task; f.root.querySelector('#dfacm-ai-model').value = 'changed-model'; await submit(f);
    assert.equal(calls[1].body.get('revision'), 'a'.repeat(32)); assert.equal(calls[1].body.get('model'), 'changed-model');
    assert.equal(calls[1].headers[ACCOUNT_KEY_HEADER], undefined); assert.ok(!calls[1].body.toString().includes('placeholder'));
});

test('switching providers clears typed keys, separates model drafts and requires a new credential before saving', async () => {
    const calls = []; const f = fixture({ fetchImpl: async (_url, options) => { calls.push(options); return response(saved()); } });
    await f.root.task; f.root.querySelector('#dfacm-ai-api-key').value = 'wrong-provider-key'; choose(f, 'custom');
    assert.equal(f.root.querySelector('#dfacm-ai-api-key').value, '');
    f.root.querySelector('#dfacm-ai-base-url').value = 'https://model.example.com/v1';
    f.root.querySelector('#dfacm-ai-model').value = 'custom-model'; await submit(f);
    assert.equal(calls.length, 1); assert.match(status(f), /对应的新 API Key/);
    choose(f, 'agentrouter'); assert.equal(f.root.querySelector('#dfacm-ai-model').value, DEFAULT_MODEL);
    choose(f, 'custom'); assert.equal(f.root.querySelector('#dfacm-ai-model').value, 'custom-model');
    assert.equal(f.root.querySelector('#dfacm-ai-base-url').value, 'https://model.example.com/v1');
});

test('explicit legacy import uses only the current account scope and saves once before removing old storage', async () => {
    const storage = memory(); const key = 'dfacm-assistant:provider:main:42';
    storage.setItem(key, JSON.stringify({ version: 1, provider: 'custom', baseUrl: 'https://legacy.example.com/v1', model: 'legacy-model', apiKey: 'legacy-key' }));
    storage.setItem('dfacm-assistant:provider:main:43', 'other-account-data');
    const calls = []; const f = fixture({ storage, fetchImpl: async (_url, options) => {
        calls.push(options); return response(options.method ? saved({ provider: 'custom', baseUrl: 'https://legacy.example.com/v1', model: 'legacy-model' }) : metadata());
    } });
    await f.root.task; assert.equal(f.root.querySelector('#dfacm-ai-api-key').value, ''); assert.equal(calls.length, 1);
    event(f, f.root.querySelector('[data-ai-action=import]'));
    assert.equal(f.root.querySelector('#dfacm-ai-api-key').value, 'legacy-key'); assert.equal(calls.length, 1); assert.ok(storage.getItem(key));
    await submit(f); assert.equal(calls[1].headers[ACCOUNT_KEY_HEADER], 'legacy-key'); assert.equal(storage.getItem(key), null);
    assert.equal(storage.getItem('dfacm-assistant:provider:main:43'), 'other-account-data');
    const other = fixture({ storage, uid: 44 }); await other.root.task;
    assert.equal(other.root.querySelector('.dfacm-ai-settings__migration').hidden, true);
});

test('save conflicts retain the draft and reload retrieves the latest account revision', async () => {
    let reads = 0; const f = fixture({ fetchImpl: async (_url, options) => options.method
        ? { ok: false, json: async () => ({ ok: false, code: 'AI_CONFIG_CONFLICT', message: '配置已更新，请重新加载。' }) }
        : response(saved({ revision: (++reads === 1 ? 'a' : 'c').repeat(32), model: reads === 1 ? 'old' : 'latest' })) });
    await f.root.task; f.root.querySelector('#dfacm-ai-model').value = 'unsaved'; await submit(f);
    assert.match(status(f), /请重新加载/); assert.equal(f.root.querySelector('#dfacm-ai-model').value, 'unsaved');
    event(f, f.root.querySelector('[data-ai-action=refresh]')); await f.root.task;
    assert.equal(f.root.querySelector('#dfacm-ai-model').value, 'latest');
});

test('deleting saved configuration sends only revision and clears the form without a model request', async () => {
    const calls = []; const f = fixture({ fetchImpl: async (_url, options) => { calls.push(options); return response(options.method ? metadata() : saved()); } });
    await f.root.task; event(f, f.root.querySelector('[data-ai-action=clear]')); await f.root.task;
    assert.equal(calls[1].body.get('action'), 'clear'); assert.equal(calls[1].body.get('revision'), 'a'.repeat(32));
    assert.deepEqual(Object.keys(calls[1].headers), ['Accept']); assert.equal(calls[1].body.has('provider'), false);
    assert.equal(f.root.querySelector('[data-ai-action=clear]').hidden, true); assert.match(status(f), /已删除/);
});

test('account responses reject foreign UIDs, credential fields, invalid providers and external settings endpoints', async () => {
    for (const value of [saved({ uid: 43 }), { ...saved(), api_key: 'secret' }, saved({ provider: 'other' }), saved({ hasKey: false })]) {
        const f = fixture({ fetchImpl: async () => response(value) }); await f.root.task;
        assert.equal(f.root.querySelector('[data-ai-action=save]').disabled, true); assert.match(status(f), /响应不完整|会话已变化/);
        assert.ok(!f.root.textContent.includes('secret'));
    }
    for (const url of ['https://evil.example.com', '//evil.example.com', '/\\evil.example.com', '/bad\npath']) assert.equal(localPath(url), false);
    assert.equal(localPath('/home/ai/config'), true); assert.deepEqual(publicAccount(saved(), 42), saved());
});

test('navigation and disposal erase typed credentials and ignore pending responses', async () => {
    let finish; const f = fixture({ fetchImpl: () => new Promise(resolve => { finish = resolve; }) });
    f.root.querySelector('#dfacm-ai-api-key').value = 'transient-key'; f.root.suspend(); assert.equal(f.root.querySelector('#dfacm-ai-api-key').value, '');
    f.root.dispose(); finish(response(saved())); await f.root.task;
    assert.equal(f.root.querySelector('#dfacm-ai-api-key').value, ''); assert.ok(!f.root.textContent.includes('已保存的 AI 配置'));
});

test('floating account settings have no credential fields and generation sends only account provider', async () => {
    const calls = []; const { document, window } = parseHTML('<html><body><main class="main"><div class="row"><div class="columns">题面</div></div></main></body></html>');
    const panel = mountAssistant({ document, config: { page: 'problem', endpoint: '/p/P1001/assistant', csrf, userScope: 'main:42',
        accountConfig: '/home/ai/config', accountSettings: '/home/ai' },
    storage: { getItem() { return null; }, setItem() {}, removeItem() {} }, fetchImpl: async (url, options) => {
        calls.push({ url, options });
        return url === '/home/ai/config' ? response(saved()) : { ok: true, json: async () => ({ ok: true, job: { id: 'd'.repeat(32), status: 'ready', html: '<p>账户题解</p>' } }) };
    } });
    const f = { window }; event(f, document.getElementById('dfacm-assistant-toggle')); assert.equal(calls.length, 0);
    event(f, panel.querySelector('[data-window-action=settings]')); await panel.querySelector('.dfacm-assistant__settings').task;
    assert.equal(calls.length, 1); assert.equal(panel.querySelector('.dfacm-assistant__settings input'), null);
    assert.equal(panel.querySelector('.dfacm-assistant__account-link').href, '/home/ai'); assert.match(panel.textContent, /AgentRouter · gpt-5.6-sol/);
    event(f, panel.querySelector('[data-window-action=settings]')); event(f, panel.querySelector('[data-assistant-mode=solve]')); await panel.task;
    assert.equal(calls.length, 2); assert.equal(calls[1].options.body.get('provider'), 'account');
    assert.deepEqual(Object.keys(calls[1].options.headers), ['Accept']); assert.equal(calls[1].options.body.has('model'), false);
    assert.equal(calls[1].options.body.has('base_url'), false); assert.match(panel.querySelector('.dfacm-assistant__result').textContent, /账户题解/);
});

test('an unconfigured account opens the settings summary and leaves solution buttons retryable', async () => {
    const calls = []; const { document, window } = parseHTML('<html><body><main class="main"><div class="row"><div class="columns"></div></div></main></body></html>');
    const panel = mountAssistant({ document, config: { page: 'problem', endpoint: '/p/P1001/assistant', csrf, userScope: 'main:42',
        accountConfig: '/home/ai/config', accountSettings: '/home/ai' }, fetchImpl: async (url, options) => {
        calls.push({ url, options }); return url === '/home/ai/config' ? response() : { ok: false, json: async () => ({ ok: false, code: 'AI_NOT_CONFIGURED', message: '请先配置账户 AI。' }) };
    } });
    event({ window }, document.getElementById('dfacm-assistant-toggle')); event({ window }, panel.querySelector('[data-assistant-mode=solve]'));
    await panel.task; await panel.querySelector('.dfacm-assistant__settings').task;
    assert.deepEqual(calls.map(call => call.url), ['/p/P1001/assistant', '/home/ai/config']);
    assert.equal(panel.querySelector('.dfacm-assistant__settings').hidden, false);
    assert.equal(panel.querySelector('[data-assistant-mode=solve]').disabled, false); assert.match(panel.textContent, /尚未保存账户 AI 配置/);
});
