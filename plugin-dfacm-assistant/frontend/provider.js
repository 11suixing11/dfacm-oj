'use strict';

const { DEFAULT_BASE, DEFAULT_MODEL, KEY_HEADER, personalProvider } = require('../provider-config.cjs');
const { mountAccountProvider } = require('./account-provider.js');

function mountProvider({ document, scope, storage, icon, onChange = () => {}, endpoint, settingsUrl, fetchImpl }) {
    if (endpoint && settingsUrl) return mountAccountProvider({ document, scope, icon, onChange, endpoint, settingsUrl, fetchImpl });
    function element(tag, className, text) {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (text !== undefined) node.textContent = text;
        return node;
    }
    const button = element('button', 'dfacm-assistant__settings-button');
    button.type = 'button';
    button.setAttribute('data-window-action', 'settings');
    button.setAttribute('aria-label', '模型设置');
    button.title = '模型设置';
    button.append(icon('M12 3v3m0 12v3M3 12h3m12 0h3M5.6 5.6l2.1 2.1m8.6 8.6 2.1 2.1m-12.8 0 2.1-2.1m8.6-8.6 2.1-2.1M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0'));
    const view = element('div', 'dfacm-assistant__settings');
    view.id = 'dfacm-assistant-settings';
    view.hidden = true;
    button.setAttribute('aria-controls', view.id);
    button.setAttribute('aria-expanded', 'false');
    view.append(element('h3', '', '模型设置'), element('p', 'dfacm-assistant__settings-intro', '选择供应商，填写你自己的 API Key。'));

    function field(labelText, control, container = view) {
        const label = element('label', 'dfacm-assistant__field-label', labelText);
        label.htmlFor = control.id;
        container.append(label, control);
    }
    const provider = element('select');
    provider.id = 'dfacm-assistant-provider';
    for (const [value, text] of [['agentrouter', 'AgentRouter'], ['custom', '自定义供应商']]) {
        const option = element('option', '', text);
        option.value = value;
        provider.append(option);
    }
    field('供应商', provider);
    const registration = element('p', 'dfacm-assistant__registration');
    const invite = element('a', 'dfacm-assistant__invite', '注册 AgentRouter（邀请链接）');
    invite.href = 'https://agentrouter.org/register?aff=SeEq';
    invite.target = '_blank';
    invite.rel = 'noopener noreferrer';
    invite.append(icon('M14 3h7v7m0-7L10 14M10 3H3v18h18v-7'));
    registration.append(element('span', '', '还没有账号？'), invite);
    view.append(registration);
    const personalFields = element('div');
    view.append(personalFields);
    function input(id, type, placeholder) {
        const node = element('input');
        node.id = id;
        node.type = type;
        node.placeholder = placeholder;
        node.setAttribute('autocomplete', 'off');
        node.setAttribute('autocapitalize', 'none');
        node.spellcheck = false;
        return node;
    }
    const base = input('dfacm-assistant-base-url', 'url', 'https://api.example.com/v1');
    base.maxLength = 2048;
    const address = element('div');
    field('API 地址', base, address);
    address.append(element('p', 'dfacm-assistant__field-help', '填写供应商的 API 基础地址，支持 /v1 或完整的 /chat/completions 地址。'));
    personalFields.append(address);
    const model = input('dfacm-assistant-model', 'text', '供应商提供的模型名称');
    model.maxLength = 100;
    field('模型名称', model, personalFields);
    const modelHelp = element('p', 'dfacm-assistant__field-help', `默认推荐 ${DEFAULT_MODEL}，实际可用模型以你的 AgentRouter 账户为准。`);
    modelHelp.id = 'dfacm-assistant-model-help';
    model.setAttribute('aria-describedby', modelHelp.id);
    const modelWarning = element('div', 'dfacm-assistant__model-warning');
    modelWarning.setAttribute('role', 'note');
    modelWarning.append(element('p', 'dfacm-assistant__field-help', '旧默认模型可能暂无可用渠道，可切换到当前推荐模型。'));
    const recommended = element('button', 'dfacm-assistant__model-preset', `使用 ${DEFAULT_MODEL}`);
    recommended.type = 'button';
    recommended.setAttribute('data-provider-action', 'recommended-model');
    modelWarning.append(recommended);
    personalFields.append(modelHelp, modelWarning);
    const key = input('dfacm-assistant-api-key', 'password', '粘贴你的 API Key');
    key.maxLength = 4096;
    field('API Key', key, personalFields);
    const remember = input('dfacm-assistant-remember-key', 'checkbox', '');
    const rememberLabel = element('label', 'dfacm-assistant__remember');
    rememberLabel.htmlFor = remember.id;
    rememberLabel.append(remember, element('span', '', '在当前标签页记住配置'));
    personalFields.append(rememberLabel);
    const notice = element('p', 'dfacm-assistant__field-help', '默认仅当前页面使用；记住后刷新、换题可复用，关闭标签页后清除。Key 经 OJ 后端转发到你选择的供应商，不写入服务器数据库；费用按该供应商计费。');
    const compatibility = element('p', 'dfacm-assistant__field-help');
    personalFields.append(notice);
    personalFields.append(compatibility);
    const status = element('p', 'dfacm-assistant__settings-status');
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    view.append(status);
    const controls = element('div', 'dfacm-assistant__settings-actions');
    const clear = element('button', '', '清除个人配置');
    clear.type = 'button';
    clear.setAttribute('data-provider-action', 'clear');
    const save = element('button', 'dfacm-assistant__save', '应用设置');
    save.type = 'button';
    save.setAttribute('data-provider-action', 'save');
    controls.append(clear, save);
    view.append(controls);

    const storageKey = scope ? `dfacm-assistant:provider:${scope}` : null;
    let active = null;
    let busy = false;
    let draftCustom = { baseUrl: '', model: '' };
    let previous = 'agentrouter';
    let kept = false;

    function select(value) {
        // Works without assuming the browser implements select.value setters.
        for (const option of provider.querySelectorAll('option')) option.selected = false;
        const chosen = [...provider.querySelectorAll('option')].find(option => option.value === value);
        if (chosen) chosen.selected = true;
    }
    function showFields() {
        address.hidden = provider.value !== 'custom';
        registration.hidden = provider.value !== 'agentrouter';
        compatibility.textContent = provider.value === 'agentrouter'
            ? '请填写可用于 Codex 接入的 AgentRouter Key，并确认该 Key 有当前模型的使用权限。'
            : '自定义供应商需兼容 Chat Completions，支持 JSON 输出和工具调用。';
        clear.hidden = !active && !key.value;
        showModelHelp();
    }
    function showModelHelp() {
        modelHelp.hidden = provider.value !== 'agentrouter';
        modelWarning.hidden = provider.value !== 'agentrouter' || model.value.trim() !== 'deepseek-v4-flash';
    }
    function removeSaved() {
        try { if (storageKey) storage?.removeItem(storageKey); } catch { /* Optional storage. */ }
    }
    function fill() {
        previous = active?.provider || 'agentrouter';
        select(previous);
        base.value = active?.baseUrl || DEFAULT_BASE;
        model.value = active?.model || DEFAULT_MODEL;
        key.value = active?.apiKey || '';
        remember.checked = kept;
        if (active?.provider === 'custom') draftCustom = { baseUrl: base.value, model: model.value };
        showFields();
    }
    function setOpen(value) {
        if (value && busy) return;
        view.hidden = !value;
        button.setAttribute('aria-expanded', String(value));
        button.classList.toggle('is-active', value);
        status.textContent = '';
        if (value) fill();
        onChange(value);
        if (value) provider.focus({ preventScroll: true });
    }
    button.addEventListener('click', () => setOpen(view.hidden));
    provider.addEventListener('change', () => {
        if (previous === 'custom') draftCustom = { baseUrl: base.value, model: model.value };
        if (provider.value === 'agentrouter') { base.value = DEFAULT_BASE; model.value = DEFAULT_MODEL; }
        else if (provider.value === 'custom') { base.value = draftCustom.baseUrl; model.value = draftCustom.model; }
        previous = provider.value;
        status.textContent = '';
        showFields();
    });
    remember.addEventListener('change', () => {
        if (!remember.checked) { kept = false; removeSaved(); }
    });
    key.addEventListener('input', showFields);
    model.addEventListener('input', showModelHelp);
    recommended.addEventListener('click', () => {
        if (busy) return;
        model.value = DEFAULT_MODEL;
        status.textContent = '';
        showModelHelp();
        model.focus({ preventScroll: true });
    });
    save.addEventListener('click', () => {
        if (busy) return;
        try {
            active = personalProvider({ provider: provider.value, baseUrl: base.value, model: model.value, apiKey: key.value });
            kept = false;
            removeSaved();
            if (remember.checked && storageKey && storage) {
                try { storage.setItem(storageKey, JSON.stringify({ version: 1, ...active })); kept = true; }
                catch { /* The active in-memory configuration still works. */ }
            }
            setOpen(false);
            button.focus({ preventScroll: true });
        } catch (error) { status.textContent = error.message || '请检查模型配置。'; }
    });
    clear.addEventListener('click', () => {
        if (busy) return;
        active = null;
        draftCustom = { baseUrl: '', model: '' };
        kept = false;
        removeSaved();
        fill();
        status.textContent = '个人配置已清除，请填写 API Key 后应用设置。';
        onChange(true);
    });
    try {
        const saved = storageKey ? JSON.parse(storage?.getItem(storageKey) || 'null') : null;
        if (saved?.version === 1) { active = personalProvider(saved); kept = true; }
    } catch { removeSaved(); }
    fill();

    return {
        button, view,
        get isOpen() { return !view.hidden; },
        get label() { return !active ? '未配置 API Key' : active.provider === 'agentrouter' ? '个人 · AgentRouter' : '个人 · 自定义'; },
        setOpen,
        setBusy(value) {
            busy = value;
            button.disabled = value;
            for (const control of [provider, base, model, key, remember, clear, save, recommended]) control.disabled = value;
        },
        apply(body) {
            if (!active) {
                setOpen(true);
                status.textContent = '请先填写 API Key 并点击“应用设置”。';
                key.focus({ preventScroll: true });
                return null;
            }
            body.set('provider', active.provider);
            body.set('base_url', active.baseUrl);
            body.set('model', active.model);
            return { [KEY_HEADER]: active.apiKey };
        },
        dispose() { active = null; key.value = ''; },
    };
}

module.exports = { mountProvider };
