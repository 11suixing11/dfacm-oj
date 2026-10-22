'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const path = require('node:path');
const { createProgressReporter, completedStrings, usageDto } = require('../progress.cjs');
const { createModelClient, personalModelConfig } = require('../client.cjs');
const { validateAnswer } = require('../protocol.cjs');
const { answerSchema } = require('../codex-client.cjs');
const { request, answer, ceRequest, ceAnswer } = require('./fixtures.cjs');

const resourceRoot = path.resolve(__dirname, '../skill/acm-trainer');
const config = personalModelConfig({ provider: 'custom', baseUrl: 'https://fixture.example.com/v1', model: 'fixture', apiKey: 'never-echo-fixture-key' });
const event = value => 'data: ' + JSON.stringify(value) + '\n\n';
const usage = { prompt_tokens: 13, completion_tokens: 7, prompt_tokens_details: { cached_tokens: 3 } };
const dto = { inputTokens: 13, outputTokens: 7, totalTokens: 20, cachedInputTokens: 3 };

test('help levels enforce distinct answers and never accept hidden full programs', () => {
    for (const level of ['hint', 'approach', 'solution']) {
        const result = validateAnswer(answer('solve', level), request('solve', level));
        assert.equal(result.level, level);
        assert.equal(!!result.code, level === 'solution');
        if (level !== 'solution') {
            assert.deepEqual(answerSchema('solve', level).properties.code.enum, ['']);
            assert.throws(() => validateAnswer(answer(), request('solve', level)), { code: 'INVALID_RESPONSE' });
            const bad = answer('solve', level); bad.approach = '```cpp\nint main() {}\n```';
            assert.throws(() => validateAnswer(bad, request('solve', level)), { code: 'INVALID_RESPONSE' });
        }
    }
    assert.equal(validateAnswer(answer(), request()).level, 'solution');
    assert.throws(() => validateAnswer(answer(), request('solve', 'unknown')), { code: 'INVALID_LEVEL' });
    assert.equal(validateAnswer(ceAnswer(), ceRequest()).issues[0].locations[0].startLine, 5);
    const badCE = ceAnswer(); badCE.counterexamples = answer('debug').counterexamples;
    assert.throws(() => validateAnswer(badCE, ceRequest()), { code: 'INVALID_RESPONSE' });
});

test('previews contain only completed top-level answer fields, never reasoning, code or credentials', () => {
    assert.deepEqual(completedStrings('{"status":"ok","mode":"solve","meaning":"中文\\n转义","approach":"未完'),
        { status: 'ok', mode: 'solve', meaning: '中文\n转义' });
    const events = []; const reporter = createProgressReporter({ request: request('solve', 'hint'), apiKey: config.apiKey, onProgress: value => events.push(value) });
    reporter.text('{"status":"ok","mode":"solve","meaning":"已完成题意","approach":"未完成');
    assert.deepEqual(events.at(-1).preview, { meaning: '已完成题意' });
    reporter.text(JSON.stringify({ status: 'ok', mode: 'solve', meaning: config.apiKey, approach: 'int main() {}', reasoning: 'private', code: 'private' }));
    assert.deepEqual(events.at(-1).preview, {});
    reporter.text('{"status":"unsupported","mode":"solve","meaning":"不可预览"}');
    reporter.text('{"status":"ok","mode":"debug","summary":"模式不符"}');
    assert.ok(!JSON.stringify(events).includes(config.apiKey));
    assert.ok(!JSON.stringify(events).includes('private'));
    const debug = []; createProgressReporter({ request: ceRequest(), onProgress: value => debug.push(value) })
        .text('{"status":"ok","mode":"debug","summary":"首个语法根因","meaning":"不公开","issues":[]}');
    assert.deepEqual(debug.at(-1).preview, { summary: '首个语法根因' });
});

