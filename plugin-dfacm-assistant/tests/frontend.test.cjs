'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { parseHTML } = require('linkedom');
const { mountAssistant } = require('../frontend/panel.js');
const { validateAnswer, sourceLines } = require('../protocol.cjs');
const { request, answer, SOURCE } = require('./fixtures.cjs');
const { render } = require('./render.cjs');

function fixture({ page = 'problem', fetchImpl, storage, sleep = async () => {}, sidebar = false, userScope = 'main:42' } = {}) {
    const { document, window } = parseHTML(`<html><body><main class="main"><div class="row"><div class="medium-9 columns"><article>题面</article></div>${sidebar ? '<div class="medium-3 columns"><div data-sticky="large"></div></div>' : ''}</div></main></body></html>`);
    const config = { endpoint: '/p/P1001/assistant', csrf: 'fixture-csrf', page, userScope };
    const panel = mountAssistant({ document, config, fetchImpl, storage, sleep });
    return { document, window, config, panel };
}
function ready(mode = 'solve') {
    const job = { id: 'a'.repeat(32), status: 'ready', source: mode === 'debug' ? sourceLines(SOURCE) : [],
        verdict: mode === 'debug' ? 'WA' : '', answer: validateAnswer(answer(mode), request(mode)) };
    job.html = render(job);
    return job;
}
const response = (job) => ({ ok: true, json: async () => ({ ok: true, job }) });
function click(f, node) { node.dispatchEvent(new f.window.Event('click', { bubbles: true })); }
function open(f) { click(f, f.document.querySelector('.dfacm-assistant-toggle')); }
function start(f, mode) {
    if (f.panel.hidden) open(f);
    if (f.panel.querySelector('.dfacm-assistant__tag').textContent === '未配置 API Key') {
        configurePersonal(f, { provider: 'agentrouter' });
    }
    click(f, f.panel.querySelector(`[data-assistant-mode="${mode}"]`));
}
function memory() {
    const values = new Map();
    return { getItem: (key) => values.get(key) || null, setItem: (key, value) => values.set(key, value), removeItem: (key) => values.delete(key) };
}

test('expanding the floating entry makes no request until the user selects a solution', async () => {
    const calls = [];
    const f = fixture({ fetchImpl: async (url, options) => {
        calls.push({ url, options });
        return response(calls.length === 1 ? { id: 'a'.repeat(32), status: 'pending' } : ready());
    } });
    open(f);
    assert.equal(f.panel.hidden, false);
    assert.equal(calls.length, 0);
    assert.equal(f.panel.classList.contains('is-compact'), false);
    assert.equal(f.panel.querySelector('.dfacm-assistant__intro').hidden, false);
    start(f, 'solve');
    assert.equal(f.panel.getAttribute('aria-busy'), 'true');
    assert.equal(f.panel.classList.contains('is-compact'), true);
    assert.equal(f.panel.querySelector('.dfacm-assistant__intro').hidden, true);
    await f.panel.task;
    assert.deepEqual([...f.panel.querySelectorAll('.dfacm-assistant__answer h3')].map((node) => node.textContent), ['题目大意', '思路', '题解', '点评']);
    assert.match(f.panel.querySelector('[data-solution-code]').textContent, /long long sum = 0;/);
    assert.equal(calls[0].options.method, 'POST');
    assert.equal(calls[0].options.body.get('mode'), 'solve');
    assert.equal(calls[0].options.body.get('csrf'), 'fixture-csrf');
    assert.equal(calls[0].options.body.has('statement'), false);
    assert.equal(calls[0].options.body.has('api_key'), false);
    assert.equal(calls[1].options.credentials, 'same-origin');
    assert.equal(f.panel.getAttribute('aria-busy'), 'false');
    assert.equal(f.panel.classList.contains('has-result'), true);
    assert.equal(f.panel.classList.contains('is-working'), false);
    assert.equal(f.panel.querySelector('.dfacm-assistant__tag').textContent, '个人 · AgentRouter');
});

test('diagnostic identifies original source lines and jumps to the highlighted row', async () => {
    const f = fixture({ page: 'record', fetchImpl: async () => response(ready('debug')) });
    start(f, 'debug');
    await f.panel.task;
    assert.equal(f.panel.querySelector('[data-source-line="6"]').classList.contains('is-issue'), true);
    assert.equal(f.panel.querySelector('[data-source-line="10"]').classList.contains('is-issue'), true);
    assert.equal(f.panel.querySelector('[data-source-line="3"] code').textContent, ' ');
    const row = f.panel.querySelector('[data-source-line="10"]'); let scrolled = false;
    row.scrollIntoView = () => { scrolled = true; };
    click(f, f.panel.querySelector('[data-jump-line="10"]')); assert.equal(scrolled, true);
    assert.match(f.panel.textContent, /构造反例/);
    assert.match(f.panel.textContent, /未定义行为/);
});

