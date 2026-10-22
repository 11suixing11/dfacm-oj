'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const path = require('node:path');
const { createModelClient, modelConfig, loadSkill } = require('../client.cjs');
const { request, answer } = require('./fixtures.cjs');

const root = path.resolve(__dirname, '../skill/acm-trainer');
const cfg = () => modelConfig({ apiKey: 'fixture-key' });
const response = (message, finish_reason = 'stop') => new Response(JSON.stringify({ choices: [{ message, finish_reason }] }), { status: 200 });

test('AgentRouter config uses selected endpoint/model and rejects keys in URL', () => {
    assert.equal(cfg().endpoint, 'https://agentrouter.org/v1/chat/completions');
    assert.equal(cfg().model, 'gpt-5.6-sol');
    for (const baseUrl of ['http://example.test/v1', 'https://key@example.test/v1', 'https://example.test/v1?key=secret']) {
        assert.throws(() => modelConfig({ baseUrl, apiKey: 'fixture' }), { code: 'NOT_CONFIGURED' });
    }
    assert.throws(() => modelConfig(), { code: 'NOT_CONFIGURED' });
});

test('real Skill entry, mode guide and OJ contract are loaded for model request', async () => {
    let sent;
    const client = createModelClient({ resourceRoot: root, fetchImpl: async (url, options) => {
        sent = { url, options, body: JSON.parse(options.body) };
        return response({ content: JSON.stringify(answer()) });
    } });
    const output = await client.generate(request(), cfg());
    assert.equal(output.mode, 'solve');
    assert.equal(sent.url, 'https://agentrouter.org/v1/chat/completions');
    assert.equal(sent.options.headers.Authorization, 'Bearer fixture-key');
    assert.equal(sent.body.model, 'gpt-5.6-sol');
    assert.match(sent.body.messages[0].content, /解题流程（F1）/);
    assert.match(sent.body.messages[0].content, /OJ 题目旁助手/);
    assert.match(sent.body.messages[0].content, /read_template/);
    assert.equal(sent.body.messages[1].content, JSON.stringify(request()));
    assert.ok(!sent.body.messages.some((message) => message.content?.includes('fixture-key')));
});

test('model can read an actual allowlisted algorithm template before complete solution', async () => {
    const calls = [];
    const client = createModelClient({ resourceRoot: root, fetchImpl: async (_url, options) => {
        const body = JSON.parse(options.body); calls.push(body);
        if (calls.length === 1) return response({ content: null, tool_calls: [
            { id: 'call1', type: 'function', function: { name: 'read_template', arguments: '{"name":"dsu.md"}' } },
        ] }, 'tool_calls');
        return response({ content: JSON.stringify(answer()) });
    } });
    await client.generate(request(), cfg());
    assert.equal(calls.length, 2);
    const loaded = calls[1].messages.find((message) => message.role === 'tool');
    assert.equal(loaded.content, loadSkill(root).templates.get('dsu.md'));
    assert.equal(loaded.tool_call_id, 'call1');
});

test('template tool cannot read paths outside its allowlist', async () => {
    const client = createModelClient({ resourceRoot: root, fetchImpl: async () => response({ content: null, tool_calls: [
        { id: 'call1', type: 'function', function: { name: 'read_template', arguments: '{"name":"../../.env"}' } },
    ] }) });
    await assert.rejects(client.generate(request(), cfg()), { code: 'INVALID_RESPONSE' });
});

test('upstream errors and network exceptions never expose credentials or response bodies', async () => {
    for (const status of [401, 403, 429, 500]) {
        const client = createModelClient({ resourceRoot: root, fetchImpl: async () => new Response('secret upstream details fixture-key', { status }) });
        await assert.rejects(client.generate(request(), cfg()), (error) => !error.message.includes('fixture-key') && !error.message.includes('details'));
    }
    const client = createModelClient({ resourceRoot: root, fetchImpl: async () => { throw new Error('header fixture-key leaked'); } });
    await assert.rejects(client.generate(request(), cfg()), { code: 'UPSTREAM_ERROR' });
});

test('truncated JSON, unverified source locations and long responses fail explicitly', async () => {
    const raw = answer('debug'); raw.issues[0].locations[0].quote = 'incorrect';
    const client = createModelClient({ resourceRoot: root, fetchImpl: async () => response({ content: JSON.stringify(raw) }) });
    await assert.rejects(client.generate(request('debug'), cfg()), { code: 'INVALID_LOCATION' });
    const cut = createModelClient({ resourceRoot: root, fetchImpl: async () => response({ content: '{' }, 'length') });
    await assert.rejects(cut.generate(request(), cfg()), { code: 'INCOMPLETE_RESPONSE' });
    const large = createModelClient({ resourceRoot: root, fetchImpl: async () => new Response('x'.repeat(1024 * 1024 + 1)) });
    await assert.rejects(large.generate(request(), cfg()), { code: 'INVALID_RESPONSE' });
});

test('abort cancels a model call instead of retrying billable requests', async () => {
    const controller = new AbortController(); let calls = 0;
    const client = createModelClient({ resourceRoot: root, fetchImpl: async (_url, { signal }) => {
        calls++;
        return new Promise((_resolve, reject) => {
            signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
        });
    } });
    const pending = client.generate(request(), cfg(), controller.signal);
    controller.abort();
    await assert.rejects(pending, { code: 'TIMEOUT' });
    assert.equal(calls, 1);
});
