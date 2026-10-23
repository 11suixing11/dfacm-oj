'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { createServer } = require('./preview.cjs');

test('preview serves shipped pages, explicit fixtures and the full training return loop without writes', async (t) => {
    const server = createServer();
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    t.after(() => new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); }));
    const base = `http://127.0.0.1:${server.address().port}`;
    const page = await fetch(base + '/workbench').then((r) => r.text());
    assert.match(page, /本地设计预览/);
    assert.match(page, /id="resume-next"/);
    const payload = await fetch(base + '/workbench/data').then((r) => r.json());
    const next = payload.data.trainings[0].next.url;
    assert.match(next, /trainingNode=2$/);
    const problem = await fetch(base + next).then((r) => r.text());
    assert.match(problem, /id="preview-training-data"/);
    const record = problem.match(/href="([^\"]+verdict=judging)"/)[1];
    const result = await fetch(base + record).then((r) => r.text());
    assert.match(result, /id="status" data-status="20"/);
    const context = JSON.parse(result.match(/id="preview-training-data">([^<]+)<\/script>/)[1]);
    const accepted = await fetch(base + context.refreshUrl + '&previewStatus=1').then((r) => r.json());
    assert.equal(accepted.data.next.pid, 1002);
    assert.equal(accepted.data.done, 69);
    const chapter = await fetch(base + accepted.data.chapterUrl).then((r) => r.text());
    assert.match(chapter, /id="node-2"/);
    for (const asset of ['/preview/training.js', '/preview/training.css', '/preview/layout.css', '/preview/ui.js']) {
        const response = await fetch(base + asset); assert.equal(response.status, 200, asset);
    }
    for (const route of ['/mistakes/update', '/p/P1001/submit', '/reg']) {
        const response = await fetch(base + route, { method: 'POST', body: 'code=example' });
        assert.equal(response.status, 503);
        assert.equal((await response.json()).ok, false);
    }
    const failure = await fetch(base + '/workbench/data', { headers: { Referer: base + '/workbench?scenario=error' } });
    assert.equal(failure.status, 503);
    const empty = await fetch(base + '/workbench/data?scenario=empty').then((r) => r.json());
    assert.deepEqual(empty.data.trainings, []);
    assert.equal(empty.data.week.submissions, 0);
});

test('catalogue includes all real route names across pages and filters the whole collection', async (t) => {
    const server = createServer();
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    t.after(() => new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); }));
    const base = `http://127.0.0.1:${server.address().port}`;
    const read = async (query) => {
        const html = await fetch(base + '/training' + query).then((r) => r.text());
        return JSON.parse(html.match(/id="preview-catalog-data">([^<]+)<\/script>/)[1]);
    };
    const all = await read('');
    assert.equal(all.total, 11);
    assert.equal(all.items.length, 10);
    assert.equal(all.pages, 2);
    assert.equal(all.categories.find((item) => item.label === '专题').count, 8);
    const second = await read('?page=2');
    assert.equal(second.items.length, 1);
    assert.match(second.items[0].title, /一本通/);
    const foundation = await read('?category=' + encodeURIComponent('入门'));
    assert.equal(foundation.total, 1);
    assert.equal(foundation.items[0].tid, second.items[0].tid);
    const topic = await read('?category=' + encodeURIComponent('专题') + '&q=' + encodeURIComponent('动态'));
    assert.equal(topic.items.length, 1);
    assert.match(topic.items[0].title, /动态规划/);
    const joined = await read('?view=enrolled');
    const completed = await read('?view=completed');
    assert.equal(joined.total, 8);
    assert.equal(joined.items.every((item) => item.attend >= 1), true, 'joined fixtures count the example member');
    assert.equal(completed.total, 1);
    assert.equal(completed.items[0].completed, true);
    const empty = await read('?q=no-such-route');
    assert.equal(empty.total, 0);
    const guest = await read('?member=0&view=enrolled');
    assert.equal(guest.total, 11);
    assert.equal(guest.views.length, 1);
    const detail = await fetch(base + topic.items[0].url).then((r) => r.text());
    assert.match(detail, /【专题】动态规划/);
    assert.doesNotMatch(detail, /林间小径/, 'other routes must not show the foundation fixture');
    const workbench = await fetch(base + '/workbench/data').then((r) => r.json());
    assert.equal(workbench.data.trainingOverview.enrolled, joined.total);
    assert.equal(workbench.data.trainings.length, 3);
});
