import { randomBytes, timingSafeEqual } from 'node:crypto';
import { join } from 'node:path';
import {
    Context, ContestModel, db, Handler, ObjectId, param, PERM, post, PRIV, ProblemModel,
    RecordModel, SettingModel, SystemModel, Types,
} from 'hydrooj';

const { AssistantError } = require('./protocol.cjs');
const { createContextLoader } = require('./context.cjs');
const { DEFAULT_BASE, DEFAULT_MODEL, createModelClient, modelConfig, personalModelConfig } = require('./client.cjs');
const { KEY_HEADER } = require('./provider-config.cjs');
const { createMongoJobStore } = require('./mongo-jobs.cjs');
const { createAccountProviderStore } = require('./account-store.cjs');
const { createAccountHandlers, accountCsrf } = require('./account-http.cjs');

const loader = createContextLoader({
    problemModel: ProblemModel, recordModel: RecordModel, contestModel: ContestModel,
    permissions: PERM, objectId: (value: string) => new ObjectId(value),
});
const client = createModelClient({ resourceRoot: join(__dirname, 'skill/acm-trainer') });
const collection = db.collection('dfacm_assistant_jobs' as any);
const jobs = createMongoJobStore({ collection, generate: client.generate });
const accountProviders = createAccountProviderStore({ collection: db.collection('dfacm_ai_accounts' as any) });
const SESSION_KEY = 'dfacmAssistantCsrf';
const ALLOWED_ENV_KEYS = ['DFACM_ASSISTANT_ENABLED', 'DFACM_ASSISTANT_BASE_URL', 'DFACM_ASSISTANT_MODEL', 'DFACM_ASSISTANT_API_KEY'];

function setting(key: string, env: string, fallback: unknown) {
    return process.env[env] ?? SystemModel.get(`dfacm_assistant.${key}`) ?? fallback;
}

function enabled() {
    return ['true', '1', 'on'].includes(String(setting('enabled', ALLOWED_ENV_KEYS[0], false)).toLowerCase());
}

function config() {
    return modelConfig({
        baseUrl: setting('base_url', ALLOWED_ENV_KEYS[1], DEFAULT_BASE),
        model: setting('model', ALLOWED_ENV_KEYS[2], DEFAULT_MODEL),
        apiKey: setting('api_key', ALLOWED_ENV_KEYS[3], ''),
    });
}

function csrfToken(handler: Handler) {
    if (!handler.session) return '';
    if (typeof handler.session[SESSION_KEY] !== 'string' || handler.session[SESSION_KEY].length !== 64) {
        handler.session[SESSION_KEY] = randomBytes(32).toString('hex');
    }
    return handler.session[SESSION_KEY];
}

function csrfRejected(handler: Handler, sent: unknown) {
    const expected = handler.session?.[SESSION_KEY];
    if (typeof expected !== 'string' || typeof sent !== 'string') return true;
    const left = Buffer.from(expected);
    const right = Buffer.from(sent);
    return !left.length || left.length !== right.length || !timingSafeEqual(left, right);
}

function requireEnabled() {
    if (!enabled()) throw new AssistantError('DISABLED', '题目助手尚未开启，请联系管理员。', 503);
}

function target(handler: Handler, page: 'problem' | 'record') {
    return page === 'problem' ? `p:${handler.args.pid}` : `r:${handler.args.rid}`;
}

function json(handler: Handler, body: any) {
    handler.response.body = body;
    handler.response.type = 'application/json';
    handler.response.addHeader('Cache-Control', 'no-store');
    handler.response.addHeader('Vary', 'Cookie');
}

function failure(handler: Handler, error: unknown) {
    const safe = error instanceof AssistantError ? error
        : new AssistantError('REQUEST_FAILED', '题目助手暂时不可用，请稍后重试。', 500);
    handler.response.status = safe.status;
    json(handler, { ok: false, code: safe.code, message: safe.message });
}