test('manual code preserves leading blank lines and sends actual selected verdict', async () => {
    let posted;
    const f = fixture({ fetchImpl: async (_url, options) => { posted = options.body; return response(ready(options.body.get('mode'))); } });
    open(f);
    click(f, f.panel.querySelector('.dfacm-assistant__text-button'));
    assert.equal(f.panel.classList.contains('has-code'), true);
    assert.equal(f.panel.classList.contains('is-compact'), true);
    assert.equal(f.panel.querySelector('.dfacm-assistant__text-button').getAttribute('aria-expanded'), 'true');
    const code = '\n// header\n\nint main() {}\n';
    f.panel.querySelector('textarea').value = code;
    click(f, f.panel.querySelector('.dfacm-assistant__text-button'));
    assert.equal(f.panel.classList.contains('has-code'), false);
    assert.equal(f.panel.classList.contains('is-compact'), false);
    assert.equal(f.panel.querySelector('.dfacm-assistant__text-button').getAttribute('aria-expanded'), 'false');
    click(f, f.panel.querySelector('.dfacm-assistant__text-button'));
    assert.equal(f.panel.querySelector('textarea').value, code);
    const select = f.panel.querySelector('select');
    for (const option of select.querySelectorAll('option')) option.selected = false;
    select.querySelector('option[value="CE"]').selected = true;
    start(f, 'debug');
    await f.panel.task;
    assert.equal(posted.get('code'), code);
    assert.equal(posted.get('verdict'), 'CE');
});

test('missing source and network errors are visible and leave a retryable button', async () => {
    const f = fixture({ sidebar: true, fetchImpl: async () => ({ ok: false, json: async () => ({ ok: false, message: '没有找到未通过的提交，请粘贴你的代码。' }) }) });
    start(f, 'debug'); await f.panel.task;
    assert.equal(f.panel.querySelector('.dfacm-assistant__editor').hidden, false);
    assert.match(f.panel.querySelector('[role="status"]').textContent, /请粘贴/);
    assert.equal(f.panel.getAttribute('aria-busy'), 'false');
    const n = fixture({ fetchImpl: async () => { throw new Error('网络已断开'); } });
    start(n, 'solve');
    await n.panel.task;
    assert.equal(n.panel.querySelector('[role="status"]').textContent, '网络已断开');
    assert.equal(n.panel.querySelector('button').disabled, false);
});

test('refresh restores an existing task without generating a new model request', async () => {
    const calls = [];
    const storage = { getItem: () => JSON.stringify({ id: 'a'.repeat(32), mode: 'solve' }), removeItem() {}, setItem() {} };
    const f = fixture({ storage, fetchImpl: async (url, options) => { calls.push({ url, options }); return response(ready()); } });
    await f.panel.task;
    assert.equal(calls.length, 1); assert.equal(calls[0].options.method, undefined);
    assert.equal(f.panel.querySelectorAll('.dfacm-assistant__answer h3').length, 4);
});

test('template escapes raw code and disallows executable HTML from model prose', () => {
    const raw = answer(); raw.code = '<script>alert(1)</script>'; raw.commentary = '<img src=x onerror=alert(1)> [danger](javascript:alert(1))';
    const html = render({ answer: raw, source: [] });
    const { document } = parseHTML(html);
    assert.equal(document.querySelectorAll('script,img').length, 0);
    assert.equal(document.querySelectorAll('a[href^="javascript:"]').length, 0);
    assert.equal(document.querySelector('[data-solution-code]').textContent, '<script>alert(1)</script>');
});

test('Hydro markdown output renders paragraphs, code emphasis and lists as HTML', () => {
    const raw = answer(); raw.approach = '**顺序累加**，使用 `long long`。\n\n- 保留负数\n- 检查范围';
    const { document } = parseHTML(render({ answer: raw, source: [] }));
    const section = document.querySelectorAll('.dfacm-assistant__part')[1];
    assert.equal(section.querySelector('strong').textContent, '顺序累加');
    assert.equal(section.querySelector('code').textContent, 'long long');
    assert.equal(section.querySelectorAll('ul li').length, 2);
});

test('page mount is scoped, idempotent and requires an authorized server entry', () => {
    const f = fixture();
    assert.equal(mountAssistant({ document: f.document, config: f.config }), f.panel);
    assert.equal(f.document.querySelectorAll('#dfacm-assistant').length, 1);
    assert.equal(f.document.querySelectorAll('#dfacm-assistant-toggle').length, 1);
    assert.equal(mountAssistant({ document: f.document, config: {} }), null);
});

