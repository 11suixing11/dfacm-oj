'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { spawn } = require('node:child_process');
const { AssistantError, assistanceLevel } = require('./protocol.cjs');
const { DEFAULT_BASE } = require('./provider-config.cjs');

const CODEX_VERSION = '0.163.0';
const KEY_ENV = 'CODEX_GATEWAY_API_KEY';
const OUTPUT_LIMIT = 1024 * 1024;
const STDERR_LIMIT = 16384;
// This list and the model catalog are verified against the pinned real CLI.
// No native execution, file, browser, agent, plugin or memory tools are offered.
const DISABLED_FEATURES = [
    'shell_tool', 'view_image', 'code_mode', 'code_mode_only', 'js_repl',
    'multi_agent', 'multi_agent_v2', 'collaboration_modes', 'plugins', 'apps',
    'browser_use', 'computer_use', 'image_generation', 'imagegenext',
    'tool_suggest', 'tool_search', 'search_tool', 'deferred_executor',
    'current_time_reminder', 'sleep_tool', 'token_budget', 'goals',
    'send_message_to_user_async', 'request_permissions_tool',
    'shell_snapshot', 'shell_snapshot_v2', 'memories', 'memory_tool',
    'hooks', 'codex_hooks', 'plugin_hooks', 'remote_control',
    'daemon_auto_start', 'api_key_model_discovery', 'remote_models',
    'sqlite', 'background_paginated_rollout_migration', 'runtime_metrics',
    'responses_websockets', 'responses_websockets_v2', 'enable_request_compression',
];

function runtimeError() {
    return new AssistantError('CLIENT_UNAVAILABLE', 'AgentRouter 客户端暂时不可用，请联系管理员检查运行环境。', 503);
}

function clientError(text) {
    text = typeof text === 'string' ? text.slice(0, STDERR_LIMIT) : '';
    // Read HTTP status markers, not arbitrary numbers in URLs, request IDs or
    // credentials. All diagnostics remain transient and become fixed messages.
    const statusMatch = text.match(/\b(?:HTTP(?:\/\d(?:\.\d)?)?|(?:unexpected\s+)?(?:response\s+)?status(?:[_ -]?code)?)\s*[:=]?\s*([45]\d{2})\b/i)
        || text.match(/"(?:status|status_code)"\s*:\s*([45]\d{2})\b/i)
        || text.match(/^\s*([45]\d{2})(?:\s+[a-z\u4e00-\u9fff]|\s*$)/i);
    const status = statusMatch ? Number(statusMatch[1]) : null;
    if (/unauthori[sz]ed client|client (?:is )?not (?:allowed|authorized)|unsupported client/i.test(text)) {
        return new AssistantError('UPSTREAM_CLIENT', 'AgentRouter 拒绝了客户端接入，请检查该 Key 的 Codex 使用权限或联系供应商。', 503);
    }
    if ([401, 403].includes(status) || /invalid[_ -]?(?:(?:api|access)[_ -]?)?(?:key|token)|authentication (?:failed|error)|unauthori[sz]ed|unauthenticated|token (?:has )?expired|expired token|无效的?令牌|令牌(?:无效|已过期)|鉴权失败/i.test(text)) {
        return new AssistantError('UPSTREAM_AUTH', 'AgentRouter API 鉴权失败，请在模型设置中检查 Key 及其模型权限。', 503);
    }
    if (status === 402 || /insufficient[_ -]?(?:quota|balance)|quota (?:exceeded|exhausted)|(?:额度|余额|配额)(?:不足|已用尽|用尽)/i.test(text)) {
        return new AssistantError('UPSTREAM_QUOTA', 'AgentRouter 可用额度不足，请检查账户额度。', 503);
    }
    if (status === 429 || /rate[_ -]?limit|too many requests|请求过于频繁|频率限制/i.test(text)) {
        return new AssistantError('UPSTREAM_BUSY', 'AgentRouter 请求过于频繁，请稍后重试。', 503);
    }
    if (/无可用渠道|暂无可用渠道|no[_ -](?:available[_ -])?channels?|model[_ -](?:unavailable|offline)|model (?:is )?(?:unavailable|offline)|模型.{0,30}(?:已下线|已停用)/i.test(text)) {
        return new AssistantError('UPSTREAM_MODEL_UNAVAILABLE', 'AgentRouter 当前模型暂无可用渠道，请在模型设置中核对模型名称和 Key 分组权限，或稍后重试。', 503);
    }
    if ([400, 404, 422].includes(status) || /model[_ -]not[_ -]found|unknown model/i.test(text)) {
        return new AssistantError('UPSTREAM_CONFIG', 'AgentRouter 未接受当前模型的 Responses 请求，请检查模型名称及接入权限。', 502);
    }
    if (status === 504 || /gateway[_ -]?timeout|request timed out|connection timed out|响应超时/i.test(text)) {
        return new AssistantError('UPSTREAM_TIMEOUT', 'AgentRouter 响应超时，请稍后重试。', 504);
    }
    if (status === 502 || /bad gateway/i.test(text)) {
        return new AssistantError('UPSTREAM_GATEWAY', 'AgentRouter 网关暂时异常，请稍后重试。', 502);
    }
    if ((status !== null && status >= 500) || /service unavailable|服务暂时不可用/i.test(text)) {
        return new AssistantError('UPSTREAM_UNAVAILABLE', 'AgentRouter 服务暂时不可用，请稍后重试；若持续出现，请在模型设置中检查模型是否有可用渠道。', 503);
    }
    if (/error sending request|connection (?:reset|refused|closed)|stream disconnected|dns (?:error|lookup)|failed to (?:resolve|lookup)|tls|ssl|certificate|network (?:error|unreachable)/i.test(text)) {
        return new AssistantError('UPSTREAM_NETWORK', 'OJ 与 AgentRouter 的连接中断，请稍后重试；若持续出现，请联系管理员。', 502);
    }
    return new AssistantError('UPSTREAM_ERROR', 'AgentRouter 请求失败，请在模型设置中检查模型名称和 Key 权限后重试。', 502);
}

