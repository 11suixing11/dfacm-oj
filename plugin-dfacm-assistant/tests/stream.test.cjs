'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
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

test('truncation, unfinished streams, error events, malformed JSON and excessive tool indexes fail', async () => {
    for (const [raw, code] of [
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
