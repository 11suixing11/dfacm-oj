'use strict';

const { randomBytes, timingSafeEqual } = require('node:crypto');
const { AssistantError } = require('./protocol.cjs');
const { ACCOUNT_KEY_HEADER } = require('./account-store.cjs');

const CSRF_SESSION_KEY = 'dfacmAiCsrf';

function accountCsrf(handler) {
    const uid = handler.user?._id;
    if (!handler.session || !Number.isSafeInteger(uid) || uid <= 1) return '';
    const current = handler.session[CSRF_SESSION_KEY];
    if (current?.uid === uid && typeof current.token === 'string' && current.token.length === 64) return current.token;
    const token = randomBytes(32).toString('hex');
    handler.session[CSRF_SESSION_KEY] = { uid, token };
    return token;
}
function csrfValid(handler, sent) {
    const expected = handler.session?.[CSRF_SESSION_KEY];
    if (expected?.uid !== handler.user?._id || typeof expected?.token !== 'string' || typeof sent !== 'string') return false;
    const left = Buffer.from(expected.token); const right = Buffer.from(sent);
    return !!left.length && left.length === right.length && timingSafeEqual(left, right);
}
function json(handler, payload, status = 200) {
    handler.response.status = status; handler.response.body = payload; handler.response.type = 'application/json';
    handler.response.addHeader('Cache-Control', 'private, no-store'); handler.response.addHeader('Vary', 'Cookie');
}
function failed(handler, error) {
    const safe = error instanceof AssistantError ? error : new AssistantError('AI_SETTINGS_FAILED', 'AI 设置暂时无法保存，请稍后重试。', 500);
    json(handler, { ok: false, code: safe.code, message: safe.message }, safe.status);
}
function createAccountHandlers({ Handler, store, loginPrivilege }) {
    function loggedIn(handler) {
        if (!handler.user?.hasPriv(loginPrivilege) || !Number.isSafeInteger(handler.user._id) || handler.user._id <= 1
            || handler.session?.sudoUid) throw new AssistantError('AI_ACCOUNT_REQUIRED', '请使用自己的 OJ 账户登录后管理 AI 配置。', 403);
    }
    class AccountConfigHandler extends Handler {
        async get() {
            try {
                loggedIn(this);
                json(this, { ok: true, config: await store.getSettings(this.user._id), csrf: accountCsrf(this) });
            } catch (error) { failed(this, error); }
        }
        async post() {
            const apiKey = this.request.headers?.[ACCOUNT_KEY_HEADER];
            if (this.request.headers) delete this.request.headers[ACCOUNT_KEY_HEADER];
            // Reject body credentials; do not leave accidental submissions in
            // handler args or error logs. API keys only travel in this header.
            const body = { ...this.request.body };
            const bodyKey = ['api_key', 'apiKey', 'key'].some(name => name in body);
            for (const name of ['api_key', 'apiKey', 'key']) {
                delete this.request.body?.[name]; delete this.args?.[name]; delete body[name];
            }
            try {
                loggedIn(this);
                if (!csrfValid(this, body.csrf)) throw new AssistantError('CSRF', '会话已过期，请刷新页面后重试。', 403);
                if (bodyKey || apiKey !== undefined && typeof apiKey !== 'string') throw new AssistantError('INVALID_PROVIDER', '请通过 AI 设置页面填写 API Key。');
                await this.limitRate('dfacm_ai_settings', 60, 20, `u${this.user._id}`);
                let config;
                if (body.action === 'save') config = await store.saveSettings(this.user._id,
                    { provider: body.provider, baseUrl: body.base_url, model: body.model, apiKey }, body.revision || '');
                else if (body.action === 'clear') config = await store.clearSettings(this.user._id, body.revision || '');
                else throw new AssistantError('INVALID_PROVIDER', '请选择保存或删除 AI 配置。');
                json(this, { ok: true, config, csrf: accountCsrf(this) });
            } catch (error) { failed(this, error); }
        }
    }
    class AccountSettingsRedirectHandler extends Handler {
        async get() {
            loggedIn(this);
            this.response.addHeader('Cache-Control', 'private, no-store');
            this.response.redirect = this.url('home_settings', { category: 'account' }) + '#ai';
        }
    }
    return { AccountConfigHandler, AccountSettingsRedirectHandler };
}

module.exports = { accountCsrf, createAccountHandlers };
