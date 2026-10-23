'use strict';

const { mountTrainingContext } = require('../../plugin-dfacm-train/frontend/training.js');
const { mountTrainingCatalog } = require('../../plugin-dfacm-train/frontend/catalog.js');
const catalogSource = document.getElementById('preview-catalog-data');
if (catalogSource) mountTrainingCatalog({ document, config: JSON.parse(catalogSource.textContent), location: window.location });
const source = document.getElementById('preview-training-data');
if (source) mountTrainingContext({
    document, config: JSON.parse(source.textContent), location: window.location, Observer: window.MutationObserver,
    fetchImpl: (url, options) => {
        const target = new URL(url, window.location.href);
        target.searchParams.set('previewStatus', document.getElementById('status')?.getAttribute('data-status') || '20');
        return window.fetch(target.pathname + target.search, options);
    },
});
