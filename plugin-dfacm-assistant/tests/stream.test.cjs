'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const http = require('node:http');
const { sseParser, readChatStream } = require('../stream.cjs');
const event = value => 'data: ' + JSON.stringify(value) + '\r\n\r\n';
const response = raw => new Response(new ReadableStream({ start(controller) {
    const bytes = Buffer.from(raw);
    for (let index = 0; index < bytes.length; index++) controller.enqueue(bytes.subarray(index, index + 1));
    controller.close();
} }), { headers: { 'content-type': 'text/event-stream' } });

test('SSE handles split CRLF, comments, multiline data and UTF-8 answer fragments', async () => {
    const events = []; const parser = sseParser(value => events.push(value));
    for (const chunk of [': heartbeat\r', '\ndata: first\r\n', 'data: second\r\n\r', '\n']) parser.push(chunk);
    parser.finish(); assert.deepEqual(events, [{ event: '', data: 'first\nsecond' }]);
    const preview = [], usage = [];
    const result = await readChatStream(response(event({ choices: [{ index: 0, delta: { content: '中文🙂' } }] })
        + event({ choices: [{ index: 0, delta: { content: '答案' }, finish_reason: 'stop' }] })
        + event({ choices: [], usage: { prompt_tokens: 4, completion_tokens: 2 } }) + 'data: [DONE]\r\n\r\n'), value => preview.push(value), value => usage.push(value));
    assert.equal(result.content, '中文🙂答案'); assert.equal(preview.at(-1), '中文🙂答案'); assert.equal(usage.length, 1);
});

test('streamed template calls preserve fragmented names, arguments and exact call IDs', async () => {
    const result = await readChatStream(response(event({ choices: [{ delta: { tool_calls: [{ index: 0, id: 'call-1', type: 'function', function: { name: 'read_', arguments: '{"name":"prefix-' } }] } }] })
        + event({ choices: [{ delta: { tool_calls: [{ index: 0, function: { name: 'template', arguments: 'sum.md"}' } }] }, finish_reason: 'tool_calls' }] }) + 'data: [DONE]\n\n'));
    assert.deepEqual(result.tool_calls, [{ id: 'call-1', type: 'function', function: { name: 'read_template', arguments: '{"name":"prefix-sum.md"}' } }]);
});

test('complete DONE returns without HTTP EOF on a localhost SSE connection', async () => {
    const server = http.createServer((_request, reply) => {
        reply.writeHead(200, { 'content-type': 'text/event-stream' });
        reply.write(event({ choices: [{ delta: { content: 'complete' }, finish_reason: 'stop' }] }) + 'data: [DONE]\n\n');
        // Deliberately keep HTTP open; the SSE marker is the end of this answer.
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 750);
    try {
        const upstream = await fetch(`http://127.0.0.1:${server.address().port}/`, { signal: controller.signal });
        const observed = await readChatStream(upstream).then(result => ({ result }), error => ({ error: error.name }));
        assert.deepEqual(observed, { result: { content: 'complete', tool_calls: undefined, finish_reason: 'stop' } });
        assert.equal(controller.signal.aborted, false);
    } finally {
        clearTimeout(timer); server.closeAllConnections();
        await new Promise(resolve => server.close(resolve));
    }
});

test('split DONE cancels an open stream and retains usage after finish', async () => {
    let canceled = false;
    const chunks = [event({ choices: [{ delta: { content: '答案🙂' }, finish_reason: 'stop' }] }),
        event({ choices: [], usage: { prompt_tokens: 4, completion_tokens: 2 } }) + 'data: [DO', 'NE]\r\n', '\r\n'];
    let controller;
    const upstream = new Response(new ReadableStream({
        start(value) { controller = value; },
        pull(value) { if (chunks.length) value.enqueue(Buffer.from(chunks.shift())); },
        cancel() { canceled = true; },
    }));
    // Bound the regression even before the fix; EOF then exposes missed cancellation.
    const timer = setTimeout(() => controller.close(), 750);
    const usage = [], preview = [];
    try {
        const result = await readChatStream(upstream, value => preview.push(value), value => usage.push(value));
        assert.equal(canceled, true, 'DONE must cancel before HTTP EOF');
        assert.equal(result.content, '答案🙂');
        assert.deepEqual(preview, ['答案🙂']);
        assert.deepEqual(usage, [{ prompt_tokens: 4, completion_tokens: 2 }]);
    } finally { clearTimeout(timer); }
});

test('events after DONE in the same chunk cannot change content, usage or success', async () => {
    const preview = [], usage = [];
    const raw = event({ choices: [{ delta: { content: 'complete' }, finish_reason: 'stop' }] })
        + event({ choices: [], usage: { prompt_tokens: 4, completion_tokens: 2 } }) + 'data: [DONE]\n\n'
        + 'event: error\ndata: late provider error\n\n'
        + event({ choices: [{ delta: { content: 'late', tool_calls: [{ index: 0, id: 'late-call', function: { name: 'read_template', arguments: '{"name":"dsu.md"}' } }] }, finish_reason: 'length' }], usage: { prompt_tokens: 99, completion_tokens: 99 } })
        + 'data: malformed trailing JSON\n\n';
    const upstream = new Response(new ReadableStream({ start(controller) { controller.enqueue(Buffer.from(raw)); controller.close(); } }));
    const result = await readChatStream(upstream, value => preview.push(value), value => usage.push(value));
    assert.equal(result.content, 'complete'); assert.equal(result.finish_reason, 'stop'); assert.equal(result.tool_calls, undefined);
    assert.deepEqual(preview, ['complete']);
    assert.deepEqual(usage, [{ prompt_tokens: 4, completion_tokens: 2 }]);
});

test('HTTP EOF still flushes a final DONE without a terminating blank line', async () => {
    const result = await readChatStream(response(event({ choices: [{ delta: { content: 'complete' }, finish_reason: 'stop' }] }) + 'data: [DONE]'));
    assert.equal(result.content, 'complete'); assert.equal(result.finish_reason, 'stop');
});

test('truncation, unfinished streams, error events, malformed JSON and excessive tool indexes fail', async () => {
    for (const [raw, code] of [
        [event({ choices: [{ delta: { content: 'partial' } }] }) + 'data: [DONE]\n\n', 'INCOMPLETE_RESPONSE'],
        [event({ choices: [{ delta: { content: 'partial' }, finish_reason: 'length' }] }) + 'data: [DONE]\n\n', 'INCOMPLETE_RESPONSE'],
        [event({ choices: [{ delta: { content: 'partial' }, finish_reason: 'stop' }] }), 'INCOMPLETE_RESPONSE'],
        ['event: error\ndata: provider aborted\n\ndata: [DONE]\n\n', 'UPSTREAM_ERROR'],
        ['data: {incomplete}\n\n', 'INVALID_RESPONSE'],
        [event({ choices: [{ delta: { tool_calls: [{ index: 99 }] } }] }), 'INVALID_RESPONSE'],
    ]) await assert.rejects(readChatStream(response(raw)), { code });
    let canceled = false;
    const bad = new Response(new ReadableStream({ start(controller) { controller.enqueue(Buffer.from('data: invalid\n\n')); }, cancel() { canceled = true; } }));
    await assert.rejects(readChatStream(bad), { code: 'INVALID_RESPONSE' }); assert.equal(canceled, true);
    const parser = sseParser(() => {}); assert.throws(() => parser.push('x'.repeat(1024 * 1024 + 1)), { code: 'INVALID_RESPONSE' });
});