async function begin(handler: Handler, page: 'problem' | 'record', mode: string, csrf: string,
    code?: string, verdict?: string, rid?: string, provider?: string, baseUrl?: string, modelName?: string,
    level?: string, compilerOutput?: string) {
    const personalKey = handler.request.headers?.[KEY_HEADER];
    // The key is a header, never a decorated argument or stored job input.
    if (handler.request.headers) delete handler.request.headers[KEY_HEADER];
    try {
        requireEnabled();
        if (csrfRejected(handler, csrf)) throw new AssistantError('CSRF', '会话已过期，请刷新页面后重试。', 403);
        const args: any = { mode, verdict, level, compiler_output: compilerOutput };
        if (code !== undefined) args.code = code;
        if (rid !== undefined) args.rid = rid;
        const loaded = await loader.load({
            domainId: handler.args.domainId,
            pid: page === 'problem' ? handler.args.pid : undefined,
            rid: page === 'record' ? String(handler.args.rid) : undefined,
            user: handler.user, args,
        });
        let model;
        if (provider === undefined || provider === 'account') {
            if (personalKey || baseUrl || modelName || handler.session?.sudoUid) {
                throw new AssistantError('INVALID_PROVIDER', '请使用自己的账户 AI 设置进行生成。');
            }
            model = await accountProviders.getModelConfig(handler.user._id);
        } else if (provider === 'site') {
            if (personalKey || baseUrl || modelName) throw new AssistantError('INVALID_PROVIDER', '请先选择个人供应商，再填写个人配置。');
            model = config();
        } else model = personalModelConfig({ provider, baseUrl, model: modelName, apiKey: personalKey });
        await handler.limitRate('dfacm_assistant_user', 60, 4, `u${handler.user._id}`);
        await handler.limitRate('dfacm_assistant_global', 60, 30, 'site');
        const job = await jobs.start(loaded.request, loaded.scope, target(handler, page), model, client.digest);
        if (job.status === 'ready') job.html = await handler.renderHTML('assistant_result.html', {
            answer: job.answer, source: job.source, verdict: job.verdict, diagnostic: job.diagnostic,
        });
        json(handler, { ok: true, job });
    } catch (error) { failure(handler, error); }
}

async function poll(handler: Handler, page: 'problem' | 'record', jobId: string) {
    try {
        requireEnabled();
        await handler.limitRate('dfacm_assistant_poll', 60, 90, `u${handler.user._id}`);
        if (page === 'problem') await loader.visibleProblem(handler.args.domainId, handler.args.pid, handler.user);
        else {
            const record = await loader.ownRecord(handler.args.domainId, String(handler.args.rid), handler.user);
            await loader.visibleProblem(handler.args.domainId, record.pid, handler.user);
        }
        const scope = `${handler.args.domainId}:${handler.user._id}`;
        const job = await jobs.get(jobId, scope, target(handler, page));
        if (job.status === 'ready') job.html = await handler.renderHTML('assistant_result.html', {
            answer: job.answer, source: job.source, verdict: job.verdict, diagnostic: job.diagnostic,
        });
        json(handler, { ok: true, job });
    } catch (error) { failure(handler, error); }
}

class AssistantProblemHandler extends Handler {
    @param('pid', Types.ProblemId)
    @param('job', Types.String)
    async get(domainId: string, pid: string | number, job: string) { await poll(this, 'problem', job); }

    @post('mode', Types.String)
    @post('csrf', Types.String, true)
    @post('code', Types.String, true)
    @post('verdict', Types.String, true)
    @post('rid', Types.String, true)
    @post('provider', Types.String, true)
    @post('base_url', Types.String, true)
    @post('model', Types.String, true)
    @post('level', Types.String, true)
    @post('compiler_output', Types.String, true)
    async post(domainId: string, mode: string, csrf: string, code?: string, verdict?: string, rid?: string,
        provider?: string, baseUrl?: string, modelName?: string, level?: string, compilerOutput?: string) {
        await begin(this, 'problem', mode, csrf, code, verdict, rid, provider, baseUrl, modelName, level, compilerOutput);
    }
}

class AssistantRecordHandler extends Handler {
    @param('rid', Types.ObjectId)
    @param('job', Types.String)
    async get(domainId: string, rid: ObjectId, job: string) { await poll(this, 'record', job); }

    @post('mode', Types.String)
    @post('csrf', Types.String, true)
    @post('provider', Types.String, true)
    @post('base_url', Types.String, true)
    @post('model', Types.String, true)
    async post(domainId: string, mode: string, csrf: string, provider?: string, baseUrl?: string, modelName?: string) {
        await begin(this, 'record', mode, csrf, undefined, undefined, undefined, provider, baseUrl, modelName);
    }
}

async function addProblemEntry(handler: Handler) {
    if (!enabled() || handler.request.json || handler.response.template !== 'problem_detail.html'
        || !handler.user.hasPriv(PRIV.PRIV_USER_PROFILE) || handler.args.tid || handler.response.body?.tdoc) return;
    const pdoc = handler.response.body?.pdoc;
    if (!pdoc) return;
    try { await loader.visibleProblem(handler.args.domainId, pdoc.docId, handler.user); }
    catch { return; }
    handler.UiContext.dfacmAssistant = {
        page: 'problem', csrf: csrfToken(handler), userScope: `${handler.args.domainId}:${handler.user._id}`,
        endpoint: handler.url('dfacm_assistant_problem', { pid: pdoc.pid || pdoc.docId }),
        accountSettings: handler.url('dfacm_ai_settings'),
        accountConfig: handler.url('dfacm_ai_config'),
    };
    handler.response.addHeader('Cache-Control', 'private, no-store');
}

