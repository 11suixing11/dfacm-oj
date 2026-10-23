import { addPage, NamedPage } from '@hydrooj/ui-default';
import './training.css';
import './catalog.css';

const { mountTrainingContext } = require('./training.js');
const { mountTrainingCatalog } = require('./catalog.js');

addPage(new NamedPage('training_main', () => {
    mountTrainingCatalog({ document, config: window.UiContext?.dfacmCatalog, location: window.location });
}));

addPage(new NamedPage(['training_detail', 'problem_detail', 'problem_submit', 'record_detail'], () => {
    const panel = mountTrainingContext({
        document, config: window.UiContext?.dfacmTraining, uiContext: window.UiContext,
        location: window.location, fetchImpl: window.fetch.bind(window), Observer: window.MutationObserver,
    });
    if (!panel) return;
    const onShow = (event: PageTransitionEvent) => { if (event.persisted) panel.refresh(); };
    const onHide = (event: PageTransitionEvent) => {
        if (event.persisted) return;
        panel.dispose();
        window.removeEventListener('pageshow', onShow);
        window.removeEventListener('pagehide', onHide);
    };
    window.addEventListener('pageshow', onShow);
    window.addEventListener('pagehide', onHide);
}));