function eventErrorText(value) {
    const fields = [value.message, typeof value.error === 'string' ? value.error : '',
        value.error?.message, value.error?.code, value.additional_details, value.error?.additional_details];
    for (const status of [value.status, value.status_code, value.error?.status, value.error?.status_code]) {
        if (Number.isInteger(status) && status >= 400 && status <= 599) fields.unshift(`HTTP ${status}`);
    }
    return fields.filter(field => typeof field === 'string' && field).join('\n').slice(0, STDERR_LIMIT);
}

function answerSchema(mode, requestedLevel) {
    const level = mode === 'solve' ? assistanceLevel(requestedLevel) : 'solution';
    const text = { type: 'string' };
    const object = (properties) => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false });
    const array = (items, maxItems) => ({ type: 'array', items, maxItems });
    return object({
        version: { type: 'integer', enum: [1] },
        status: { type: 'string', enum: ['ok', 'needs_context', 'unsupported'] },
        mode: { type: 'string', enum: [mode] },
        message: text, meaning: text, approach: text,
        code: level !== 'solution' ? { type: 'string', enum: [''] } : text,
        complexity: level === 'hint' ? { type: 'string', enum: [''] } : text,
        commentary: level === 'hint' ? { type: 'string', enum: [''] } : text, summary: text,
        missing: array(text, 30), changes: array(text, 30),
        issues: array(object({
            kind: { type: 'string', enum: ['syntax', 'implementation', 'algorithm', 'complexity'] },
            confidence: { type: 'string', enum: ['confirmed', 'possible'] },
            title: text, explanation: text, fix: text, evidence: text,
            locations: array(object({ startLine: { type: 'integer', minimum: 1 }, endLine: { type: 'integer', minimum: 1 }, quote: text }), 10),
        }), 30),
        counterexamples: array(object({ input: text, expected: text, actual: { type: ['string', 'null'] }, explanation: text }), 6),
        verification: text, notice: text,
    });
}

