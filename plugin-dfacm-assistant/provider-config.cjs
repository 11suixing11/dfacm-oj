'use strict';

// Shared with the browser: this module has no server imports or credentials.
const DEFAULT_BASE = 'https://agentrouter.org/v1';
const DEFAULT_MODEL = 'gpt-5.6-sol';
const KEY_HEADER = 'x-dfacm-assistant-key';
const ACCOUNT_KEY_HEADER = 'x-dfacm-ai-key';

class ProviderConfigError extends Error {
    constructor(message) { super(message); this.code = 'INVALID_PROVIDER'; }
}

function personalProvider({ provider, baseUrl, model, apiKey } = {}) {
    if (!['agentrouter', 'custom'].includes(provider)) throw new ProviderConfigError('请选择个人供应商。');
    if (provider === 'agentrouter') baseUrl = DEFAULT_BASE;
    if (typeof baseUrl !== 'string' || !baseUrl.trim() || baseUrl.length > 2048) {
        throw new ProviderConfigError('请填写供应商的 API 地址。');
    }
    let url;
    try { url = new URL(baseUrl.trim()); } catch { throw new ProviderConfigError('API 地址格式不正确。'); }
    const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash
        || !hostname.includes('.') && !hostname.includes(':')
        || /(?:^|\.)(?:localhost|local|internal)$/.test(hostname)) {
        throw new ProviderConfigError('请使用公开供应商的 HTTPS API 地址，地址中不要包含 Key 或查询参数。');
    }
    url.pathname = url.pathname.replace(/\/+$/, '').replace(/\/chat\/completions$/, '') || '/';
    if (typeof model !== 'string' || !model.trim() || model.length > 100 || /[\x00-\x1f\x7f]/.test(model)) {
        throw new ProviderConfigError('请填写有效的模型名称（最多 100 个字符）。');
    }
    if (typeof apiKey !== 'string' || !apiKey.trim() || apiKey.length > 4096 || /[^\x21-\x7e]/.test(apiKey.trim())) {
        throw new ProviderConfigError('请填写有效的 API Key。');
    }
    return { provider, baseUrl: url.href.replace(/\/+$/, ''), model: model.trim(), apiKey: apiKey.trim() };
}

module.exports = { DEFAULT_BASE, DEFAULT_MODEL, KEY_HEADER, ACCOUNT_KEY_HEADER, personalProvider };
