'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { categoryOf, readFilters, filterClauses, withoutOwnClauses, buildCatalog, OTHER } = require('../catalog.cjs');

test('catalog directions include later-page plans and new title prefixes without fixed IDs', () => {
    const docs = Array.from({ length: 25 }, (_, i) => ({ docId: String(i), title: i === 24 ? '【入门】一本通'
        : i === 23 ? '【新方向】新训练' : '【专题】题单 ' + i }));
    const statuses = { 24: { enroll: 1, done: false }, 0: { enroll: 1, done: true } };
    const result = buildCatalog({ docs, items: docs.slice(0, 10), statuses, filters: { category: '', view: 'all' },
        page: 1, pages: 3, url: '/training', member: true });
    assert.equal(result.total, 25);
    assert.equal(result.items.length, 10);
    assert.deepEqual(result.categories.map((item) => [item.label, item.count]), [['入门', 1], ['专题', 23], ['新方向', 1]]);
    assert.equal(result.views.find((item) => item.value === 'enrolled').count, 2);
    assert.equal(result.views.find((item) => item.value === 'completed').count, 1);
});

test('direction and enrollment filters compose with search and independent visibility constraints', () => {
    const filters = readFilters({ category: 'C++.*', view: 'enrolled' }, true);
    const status = [{ docId: 'yes', enroll: 1 }, { docId: 'no', enroll: 0 }];
    const clauses = filterClauses(filters, status);
    assert.equal(clauses[0].title.$regex.test('【C++.*】训练'), true);
    assert.equal(clauses[0].title.$regex.test('【CZZ】训练'), false);
    assert.deepEqual(clauses[1].docId.$in, ['yes']);
    const visibility = { private: false };
    const query = { title: /动态/, $and: [visibility, ...clauses] };
    const base = withoutOwnClauses(query, clauses);
    assert.equal(base.title, query.title);
    assert.deepEqual(base.$and, [visibility]);
    assert.equal(query.$and.length, 3, 'removing facet constraints must not mutate native list query');
    assert.deepEqual(filterClauses({ category: '', view: 'completed' }, status), [{ docId: { $in: [] } }]);
    assert.equal(readFilters({ view: 'enrolled', category: '专题' }, false).view, 'all', 'guest has no personal view');
    assert.equal(readFilters({ category: ['入门'], view: ['all'] }, true).category, '');
    assert.equal(categoryOf('普通训练'), OTHER);
});

test('facets keep the current empty category and distinguish completed from merely joined', () => {
    const docs = [{ docId: 'a', title: '【入门】基础' }, { docId: 'b', title: '【专题】图论' }];
    const data = buildCatalog({ docs, items: [], statuses: { a: { enroll: 1, done: true } },
        filters: { category: '专题', view: 'enrolled' }, member: true, url: '/training' });
    assert.equal(data.total, 0);
    assert.deepEqual(data.categories.map((item) => [item.value, item.count]), [['入门', 1], ['专题', 0]]);
    const summary = buildCatalog({ docs, items: [{ ...docs[0], description: '短简介', content: '很长的正文',
        dag: [{ pids: [1, 2] }, { pids: [2, 3] }] }], statuses: { a: { enroll: 1, donePids: [1, 1, 99] } },
        filters: { category: '', view: 'all' }, member: true, url: '/d/course/training' });
    assert.equal(summary.items[0].summary, '短简介');
    assert.equal(summary.items[0].total, 3);
    assert.equal(summary.items[0].percent, 33);
    assert.equal(summary.items[0].url, '/d/course/training/a');
});