test('the floating entry opens and collapses without inserting controls into the problem or sidebar', () => {
    const calls = [];
    const f = fixture({ sidebar: true, fetchImpl: async (_url, options) => { calls.push(options); return response(ready()); } });
    f.panel.scrollIntoView = () => { assert.fail('Opening the window must not scroll the problem'); };
    const sidebar = f.document.querySelector('.medium-3');
    const original = sidebar.innerHTML;
    const button = f.document.querySelector('.dfacm-assistant-toggle');
    assert.equal(button.closest('.medium-3'), null);
    assert.equal(f.panel.hidden, true);
    click(f, button);
    assert.equal(f.panel.hidden, false);
    assert.equal(button.disabled, false);
    assert.equal(button.hidden, false);
    assert.equal(button.getAttribute('aria-expanded'), 'true');
    click(f, button);
    assert.equal(f.panel.hidden, true);
    assert.equal(button.getAttribute('aria-expanded'), 'false');
    assert.equal(calls.length, 0);
    assert.equal(sidebar.innerHTML, original);
    assert.equal(f.document.querySelector('.medium-9').textContent, '题面');
    mountAssistant({ document: f.document, config: f.config });
    assert.equal(f.document.querySelectorAll('.dfacm-assistant-toggle').length, 1);
});

test('mount leaves the problem untouched and exposes an accessible floating entry without generating', async () => {
    let calls = 0;
    const f = fixture({ fetchImpl: async () => { calls++; return response(ready()); } });
    assert.equal(f.panel.hidden, true);
    assert.equal(f.panel.parentNode, f.document.body);
    assert.equal(f.document.querySelector('.medium-9').textContent, '题面');
    assert.equal(f.panel.getAttribute('role'), 'dialog');
    assert.equal(f.panel.getAttribute('aria-modal'), 'false');
    const toggle = f.document.querySelector('.dfacm-assistant-toggle');
    assert.equal(toggle.hidden, false);
    assert.equal(toggle.textContent, '题目助手');
    assert.equal(toggle.getAttribute('aria-expanded'), 'false');
    assert.equal(calls, 0);
    open(f);
    assert.equal(f.panel.hidden, false);
    assert.equal(toggle.hidden, false);
    assert.equal(toggle.getAttribute('aria-expanded'), 'true');
    await f.panel.task;
    assert.equal(calls, 0);
});

test('minimizing, closing and reopening preserve answers, pasted code and scroll position without requests', async () => {
    const calls = [];
    const f = fixture({ sidebar: true, fetchImpl: async (_url, options) => { calls.push(options); return response(ready()); } });
    start(f, 'solve'); await f.panel.task;
    const result = f.panel.querySelector('.dfacm-assistant__result');
    const content = f.panel.querySelector('.dfacm-assistant__body');
    const html = result.innerHTML;
    const code = '\n// keep my code\nint main() {}\n';
    f.panel.querySelector('textarea').value = code;
    content.scrollTop = 180;
    const minimize = f.panel.querySelector('[data-window-action="minimize"]');
    click(f, minimize);
    assert.equal(f.panel.hidden, true);
    assert.equal(content.hidden, true);
    assert.equal(f.document.querySelector('.dfacm-assistant-toggle').hidden, false);
    open(f);
    assert.equal(content.hidden, false);
    click(f, f.panel.querySelector('[data-window-action="close"]'));
    assert.equal(f.panel.hidden, true);
    assert.match(f.document.querySelector('.dfacm-assistant-toggle').getAttribute('aria-label'), /结果已就绪/);
    open(f);
    assert.equal(result.innerHTML, html);
    assert.equal(f.panel.querySelector('textarea').value, code);
    assert.equal(content.scrollTop, 180);
    click(f, f.panel.querySelector('[data-window-action="close"]'));
    open(f); await f.panel.task;
    assert.equal(f.panel.hidden, false);
    assert.equal(calls.length, 1);
});

