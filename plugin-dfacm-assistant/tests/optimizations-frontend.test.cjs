'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { parseHTML } = require('linkedom');
const { mountAssistant } = require('../frontend/panel.js');
const { validateAnswer, sourceLines } = require('../protocol.cjs');
const { request, answer, SOURCE, CE_SOURCE, CE_LOG, ceRequest, ceAnswer } = require('./fixtures.cjs');
const { render } = require('./render.cjs');
const tick = () => new Promise(resolve => setImmediate(resolve));
const response = job => ({ ok: true, json: async () => ({ ok: true, job }) });
const metadata = () => ({ ok: true, json: async () => ({ ok: true, config: { uid: 42, provider: 'agentrouter', baseUrl: 'https://agentrouter.org/v1', model: 'gpt-5.6-sol', configured: true, hasKey: true, revision: 'a'.repeat(32) } }) });
const ready = (level = 'hint', debug = false) => {
    const input = debug ? ceRequest('manual') : request('solve', level);
    const job = { id: (debug ? 'f' : { hint: 'a', approach: 'b', solution: 'c' }[level]).repeat(32), status: 'ready',
        source: debug ? sourceLines(CE_SOURCE) : [], verdict: debug ? 'CE' : '', diagnostic: debug ? { origin: 'manual', hasCompilerOutput: true } : null,
        level: debug ? null : level, answer: validateAnswer(debug ? ceAnswer() : answer('solve', level), input),
        elapsedMs: 1250, usage: { inputTokens: 20, outputTokens: 40, totalTokens: 60, cachedInputTokens: 5 } };
    job.html = render(job); return job;
};
function sourceEvents(initial) {
    const handlers = new Map();
    return { ...initial, handlers,
        addEventListener(type, handler) { if (!handlers.has(type)) handlers.set(type, new Set()); handlers.get(type).add(handler); },
        removeEventListener(type, handler) { handlers.get(type)?.delete(handler); },
        dispatch(type) { for (const handler of handlers.get(type) || []) handler(); } };
}
function fixture({ fetchJob = async () => response(ready()), sleep = async () => {}, mobile = false, storage, clipboard } = {}) {
    const { document, window } = parseHTML('<html><body><main class="main"><div class="row"><div class="medium-9"><article>完整题面</article></div></div></main></body></html>');
    const media = sourceEvents({ matches: mobile }); const viewport = sourceEvents({ height: 700, offsetTop: 0 });
    Object.defineProperty(window, 'matchMedia', { configurable: true, value: () => media });
    Object.defineProperty(window, 'visualViewport', { configurable: true, value: viewport });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 900 });
    const config = { endpoint: '/p/P1001/assistant', csrf: 'fixture-csrf', page: 'problem', userScope: 'main:42', accountConfig: '/home/ai/config', accountSettings: '/home/settings/account#ai' };
    const panel = mountAssistant({ document, config, sleep, storage, clipboard, fetchImpl: (url, options) => url === '/home/ai/config' ? metadata() : fetchJob(url, options) });
    return { document, window, panel, media, viewport, config };
}
const click = (f, selector) => (typeof selector === 'string' ? f.document.querySelector(selector) : selector)
    .dispatchEvent(new f.window.Event('click', { bubbles: true, cancelable: true }));
const open = f => click(f, '.dfacm-assistant-toggle');