test('supplier usage is normalized accurately; a missing tool-round usage stays unknown', () => {
    assert.deepEqual(usageDto(usage), dto);
    assert.deepEqual(usageDto({ input_tokens: 13, output_tokens: 7, cached_input_tokens: 3 }, 'codex'), dto);
    assert.equal(usageDto({ prompt_tokens: -1, completion_tokens: 2 }), null);
    const reporter = createProgressReporter({ request: request() });
    reporter.usage(usage, 'chat'); reporter.usage(usage, 'chat');
    assert.deepEqual(reporter.usageValue, { inputTokens: 26, outputTokens: 14, totalTokens: 40, cachedInputTokens: 6 });
    reporter.usage(null, 'chat'); reporter.usage(usage, 'chat');
    assert.equal(reporter.usageValue, null);
});

test('Chat streaming exposes a finished section before the final answer and captures supplier usage', async () => {
    let finish;
    const completed = new Promise(resolve => { finish = resolve; });
    let release, cancel = false;
    const raw = JSON.stringify(answer('solve', 'hint'));
    const split = raw.indexOf(',"approach"');
    let sent;
    const client = createModelClient({ resourceRoot, personalFetchImpl: async (_url, options) => {
        sent = JSON.parse(options.body);
        return new Response(new ReadableStream({ start(controller) {
            controller.enqueue(Buffer.from(event({ choices: [{ index: 0, delta: { content: raw.slice(0, split) } }] })));
            release = () => {
                controller.enqueue(Buffer.from(event({ choices: [{ index: 0, delta: { content: raw.slice(split) }, finish_reason: 'stop' }] })
                    + event({ choices: [], usage }) + 'data: [DONE]\n\n'));
                controller.close();
            };
        }, cancel() { cancel = true; } }), { headers: { 'Content-Type': 'text/event-stream' } });
    } });
    let final = false; const progress = [];
    const pending = client.generate(request('solve', 'hint'), config, undefined, value => {
        progress.push(value);
        if (value.preview.meaning) { assert.equal(final, false); finish(); }
    }).then(value => { final = true; return value; });
    await completed;
    assert.equal(sent.stream, true); assert.equal(sent.max_tokens, 2500); assert.equal(sent.stream_options.include_usage, true);
    assert.ok(!JSON.stringify(sent).includes(config.apiKey));
    release(); const result = await pending;
    assert.equal(result.code, ''); assert.deepEqual(result.usage, dto);
    assert.ok(progress.some(value => value.stage === 'validating'));
    assert.equal(cancel, false); // Closed readers need no further cancellation.
});

test('Chat tool rounds sum real usage and incomplete provider usage is not a partial total', async () => {
    for (const includeFirstUsage of [true, false]) {
        let calls = 0; const seen = [];
        const client = createModelClient({ resourceRoot, personalFetchImpl: async (_url, options) => {
            calls++; seen.push(JSON.parse(options.body));
            return new Response(JSON.stringify({ ...(includeFirstUsage || calls === 2 ? { usage } : {}), choices: [{ finish_reason: calls === 1 ? 'tool_calls' : 'stop',
                message: calls === 1 ? { content: null, tool_calls: [{ id: 'template', type: 'function', function: { name: 'read_template', arguments: '{"name":"prefix-sum.md"}' } }] }
                    : { content: JSON.stringify(answer('solve', 'approach')) } }] }));
        } });
        const result = await client.generate(request('solve', 'approach'), config);
        assert.equal(calls, 2); assert.equal(seen[1].messages.at(-1).role, 'tool');
        assert.equal(result.code, '');
        assert.deepEqual(result.usage, includeFirstUsage ? { inputTokens: 26, outputTokens: 14, totalTokens: 40, cachedInputTokens: 6 } : null);
    }
});

test('upstream credential echoes are rejected before an answer can be persisted', async () => {
    const raw = answer(); raw.commentary = config.apiKey;
    const client = createModelClient({ resourceRoot, personalFetchImpl: async () => new Response(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(raw) } }] })) });
    await assert.rejects(client.generate(request(), config), error => { assert.equal(error.code, 'INVALID_RESPONSE'); assert.ok(!error.message.includes(config.apiKey)); return true; });
});