test('a closed pending window keeps polling and can reopen from the floating entry without a second task', async () => {
    let resume;
    const calls = [];
    const storage = memory();
    const f = fixture({ sidebar: true, storage,
        sleep: () => new Promise((resolve) => { resume = resolve; }),
        fetchImpl: async (url, options) => { calls.push({ url, options }); return response(calls.length === 1 ? { id: 'a'.repeat(32), status: 'pending' } : ready()); },
    });
    start(f, 'solve');
    while (!resume) await new Promise((resolve) => setImmediate(resolve));
    const task = f.panel.task;
    click(f, f.panel.querySelector('[data-window-action="close"]'));
    assert.equal(f.panel.hidden, true);
    assert.equal(f.document.querySelector('.dfacm-assistant-toggle').getAttribute('data-status'), 'busy');
    assert.match(f.document.querySelector('.dfacm-assistant-toggle').getAttribute('aria-label'), /正在生成/);
    assert.equal(JSON.parse(storage.getItem(`dfacm-assistant:${f.config.userScope}:${f.config.endpoint}`)).windowState, 'closed');
    open(f);
    assert.equal(f.panel.hidden, false);
    assert.equal(f.panel.task, task);
    assert.equal(calls.length, 1);
    click(f, f.panel.querySelector('[data-window-action="close"]'));
    resume(); await task;
    assert.equal(f.panel.hidden, true);
    assert.equal(f.panel.querySelectorAll('.dfacm-assistant__answer h3').length, 4);
    assert.equal(calls.filter((call) => call.options.method === 'POST').length, 1);
    open(f);
    assert.equal(f.panel.hidden, false);
    assert.equal(calls.length, 2);
});

test('refresh preserves closed and minimized windows while restoring the same result', async () => {
    for (const state of ['closed', 'minimized']) {
        const storage = memory();
        const f = fixture({ sidebar: true, storage, fetchImpl: async () => response(ready()) });
        start(f, 'solve'); await f.panel.task;
        click(f, f.panel.querySelector(`[data-window-action="${state === 'closed' ? 'close' : 'minimize'}"]`));
        f.panel.dispose();
        const calls = [];
        const restored = fixture({ sidebar: true, storage, fetchImpl: async (url, options) => { calls.push({ url, options }); return response(ready()); } });
        await restored.panel.task;
        assert.equal(restored.panel.getAttribute('data-window-state'), state);
        assert.equal(restored.panel.hidden, true);
        assert.equal(restored.panel.querySelector('.dfacm-assistant__body').hidden, true);
        open(restored); await restored.panel.task;
        assert.equal(restored.panel.hidden, false);
        assert.equal(restored.panel.querySelector('.dfacm-assistant__body').hidden, false);
        assert.equal(calls.length, 1);
        assert.equal(calls[0].options.method, undefined);
    }
});

test('Escape closes the window and returns keyboard focus to the launcher', async () => {
    const f = fixture({ fetchImpl: async () => response(ready()) });
    const toggle = f.document.querySelector('.dfacm-assistant-toggle');
    let focused = false;
    toggle.focus = () => { focused = true; };
    open(f);
    await f.panel.task;
    const escape = new f.window.Event('keydown', { bubbles: true, cancelable: true });
    Object.defineProperty(escape, 'key', { value: 'Escape' });
    f.panel.dispatchEvent(escape);
    assert.equal(f.panel.hidden, true);
    assert.equal(escape.defaultPrevented, true);
    assert.equal(focused, true);
});

function chooseProvider(f, value) {
    const select = f.panel.querySelector('#dfacm-assistant-provider');
    for (const option of select.querySelectorAll('option')) option.selected = false;
    select.querySelector(`option[value="${value}"]`).selected = true;
    select.dispatchEvent(new f.window.Event('change', { bubbles: true }));
}
function configurePersonal(f, { provider = 'custom', key = 'personal-fixture-key', remember = false } = {}) {
    click(f, f.panel.querySelector('[data-window-action="settings"]'));
    chooseProvider(f, provider);
    if (provider === 'custom') {
        f.panel.querySelector('#dfacm-assistant-base-url').value = 'https://model.example.com/v1/chat/completions/';
        f.panel.querySelector('#dfacm-assistant-model').value = 'custom-model';
    }
    f.panel.querySelector('#dfacm-assistant-api-key').value = key;
    f.panel.querySelector('#dfacm-assistant-remember-key').checked = remember;
    click(f, f.panel.querySelector('[data-provider-action="save"]'));
}