async function addRecordEntry(handler: Handler) {
    if (!enabled() || handler.request.json || handler.response.template !== 'record_detail.html'
        || !handler.user.hasPriv(PRIV.PRIV_USER_PROFILE)) return;
    const record = handler.response.body?.rdoc;
    if (!record?._id || record.uid !== handler.user._id || handler.args.rev) return;
    try {
        await loader.ownRecord(handler.args.domainId, String(record._id), handler.user);
        await loader.visibleProblem(handler.args.domainId, record.pid, handler.user);
    } catch { return; }
    handler.UiContext.dfacmAssistant = {
        page: 'record', csrf: csrfToken(handler), userScope: `${handler.args.domainId}:${handler.user._id}`,
        endpoint: handler.url('dfacm_assistant_record', { rid: record._id }),
        accountSettings: handler.url('dfacm_ai_settings'),
        accountConfig: handler.url('dfacm_ai_config'),
    };
    handler.response.addHeader('Cache-Control', 'private, no-store');
}

export const inject = ['db'];

export async function apply(ctx: Context) {
    await db.ensureIndexes(collection,
        { key: { expireAt: 1 }, name: 'expiry', expireAfterSeconds: 0 },
        { key: { scope: 1, target: 1, identity: 1, status: 1 }, name: 'reuse' },
    );
    const { Setting, SystemSetting, FLAG_SECRET } = SettingModel;
    // One dot per setting key, matching Hydro's native form save handler.
    ctx.effect(() => SystemSetting(
        Setting('setting_dfacm_assistant', 'dfacm_assistant.enabled', false, 'boolean', '开启题目助手',
            '为登录用户的日常题目和赛后提交提供完整题解与代码诊断。', 0),
        Setting('setting_dfacm_assistant', 'dfacm_assistant.base_url', DEFAULT_BASE, 'text', '模型 API 地址',
            '兼容 OpenAI Chat Completions 的 HTTPS 地址，填写到 /v1。', 0),
        Setting('setting_dfacm_assistant', 'dfacm_assistant.model', DEFAULT_MODEL, 'text', '模型名称',
            `默认使用 AgentRouter 的 ${DEFAULT_MODEL}，以账户当前可用模型为准。`, 0),
        Setting('setting_dfacm_assistant', 'dfacm_assistant.api_key', '', 'password', '模型 API Key',
            '仅用于服务器调用，保存后不回显；留空保留已有 Key。', FLAG_SECRET),
    ));
    ctx.Route('dfacm_assistant_problem', '/p/:pid/assistant', AssistantProblemHandler, PRIV.PRIV_USER_PROFILE);
    ctx.Route('dfacm_assistant_record', '/record/:rid/assistant', AssistantRecordHandler, PRIV.PRIV_USER_PROFILE);
    const { AccountConfigHandler, AccountSettingsRedirectHandler } = createAccountHandlers({
        Handler, store: accountProviders, loginPrivilege: PRIV.PRIV_USER_PROFILE,
    });
    ctx.Route('dfacm_ai_settings', '/home/ai', AccountSettingsRedirectHandler, PRIV.PRIV_USER_PROFILE);
    ctx.Route('dfacm_ai_config', '/home/ai/config', AccountConfigHandler, PRIV.PRIV_USER_PROFILE);
    ctx.on('handler/after/HomeSettings#get', (handler: Handler) => {
        if (handler.request.json || handler.response.template !== 'home_settings.html'
            || handler.response.body?.category !== 'account' || !handler.user.hasPriv(PRIV.PRIV_USER_PROFILE)
            || handler.session?.sudoUid || !Number.isSafeInteger(handler.user._id) || handler.user._id <= 1) return;
        handler.response.template = 'dfacm_ai_account_settings.html';
        handler.UiContext.dfacmAiSettings = {
            endpoint: handler.url('dfacm_ai_config'), csrf: accountCsrf(handler), uid: handler.user._id,
            legacyScope: `${handler.args.domainId}:${handler.user._id}`,
        };
        handler.response.addHeader('Cache-Control', 'private, no-store');
    });
    ctx.injectUI('UserDropdown', 'dfacm_ai_settings', { icon: 'sliders', displayName: 'AI 设置' }, PRIV.PRIV_USER_PROFILE);
    // Shared account resolver for future OJ AI plugins. It always resolves the
    // authenticated handler's UID, never a user-supplied account identifier.
    ctx.provide('dfacmAi', Object.freeze({
        getModelConfig: (handler: Handler) => {
            if (!handler.user?.hasPriv(PRIV.PRIV_USER_PROFILE) || handler.session?.sudoUid) {
                throw new AssistantError('AI_ACCOUNT_REQUIRED', '请使用自己的 OJ 账户登录后使用 AI。', 403);
            }
            return accountProviders.getModelConfig(handler.user._id);
        },
    }));
    ctx.on('handler/after/ProblemDetail#get', addProblemEntry);
    ctx.on('handler/after/RecordDetail#get', addRecordEntry);
    ctx.effect(() => () => jobs.dispose());
    ctx.i18n.load('zh', { setting_dfacm_assistant: '题目助手' });
}
