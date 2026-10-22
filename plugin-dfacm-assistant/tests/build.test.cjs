'use strict';

const assert = require('node:assert/strict');
const vm = require('node:vm');
const { test } = require('node:test');
const { parseHTML } = require('linkedom');
const { checkBuild } = require('../scripts/check-build.cjs');

test('Hydro frontend bundle registers a named page and mounts after UiContext is parsed', async () => {
    const { backend, frontend } = await checkBuild();
    assert.equal(backend.errors.length, 0);
    const script = frontend.outputFiles.find((file) => file.path.endsWith('.js'));
    assert.ok(script);
    assert.ok(frontend.outputFiles.some((file) => file.path.endsWith('.css') && file.text.includes('.dfacm-assistant')));
    const { document } = parseHTML('<html><body><main class="main"><div class="row"><div class="medium-9 columns"></div></div></main></body></html>');
    const registered = [];
    const window = { document, UiContext: { dfacmAssistant: { page: 'problem', endpoint: '/p/P1001/assistant', csrf: 'token' } },
        navigator: {}, fetch() { throw new Error('No request should run until a click'); }, addEventListener() {},
        HydroExports: { addPage: (page) => registered.push(page), NamedPage: class { constructor(name, afterLoading) { this.name = name; this.afterLoading = afterLoading; } } } };
    Object.defineProperty(window, 'sessionStorage', { get() { throw new Error('Storage unavailable'); } });
    vm.runInNewContext(script.text, { window, document, setTimeout, URLSearchParams });
    assert.equal(registered.length, 2);
    assert.deepEqual([...registered[0].name], ['problem_detail', 'record_detail']);
    assert.equal(document.getElementById('dfacm-assistant'), null);
    registered[0].afterLoading();
    const panel = document.getElementById('dfacm-assistant');
    assert.ok(panel);
    assert.equal(panel.hidden, true);
    assert.equal(panel.parentNode, document.body);
    assert.equal(document.getElementById('dfacm-assistant-toggle').hidden, false);
    assert.deepEqual([...panel.querySelectorAll('#dfacm-assistant-provider option')].map(option => option.value), ['agentrouter', 'custom']);
    assert.equal(panel.querySelector('.dfacm-assistant__invite').href, 'https://agentrouter.org/register?aff=SeEq');
    assert.equal(panel.textContent.includes('站点默认'), false);
});

test('native account named page mounts the settings form from safe UiContext and clears keys on navigation', async () => {
    const { frontend } = await checkBuild(); const script = frontend.outputFiles.find(file => file.path.endsWith('.js'));
    const { document } = parseHTML('<html><body><article>账户资料</article><div data-dfacm-ai-settings></div></body></html>');
    const pages = []; const events = {}; let requests = 0;
    const window = { document, UiContext: { dfacmAiSettings: { uid: 42, endpoint: '/home/ai/config', csrf: 'a'.repeat(64) } },
        fetch: async () => { requests++; return { ok: true, json: async () => ({ ok: true, csrf: 'a'.repeat(64), config: {
            uid: 42, configured: true, hasKey: true, provider: 'agentrouter', baseUrl: 'https://agentrouter.org/v1',
            model: 'gpt-5.6-sol', revision: 'b'.repeat(32), updatedAt: null,
        } }) }; }, addEventListener(name, callback) { events[name] = callback; },
        HydroExports: { addPage: page => pages.push(page), NamedPage: class { constructor(name, callback) { this.name = name; this.afterLoading = callback; } } } };
    vm.runInNewContext(script.text, { window, document, URL, URLSearchParams, setTimeout });
    assert.deepEqual([...pages[1].name], ['home_account', 'dfacm_ai_account_settings']);
    assert.equal(requests, 0); pages[1].afterLoading(); await document.querySelector('[data-dfacm-ai-settings]').task;
    assert.equal(requests, 1); assert.equal(document.querySelector('article').textContent, '账户资料');
    const key = document.querySelector('#dfacm-ai-api-key'); key.value = 'typed-fixture-key'; events.pagehide({ persisted: true });
    assert.equal(key.value, ''); assert.ok(frontend.outputFiles.some(file => file.path.endsWith('.css') && file.text.includes('.dfacm-ai-settings__actions')));
});