test('personal provider applies only on generation; key stays out of request body, job storage and polling', async () => {
    const calls = []; const storage = memory();
    const f = fixture({ storage, fetchImpl: async (url, options) => {
        calls.push({ url, options });
        return response(calls.length === 1 ? { id: 'a'.repeat(32), status: 'pending' } : ready());
    } });
    open(f); configurePersonal(f);
    assert.equal(calls.length, 0);
    assert.equal(f.panel.querySelector('#dfacm-assistant-api-key').type, 'password');
    assert.equal(f.panel.querySelector('.dfacm-assistant__settings').hidden, true);
    assert.equal(f.panel.querySelector('.dfacm-assistant__tag').textContent, '个人 · 自定义');
    assert.equal(storage.getItem('dfacm-assistant:provider:main:42'), null);
    start(f, 'solve'); await f.panel.task;
    const first = calls[0].options;
    assert.equal(first.body.get('provider'), 'custom');
    assert.equal(first.body.get('base_url'), 'https://model.example.com/v1');
    assert.equal(first.body.get('model'), 'custom-model');
    assert.equal(first.headers['x-dfacm-assistant-key'], 'personal-fixture-key');
    assert.ok(!first.body.toString().includes('personal-fixture-key'));
    assert.equal(calls[1].options.headers['x-dfacm-assistant-key'], undefined);
    assert.ok(!storage.getItem(`dfacm-assistant:${f.config.userScope}:${f.config.endpoint}`).includes('personal-fixture-key'));
    const html = f.panel.querySelector('.dfacm-assistant__result').innerHTML;
    const content = f.panel.querySelector('.dfacm-assistant__body'); content.scrollTop = 80;
    click(f, f.panel.querySelector('[data-window-action="settings"]'));
    assert.equal(content.hidden, true);
    chooseProvider(f, 'agentrouter');
    f.panel.querySelector('#dfacm-assistant-api-key').value = 'agentrouter-fixture-key';
    click(f, f.panel.querySelector('[data-provider-action="save"]'));
    assert.equal(content.hidden, false);
    assert.equal(content.scrollTop, 80);
    assert.equal(f.panel.querySelector('.dfacm-assistant__result').innerHTML, html);
    click(f, f.panel.querySelector('[data-assistant-action="refresh"]')); await f.panel.task;
    assert.equal(calls[2].options.headers['x-dfacm-assistant-key'], 'agentrouter-fixture-key');
    assert.equal(calls[2].options.body.get('provider'), 'agentrouter');
    assert.equal(calls[2].options.body.get('base_url'), 'https://agentrouter.org/v1');
    assert.equal(calls[2].options.body.get('model'), 'gpt-5.6-sol');
});

test('personal settings validate before applying; missing key makes no request and presets fill defaults', () => {
    let calls = 0; const f = fixture({ fetchImpl: async () => { calls++; return response(ready()); } });
    open(f); configurePersonal(f, { provider: 'agentrouter', key: '' });
    assert.equal(f.panel.querySelector('.dfacm-assistant__settings').hidden, false);
    assert.match(f.panel.querySelector('.dfacm-assistant__settings-status').textContent, /API Key/);
    assert.equal(calls, 0);
    assert.equal(f.panel.querySelector('#dfacm-assistant-model').value, 'gpt-5.6-sol');
    assert.equal(f.panel.querySelector('#dfacm-assistant-base-url').value, 'https://agentrouter.org/v1');
    chooseProvider(f, 'custom');
    f.panel.querySelector('#dfacm-assistant-base-url').value = 'http://localhost/v1';
    f.panel.querySelector('#dfacm-assistant-model').value = 'custom';
    f.panel.querySelector('#dfacm-assistant-api-key').value = 'fixture';
    click(f, f.panel.querySelector('[data-provider-action="save"]'));
    assert.match(f.panel.querySelector('.dfacm-assistant__settings-status').textContent, /HTTPS/);
    assert.equal(calls, 0);
});

test('opt-in tab storage restores personal config and clearing removes it without sending requests', async () => {
    const storage = memory(); const f = fixture({ storage });
    open(f); configurePersonal(f, { provider: 'agentrouter', remember: true });
    assert.equal(JSON.parse(storage.getItem('dfacm-assistant:provider:main:42')).apiKey, 'personal-fixture-key');
    f.panel.dispose();
    const calls = []; const restored = fixture({ storage, fetchImpl: async (_url, options) => { calls.push(options); return response(ready()); } });
    assert.equal(calls.length, 0);
    start(restored, 'solve'); await restored.panel.task;
    assert.equal(calls[0].headers['x-dfacm-assistant-key'], 'personal-fixture-key');
    click(restored, restored.panel.querySelector('[data-window-action="settings"]'));
    click(restored, restored.panel.querySelector('[data-provider-action="clear"]'));
    assert.equal(storage.getItem('dfacm-assistant:provider:main:42'), null);
    assert.equal(restored.panel.querySelector('#dfacm-assistant-api-key').value, '');
    assert.equal(restored.panel.querySelector('#dfacm-assistant-provider').value, 'agentrouter');
    assert.equal(restored.panel.querySelector('.dfacm-assistant__tag').textContent, '未配置 API Key');
    click(restored, restored.panel.querySelector('[data-window-action="settings"]'));
    click(restored, restored.panel.querySelector('[data-assistant-action="refresh"]'));
    assert.equal(restored.panel.querySelector('.dfacm-assistant__settings').hidden, false);
    assert.match(restored.panel.querySelector('.dfacm-assistant__settings-status').textContent, /API Key/);
    assert.equal(calls.length, 1);
});

