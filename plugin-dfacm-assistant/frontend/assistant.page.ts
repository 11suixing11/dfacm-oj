import { addPage, NamedPage } from '@hydrooj/ui-default';
import './assistant.css';

const { mountAssistant } = require('./panel.js');

addPage(new NamedPage(['problem_detail', 'record_detail'], () => {
    let storage;
    try { storage = window.sessionStorage; } catch { /* Browser storage is optional. */ }
    const panel = mountAssistant({
        document, config: window.UiContext?.dfacmAssistant,
        fetchImpl: window.fetch.bind(window), storage,
        clipboard: window.navigator.clipboard,
    });
    window.addEventListener('pagehide', (event) => { if (!event.persisted) panel?.dispose?.(); }, { once: true });
}));
