'use strict';

const { AssistantError } = require('./protocol.cjs');
const LIMIT = 1024 * 1024;

function sseParser(receive) {
    let buffer = '', data = [], event = '', bytes = 0;
    function dispatch() {
        if (data.length) receive({ event, data: data.join('\n') });
        data = []; event = '';
    }
    function line(text) {
        if (text === '') return dispatch();
        if (text[0] === ':') return;
        const colon = text.indexOf(':');
        const field = colon < 0 ? text : text.slice(0, colon);
        let value = colon < 0 ? '' : text.slice(colon + 1);
        if (value[0] === ' ') value = value.slice(1);
        if (field === 'data') data.push(value);
        if (field === 'event') event = value;
    }
    return {
        push(chunk) {
            bytes += Buffer.byteLength(chunk);
            if (bytes > LIMIT) throw new AssistantError('INVALID_RESPONSE', '模型返回内容过长，请重试。', 502);
            buffer += chunk;
            let newline;
            while ((newline = buffer.indexOf('\n')) >= 0) {
                line(buffer.slice(0, newline).replace(/\r$/, '')); buffer = buffer.slice(newline + 1);
            }
        },
        finish() { if (buffer) line(buffer.replace(/\r$/, '')); buffer = ''; dispatch(); },
    };
}

async function readChatStream(response, onText, onUsage) {
    let content = '', finish = null, done = false, failed = false;
    const calls = new Map();
    const parser = sseParser(({ data, event }) => {
        if (event === 'error') { failed = true; return; }
        if (done) return;
        if (data === '[DONE]') { done = true; return; }
        let value;
        try { value = JSON.parse(data); } catch { throw new AssistantError('INVALID_RESPONSE', '模型返回的流式内容不完整，请重试。', 502); }
        if (value.error) { failed = true; return; }
        if (value.usage) onUsage?.(value.usage);
        const choice = value.choices?.find(item => item.index === 0 || item.index === undefined);
        if (!choice) return;
        if (choice.finish_reason) finish = choice.finish_reason;
        const delta = choice.delta;
        if (!delta) return;
        if (typeof delta.content === 'string') { content += delta.content; onText?.(content); }
        for (const call of delta.tool_calls || []) {
            if (!Number.isSafeInteger(call.index) || call.index < 0 || call.index > 1) throw new AssistantError('INVALID_RESPONSE', '模型读取模板失败，请重试。', 502);
            const prior = calls.get(call.index) || { id: '', type: 'function', function: { name: '', arguments: '' } };
            if (call.id) prior.id = call.id;
            if (call.type) prior.type = call.type;
            if (typeof call.function?.name === 'string') prior.function.name += call.function.name;
            if (typeof call.function?.arguments === 'string') prior.function.arguments += call.function.arguments;
            calls.set(call.index, prior);
        }
    });
    const reader = response.body?.getReader?.();
    if (!reader) throw new AssistantError('INVALID_RESPONSE', '模型没有返回可读取的内容，请重试。', 502);
    const decoder = new TextDecoder();
    try {
        for (;;) {
            const { value, done: end } = await reader.read(); if (end) break;
            parser.push(decoder.decode(value, { stream: true }));
        }
        parser.push(decoder.decode()); parser.finish();
    } finally { await reader.cancel().catch(() => {}); }
    if (failed) throw new AssistantError('UPSTREAM_ERROR', '模型生成中断，请稍后重试。', 502);
    if (!done || !finish || finish === 'length') throw new AssistantError('INCOMPLETE_RESPONSE', '模型答案未生成完整，请重试。', 502);
    return { content, tool_calls: calls.size ? [...calls].sort((a, b) => a[0] - b[0]).map(([, value]) => value) : undefined, finish_reason: finish };
}

module.exports = { sseParser, readChatStream };