test('remembered personal keys stay scoped to the logged-in account and domain', async () => {
    const storage = memory(); const owner = fixture({ storage });
    open(owner); configurePersonal(owner, { remember: true });
    for (const userScope of ['main:43', 'other:42']) {
        const calls = []; const f = fixture({ storage, userScope, fetchImpl: async (_url, options) => { calls.push(options); return response(ready()); } });
        open(f);
        click(f, f.panel.querySelector('[data-assistant-mode="solve"]'));
        await f.panel.task;
        assert.equal(calls.length, 0);
        assert.equal(f.panel.querySelector('#dfacm-assistant-api-key').value, '');
        assert.equal(f.panel.querySelector('.dfacm-assistant__settings').hidden, false);
        assert.equal(f.panel.querySelector('.dfacm-assistant__tag').textContent, '未配置 API Key');
    }
});

test('personal settings tolerate unavailable tab storage and Escape returns to the previous result', () => {
    const storage = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); }, removeItem() {} };
    const f = fixture({ storage }); open(f);
    configurePersonal(f, { remember: true });
    assert.equal(f.panel.querySelector('.dfacm-assistant__tag').textContent, '个人 · 自定义');
    click(f, f.panel.querySelector('[data-window-action="settings"]'));
    const escape = new f.window.Event('keydown', { bubbles: true, cancelable: true });
    Object.defineProperty(escape, 'key', { value: 'Escape' }); f.panel.dispatchEvent(escape);
    assert.equal(f.panel.hidden, false);
    assert.equal(f.panel.querySelector('.dfacm-assistant__settings').hidden, true);
    assert.equal(f.panel.querySelector('.dfacm-assistant__body').hidden, false);
});

test('settings stay separate from the result through minimize, close, reopen and apply', async () => {
    const calls = [];
    const f = fixture({ fetchImpl: async (_url, options) => { calls.push(options); return response(ready()); } });
    start(f, 'solve'); await f.panel.task;
    const content = f.panel.querySelector('.dfacm-assistant__body');
    const settingsBody = f.panel.querySelector('.dfacm-assistant__settings-body');
    const settings = f.panel.querySelector('[data-window-action="settings"]');
    const result = f.panel.querySelector('.dfacm-assistant__result');
    const html = result.innerHTML;
    const source = '\n// keep draft source\nint main() {}\n';
    f.panel.querySelector('textarea').value = source;
    content.scrollTop = 140;
    click(f, settings);
    chooseProvider(f, 'custom');
    f.panel.querySelector('#dfacm-assistant-base-url').value = 'https://model.example.com/v1';
    f.panel.querySelector('#dfacm-assistant-model').value = 'draft-model';
    f.panel.querySelector('#dfacm-assistant-api-key').value = 'draft-fixture-key';
    settingsBody.scrollTop = 110;

    for (const action of ['minimize', 'close', 'launcher']) {
        assert.equal(content.hidden, true);
        assert.equal(settingsBody.hidden, false);
        click(f, action === 'launcher' ? f.document.querySelector('.dfacm-assistant-toggle')
            : f.panel.querySelector(`[data-window-action="${action}"]`));
        assert.equal(f.panel.hidden, true);
        assert.equal(content.hidden, true);
        assert.equal(settingsBody.hidden, true);
        open(f);
        assert.equal(content.hidden, true);
        assert.equal(settingsBody.hidden, false);
        assert.equal(settings.getAttribute('aria-expanded'), 'true');
        assert.equal(settingsBody.scrollTop, 110);
        assert.equal(f.panel.querySelector('#dfacm-assistant-model').value, 'draft-model');
        assert.equal(f.panel.querySelector('#dfacm-assistant-api-key').value, 'draft-fixture-key');
        assert.equal(calls.length, 1);
    }
    click(f, f.panel.querySelector('[data-provider-action="save"]'));
    assert.equal(f.panel.hidden, false);
    assert.equal(content.hidden, false);
    assert.equal(settingsBody.hidden, true);
    assert.equal(settings.getAttribute('aria-expanded'), 'false');
    assert.equal(content.scrollTop, 140);
    assert.equal(result.innerHTML, html);
    assert.equal(f.panel.querySelector('textarea').value, source);
    assert.equal(f.panel.querySelector('.dfacm-assistant__tag').textContent, '个人 · 自定义');
    click(f, settings);
    chooseProvider(f, 'agentrouter');
    f.panel.querySelector('#dfacm-assistant-api-key').value = 'agentrouter-fixture-key';
    click(f, f.panel.querySelector('[data-provider-action="save"]'));
    assert.equal(content.hidden, false);
    assert.equal(settingsBody.hidden, true);
    assert.equal(f.panel.querySelector('.dfacm-assistant__tag').textContent, '个人 · AgentRouter');
    assert.equal(calls.length, 1);
});

