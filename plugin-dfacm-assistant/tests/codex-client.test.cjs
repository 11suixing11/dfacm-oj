'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { EventEmitter } = require('node:events');
const { PassThrough } = require('node:stream');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { createCodexRunner, CODEX_VERSION, KEY_ENV, childEnvironment, clientError } = require('../codex-client.cjs');
const { createModelClient, personalModelConfig } = require('../client.cjs');
const { createTemplateServer } = require('../template-mcp.cjs');
const { request, answer } = require('./fixtures.cjs');

const resourceRoot = path.resolve(__dirname, '../skill/acm-trainer');
const config = () => personalModelConfig({ provider: 'agentrouter', model: 'gpt-5.6-sol', apiKey: 'private-codex-user-key' });
const event = (item) => JSON.stringify(item) + '\n';
const successful = (mode = 'solve') => [
    { type: 'thread.started', thread_id: 'ephemeral-fixture' },
    { type: 'turn.started' },
    { type: 'item.completed', item: { type: 'reasoning', text: '静态分析。' } },
    { type: 'item.completed', item: { type: 'agent_message', text: JSON.stringify(answer(mode)) } },
    { type: 'turn.completed' },
];

async function fakeRuntime(context, version = CODEX_VERSION) {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'dfacm-runtime-test-'));
    context.after(async () => {
        assert.equal(path.dirname(directory), path.resolve(os.tmpdir()));
        assert.ok(path.basename(directory).startsWith('dfacm-runtime-test-'));
        await fs.rm(directory, { recursive: true, force: true });
    });
    await fs.mkdir(path.join(directory, 'bin'));
    await fs.writeFile(path.join(directory, 'package.json'), JSON.stringify({ name: '@openai/codex', version }));
    await fs.writeFile(path.join(directory, 'bin/codex.js'), '');
    return path.join(directory, 'bin/codex.js');
}

function fakeSpawn(inspect, output = successful(), { code = 0, stderr = '', hang = false, spawnError = false } = {}) {
    return (command, args, options) => {
        const child = new EventEmitter();
        child.stdout = new PassThrough(); child.stderr = new PassThrough(); child.stdin = new PassThrough();
        let input = '';
        child.stdin.on('data', chunk => { input += chunk; });
        let closed = false;
        child.kill = () => { if (!closed) { closed = true; queueMicrotask(() => child.emit('close', null)); } return true; };
        child.stdin.on('finish', async () => {
            try {
                await inspect(command, args, options, input);
                if (spawnError) child.emit('error', new Error('private-codex-user-key spawn details'));
                if (hang) return;
                if (stderr) child.stderr.write(stderr);
                const text = typeof output === 'string' ? output : output.map(event).join('');
                // Exercise UTF-8 decoding and JSONL records split across chunks.
                const bytes = Buffer.from(text);
                child.stdout.write(bytes.subarray(0, 41)); child.stdout.write(bytes.subarray(41));
                if (!closed) { closed = true; child.emit('close', code); }
            } catch (error) { child.emit('error', error); if (!closed) { closed = true; child.emit('close', 1); } }
        });
        return child;
    };
}

test('AgentRouter alone selects genuine Codex Responses and validates original debug line quotes', async () => {
    let seen;
    const client = createModelClient({ resourceRoot, fetchImpl() { assert.fail('Site transport must not run'); },
        personalFetchImpl() { assert.fail('Custom transport must not run'); },
        codexRunner: async input => { seen = input; return JSON.stringify(answer('debug')); } });
    const result = await client.generate(request('debug'), config());
    assert.equal(seen.config.endpoint, 'https://agentrouter.org/v1/responses');
    assert.equal(seen.config.transport, 'codex-responses');
    assert.equal(seen.config.provider, 'agentrouter');
    assert.match(seen.system, /改错流程/);
    assert.ok(!seen.system.includes(config().apiKey));
    assert.equal(result.issues[0].locations[0].startLine, 6);
    const invalid = answer('debug'); invalid.issues[0].locations[0].quote = 'from the repaired code';
    const wrong = createModelClient({ resourceRoot, codexRunner: async () => JSON.stringify(invalid) });
    await assert.rejects(wrong.generate(request('debug'), config()), { code: 'INVALID_LOCATION' });
    const custom = personalModelConfig({ provider: 'custom', baseUrl: 'https://example.com/v1', model: 'custom', apiKey: 'custom-key' });
    assert.equal(custom.transport, 'chat-completions');
    assert.equal(custom.endpoint, 'https://example.com/v1/chat/completions');
});