function modelCatalog(model) {
    return { models: [{
        slug: model, display_name: model, description: 'OJ answer generation',
        supported_reasoning_levels: [], shell_type: 'disabled', visibility: 'none',
        supported_in_api: true, priority: 0, availability_nux: null, upgrade: null,
        model_messages: { instructions_template: '你是 OJ 题目旁的 C++ 竞赛助手。仅分析提供的数据，按 OJ 契约返回答案。' },
        support_verbosity: false, default_verbosity: null, apply_patch_tool_type: null,
        supports_reasoning_summary_parameter: false,
        truncation_policy: { mode: 'bytes', limit: 10000 },
        context_window: 128000, experimental_supported_tools: [],
        input_modalities: ['text'], tool_mode: 'direct',
        include_skills_usage_instructions: false, include_plugin_usage_instructions: false,
        include_apps_usage_instructions: false,
    }] };
}

function childEnvironment(directory, apiKey, parent = process.env) {
    // Allowlist OS necessities only. Never inherit site keys, login credentials,
    // proxies, Node hooks or another user's Codex configuration/authentication.
    const env = {};
    for (const name of ['PATH', 'Path', 'SystemRoot', 'SYSTEMROOT', 'WINDIR', 'ComSpec', 'PATHEXT', 'LANG', 'LC_ALL']) {
        if (typeof parent[name] === 'string') env[name] = parent[name];
    }
    env.CODEX_HOME = path.join(directory, 'codex-home');
    env.TMPDIR = env.TMP = env.TEMP = path.join(directory, 'tmp');
    env.RUST_LOG = 'off';
    env.NO_COLOR = '1';
    env[KEY_ENV] = apiKey;
    return env;
}

function invocation({ directory, config, resourceRoot }) {
    const quote = (value) => JSON.stringify(value);
    const overrides = {
        model: quote(config.model), model_provider: '"AgentRouter"',
        'model_providers.AgentRouter.name': '"AgentRouter"',
        'model_providers.AgentRouter.base_url': quote(DEFAULT_BASE),
        'model_providers.AgentRouter.env_key': quote(KEY_ENV),
        'model_providers.AgentRouter.wire_api': '"responses"',
        'model_providers.AgentRouter.requires_openai_auth': 'false',
        'model_providers.AgentRouter.request_max_retries': '0',
        'model_providers.AgentRouter.stream_max_retries': '0',
        'model_providers.AgentRouter.stream_idle_timeout_ms': String(config.timeoutMs),
        model_catalog_json: quote(path.join(directory, 'models.json')),
        model_instructions_file: quote(path.join(directory, 'instructions.md')),
        'tools.update_plan.enabled': 'false', 'tools.experimental_request_user_input.enabled': 'false',
        web_search: '"disabled"', project_doc_max_bytes: '0',
        'skills.bundled.enabled': 'false', 'skills.include_instructions': 'false',
        'features.skip_host_skill_discovery': 'true',
        'history.persistence': '"none"', cli_auth_credentials_store: '"ephemeral"',
        'analytics.enabled': 'false', 'feedback.enabled': 'false',
        'otel.exporter': '"none"', 'otel.trace_exporter': '"none"', 'otel.metrics_exporter': '"none"',
        'otel.log_user_prompt': 'false', 'otel.log_agent_responses': 'false',
        'shell_environment_policy.inherit': '"none"', 'shell_environment_policy.include_only': '[]',
        'mcp_servers.acm_trainer.command': quote(process.execPath),
        'mcp_servers.acm_trainer.args': `[${quote(path.join(__dirname, 'template-mcp.cjs'))}, ${quote(resourceRoot)}]`,
        'mcp_servers.acm_trainer.env.CODEX_GATEWAY_API_KEY': '""',
        'mcp_servers.acm_trainer.enabled_tools': '["read_template"]',
        'mcp_servers.acm_trainer.startup_timeout_sec': '10',
        'mcp_servers.acm_trainer.tool_timeout_sec': '10',
    };
    return [
        '--no-daemon', '-a', 'never', ...Object.entries(overrides).flatMap(([key, value]) => ['-c', `${key}=${value}`]),
        ...DISABLED_FEATURES.flatMap(feature => ['--disable', feature]),
        'exec', '--ignore-user-config', '--ignore-rules', '--strict-config', '--ephemeral',
        '--skip-git-repo-check', '--sandbox', 'read-only', '--cd', path.join(directory, 'work'),
        '--output-schema', path.join(directory, 'answer-schema.json'), '--json', '-',
    ];
}