test('only personal suppliers and the AgentRouter invite are shown; missing keys open settings without requests', async () => {
    for (const page of ['problem', 'record']) {
        const calls = [];
        const f = fixture({ page, fetchImpl: async (...args) => { calls.push(args); return response(ready()); } });
        open(f);
        const provider = f.panel.querySelector('#dfacm-assistant-provider');
        assert.deepEqual([...provider.querySelectorAll('option')].map(option => option.value), ['agentrouter', 'custom']);
        assert.equal(f.panel.textContent.includes('站点默认'), false);
        const settingsButton = f.panel.querySelector('[data-window-action="settings"]');
        click(f, settingsButton);
        assert.equal(provider.value, 'agentrouter');
        assert.equal(f.panel.querySelector('#dfacm-assistant-base-url').value, 'https://agentrouter.org/v1');
        assert.equal(f.panel.querySelector('#dfacm-assistant-model').value, 'gpt-5.6-sol');
        const registration = f.panel.querySelector('.dfacm-assistant__registration');
        const invite = registration.querySelector('a');
        assert.equal(invite.href, 'https://agentrouter.org/register?aff=SeEq');
        assert.equal(invite.target, '_blank');
        assert.equal(invite.rel, 'noopener noreferrer');
        assert.match(invite.textContent, /邀请链接/);
        assert.equal(registration.hidden, false);
        chooseProvider(f, 'custom');
        assert.equal(registration.hidden, true);
        chooseProvider(f, 'agentrouter');
        assert.equal(registration.hidden, false);
        click(f, invite);
        assert.equal(calls.length, 0);
        click(f, settingsButton);
        const key = f.panel.querySelector('#dfacm-assistant-api-key');
        let focused = false;
        key.focus = () => { focused = true; };
        click(f, f.panel.querySelector(`[data-assistant-mode="${page === 'problem' ? 'solve' : 'debug'}"]`));
        await f.panel.task;
        assert.equal(calls.length, 0);
        assert.equal(f.panel.querySelector('.dfacm-assistant__settings-body').hidden, false);
        assert.equal(f.panel.querySelector('.dfacm-assistant__body').hidden, true);
        assert.equal(f.panel.getAttribute('aria-busy'), 'false');
        assert.equal(f.panel.querySelector('[data-assistant-mode="debug"]').disabled, false);
        assert.match(f.panel.querySelector('.dfacm-assistant__settings-status').textContent, /应用设置/);
        assert.equal(focused, true);
    }
});

test('clearing an unsaved key restores AgentRouter defaults and leaves generation unconfigured', () => {
    const f = fixture({ fetchImpl: () => assert.fail('Clearing or opening settings must not request generation') });
    open(f);
    click(f, f.panel.querySelector('[data-window-action="settings"]'));
    chooseProvider(f, 'custom');
    f.panel.querySelector('#dfacm-assistant-base-url').value = 'https://model.example.com/v1';
    f.panel.querySelector('#dfacm-assistant-model').value = 'draft-model';
    const key = f.panel.querySelector('#dfacm-assistant-api-key');
    const clear = f.panel.querySelector('[data-provider-action="clear"]');
    assert.equal(clear.hidden, true);
    key.value = 'unsaved-fixture-key';
    key.dispatchEvent(new f.window.Event('input', { bubbles: true }));
    assert.equal(clear.hidden, false);
    click(f, clear);
    assert.equal(clear.hidden, true);
    assert.equal(key.value, '');
    assert.equal(f.panel.querySelector('#dfacm-assistant-provider').value, 'agentrouter');
    assert.equal(f.panel.querySelector('#dfacm-assistant-base-url').value, 'https://agentrouter.org/v1');
    assert.equal(f.panel.querySelector('#dfacm-assistant-model').value, 'gpt-5.6-sol');
    assert.equal(f.panel.querySelector('.dfacm-assistant__tag').textContent, '未配置 API Key');
    assert.equal(f.panel.querySelector('.dfacm-assistant__registration').hidden, false);
    chooseProvider(f, 'custom');
    assert.equal(f.panel.querySelector('#dfacm-assistant-base-url').value, '');
    assert.equal(f.panel.querySelector('#dfacm-assistant-model').value, '');
});

