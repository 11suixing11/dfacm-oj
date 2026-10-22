'use strict';

const { localPath, publicAccount } = require('./account-view.js');

function mountAccountProvider({ document, endpoint, settingsUrl, scope, fetchImpl, icon, onChange }) {
    if (!localPath(endpoint) || !localPath(settingsUrl)) throw new Error('账户设置地址无效，请刷新页面。');
    function element(tag, className, text) {
        const node = document.createElement(tag); if (className) node.className = className;
        if (text !== undefined) node.textContent = text; return node;
    }
    const button = element('button', 'dfacm-assistant__settings-button'); button.type = 'button';
    button.setAttribute('data-window-action', 'settings'); button.setAttribute('aria-label', '账户 AI 设置'); button.title = '账户 AI 设置';
    button.append(icon('M12 3v3m0 12v3M3 12h3m12 0h3M5.6 5.6l2.1 2.1m8.6 8.6 2.1 2.1m-12.8 0 2.1-2.1m8.6-8.6 2.1-2.1M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0'));
    const view = element('div', 'dfacm-assistant__settings'); view.id = 'dfacm-assistant-settings'; view.hidden = true;
    button.setAttribute('aria-controls', view.id); button.setAttribute('aria-expanded', 'false');
    view.append(element('h3', '', '账户 AI 设置'), element('p', 'dfacm-assistant__settings-intro', 'AI 配置随你的 OJ 账户保存，换题或换设备都能复用。'));
    const summary = element('p', 'dfacm-assistant__account-summary');
    const status = element('p', 'dfacm-assistant__settings-status'); status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
    const link = element('a', 'dfacm-assistant__account-link', '前往账户 AI 设置'); link.href = settingsUrl;
    link.target = '_blank'; link.rel = 'noopener noreferrer';
    const reload = element('button', '', '刷新配置状态'); reload.type = 'button'; reload.setAttribute('data-provider-action', 'refresh-account');
    const controls = element('div', 'dfacm-assistant__account-actions'); controls.append(link, reload);
    view.append(summary, status, controls);
    let active = null, pending = null, disposed = false;
    const uid = Number(scope?.split(':').at(-1));
    async function load() {
        if (pending || disposed) return pending;
        reload.disabled = true; status.textContent = '正在读取账户配置…';
        pending = (async () => {
            try {
                const response = await fetchImpl(endpoint, { credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'application/json' } });
                const data = await response.json(); if (disposed) return;
                if (!response.ok || !data.ok) throw new Error(data.message || '账户配置暂时无法读取，请稍后刷新。');
                active = publicAccount(data.config, uid);
                summary.textContent = active.configured ? `${active.provider === 'agentrouter' ? 'AgentRouter' : '自定义供应商'} · ${active.model}` : '尚未保存账户 AI 配置。';
                status.textContent = active.configured ? 'API Key 已设置，生成时使用账户配置。' : '请先到账户设置中填写供应商和 API Key。';
                onChange?.();
            } catch (error) {
                if (!disposed) { active = null; summary.textContent = ''; status.textContent = error.message || '读取账户 AI 配置失败，请稍后刷新。'; onChange?.(); }
            }
            finally { pending = null; if (!disposed) reload.disabled = false; }
        })();
        return pending;
    }
    function setOpen(value) {
        view.hidden = !value; button.setAttribute('aria-expanded', String(value)); button.classList.toggle('is-active', value);
        onChange?.(value); if (value) { view.task = load(); }
    }
    button.addEventListener('click', () => setOpen(view.hidden));
    reload.addEventListener('click', () => { view.task = load(); });
    return { button, view, get isOpen() { return !view.hidden; },
        get label() { return active?.configured ? `账户 · ${active.provider === 'agentrouter' ? 'AgentRouter' : '自定义'}` : '账户 AI'; },
        setOpen, setBusy(value) { button.disabled = value; },
        apply(body) { body.set('provider', 'account'); return {}; },
        dispose() { disposed = true; active = null; } };
}

module.exports = { mountAccountProvider };
