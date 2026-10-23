'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { parseHTML } = require('linkedom');
const { localUrl, mountTrainingContext } = require('../frontend/training.js');
const { buildTrainingContext } = require('../training-context.cjs');

const tid = '6abf5251aaa235606eedfb84';
const tdoc = { docId: tid, title: '<script>路线</script>', dag: [
    { _id: 1, title: '语言基础', requireNids: [], pids: [1, 2] },
    { _id: 2, title: '锁定章节', requireNids: [1], pids: [3] },
] };
const pdocs = Object.fromEntries([1, 2, 3].map((pid) => [pid, { docId: pid, pid: 'P' + pid, title: '题目 ' + pid }]));
const url = (name, args) => (name === 'training_detail' ? '/training/' + args.tid : '/p/' + args.pid);
const context = (page, extra = {}) => ({ ...buildTrainingContext({ tdoc, pdocs, pid: page === 'training' ? null : 1, url }), page, workbenchUrl: '/workbench', viewerUid: 42, ...extra });
const tick = () => new Promise((resolve) => setImmediate(resolve));

function fixture(page, html = '', extra = {}) {
    const { document, window } = parseHTML(`<html><body><main class="main">${html}</main></body></html>`);
    const location = { href: page === 'training' ? `https://oj.test/training/${tid}` : `https://oj.test/p/P1?training=${tid}` };
    const config = context(page, extra);
    return { document, window, location, config };
}

test('native training links carry route/chapter only for unlocked sections', () => {
    const f = fixture('training', '<section class="training__section"><h1 id="node-1"></h1><td class="col--problem-name"><a id="p1" href="/p/P1">题 1</a></td><td class="col--status"><a id="r1" href="/record/aaaaaaaaaaaaaaaaaaaaaaaa">WA</a></td></section><section class="training__section"><h1 id="node-2"></h1><td class="col--problem-name"><a id="locked" href="/p/P3">题 3</a></td></section>');
    const mounted = mountTrainingContext({ ...f, Observer: f.window.MutationObserver });
    assert.equal(f.document.getElementById('p1').getAttribute('href'), `/p/P1?training=${tid}&trainingNode=1`);
    assert.match(f.document.getElementById('r1').getAttribute('href'), /trainingNode=1$/);
    assert.equal(f.document.getElementById('locked').getAttribute('href'), '/p/P3');
    assert.equal(f.document.querySelectorAll('#dfacm-training script').length, 0);
    assert.equal(f.document.querySelector('.dfacm-training__route').textContent, tdoc.title);
    mounted.dispose();
});

test('problem navigation preserves Hydro editor endpoints, code and assistant; contest links remain scoped', () => {
    const f = fixture('problem', '<a id="submit" href="/p/P1/submit">提交</a><a id="contest" href="/p/P1?tid=contest">比赛</a><a id="external" href="https://other.test/record/aaaaaaaaaaaaaaaaaaaaaaaa">外站</a><a id="record" href="/record/aaaaaaaaaaaaaaaaaaaaaaaa">结果</a><textarea id="native">int main() {}</textarea><form method="post" action="/p/P1/submit"><input name="code" value="original"></form>', { problemPaths: ['/p/P1'], submitPaths: ['/p/P1/submit'] });
    const uiContext = { postSubmitUrl: '/p/P1/submit', getRecordDetailUrl: '/record/%7Brid%7D', pretestConnUrl: '/pretest', dfacmAssistant: { csrf: 'existing' } };
    const panel = mountTrainingContext({ ...f, uiContext });
    assert.match(uiContext.postSubmitUrl, /trainingNode=1$/);
    assert.match(decodeURIComponent(uiContext.getRecordDetailUrl), /^\/record\/\{rid\}\?training=/);
    assert.equal(uiContext.pretestConnUrl, '/pretest');
    assert.equal(uiContext.dfacmAssistant.csrf, 'existing');
    assert.equal(f.document.getElementById('native').value, 'int main() {}');
    assert.equal(f.document.querySelector('input[name=code]').value, 'original');
    assert.equal(f.document.getElementById('contest').getAttribute('href'), '/p/P1?tid=contest');
    assert.equal(f.document.getElementById('external').getAttribute('href'), 'https://other.test/record/aaaaaaaaaaaaaaaaaaaaaaaa');
    assert.match(f.document.querySelector('form').getAttribute('action'), /trainingNode=1$/);
    assert.match(f.document.getElementById('record').getAttribute('href'), /trainingNode=1$/);
    assert.equal(mountTrainingContext({ ...f, uiContext }), null, 're-mount does not duplicate the panel');
    panel.dispose();
});