test('saved legacy AgentRouter model shows an explicit preset without changing applied settings or sending requests', async () => {
    const storage = memory(); const calls = [];
    const original = { version: 1, provider: 'agentrouter', baseUrl: 'https://agentrouter.org/v1',
        model: 'deepseek-v4-flash', apiKey: 'saved-fixture-key' };
    storage.setItem('dfacm-assistant:provider:main:42', JSON.stringify(original));
    const f = fixture({ storage, fetchImpl: async (_url, options) => { calls.push(options); return response(ready()); } });
    open(f); click(f, f.panel.querySelector('[data-window-action="settings"]'));
    const model = f.panel.querySelector('#dfacm-assistant-model');
    const warning = f.panel.querySelector('.dfacm-assistant__model-warning');
    const recommended = f.panel.querySelector('[data-provider-action="recommended-model"]');
    assert.equal(model.value, original.model); assert.equal(warning.hidden, false);
    assert.match(warning.textContent, /暂无可用渠道/);
    assert.equal(model.getAttribute('aria-describedby'), 'dfacm-assistant-model-help');
    assert.equal(calls.length, 0);
    assert.equal(JSON.parse(storage.getItem('dfacm-assistant:provider:main:42')).model, original.model);
    click(f, recommended);
    assert.equal(model.value, 'gpt-5.6-sol'); assert.equal(warning.hidden, true);
    assert.equal(f.panel.querySelector('#dfacm-assistant-api-key').value, original.apiKey);
    assert.equal(JSON.parse(storage.getItem('dfacm-assistant:provider:main:42')).model, original.model);
    click(f, f.panel.querySelector('[data-provider-action="save"]'));
    assert.equal(calls.length, 0);
    assert.equal(JSON.parse(storage.getItem('dfacm-assistant:provider:main:42')).model, 'gpt-5.6-sol');
    start(f, 'solve'); await f.panel.task;
    assert.equal(calls[0].body.get('model'), 'gpt-5.6-sol');
    assert.equal(calls[0].headers['x-dfacm-assistant-key'], original.apiKey);
});

test('model availability guidance follows draft model and provider without overwriting a custom model', () => {
    const f = fixture({ fetchImpl: () => assert.fail('Settings edits must not call a model') });
    open(f); click(f, f.panel.querySelector('[data-window-action="settings"]'));
    const model = f.panel.querySelector('#dfacm-assistant-model');
    const warning = f.panel.querySelector('.dfacm-assistant__model-warning');
    const help = f.panel.querySelector('#dfacm-assistant-model-help');
    assert.equal(help.hidden, false); assert.equal(warning.hidden, true);
    model.value = 'deepseek-v4-flash'; model.dispatchEvent(new f.window.Event('input', { bubbles: true }));
    assert.equal(warning.hidden, false);
    model.value = 'my-agentrouter-model'; model.dispatchEvent(new f.window.Event('input', { bubbles: true }));
    assert.equal(warning.hidden, true);
    chooseProvider(f, 'custom'); model.value = 'deepseek-v4-flash';
    model.dispatchEvent(new f.window.Event('input', { bubbles: true }));
    assert.equal(help.hidden, true); assert.equal(warning.hidden, true); assert.equal(model.value, 'deepseek-v4-flash');
});

test('failed provider jobs display their actionable error and do not retry automatically', async () => {
    for (const [code, message] of [
        ['UPSTREAM_MODEL_UNAVAILABLE', 'AgentRouter 当前模型暂无可用渠道，请在模型设置中核对模型名称和 Key 分组权限，或稍后重试。'],
        ['UPSTREAM_UNAVAILABLE', 'AgentRouter 服务暂时不可用，请稍后重试。'],
        ['UPSTREAM_NETWORK', 'OJ 与 AgentRouter 的连接中断，请稍后重试；若持续出现，请联系管理员。'],
    ]) {
        const calls = []; const f = fixture({ fetchImpl: async (_url, options) => {
            calls.push(options); return response({ id: 'b'.repeat(32), status: 'failed', error: { code, message } });
        } });
        start(f, 'solve'); await f.panel.task;
        assert.equal(calls.length, 1); assert.equal(f.panel.getAttribute('aria-busy'), 'false');
        assert.ok(f.panel.textContent.includes(message));
        assert.equal(f.panel.querySelector('[data-assistant-mode="solve"]').disabled, false);
        click(f, f.panel.querySelector('[data-window-action="settings"]'));
        assert.equal(f.panel.querySelector('.dfacm-assistant__settings').hidden, false);
    }
});