test('level selection makes no request; explicit generation requests distinct content and switching back reuses results', async context => {
    const calls = []; const values = new Map();
    const storage = { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
    const f = fixture({ storage, fetchJob: async (_url, options) => { calls.push(options); return response(ready(options.body.get('level'))); } }); context.after(() => f.panel.dispose());
    await tick(); open(f); assert.equal(calls.length, 0);
    assert.equal(f.panel.querySelector('[data-assistant-level="hint"]').getAttribute('aria-pressed'), 'true');
    click(f, '[data-assistant-mode="solve"]'); await f.panel.task;
    assert.equal(calls[0].body.get('level'), 'hint'); assert.equal(f.panel.querySelector('[data-solution-code]'), null);
    const hintHtml = f.panel.querySelector('.dfacm-assistant__result').innerHTML;
    click(f, '[data-assistant-level="solution"]'); assert.equal(calls.length, 1);
    assert.equal(f.panel.querySelector('.dfacm-assistant__result').childElementCount, 0);
    click(f, '[data-assistant-mode="solve"]'); await f.panel.task;
    assert.equal(calls[1].body.get('level'), 'solution'); assert.match(f.panel.querySelector('[data-solution-code]').textContent, /long long/);
    click(f, '[data-assistant-level="approach"]'); assert.equal(calls.length, 2);
    click(f, '[data-assistant-mode="solve"]'); await f.panel.task;
    assert.equal(calls[2].body.get('level'), 'approach'); assert.equal(f.panel.querySelector('[data-solution-code]'), null);
    click(f, '[data-assistant-level="hint"]');
    assert.equal(calls.length, 3); assert.equal(f.panel.querySelector('.dfacm-assistant__result').innerHTML, hintHtml);
    assert.match(f.panel.querySelector('.dfacm-assistant__usage').textContent, /本页已有结果，本次未请求模型/);
    assert.match(f.panel.querySelector('.dfacm-assistant__usage').textContent, /原用量 输入 20 \/ 输出 40/);
    assert.equal(JSON.parse([...values.values()][0]).id, 'a'.repeat(32));
    assert.equal(f.panel.querySelector('input[type="password"]'), null);
    assert.ok(calls.every(options => options.headers['x-dfacm-ai-key'] === undefined));
});

test('pending answer previews are safe and survive minimize without starting another task', async context => {
    let continuePoll, started; const seen = new Promise(resolve => { started = resolve; }); const calls = [];
    const f = fixture({ fetchJob: async (_url, options) => {
        calls.push(options); return response(options.method ? { id: 'a'.repeat(32), status: 'pending', elapsedMs: 700,
            progress: { stage: 'generating', preview: { meaning: '<img src=x onerror=alert(1)>已完成的题意' } } } : ready());
    }, sleep: () => new Promise(resolve => { continuePoll = resolve; started(); }) }); context.after(() => f.panel.dispose());
    await tick(); open(f); click(f, '[data-assistant-mode="solve"]'); await seen;
    const preview = f.panel.querySelector('.dfacm-assistant__live');
    assert.equal(preview.hidden, false); assert.equal(preview.querySelector('img'), null); assert.match(preview.textContent, /已完成的题意/);
    const toolbar = f.panel.querySelector('.dfacm-assistant__toolbar'); const body = f.panel.querySelector('.dfacm-assistant__body');
    assert.equal(toolbar.parentElement, f.panel); assert.equal(body.contains(toolbar), false);
    assert.ok([...f.panel.querySelectorAll('[data-assistant-level]')].every(button => !button.disabled));
    click(f, '[data-window-action="minimize"]'); assert.equal(f.panel.hidden, true);
    open(f); assert.equal(preview.hidden, false); assert.equal(calls.length, 1);
    continuePoll(); await f.panel.task;
    assert.equal(calls.length, 2); assert.equal(preview.hidden, true); assert.equal(f.panel.getAttribute('aria-busy'), 'false');
    assert.match(f.panel.querySelector('.dfacm-assistant__usage').textContent, /耗时 1\.3s.*输入 20.*输出 40.*上游缓存输入 5/);
});

test('CE sends the actual manual compiler log and navigates the root-cause original line', async context => {
    const calls = [], copied = []; const f = fixture({ fetchJob: async (_url, options) => { calls.push(options); return response(ready('hint', true)); }, clipboard: { writeText: async value => copied.push(value) } }); context.after(() => f.panel.dispose());
    await tick(); open(f); click(f, '.dfacm-assistant__text-button');
    f.panel.querySelector('#dfacm-assistant-code').value = CE_SOURCE;
    const select = f.panel.querySelector('#dfacm-assistant-verdict');
    for (const option of select.querySelectorAll('option')) option.selected = false;
    select.querySelector('[value="CE"]').selected = true;
    select.dispatchEvent(new f.window.Event('change', { bubbles: true }));
    assert.equal(f.panel.querySelector('.dfacm-assistant__compiler-editor').hidden, false);
    f.panel.querySelector('#dfacm-assistant-compiler').value = CE_LOG;
    click(f, '[data-assistant-mode="debug"]'); await f.panel.task;
    assert.equal(calls[0].body.get('code'), CE_SOURCE); assert.equal(calls[0].body.get('compiler_output'), CE_LOG);
    assert.equal(calls[0].body.has('level'), false);
    assert.match(f.panel.querySelector('.dfacm-assistant__diagnostic-context').textContent, /粘贴的原始代码.*已结合编译日志/);
    assert.equal(f.panel.textContent.includes('构造反例'), false);
    const row = f.panel.querySelector('[data-source-line="5"]'), details = row.closest('details');
    assert.ok(row.classList.contains('is-issue')); details.open = false;
    let focused = false, scrolled = false; row.focus = () => { focused = true; }; row.scrollIntoView = () => { scrolled = true; };
    click(f, '[data-jump-line="5"]');
    assert.equal(details.open, true); assert.equal(focused, true); assert.equal(scrolled, true); assert.ok(row.classList.contains('is-focused'));
    click(f, '[data-copy-original]'); await tick(); assert.equal(copied[0], CE_SOURCE);
    assert.equal(f.panel.querySelector('[data-source-line="3"] code').textContent.trim(), '');
});

test('mobile drawer handles backdrop, Escape, focus trap, viewport keyboard and disposal', async () => {
    let calls = 0; const f = fixture({ mobile: true, fetchJob: async () => { calls++; return response(ready()); } }); await tick();
    let focused = null; Object.defineProperty(f.document, 'activeElement', { configurable: true, get: () => focused });
    const panel = f.panel, toggle = f.document.querySelector('.dfacm-assistant-toggle');
    panel.focus = () => { focused = panel; }; toggle.focus = () => { focused = toggle; };
    for (const node of panel.querySelectorAll('button,textarea,select,a[href]')) node.focus = () => { focused = node; };
    open(f); assert.equal(panel.getAttribute('aria-modal'), 'true'); assert.equal(toggle.hidden, true);
    assert.ok(f.document.body.classList.contains('dfacm-assistant-drawer-open')); assert.equal(f.document.querySelector('.dfacm-assistant-backdrop').hidden, false);
    f.viewport.height = 420; f.viewport.offsetTop = 20; f.viewport.dispatch('resize');
    assert.equal(panel.style.getPropertyValue('--assistant-viewport-height'), '420px'); assert.equal(panel.style.getPropertyValue('--assistant-viewport-bottom'), '460px');
    const nodes = [...panel.querySelectorAll('button,textarea,select,a[href]')].filter(node => !node.disabled && !node.closest('[hidden]'));
    focused = nodes.at(-1); const tab = new f.window.Event('keydown', { bubbles: true, cancelable: true }); Object.defineProperty(tab, 'key', { value: 'Tab' }); panel.dispatchEvent(tab);
    assert.equal(tab.defaultPrevented, true); assert.equal(focused, nodes[0]);
    click(f, '.dfacm-assistant-backdrop'); assert.equal(panel.hidden, true); assert.equal(toggle.hidden, false); assert.equal(focused, toggle);
    open(f); const escape = new f.window.Event('keydown', { bubbles: true, cancelable: true }); Object.defineProperty(escape, 'key', { value: 'Escape' }); panel.dispatchEvent(escape);
    assert.equal(panel.hidden, true); assert.equal(calls, 0);
    open(f); f.media.matches = false; f.media.dispatch('change'); assert.equal(panel.getAttribute('aria-modal'), 'false'); assert.equal(toggle.hidden, false);
    f.media.matches = true; f.media.dispatch('change'); assert.equal(toggle.hidden, true);
    panel.dispose(); assert.equal(f.document.querySelector('.dfacm-assistant-backdrop'), null); assert.equal(f.document.getElementById(panel.id), null);
    assert.equal(f.document.body.classList.contains('dfacm-assistant-drawer-open'), false);
    assert.equal(f.media.handlers.get('change').size, 0); assert.equal(f.viewport.handlers.get('resize').size, 0);
});

test('server cache reuse displays original supplier use without claiming a new model request', async context => {
    const cached = { ...ready(), cacheHit: true }; const f = fixture({ fetchJob: async () => response(cached) }); context.after(() => f.panel.dispose());
    await tick(); open(f); click(f, '[data-assistant-mode="solve"]'); await f.panel.task;
    assert.match(f.panel.querySelector('.dfacm-assistant__usage').textContent, /命中 OJ 缓存，本次未请求模型.*原生成.*原用量/);
});
