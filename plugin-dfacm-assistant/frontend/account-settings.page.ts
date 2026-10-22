import { addPage, NamedPage } from '@hydrooj/ui-default';
import './account-settings.css';

const { mountAccountSettings } = require('./account-settings.js');

addPage(new NamedPage(['home_account', 'dfacm_ai_account_settings'], () => {
    let storage;
    try { storage = window.sessionStorage; } catch { /* Legacy import is optional. */ }
    const settings = mountAccountSettings({ document, config: window.UiContext?.dfacmAiSettings,
        fetchImpl: window.fetch.bind(window), storage });
    window.addEventListener('pagehide', (event) => {
        settings?.suspend?.();
        if (!event.persisted) settings?.dispose?.();
    });
}));
