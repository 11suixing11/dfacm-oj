'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { parseHTML } = require('linkedom');
const { mountTrainingCatalog } = require('../frontend/catalog.js');
const { buildCatalog } = require('../catalog.cjs');

function fixture(empty = false) {
    const { document } = parseHTML('<html><body><section class="section"><div class="section__header"><h1 class="section__title">训练</h1><div class="section__tools"><form name="filter-form" method="get"><input name="q"></form></div></div>'
        + (empty ? '<p id="empty">没有训练</p>' : '<ol class="training__list all"><li>原列表</li></ol>')
        + '<nav id="pager"><a href="?q=DP&category=专题&view=enrolled&page=2">2</a></nav></section><aside id="native-create">创建训练</aside></body></html>');
    const docs = [{ docId: 'a', title: '【专题】<img src=x onerror=alert(1)>', description: '<script>bad()</script>', dag: [{ pids: [1] }] },
        { docId: 'b', title: '【入门】基础', dag: [{ pids: [2] }] }];
    const config = buildCatalog({ docs, items: empty ? [] : docs.slice(0, 1), statuses: { a: { enroll: 1, donePids: [] }, b: { enroll: 1, donePids: [] } },
        filters: { category: '专题', view: 'enrolled' }, member: true, q: 'DP', page: 1, pages: 2, url: '/d/course/training' });
    return { document, config, location: { href: 'https://oj.test/d/course/training?q=DP&category=专题&view=enrolled&page=8' } };
}

test('catalog keeps server search and pagination, resets page on filters, and escapes training content', () => {
    const f = fixture();
    const pager = f.document.querySelector('#pager').outerHTML;
    const mounted = mountTrainingCatalog(f);
    assert.ok(mounted);
    assert.equal(f.document.querySelectorAll('.dfacm-catalog-item').length, 1);
    assert.equal(f.document.querySelector('.dfacm-catalog-title').textContent, f.config.items[0].title);
    assert.equal(f.document.querySelectorAll('img,script').length, 0);
    assert.equal(f.document.querySelector('#pager').outerHTML, pager);
    assert.equal(f.document.getElementById('native-create').textContent, '创建训练');
    const direction = [...f.document.querySelectorAll('.dfacm-catalog-chip')].find((link) => link.textContent.startsWith('入门'));
    const href = new URL(direction.getAttribute('href'), f.location.href);
    assert.equal(href.pathname, '/d/course/training');
    assert.equal(href.searchParams.get('category'), '入门');
    assert.equal(href.searchParams.get('q'), 'DP');
    assert.equal(href.searchParams.get('view'), 'enrolled');
    assert.equal(href.searchParams.has('page'), false);
    assert.equal(f.document.querySelector('form').getAttribute('method'), 'get');
    assert.equal(f.document.querySelector('input[name="category"]').value, '专题');
    assert.equal(f.document.querySelector('input[name="view"]').value, 'enrolled');
    assert.equal(mountTrainingCatalog(f), null, 'mount is idempotent');
});

test('empty lists retain native feedback and a clear-filter link; unsafe config leaves native UI alone', () => {
    const f = fixture(true);
    mountTrainingCatalog(f);
    assert.equal(f.document.getElementById('empty').textContent, '没有训练');
    const clear = [...f.document.querySelectorAll('a')].find((link) => link.textContent === '清除筛选');
    assert.equal(clear.getAttribute('href'), '/d/course/training');
    const unsafe = fixture(); unsafe.config.url = 'https://other.test/training';
    assert.equal(mountTrainingCatalog(unsafe), null);
    assert.equal(unsafe.document.querySelector('.training__list').textContent, '原列表');
});