test('genuine CLI invocation isolates credentials, disables execution and removes temporary files', async context => {
    let directory, captured;
    const runner = createCodexRunner({ runtimePath: await fakeRuntime(context), parentEnv: {
        PATH: process.env.PATH, OPENAI_API_KEY: 'ambient-openai', ANTHROPIC_AUTH_TOKEN: 'ambient-claude',
        DFACM_ASSISTANT_API_KEY: 'site-private-key', CODEX_HOME: 'another-login',
        NODE_OPTIONS: '--require malicious-hook', HTTPS_PROXY: 'http://private-proxy',
    }, spawnImpl: fakeSpawn(async (command, args, options, input) => {
        captured = { command, args, options, input };
        directory = path.dirname(options.cwd);
        assert.equal(command, process.execPath); assert.equal(options.shell, false); assert.equal(options.windowsHide, true);
        assert.equal(options.env[KEY_ENV], config().apiKey);
        for (const name of ['OPENAI_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'DFACM_ASSISTANT_API_KEY', 'NODE_OPTIONS', 'HTTPS_PROXY']) assert.equal(options.env[name], undefined);
        assert.equal(options.env.CODEX_HOME, path.join(directory, 'codex-home'));
        for (const value of ['exec', '--ephemeral', '--ignore-user-config', '--strict-config', '--ignore-rules', 'read-only']) assert.ok(args.includes(value));
        for (const value of ['model_providers.AgentRouter.wire_api="responses"', 'model_providers.AgentRouter.env_key="CODEX_GATEWAY_API_KEY"',
            'model_providers.AgentRouter.request_max_retries=0', 'model_providers.AgentRouter.stream_max_retries=0',
            'cli_auth_credentials_store="ephemeral"', 'history.persistence="none"', 'otel.metrics_exporter="none"',
            'mcp_servers.acm_trainer.env.CODEX_GATEWAY_API_KEY=""']) assert.ok(args.includes(value));
        assert.ok(args.includes('shell_tool') && args.includes('view_image'));
        assert.ok(!JSON.stringify(args).includes(config().apiKey));
        assert.deepEqual(JSON.parse(input), request());
        for (const name of ['models.json', 'instructions.md', 'answer-schema.json']) assert.ok(!(await fs.readFile(path.join(directory, name), 'utf8')).includes(config().apiKey));
        const catalog = JSON.parse(await fs.readFile(path.join(directory, 'models.json'), 'utf8'));
        assert.equal(catalog.models[0].shell_type, 'disabled');
        assert.equal(catalog.models[0].apply_patch_tool_type, null);
        assert.deepEqual(catalog.models[0].experimental_supported_tools, []);
    }) });
    const client = createModelClient({ resourceRoot, codexRunner: runner });
    const result = await client.generate(request(), config());
    assert.equal(result.meaning, answer().meaning);
    assert.ok(captured); await assert.rejects(fs.access(directory));
});

test('Codex errors distinguish client restriction, key, quota and limits without raw upstream text', async context => {
    const runtimePath = await fakeRuntime(context);
    for (const [message, code] of [
        ['401 unauthorized client detected', 'UPSTREAM_CLIENT'], ['401 invalid api key', 'UPSTREAM_AUTH'],
        ['403 permission denied', 'UPSTREAM_AUTH'], ['429 rate limit', 'UPSTREAM_BUSY'],
        ['402 insufficient quota', 'UPSTREAM_QUOTA'], ['404 unknown model', 'UPSTREAM_CONFIG'], ['503 service offline', 'UPSTREAM_UNAVAILABLE'],
    ]) {
        let directory;
        const runner = createCodexRunner({ runtimePath, spawnImpl: fakeSpawn((_command, _args, options) => { directory = path.dirname(options.cwd); }, [
            { type: 'turn.failed', error: { message: message + ' private-codex-user-key raw-details' } },
        ], { code: 1 }) });
        const client = createModelClient({ resourceRoot, codexRunner: runner });
        await assert.rejects(client.generate(request(), config()), error => {
            assert.equal(error.code, code); assert.ok(!error.message.includes(config().apiKey)); assert.ok(!error.message.includes('raw-details')); return true;
        });
        await assert.rejects(fs.access(directory));
    }
    assert.equal(clientError('unexpected private details').code, 'UPSTREAM_ERROR');
});

test('provider channel failures, gateway, transport and Chinese key errors have safe actionable messages', () => {
    for (const [message, code] of [
        ['unexpected status 503 Service Unavailable: {"error":{"message":"分组 default 下对于模型 deepseek-v4-flash 无可用渠道"}}', 'UPSTREAM_MODEL_UNAVAILABLE'],
        ['HTTP/1.1 503: no_available_channel', 'UPSTREAM_MODEL_UNAVAILABLE'],
        ['model offline', 'UPSTREAM_MODEL_UNAVAILABLE'],
        ['unexpected status 503 Service Unavailable', 'UPSTREAM_UNAVAILABLE'],
        ['unexpected status 502 Bad Gateway', 'UPSTREAM_GATEWAY'],
        ['unexpected status 504 Gateway Timeout', 'UPSTREAM_TIMEOUT'],
        ['stream disconnected before completion: error sending request for url', 'UPSTREAM_NETWORK'],
        ['TLS certificate error', 'UPSTREAM_NETWORK'],
        ['无效的令牌', 'UPSTREAM_AUTH'],
        ['余额不足', 'UPSTREAM_QUOTA'],
        ['HTTP 429 quota exhausted', 'UPSTREAM_QUOTA'],
        ['unexpected status 404 Not Found; request ID 401-429-402', 'UPSTREAM_CONFIG'],
        ['socket connection reset; trace 401; url https://example.com/429', 'UPSTREAM_NETWORK'],
        ['request ID 401-429-402 with unspecified failure', 'UPSTREAM_ERROR'],
    ]) {
        const error = clientError(message + ' private-codex-user-key raw-details');
        assert.equal(error.code, code, message);
        assert.ok(!error.message.includes(config().apiKey));
        assert.ok(!error.message.includes('raw-details'));
    }
    assert.match(clientError('HTTP 503 无可用渠道').message, /模型设置.*Key 分组权限/);
    assert.match(clientError('unknown failure').message, /模型名称和 Key 权限/);
});

test('all terminal JSONL error fields and stderr can refine a generic failure', async context => {
    const runtimePath = await fakeRuntime(context);
    for (const [output, settings, code] of [
        [[{ type: 'error', message: 'HTTP 503', error: { message: '无可用渠道' } }], {}, 'UPSTREAM_MODEL_UNAVAILABLE'],
        [[{ type: 'turn.failed', error: '无效的令牌' }], {}, 'UPSTREAM_AUTH'],
        [[{ type: 'turn.failed', error: { status: 502, message: 'temporary failure' } }], {}, 'UPSTREAM_GATEWAY'],
        [[{ type: 'turn.failed', status_code: 504 }], {}, 'UPSTREAM_TIMEOUT'],
        [[{ type: 'error', message: 'generation failed' }, { type: 'turn.failed', error: { message: 'HTTP 503 无可用渠道' } }], {}, 'UPSTREAM_MODEL_UNAVAILABLE'],
        [[{ type: 'error', message: 'HTTP 503 Service Unavailable' }, { type: 'turn.failed', error: { message: '无可用渠道' } }], {}, 'UPSTREAM_MODEL_UNAVAILABLE'],
        [[{ type: 'error', message: 'generation failed' }], { code: 1, stderr: 'unexpected status 503 Service Unavailable: 无可用渠道' }, 'UPSTREAM_MODEL_UNAVAILABLE'],
        [[{ type: 'item.completed', item: { type: 'error', message: 'HTTP 503 无可用渠道' } }, { type: 'turn.failed', error: { message: 'generation failed' } }], {}, 'UPSTREAM_MODEL_UNAVAILABLE'],
        [[{ type: 'error', message: '401 invalid api key' }], { stderr: 'HTTP 503 unavailable' }, 'UPSTREAM_AUTH'],
    ]) {
        let directory;
        const runner = createCodexRunner({ runtimePath, spawnImpl: fakeSpawn((_command, _args, options) => { directory = path.dirname(options.cwd); }, output, settings) });
        await assert.rejects(createModelClient({ resourceRoot, codexRunner: runner }).generate(request(), config()), error => {
            assert.equal(error.code, code); assert.ok(!error.message.includes(config().apiKey)); return true;
        });
        await assert.rejects(fs.access(directory));
    }
});

test('nonfatal CLI error items never discard a completed answer', async context => {
    const runner = createCodexRunner({ runtimePath: await fakeRuntime(context), spawnImpl: fakeSpawn(() => {}, [
        { type: 'item.completed', item: { type: 'error', message: 'HTTP 503 warning' } }, ...successful(),
    ]) });
    assert.equal((await createModelClient({ resourceRoot, codexRunner: runner }).generate(request(), config())).meaning, answer().meaning);
});

test('official exec exposes genuine token totals and completed answer previews while reasoning stays private', async context => {
    const events = successful('solve');
    events[2].item.text = 'PRIVATE_REASONING_DO_NOT_FORWARD';
    events.at(-1).usage = { input_tokens: 21, output_tokens: 9, cached_input_tokens: 7 };
    const runner = createCodexRunner({ runtimePath: await fakeRuntime(context), spawnImpl: fakeSpawn(() => {}, events) });
    const progress = [];
    const result = await createModelClient({ resourceRoot, codexRunner: runner }).generate(request(), config(), undefined, value => progress.push(value));
    assert.deepEqual(result.usage, { inputTokens: 21, outputTokens: 9, totalTokens: 30, cachedInputTokens: 7 });
    assert.ok(progress.some(value => value.preview.meaning === result.meaning));
    assert.ok(!JSON.stringify(progress).includes('PRIVATE_REASONING_DO_NOT_FORWARD'));
    assert.ok(!JSON.stringify(progress).includes(config().apiKey));
    assert.ok(!progress.some(value => value.preview.code));
    events.at(-1).usage = { input_tokens: 0, output_tokens: 0, cached_input_tokens: 0 };
    const missing = createCodexRunner({ runtimePath: await fakeRuntime(context), spawnImpl: fakeSpawn(() => {}, events) });
    assert.equal((await createModelClient({ resourceRoot, codexRunner: missing }).generate(request(), config())).usage, null);
});

test('runtime missing or version mismatch fails explicitly without trying another provider', async context => {
    for (const runtimePath of [path.join(os.tmpdir(), 'missing-dfacm-runtime/bin/codex.js'), await fakeRuntime(context, '0.0.1')]) {
        const runner = createCodexRunner({ runtimePath, spawnImpl() { assert.fail('Untrusted or missing runtime must not run'); } });
        const client = createModelClient({ resourceRoot, codexRunner: runner });
        await assert.rejects(client.generate(request(), config()), { code: 'CLIENT_UNAVAILABLE' });
    }
});

test('invalid CLI events, forbidden operations, excessive output and abnormal exits fail safely', async context => {
    const runtimePath = await fakeRuntime(context);
    for (const [output, settings, code] of [
        ['not-json\n', {}, 'INVALID_RESPONSE'],
        ['null\n', {}, 'INVALID_RESPONSE'],
        ['"text"\n', {}, 'INVALID_RESPONSE'],
        [[{ type: 'item.started', item: { type: 'command_execution', command: 'read secrets' } }], {}, 'INVALID_RESPONSE'],
        [[{ type: 'item.started', item: { type: 'mcp_tool_call', server: 'unknown', tool: 'exec' } }], {}, 'INVALID_RESPONSE'],
        ['x'.repeat(1024 * 1024 + 1), {}, 'INVALID_RESPONSE'],
        [[{ type: 'turn.completed' }], {}, 'INCOMPLETE_RESPONSE'],
        [[], { code: 1, stderr: '401 private-codex-user-key raw stderr' }, 'UPSTREAM_AUTH'],
        [[], { spawnError: true, code: 1 }, 'CLIENT_UNAVAILABLE'],
    ]) {
        const runner = createCodexRunner({ runtimePath, spawnImpl: fakeSpawn(() => {}, output, settings) });
        const client = createModelClient({ resourceRoot, codexRunner: runner });
        await assert.rejects(client.generate(request(), config()), error => { assert.equal(error.code, code); assert.ok(!error.message.includes(config().apiKey)); return true; });
    }
});

test('abort terminates a CLI invocation and cleans it; an already aborted call never spawns', async context => {
    let directory, started;
    const running = new Promise(resolve => { started = resolve; });
    const runner = createCodexRunner({ runtimePath: await fakeRuntime(context), spawnImpl: fakeSpawn((_command, _args, options) => {
        directory = path.dirname(options.cwd); started();
    }, [], { hang: true }) });
    const client = createModelClient({ resourceRoot, codexRunner: runner });
    const controller = new AbortController();
    const pending = client.generate(request(), config(), controller.signal);
    await running; controller.abort();
    await assert.rejects(pending, { code: 'TIMEOUT' }); await assert.rejects(fs.access(directory));
    await assert.rejects(client.generate(request(), config(), controller.signal), { code: 'TIMEOUT' });
});

test('template MCP only reads allowlisted resources with a two-template limit', () => {
    const handle = createTemplateServer(resourceRoot);
    const rpc = (method, params) => handle({ jsonrpc: '2.0', id: 1, method, params });
    assert.deepEqual(rpc('tools/list').result.tools.map(tool => tool.name), ['read_template']);
    assert.deepEqual(rpc('resources/list').result.resources, []);
    assert.equal(rpc('resources/read', { uri: 'file:///etc/passwd' }).error.code, -32601);
    const read = (name) => rpc('tools/call', { name: 'read_template', arguments: { name } }).result;
    assert.match(read('dsu.md').content[0].text, /并查集/);
    assert.match(read('bit.md').content[0].text, /树状数组/);
    assert.equal(read('dsu.md').isError, undefined);
    for (const name of ['segment-tree.md', '../../.env', '/etc/passwd']) assert.equal(read(name).isError, true);
    assert.equal(rpc('tools/call', { name: 'exec_command', arguments: { cmd: 'anything' } }).result.isError, true);
    assert.equal(handle({ jsonrpc: '2.0', method: 'notifications/initialized' }), null);
});

test('environment allowlist does not mutate or reuse ambient authentication', () => {
    const parent = { PATH: 'trusted-system-path', CODEX_HOME: 'existing-home', HOME: 'existing-os-home', OPENAI_API_KEY: 'another-key',
        CODEX_GATEWAY_API_KEY: 'another-provider-key', DFACM_ASSISTANT_API_KEY: 'site-key' };
    const env = childEnvironment(path.resolve(os.tmpdir(), 'owned-invocation'), 'this-call-key', parent);
    assert.equal(env.CODEX_GATEWAY_API_KEY, 'this-call-key'); assert.equal(env.HOME, undefined);
    assert.notEqual(env.CODEX_HOME, parent.CODEX_HOME); assert.equal(parent.CODEX_GATEWAY_API_KEY, 'another-provider-key');
    assert.equal(parent.CODEX_HOME, 'existing-home'); assert.equal(env.OPENAI_API_KEY, undefined);
});
