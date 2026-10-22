'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { parseHTML } = require('linkedom');
const { mountAssistant } = require('../frontend/panel.js');
const { validateAnswer, sourceLines } = require('../protocol.cjs');
const { request, answer, CE_SOURCE, CE_LOG, ceRequest, ceAnswer } = require('./fixtures.cjs');
const { render } = require('./render.cjs');

const tick = () => new Promise(resolve => setImmediate(resolve));
const response = job => ({ ok: true, json: async () => ({ ok: true, job }) });
const failure = (code, message, status = 400) => ({ ok: false, status, json: async () => ({ ok: false, code, message }) });
function memory() {
    const values = new Map();
    return { values, getItem: key => values.get(key) || null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
}
function ready(level = 'hint', debug = false) {
    const input = debug ? ceRequest('manual') : request('solve', level);
    const job = { id: (debug ? 'f' : { hint: 'a', approach: 'b', solution: 'c' }[level]).repeat(32), status: 'ready',
        level: debug ? null : level, source: debug ? sourceLines(CE_SOURCE) : [], verdict: debug ? 'CE' : '',
        diagnostic: debug ? { origin: 'manual', hasCompilerOutput: true } : null,
        answer: validateAnswer(debug ? ceAnswer() : answer('solve', level), input),
        usage: { inputTokens: 12, outputTokens: 24, totalTokens: 36, cachedInputTokens: 0 }, elapsedMs: 900 };
    job.html = render(job); return job;
}
function fixture(context, { fetchJob = async (_url, options) => response(ready(options.body?.get('level') || 'hint')), sleep = async () => {}, storage, page = 'problem', clipboard } = {}) {
    const { document, window } = parseHTML('<html><body><main class="main"><div class="row"><div class="medium-9"><h1>测试题</h1></div></div></main></body></html>');
    const config = { endpoint: '/p/P1001/assistant', csrf: 'fixture-csrf', page, userScope: 'main:42', accountConfig: '/home/ai/config', accountSettings: '/home/settings/account#ai' };
    const calls = [], accountCalls = [];
    const panel = mountAssistant({ document, config, storage, sleep, clipboard, fetchImpl: async (url, options) => {
        if (url === config.accountConfig) {
            accountCalls.push({ url, options });
            return { ok: true, json: async () => ({ ok: true, config: { uid: 42, configured: true, hasKey: true, provider: 'agentrouter',
                baseUrl: 'https://agentrouter.org/v1', model: 'gpt-5.6-sol', revision: 'a'.repeat(32), updatedAt: null } }) };
        }
        calls.push({ url, options }); return fetchJob(url, options);
    } });
    context.after(() => panel.dispose());
    return { document, window, config, panel, calls, accountCalls };
}
function click(f, selector) {
    const node = typeof selector === 'string' ? f.document.querySelector(selector) : selector;
    assert.ok(node, `Missing control: ${selector}`);
    node.dispatchEvent(new f.window.Event('click', { bubbles: true, cancelable: true }));
}
const open = f => click(f, '.dfacm-assistant-toggle');
const generate = async (f, mode = 'solve') => { click(f, `[data-assistant-mode="${mode}"]`); await f.panel.task; };
function select(f, id, value) {
    const node = f.panel.querySelector(id);
    for (const option of node.querySelectorAll('option')) option.selected = false;
    node.querySelector(`option[value="${value}"]`).selected = true;
    node.dispatchEvent(new f.window.Event('change', { bubbles: true }));
}
function input(f, id, value) {
    const node = f.panel.querySelector(id); node.value = value;
    node.dispatchEvent(new f.window.Event('input', { bubbles: true }));
}
const result = f => f.panel.querySelector('.dfacm-assistant__result');
const body = f => f.panel.querySelector('#dfacm-assistant-workspace');

test('mode and level choices do not call the model; only the visible explicit action starts a task', async context => {
    const f = fixture(context); open(f);
    assert.equal(f.panel.querySelector('[data-assistant-mode="debug"]').hidden, true);
    click(f, '[data-assistant-level="solution"]');
    assert.equal(f.calls.length, 0); assert.match(f.panel.querySelector('.dfacm-assistant__empty').textContent, /完整.*C\+\+/);
    click(f, '[data-assistant-view="debug"]');
    assert.equal(f.panel.querySelector('[data-assistant-mode="solve"]').hidden, true);
    assert.equal(f.panel.querySelector('.dfacm-assistant__levels').hidden, true);
    assert.match(f.panel.querySelector('.dfacm-assistant__source-help').textContent, /最近一次日常失败提交/);
    click(f, '[data-assistant-view="solve"]'); await generate(f);
    assert.equal(f.calls.length, 1); assert.equal(f.calls[0].options.body.get('level'), 'solution');
    await generate(f); assert.equal(f.calls.length, 1);
    assert.match(f.panel.querySelector('.dfacm-assistant__usage').textContent, /本次未请求模型/);
});

test('pasted source remains selected when the editor is collapsed and after returning from explanation', async context => {
    const f = fixture(context, { fetchJob: async () => response(ready('hint', true)) }); open(f);
    click(f, '[data-assistant-view="debug"]'); click(f, '[data-assistant-source="manual"]');
    input(f, '#dfacm-assistant-code', CE_SOURCE); select(f, '#dfacm-assistant-verdict', 'CE'); input(f, '#dfacm-assistant-compiler', CE_LOG);
    click(f, '[data-assistant-action="edit-code"]'); assert.equal(f.panel.querySelector('.dfacm-assistant__editor').hidden, true);
    assert.match(f.panel.querySelector('.dfacm-assistant__source-help').textContent, /收起输入后仍使用/);
    click(f, '[data-assistant-view="solve"]'); click(f, '[data-assistant-view="debug"]');
    assert.equal(f.panel.querySelector('.dfacm-assistant__editor').hidden, true);
    await generate(f, 'debug');
    assert.equal(f.calls[0].options.body.get('code'), CE_SOURCE);
    assert.equal(f.calls[0].options.body.get('compiler_output'), CE_LOG);
    assert.equal(f.calls[0].options.body.get('verdict'), 'CE');
    assert.equal(f.panel.querySelector('.dfacm-assistant__editor').hidden, true);
});

test('blank pasted code is rejected locally and changing source to recent omits the draft and compiler log', async context => {
    const f = fixture(context, { fetchJob: async () => response(ready('hint', true)) }); open(f);
    click(f, '[data-assistant-view="debug"]'); click(f, '[data-assistant-source="manual"]'); await generate(f, 'debug');
    assert.equal(f.calls.length, 0); assert.match(f.panel.querySelector('.dfacm-assistant__status').textContent, /请先粘贴/);
    input(f, '#dfacm-assistant-code', CE_SOURCE); input(f, '#dfacm-assistant-compiler', CE_LOG);
    click(f, '[data-assistant-source="recent"]'); await generate(f, 'debug');
    assert.equal(f.calls.length, 1); assert.equal(f.calls[0].options.body.has('code'), false);
    assert.equal(f.calls[0].options.body.has('compiler_output'), false);
    click(f, '[data-assistant-source="manual"]'); assert.equal(f.panel.querySelector('#dfacm-assistant-code').value, CE_SOURCE);
});

test('new pasted code starts as unevaluated and editing invalidates only its previous diagnostic', async context => {
    const f = fixture(context, { fetchJob: async () => response(ready('hint', true)) }); open(f);
    click(f, '[data-assistant-source="manual"]'); input(f, '#dfacm-assistant-code', CE_SOURCE);
    assert.equal(f.panel.querySelector('#dfacm-assistant-verdict').value, 'UNKNOWN');
    await generate(f, 'debug'); assert.equal(f.calls[0].options.body.get('verdict'), 'UNKNOWN');
    const html = result(f).innerHTML; click(f, '[data-assistant-action="edit-code"]');
    input(f, '#dfacm-assistant-code', CE_SOURCE + '// changed\n');
    assert.equal(result(f).childElementCount, 0); assert.equal(f.calls.length, 1);
    input(f, '#dfacm-assistant-code', CE_SOURCE); assert.equal(result(f).innerHTML, html);
});

test('generating another level preserves the exact earlier DOM, reading position and original usage', async context => {
    let finishPoll, reached; const seen = new Promise(resolve => { reached = resolve; });
    const f = fixture(context, { sleep: () => new Promise(resolve => { finishPoll = resolve; reached(); }),
        fetchJob: async (_url, options) => response(options.method && options.body.get('level') === 'solution'
            ? { id: 'c'.repeat(32), status: 'pending', elapsedMs: 300, progress: { stage: 'generating', preview: { meaning: '完整题意' } } }
            : ready(options.method ? options.body.get('level') : 'solution')) });
    open(f); await generate(f);
    const earlier = result(f).firstChild; body(f).scrollTop = 145;
    click(f, '[data-assistant-level="solution"]'); click(f, '[data-assistant-mode="solve"]'); await seen;
    click(f, '[data-assistant-level="hint"]');
    assert.equal(result(f).firstChild, earlier); assert.equal(body(f).scrollTop, 145);
    assert.match(f.panel.querySelector('.dfacm-assistant__usage').textContent, /原用量/);
    assert.equal(f.panel.querySelector('.dfacm-assistant__live').hidden, true);
    assert.equal(f.panel.querySelector('.dfacm-assistant__task-bar').hidden, false);
    click(f, '[data-assistant-mode="solve"]'); assert.equal(f.calls.filter(call => call.options.method === 'POST').length, 2);
    finishPoll(); await tick(); await f.panel.task;
    assert.equal(f.panel.querySelector('[data-assistant-level="hint"]').getAttribute('aria-pressed'), 'true');
    assert.equal(result(f).firstChild, earlier);
    click(f, '[data-assistant-action="view-task"]'); assert.ok(result(f).querySelector('[data-solution-code]'));
    click(f, '[data-assistant-level="hint"]'); assert.equal(result(f).firstChild, earlier); assert.equal(body(f).scrollTop, 145);
});

test('refresh failure retains the earlier answer and a retry starts only after an explicit click', async context => {
    let attempted = 0, complete, reached; const seen = new Promise(resolve => { reached = resolve; });
    const f = fixture(context, { sleep: () => new Promise(resolve => { complete = resolve; reached(); }), fetchJob: async (_url, options) => {
        if (options.method) {
            attempted++;
            return response(attempted === 2 ? { id: 'd'.repeat(32), status: 'pending' } : ready());
        }
        return response({ id: 'd'.repeat(32), status: 'failed', error: { code: 'UPSTREAM_AUTH', message: 'API 鉴权失败' } });
    } });
    open(f); await generate(f); const earlier = result(f).firstChild; body(f).scrollTop = 82;
    click(f, '[data-assistant-action="refresh"]'); const task = f.panel.task; await seen;
    assert.equal(result(f).firstChild, earlier); assert.equal(body(f).scrollTop, 82);
    complete(); await task;
    assert.equal(result(f).firstChild, earlier); assert.match(f.panel.querySelector('.dfacm-assistant__status').textContent, /鉴权失败/);
    assert.equal(f.panel.querySelector('.dfacm-assistant__error-actions').hidden, false);
    click(f, '[data-assistant-action="check-settings"]'); await f.panel.querySelector('.dfacm-assistant__settings').task;
    click(f, '[data-assistant-action="back-settings"]'); assert.equal(result(f).firstChild, earlier);
    assert.equal(attempted, 2); await generate(f); assert.equal(attempted, 3);
});

test('interrupted polling keeps the original job and recovery issues GET only, even after switching views', async context => {
    let reads = 0; const storage = memory();
    const f = fixture(context, { storage, fetchJob: async (_url, options) => {
        if (options.method) return response({ id: 'a'.repeat(32), status: 'pending' });
        if (++reads === 1) throw new Error('network offline');
        return response(ready());
    } }); open(f); await generate(f);
    const saved = JSON.parse(storage.getItem(`dfacm-assistant:${f.config.userScope}:${f.config.endpoint}`));
    assert.equal(saved.id, 'a'.repeat(32)); assert.equal(saved.pending, true);
    assert.match(f.panel.querySelector('[data-assistant-mode="solve"]').textContent, /恢复原任务/);
    click(f, '[data-assistant-level="solution"]'); await generate(f);
    assert.equal(f.calls.filter(call => call.options.method === 'POST').length, 1);
    click(f, '[data-assistant-action="view-task"]'); await f.panel.task;
    assert.equal(f.calls.filter(call => call.options.method === 'POST').length, 1);
    assert.equal(reads, 2); assert.ok(result(f).firstChild);
    assert.equal(JSON.parse(storage.getItem(`dfacm-assistant:${f.config.userScope}:${f.config.endpoint}`)).pending, false);
});

test('expired recovery clears the stale task and returns to explicit generation', async context => {
    let reads = 0; const storage = memory();
    const f = fixture(context, { storage, fetchJob: async (_url, options) => {
        if (options.method) return response({ id: 'a'.repeat(32), status: 'pending' });
        if (++reads === 1) throw new Error('offline');
        return failure('JOB_NOT_FOUND', '结果已过期，请重新生成。', 404);
    } }); open(f); await generate(f); await generate(f);
    assert.equal(storage.getItem(`dfacm-assistant:${f.config.userScope}:${f.config.endpoint}`), null);
    assert.match(f.panel.querySelector('[data-assistant-mode="solve"]').textContent, /重试生成/);
    assert.equal(f.panel.querySelector('[data-assistant-mode="solve"]').disabled, false);
    assert.equal(f.calls.filter(call => call.options.method === 'POST').length, 1);
});

test('completion does not steal the current view; reopening the unread launcher shows the completed answer', async context => {
    let complete, reached; const seen = new Promise(resolve => { reached = resolve; });
    const f = fixture(context, { sleep: () => new Promise(resolve => { complete = resolve; reached(); }), fetchJob: async (_url, options) =>
        response(options.method ? { id: 'c'.repeat(32), status: 'pending' } : ready('solution')) }); open(f);
    click(f, '[data-assistant-level="solution"]'); click(f, '[data-assistant-mode="solve"]'); const task = f.panel.task; await seen;
    click(f, '[data-assistant-view="debug"]'); click(f, '[data-window-action="minimize"]'); complete(); await task;
    assert.match(f.document.querySelector('.dfacm-assistant-toggle').textContent, /结果已就绪/);
    open(f); assert.ok(result(f).querySelector('[data-solution-code]')); assert.equal(f.calls.length, 2);
});

test('copying earlier source while another task is active uses the displayed diagnostic source', async context => {
    let complete, reached; const seen = new Promise(resolve => { reached = resolve; }); const copied = [];
    const f = fixture(context, { clipboard: { writeText: async text => copied.push(text) }, sleep: () => new Promise(resolve => { complete = resolve; reached(); }),
        fetchJob: async (_url, options) => response(options.method && options.body.get('mode') === 'debug' ? ready('hint', true)
            : options.method ? { id: 'a'.repeat(32), status: 'pending', source: [] } : ready()) });
    open(f); click(f, '[data-assistant-action="edit-code"]'); input(f, '#dfacm-assistant-code', CE_SOURCE); await generate(f, 'debug');
    const row = result(f).querySelector('[data-source-line="5"]'), details = row.closest('details'); details.open = true;
    click(f, '[data-assistant-view="solve"]'); click(f, '[data-assistant-mode="solve"]'); const task = f.panel.task; await seen;
    click(f, '[data-assistant-view="debug"]'); assert.equal(result(f).querySelector('[data-source-line="5"]'), row); assert.equal(details.open, true);
    click(f, '[data-copy-original]'); await tick(); assert.equal(copied[0], CE_SOURCE);
    complete(); await task;
});

test('settings back and keyboard mode navigation preserve the answer and never generate', async context => {
    const f = fixture(context); open(f); await generate(f); const earlier = result(f).firstChild; body(f).scrollTop = 60;
    click(f, '[data-window-action="settings"]'); await f.panel.querySelector('.dfacm-assistant__settings').task;
    click(f, '[data-assistant-action="back-settings"]');
    assert.equal(result(f).firstChild, earlier); assert.equal(body(f).scrollTop, 60); assert.equal(f.calls.length, 1);
    const event = new f.window.Event('keydown', { bubbles: true, cancelable: true }); Object.defineProperty(event, 'key', { value: 'ArrowRight' });
    f.panel.querySelector('[data-assistant-view="solve"]').dispatchEvent(event);
    assert.equal(event.defaultPrevented, true); assert.equal(f.panel.querySelector('[data-assistant-view="debug"]').getAttribute('aria-selected'), 'true');
    assert.equal(f.calls.length, 1);
});

test('Ctrl Enter diagnoses pasted code once and record pages cannot send a manual code override', async context => {
    const f = fixture(context, { fetchJob: async () => response(ready('hint', true)) }); open(f);
    click(f, '[data-assistant-action="edit-code"]'); input(f, '#dfacm-assistant-code', CE_SOURCE);
    const event = new f.window.Event('keydown', { bubbles: true, cancelable: true });
    Object.defineProperties(event, { key: { value: 'Enter' }, ctrlKey: { value: true } });
    f.panel.querySelector('#dfacm-assistant-code').dispatchEvent(event); await f.panel.task;
    assert.equal(event.defaultPrevented, true); assert.equal(f.calls.length, 1);
    const record = fixture(context, { page: 'record', fetchJob: async () => response(ready('hint', true)) }); open(record);
    assert.equal(record.panel.querySelector('.dfacm-assistant__modes').hidden, true);
    assert.equal(record.panel.querySelector('.dfacm-assistant__sources').hidden, true);
    record.panel.querySelector('#dfacm-assistant-code').value = 'int main(){}'; await generate(record, 'debug');
    assert.equal(record.calls[0].options.body.has('code'), false); assert.match(record.panel.querySelector('.dfacm-assistant__source-help').textContent, /当前评测记录/);
});

test('restoring a pasted-code task reconstructs the original code without persisting the draft or making a POST', async context => {
    const storage = memory(); const key = 'dfacm-assistant:main:42:/p/P1001/assistant';
    storage.setItem(key, JSON.stringify({ id: 'f'.repeat(32), mode: 'debug', source: 'manual', level: 'hint', windowState: 'open', pending: false }));
    const f = fixture(context, { storage, fetchJob: async () => response(ready('hint', true)) }); await f.panel.task;
    assert.equal(f.panel.querySelector('#dfacm-assistant-code').value, CE_SOURCE); assert.ok(result(f).querySelector('[data-source-line="5"]'));
    assert.equal(f.panel.querySelector('#dfacm-assistant-verdict').value, 'CE');
    assert.equal(f.calls.filter(call => call.options.method === 'POST').length, 0);
    assert.ok(!storage.getItem(key).includes(CE_SOURCE)); assert.ok(!storage.getItem(key).includes(CE_LOG));
});
