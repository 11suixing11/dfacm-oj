'use strict';

const { DEFAULT_BASE, DEFAULT_MODEL, ACCOUNT_KEY_HEADER, personalProvider } = require('../provider-config.cjs');
const { localPath, publicAccount } = require('./account-view.js');

function mountAccountSettings({ document, config, fetchImpl, storage }) {
    const root = document.querySelector('[data-dfacm-ai-settings]');
    if (!root || root.dispose || !Number.isSafeInteger(config?.uid) || config.uid <= 1
        || !localPath(config.endpoint)) return null;
    function element(tag, className, text) {
        const node = document.createElement(tag); if (className) node.className = className;
        if (text !== undefined) node.textContent = text; return node;
    }
    function input(id, type, placeholder) {
        const node = element('input'); node.id = id; node.type = type; node.placeholder = placeholder;
        node.autocomplete = 'off'; node.spellcheck = false; node.setAttribute('autocapitalize', 'none'); return node;
    }
    function field(labelText, node, parent) {
        const label = element('label', 'dfacm-ai-settings__label', labelText); label.htmlFor = node.id;
        parent.append(label, node);
    }
    root.replaceChildren();
    const form = element('form', 'dfacm-ai-settings__form'); form.noValidate = true;
    const provider = element('select'); provider.id = 'dfacm-ai-provider';
    for (const [value, label] of [['agentrouter', 'AgentRouter'], ['custom', '自定义供应商']]) {
        const option = element('option', '', label); option.value = value; provider.append(option);
    }
    field('供应商', provider, form);
    const registration = element('p', 'dfacm-ai-settings__help', '还没有账号？');
    const invite = element('a', '', '注册 AgentRouter（邀请链接）');
    invite.href = 'https://agentrouter.org/register?aff=SeEq'; invite.target = '_blank'; invite.rel = 'noopener noreferrer';
    registration.append(document.createTextNode(' '), invite); form.append(registration);
    const address = element('div'); const base = input('dfacm-ai-base-url', 'url', 'https://api.example.com/v1'); base.maxLength = 2048;
    field('API 地址', base, address);
    address.append(element('p', 'dfacm-ai-settings__help', '使用公网 HTTPS 基础地址，支持 /v1 或完整 /chat/completions 地址。'));
    form.append(address);
    const model = input('dfacm-ai-model', 'text', '供应商提供的模型名称'); model.maxLength = 100;
    field('默认模型', model, form);
    const compatibility = element('p', 'dfacm-ai-settings__help'); form.append(compatibility);
    const modelWarning = element('div', 'dfacm-ai-settings__model-warning');
    modelWarning.append(element('p', 'dfacm-ai-settings__help', '旧默认模型可能暂无可用渠道，可切换到当前推荐模型。'));
    const preset = element('button', 'rounded button', `使用 ${DEFAULT_MODEL}`); preset.type = 'button';
    preset.setAttribute('data-ai-action', 'recommended'); modelWarning.append(preset); form.append(modelWarning);
    const key = input('dfacm-ai-api-key', 'password', '填写你的 API Key'); key.maxLength = 4096;
    field('API Key', key, form); const keyHelp = element('p', 'dfacm-ai-settings__help'); form.append(keyHelp);
    form.append(element('p', 'dfacm-ai-settings__help', '配置随当前账户保存。Key 加密存储，调用时由 OJ 后端发送到所选供应商；费用按供应商计费。'));
    const migration = element('div', 'dfacm-ai-settings__migration'); migration.hidden = true;
    migration.append(element('p', 'dfacm-ai-settings__help', '此标签页有旧的题目助手配置，可以导入后保存到账户。'));
    const importButton = element('button', 'rounded button', '导入旧配置'); importButton.type = 'button';
    importButton.setAttribute('data-ai-action', 'import'); migration.append(importButton); form.append(migration);
    const status = element('p', 'dfacm-ai-settings__status'); status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
    const controls = element('div', 'dfacm-ai-settings__actions');
    const save = element('button', 'primary rounded button', '保存 AI 设置'); save.type = 'submit'; save.setAttribute('data-ai-action', 'save');
    const refresh = element('button', 'rounded button', '重新加载配置'); refresh.type = 'button'; refresh.setAttribute('data-ai-action', 'refresh');
    const clear = element('button', 'rounded button', '删除 AI 配置'); clear.type = 'button'; clear.setAttribute('data-ai-action', 'clear');
    controls.append(save, refresh, clear); form.append(status, controls); root.append(form);
    let active = null, busy = false, disposed = false, loaded = false, csrf = config.csrf || '', legacy = null;
    let customDraft = { baseUrl: '', model: '' }, agentDraft = { model: DEFAULT_MODEL }, previous = 'agentrouter';
    const legacyKey = typeof config.legacyScope === 'string' ? `dfacm-assistant:provider:${config.legacyScope}` : null;
    function choose(value) {
        for (const option of provider.querySelectorAll('option')) option.selected = false;
        provider.querySelector(`option[value="${value}"]`).selected = true;
    }
    function showFields() {
        address.hidden = provider.value !== 'custom'; registration.hidden = provider.value !== 'agentrouter';
        compatibility.textContent = provider.value === 'agentrouter'
            ? `默认推荐 ${DEFAULT_MODEL}，可用模型以账户为准。AgentRouter Key 需有 Codex 接入和当前模型权限。`
            : '供应商需兼容 Chat Completions，支持 JSON 输出与工具调用。';
        modelWarning.hidden = provider.value !== 'agentrouter' || model.value.trim() !== 'deepseek-v4-flash';
        keyHelp.textContent = active?.hasKey ? 'API Key 已加密保存；留空保留原 Key，填写新 Key 将替换。' : '请填写你自己的 API Key。';
        key.placeholder = active?.hasKey ? '已设置，留空保持不变' : '填写你的 API Key';
        clear.hidden = !active?.configured; migration.hidden = !legacy || !!active?.configured;
    }
    function setBusy(value) {
        busy = value; root.setAttribute('aria-busy', String(value));
        for (const control of [provider, base, model, key, preset, importButton, save, clear]) control.disabled = value || !loaded;
        refresh.disabled = value;
    }
    function fill(value) {
        active = value; previous = value.provider; choose(previous); base.value = value.baseUrl; model.value = value.model; key.value = '';
        if (value.provider === 'custom') customDraft = { baseUrl: value.baseUrl, model: value.model };
        else agentDraft = { model: value.model };
        showFields();
    }
    async function request(options = {}) {
        const response = await fetchImpl(config.endpoint, { credentials: 'same-origin', cache: 'no-store', ...options,
            headers: { Accept: 'application/json', ...options.headers } });
        let data;
        try { data = await response.json(); } catch { throw new Error('会话已过期或服务暂时不可用，请刷新页面。'); }
        if (!response.ok || !data.ok) throw new Error(data.message || 'AI 配置操作失败，请稍后重试。');
        const value = publicAccount(data.config, config.uid);
        if (typeof data.csrf !== 'string' || !/^[a-f0-9]{64}$/.test(data.csrf)) throw new Error('账户会话已变化，请刷新页面。');
        if (!disposed) csrf = data.csrf;
        return value;
    }
    async function load() {
        if (busy || disposed) return;
        setBusy(true); status.textContent = '正在加载账户 AI 配置…';
        try {
            const value = await request(); if (disposed) return;
            loaded = true; fill(value); status.textContent = value.configured ? '正在使用账户已保存的 AI 配置。' : '尚未配置 AI，填写后保存即可。';
        } catch (error) {
            if (!disposed) { loaded = false; active = null; key.value = ''; showFields(); status.textContent = error.message || '账户 AI 配置加载失败，请重新加载。'; }
        }
        finally { if (!disposed) setBusy(false); }
    }
    async function mutate(action) {
        if (busy || !loaded || disposed) return;
        let draft;
        try {
            if (action === 'save') draft = personalProvider({ provider: provider.value, baseUrl: base.value, model: model.value,
                apiKey: key.value.trim() || (active?.hasKey ? 'stored-key-placeholder' : '') });
            if (draft && active?.configured && !key.value.trim()
                && (draft.provider !== active.provider || draft.baseUrl !== active.baseUrl)) {
                throw new Error('更换供应商或 API 地址时，请填写对应的新 API Key。');
            }
        } catch (error) { status.textContent = error.message; return; }
        const body = new URLSearchParams({ action, csrf, revision: active?.revision || '' });
        const headers = {};
        if (draft) { body.set('provider', draft.provider); body.set('base_url', draft.baseUrl); body.set('model', draft.model); }
        if (action === 'save' && key.value.trim()) headers[ACCOUNT_KEY_HEADER] = key.value.trim();
        setBusy(true); status.textContent = action === 'clear' ? '正在删除 AI 配置…' : '正在保存 AI 设置…';
        try {
            const value = await request({ method: 'POST', body, headers }); if (disposed) return;
            fill(value);
            if (action === 'save' && legacyKey) { try { storage?.removeItem(legacyKey); } catch { /* Optional old storage. */ } legacy = null; showFields(); }
            status.textContent = action === 'save' ? 'AI 设置已保存到账户，题目助手及后续 AI 功能将共用此配置。' : 'AI 配置已删除，需要重新设置后才能使用 AI。';
        } catch (error) { if (!disposed) status.textContent = error.message || 'AI 设置操作失败，请稍后重试。'; }
        finally { if (!disposed) setBusy(false); }
    }
    provider.addEventListener('change', () => {
        if (previous === 'custom') customDraft = { baseUrl: base.value, model: model.value };
        else agentDraft = { model: model.value };
        if (provider.value === 'custom') { base.value = customDraft.baseUrl; model.value = customDraft.model; }
        else { base.value = DEFAULT_BASE; model.value = agentDraft.model; }
        previous = provider.value; key.value = ''; status.textContent = ''; showFields();
    });
    model.addEventListener('input', showFields);
    preset.addEventListener('click', () => { if (!busy) { model.value = DEFAULT_MODEL; showFields(); } });
    importButton.addEventListener('click', () => {
        if (busy || !legacy || active?.configured) return;
        choose(legacy.provider); previous = legacy.provider; base.value = legacy.baseUrl; model.value = legacy.model; key.value = legacy.apiKey;
        showFields(); status.textContent = '旧配置已导入，请点击“保存 AI 设置”写入当前账户。';
    });
    form.addEventListener('submit', event => { event.preventDefault(); root.task = mutate('save'); });
    clear.addEventListener('click', () => { root.task = mutate('clear'); });
    refresh.addEventListener('click', () => { root.task = load(); });
    try {
        const saved = legacyKey ? JSON.parse(storage?.getItem(legacyKey) || 'null') : null;
        if (saved?.version === 1) legacy = personalProvider(saved);
    } catch { /* Invalid optional legacy configuration is ignored. */ }
    choose('agentrouter'); base.value = DEFAULT_BASE; model.value = DEFAULT_MODEL; showFields();
    root.suspend = () => { key.value = ''; legacy = null; showFields(); };
    root.dispose = () => { disposed = true; key.value = ''; legacy = null; active = null; };
    root.task = load(); return root;
}

module.exports = { mountAccountSettings };