test('the native live verdict turns a retry into the next problem without reloading the editor', async () => {
    const f = fixture('record', '<div id="status" data-status="20"></div><div id="native-code">saved code</div>', { status: 20, refreshUrl: `/workbench/context?rid=aaaaaaaaaaaaaaaaaaaaaaaa&training=${tid}` });
    let count = 0;
    const next = { ...context('record'), status: 1, done: 1, problem: { ...f.config.problem, accepted: true }, next: { pid: 2, title: '下一道题', url: `/p/P2?training=${tid}&trainingNode=1` } };
    const panel = mountTrainingContext({ ...f, Observer: f.window.MutationObserver, fetchImpl: async (path, options) => {
        count++;
        assert.equal(path, f.config.refreshUrl);
        assert.equal(options.credentials, 'same-origin');
        return { ok: true, json: async () => ({ ok: true, data: next }) };
    } });
    assert.match(f.document.getElementById('dfacm-training').textContent, /正在评测/);
    f.document.getElementById('status').setAttribute('data-status', '1');
    await tick(); await tick();
    assert.equal(count, 1);
    assert.equal(f.document.querySelector('.dfacm-training__link--primary').textContent, '下一题 · 下一道题');
    assert.equal(f.document.getElementById('native-code').textContent, 'saved code');
    panel.dispose();
});

test('refresh errors retain return navigation and a retry can recover; inaccessible context removes the panel', async () => {
    const f = fixture('record', '<div id="status" data-status="2"></div>', { status: 2, refreshUrl: '/workbench/context' });
    let attempts = 0;
    const panel = mountTrainingContext({ ...f, fetchImpl: async () => {
        attempts++;
        if (attempts === 1) throw new Error('offline');
        return { ok: true, json: async () => ({ ok: true, data: null }) };
    } });
    await panel.refresh();
    assert.match(f.document.getElementById('dfacm-training').textContent, /暂时无法更新/);
    assert.equal(f.document.querySelector('.dfacm-training__link--primary').textContent, '返回题目修改');
    await panel.refresh();
    assert.equal(f.document.getElementById('dfacm-training'), null);
});

test('missing or external context never modifies the page', () => {
    const f = fixture('problem');
    assert.equal(mountTrainingContext({ ...f, config: undefined }), null);
    assert.equal(mountTrainingContext({ ...f, config: { ...f.config, chapterUrl: 'https://other.test/training/abc' } }), null);
    assert.equal(f.document.getElementById('dfacm-training'), null);
    assert.equal(localUrl('blob:https://oj.test/abc', f.location), null);
    assert.equal(localUrl('https://user:password@oj.test/p/P1', f.location), null);
});

test('returning to a chapter expands and scrolls only an unlocked chapter, including hash clicks and fragment changes', async () => {
    const f = fixture('training', '<div data-fragment-id="training_detail"><section class="training__section collapsed"><h1 id="node-1">循环</h1></section><section class="training__section collapsed"><h1 id="node-2">锁定</h1></section></div>');
    f.location.href += '#node-1';
    const chapter = f.document.getElementById('node-1');
    let scrolled = 0;
    chapter.scrollIntoView = () => { scrolled++; };
    const panel = mountTrainingContext({ ...f, Observer: f.window.MutationObserver });
    assert.equal(chapter.parentElement.className, 'training__section expanded');
    assert.equal(scrolled, 1);
    chapter.parentElement.className = 'training__section collapsed';
    f.document.querySelector('.dfacm-training__link[href*="#node-1"]').click();
    assert.equal(chapter.parentElement.className, 'training__section expanded', 'clicking the current hash expands it again');
    f.location.href = f.location.href.replace('#node-1', '#node-2');
    f.window.dispatchEvent(new f.window.Event('hashchange'));
    assert.equal(f.document.getElementById('node-2').parentElement.className, 'training__section collapsed');
    const fragment = f.document.querySelector('[data-fragment-id]');
    f.location.href = f.location.href.replace('#node-2', '#node-1');
    fragment.innerHTML = '<section class="training__section collapsed"><h1 id="node-1">循环</h1><td class="col--problem-name"><a id="new-problem" href="/p/P1">题目</a></td></section>';
    await tick();
    assert.equal(f.document.getElementById('node-1').parentElement.className, 'training__section expanded');
    assert.match(f.document.getElementById('new-problem').getAttribute('href'), /trainingNode=1$/);
    panel.dispose();
});

