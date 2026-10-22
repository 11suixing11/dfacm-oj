'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { once } = require('node:events');
const { createPreviewServer } = require('../preview.cjs');

test('preview account settings persist in one server and enable mock generation without a real supplier call', async context => {
    const server = createPreviewServer(); server.listen(0, '127.0.0.1'); await once(server, 'listening');
    context.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
    const base = `http://127.0.0.1:${server.address().port}`;
    const html = await (await fetch(base + '/home/settings/account')).text();
    assert.match(html, /data-dfacm-ai-settings/); assert.match(html, /请使用演示 Key/);
    let result = await (await fetch(base + '/home/ai/config')).json(); assert.equal(result.config.configured, false);
    const body = new URLSearchParams({ action: 'save', csrf: result.csrf, revision: '', provider: 'agentrouter', model: 'gpt-5.6-sol' });
    result = await (await fetch(base + '/home/ai/config', { method: 'POST', body, headers: { 'x-dfacm-ai-key': 'preview-only-fixture-key' } })).json();
    assert.equal(result.config.configured, true); assert.ok(!JSON.stringify(result).includes('preview-only-fixture-key'));
    const newVisit = await (await fetch(base + '/home/ai/config')).json(); assert.equal(newVisit.config.revision, result.config.revision);
    const generated = await (await fetch(base + '/p/P1001/assistant', { method: 'POST', body: new URLSearchParams({
        csrf: 'preview-fixture-token', mode: 'solve', provider: 'account',
    }) })).json();
    assert.equal(generated.ok, true); assert.equal(generated.job.status, 'pending');
    body.set('action', 'clear'); body.set('revision', result.config.revision);
    await fetch(base + '/home/ai/config', { method: 'POST', body });
    const missing = await (await fetch(base + '/p/P1001/assistant', { method: 'POST', body: new URLSearchParams({
        csrf: 'preview-fixture-token', mode: 'solve', provider: 'account',
    }) })).json();
    assert.equal(missing.code, 'AI_NOT_CONFIGURED');
});