async function removeInvocation(directory, temporaryRoot) {
    const resolved = path.resolve(directory);
    // Only remove the private directory allocated by this invocation.
    if (path.dirname(resolved) !== path.resolve(temporaryRoot) || !path.basename(resolved).startsWith('dfacm-codex-')) {
        throw runtimeError();
    }
    await fs.rm(resolved, { recursive: true, force: true });
}

function createCodexRunner({ runtimePath, spawnImpl = spawn, temporaryRoot = os.tmpdir(), parentEnv = process.env } = {}) {
    const entry = runtimePath || parentEnv.DFACM_ASSISTANT_CODEX_JS
        || path.join(os.homedir(), '.hydro', 'assistant-runtime', `codex-${CODEX_VERSION}`, 'node_modules', '@openai', 'codex', 'bin', 'codex.js');
    return async function run({ request, config, system, resourceRoot, signal, progress }) {
        if (config.provider !== 'agentrouter' || config.endpoint !== DEFAULT_BASE + '/responses') throw runtimeError();
        if (signal?.aborted) throw new AssistantError('TIMEOUT', '生成已中断，请重试。', 504);
        try {
            const pkg = JSON.parse(await fs.readFile(path.resolve(entry, '../../package.json'), 'utf8'));
            if (!path.isAbsolute(entry) || pkg.name !== '@openai/codex' || pkg.version !== CODEX_VERSION) throw runtimeError();
            await fs.access(entry);
        } catch { throw runtimeError(); }
        const directory = await fs.mkdtemp(path.join(temporaryRoot, 'dfacm-codex-'));
        try {
            await fs.chmod(directory, 0o700);
            for (const name of ['work', 'codex-home', 'tmp']) await fs.mkdir(path.join(directory, name), { mode: 0o700 });
            for (const [name, content] of Object.entries({
                'models.json': JSON.stringify(modelCatalog(config.model)),
                'instructions.md': system,
                'answer-schema.json': JSON.stringify(answerSchema(request.mode, request.level)),
            })) await fs.writeFile(path.join(directory, name), content, { mode: 0o600 });
            if (signal?.aborted) throw new AssistantError('TIMEOUT', '生成已中断，请重试。', 504);
            return await new Promise((resolve, reject) => {
                const child = spawnImpl(process.execPath, [entry, ...invocation({ directory, config, resourceRoot })], {
                    cwd: path.join(directory, 'work'), env: childEnvironment(directory, config.apiKey, parentEnv),
                    stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true, detached: process.platform !== 'win32', shell: false,
                });
                let output = '', stderr = '', size = 0, answer = '', completed = false, failure = null, errorHint = null;
                let killTimer = null, closed = false;
                const stop = () => {
                    if (closed) return;
                    try {
                        if (process.platform !== 'win32' && child.pid) process.kill(-child.pid, 'SIGTERM');
                        else child.kill('SIGTERM');
                    } catch { /* A child may already have exited. */ }
                    killTimer ||= setTimeout(() => {
                        try {
                            if (process.platform !== 'win32' && child.pid) process.kill(-child.pid, 'SIGKILL');
                            else child.kill('SIGKILL');
                        } catch { /* Already closed. */ }
                    }, 1000);
                    killTimer.unref?.();
                };
                const enrich = (error, hint) => hint && ((error?.code === 'UPSTREAM_ERROR' && hint.code !== 'UPSTREAM_ERROR')
                    || (error?.code === 'UPSTREAM_UNAVAILABLE' && hint.code === 'UPSTREAM_MODEL_UNAVAILABLE')) ? hint : error;
                const fail = (error) => { failure = failure ? enrich(failure, error) : error; stop(); };
                const abort = () => fail(new AssistantError('TIMEOUT', '生成时间较长或任务已中断，请重试。', 504));
                signal?.addEventListener('abort', abort, { once: true });
                if (signal?.aborted) abort();
                const event = (line) => {
                    if (!line.trim()) return;
                    let value;
                    try { value = JSON.parse(line); } catch { if (!failure) fail(new AssistantError('INVALID_RESPONSE', 'AgentRouter 客户端返回格式不完整，请重试。', 502)); return; }
                    if (!value || typeof value !== 'object' || Array.isArray(value)) {
                        if (!failure) fail(new AssistantError('INVALID_RESPONSE', 'AgentRouter 客户端返回格式不完整，请重试。', 502));
                        return;
                    }
                    if (value.type === 'error' || value.type === 'turn.failed') {
                        fail(enrich(clientError(eventErrorText(value)), errorHint));
                        return;
                    }
                    if (failure) return;
                    const item = value.item;
                    if (value.type === 'turn.completed') {
                        completed = true;
                        // The pinned exec emits default zero counters when the
                        // provider omitted usage; that is unknown, not a bill.
                        const usage = value.usage;
                        progress?.usage(usage?.input_tokens === 0 && usage?.output_tokens === 0 ? null : usage, 'codex');
                    }
                    else if (item && ['item.started', 'item.updated', 'item.completed'].includes(value.type)) {
                        if (item.type === 'agent_message') {
                            progress?.stage('generating');
                            progress?.text(item.text || '');
                            if (value.type === 'item.completed') answer = item.text || '';
                        }
                        // Error items also represent nonfatal CLI warnings. Keep
                        // only their safe classification as a hint for a failed
                        // turn; never reject an otherwise completed answer.
                        else if (item.type === 'error' && value.type === 'item.completed') errorHint = clientError(eventErrorText(item));
                        else if (item.type === 'mcp_tool_call') {
                            if (item.server !== 'acm_trainer' || item.tool !== 'read_template') {
                                fail(new AssistantError('INVALID_RESPONSE', '模型请求了题目助手不支持的操作，请重试。', 502));
                            }
                            else progress?.stage('template');
                        } else if (!['agent_message', 'reasoning', 'error'].includes(item.type)) {
                            fail(new AssistantError('INVALID_RESPONSE', '模型请求了题目助手不支持的操作，请重试。', 502));
                        }
                        else if (item.type === 'reasoning') progress?.stage('generating');
                    }
                };
                child.stdout.setEncoding('utf8');
                child.stdout.on('data', (chunk) => {
                    size += Buffer.byteLength(chunk);
                    if (size > OUTPUT_LIMIT) { fail(new AssistantError('INVALID_RESPONSE', '模型返回内容过长，请重试。', 502)); return; }
                    output += chunk;
                    let newline;
                    while ((newline = output.indexOf('\n')) >= 0) { event(output.slice(0, newline)); output = output.slice(newline + 1); }
                });
                child.stderr.setEncoding('utf8');
                child.stderr.on('data', chunk => { stderr = (stderr + chunk).slice(-STDERR_LIMIT); });
                child.stdin.on('error', () => { /* Exit/error/close supplies a sanitized failure. */ });
                child.on('error', () => { failure ||= runtimeError(); });
                child.on('close', (code) => {
                    closed = true;
                    clearTimeout(killTimer);
                    signal?.removeEventListener('abort', abort);
                    if (output) event(output);
                    if (signal?.aborted) failure ||= new AssistantError('TIMEOUT', '生成已中断，请重试。', 504);
                    if (failure) reject(enrich(failure, clientError(stderr)));
                    else if (code !== 0) reject(enrich(clientError(stderr), errorHint));
                    else if (!completed || !answer) reject(new AssistantError('INCOMPLETE_RESPONSE', 'AgentRouter 未返回完整答案，请重试。', 502));
                    else resolve(answer);
                });
                // Only the problem/request goes to stdin. Credentials are never
                // embedded in argv, instructions, config files or model input.
                child.stdin.end(JSON.stringify(request));
            });
        } finally { await removeInvocation(directory, temporaryRoot); }
    };
}

module.exports = { CODEX_VERSION, KEY_ENV, DISABLED_FEATURES, answerSchema, modelCatalog, childEnvironment, invocation, clientError, createCodexRunner };