test('comparing another user through native fragment navigation hides personal progress and leaves their links alone', async () => {
    const f = fixture('training', '<div data-fragment-id="training_detail"></div>');
    const panel = mountTrainingContext({ ...f, Observer: f.window.MutationObserver });
    f.location.href += '?uid=99';
    const fragment = f.document.querySelector('[data-fragment-id]');
    fragment.innerHTML = '<section class="training__section"><h1 id="node-1"></h1><td class="col--problem-name"><a id="other-problem" href="/p/P1">题目</a></td></section>';
    await tick();
    assert.equal(f.document.querySelector('.dfacm-training-wrap').hidden, true);
    assert.equal(f.document.getElementById('other-problem').getAttribute('href'), '/p/P1');
    f.location.href = f.location.href.replace('?uid=99', '?uid=42');
    fragment.innerHTML = '<section class="training__section"><h1 id="node-1"></h1><td class="col--problem-name"><a id="self-problem" href="/p/P1">题目</a></td></section>';
    await tick();
    assert.equal(f.document.querySelector('.dfacm-training-wrap').hidden, false);
    assert.match(f.document.getElementById('self-problem').getAttribute('href'), /trainingNode=1$/);
    panel.dispose();
});

test('native verdict changes during a slow progress request queue a fresh response instead of restoring stale results', async () => {
    const f = fixture('record', '<div id="status" data-status="20"></div>', { status: 20, refreshUrl: '/workbench/context' });
    const requests = [];
    const panel = mountTrainingContext({ ...f, Observer: f.window.MutationObserver, fetchImpl: () => new Promise((resolve) => requests.push(resolve)) });
    const first = panel.refresh();
    f.document.getElementById('status').setAttribute('data-status', '1');
    await tick();
    requests[0]({ ok: true, json: async () => ({ ok: true, data: { ...f.config, status: 20 } }) });
    await tick();
    assert.equal(requests.length, 2, 'AC is not dropped while a prior request is busy');
    assert.match(f.document.querySelector('.dfacm-training__title').textContent, /Accepted/);
    requests[1]({ ok: true, json: async () => ({ ok: true, data: { ...f.config, status: 1, done: 1, problem: { ...f.config.problem, accepted: true }, next: { pid: 2, title: '新下一题', url: '/p/P2' } } }) });
    await first;
    assert.equal(f.document.querySelector('.dfacm-training__link--primary').textContent, '下一题 · 新下一题');
    assert.equal(f.document.getElementById('dfacm-training').getAttribute('aria-busy'), 'false');
    panel.dispose();
});

test('rejudging an AC to a failed result refreshes acceptance and removes the old next-problem action', async () => {
    const f = fixture('record', '<div id="status" data-status="1"></div>', { status: 1, refreshUrl: '/workbench/context', problem: { pid: 1, accepted: true, url: '/p/P1' }, next: { pid: 2, title: '题目 2', url: '/p/P2' } });
    let calls = 0;
    const panel = mountTrainingContext({ ...f, Observer: f.window.MutationObserver, fetchImpl: async () => {
        calls++;
        return { ok: true, json: async () => ({ ok: true, data: { ...f.config, status: 2, problem: { ...f.config.problem, accepted: false }, next: f.config.problem } }) };
    } });
    assert.match(f.document.querySelector('.dfacm-training__link--primary').textContent, /下一题/);
    f.document.getElementById('status').setAttribute('data-status', '20');
    await tick();
    assert.equal(calls, 0);
    assert.doesNotMatch(f.document.getElementById('dfacm-training').textContent, /下一题/);
    f.document.getElementById('status').setAttribute('data-status', '2');
    await tick(); await tick();
    assert.equal(calls, 1);
    assert.equal(f.document.querySelector('.dfacm-training__link--primary').textContent, '返回题目修改');
    assert.doesNotMatch(f.document.getElementById('dfacm-training').textContent, /已有 AC/);
    panel.dispose();
});
