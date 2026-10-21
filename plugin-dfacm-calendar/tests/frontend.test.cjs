'use strict';
const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const nunjucks = require('nunjucks');
const { JSDOM } = require('jsdom');
const { loadCalendar } = require('../calendar.cjs');
const { pageData } = require('../presentation.cjs');
const ROOT = path.resolve(__dirname, '..');
const NOW = new Date('2026-10-21T12:00:00+08:00');
const hostile = '</script><img src=x onerror="alert(1)">';
const events = [
    { id: 'ended-old', name: 'Earlier school contest', type: 'school', start: '2026-10-15T09:00:00+08:00', end: '2026-10-15T12:00:00+08:00' },
    { id: 'ended', name: 'Past CF', type: 'cf', form: 'online', start: '2026-10-20T20:00:00+08:00', end: '2026-10-20T22:00:00+08:00' },
    { id: 'live', name: 'CCSP 正在进行', type: 'ccsp', start: '2026-10-21T00:00:00+08:00', end: '2026-10-22T23:59:59+08:00' },
    { id: 'cf', name: 'CF Thursday', type: 'cf', source: 'cf', form: 'online', start: '2026-10-22T20:00:00+08:00', end: '2026-10-22T22:00:00+08:00', url: 'https://codeforces.com/contest/999' },
    { id: 'atcoder', name: 'AtCoder Saturday', type: 'atcoder', form: 'online', start: '2026-10-24T20:00:00+08:00', end: '2026-10-24T21:40:00+08:00' },
    { id: 'official', name: 'ICPC 成都', type: 'icpc', start: '2026-10-24T00:00:00+08:00', end: '2026-10-25T23:59:59+08:00', location: '成都' },
    { id: 'unsafe-title', name: hostile, type: 'school', start: '2026-10-26T09:00:00+08:00', url: 'https://example.com/contest' },
    { id: 'month', name: '蓝桥杯', type: 'lqb', approx: true, start: '2027-04-01T00:00:00+08:00', regDeadline: '2026-12-18T14:00:00+08:00' },
];
const template = fs.readFileSync(path.join(ROOT, 'templates/calendar.html'), 'utf8').replace('{% extends "layout/basic.html" %}', '').replace('{% block content %}', '').replace('{% endblock %}', '');
const client = fs.readFileSync(path.join(ROOT, 'public/calendar.js'), 'utf8');

function fixture(t, { options = {}, noScript = false, badBoot = false, view, dialogSupported = true } = {}) {
    const data = pageData(loadCalendar(JSON.stringify({ events })), NOW, options);
    const rendered = new nunjucks.Environment(null, { autoescape: true }).renderString(template, data);
    const params = new URLSearchParams(options);
    const dom = new JSDOM(rendered, {
        runScripts: 'outside-only', pretendToBeVisual: true, url: 'https://dfacm.website/calendar' + (params.size ? '?' + params : ''),
    });
    t.after(() => dom.window.close());
    const window = dom.window;
    if (view) window.localStorage.setItem('dfacm-calendar-view', view);
    const dialog = window.document.getElementById('dfacm-calendar-subscribe');
    dialog.showModal = dialogSupported ? () => { dialog.open = true; } : undefined;
    dialog.close = () => { dialog.open = false; };
    if (badBoot) window.document.getElementById('dfacm-calendar-boot').textContent = '{invalid';
    if (!noScript) window.eval(client);
    const $ = (selector) => window.document.querySelector(selector);
    const rows = () => [...window.document.querySelectorAll('[data-calendar-card]')];
    const shown = () => rows().filter(row => !row.hidden);
    function search(value) {
        $('#dfacm-calendar-search').value = value;
        $('#dfacm-calendar-search').dispatchEvent(new window.Event('input'));
    }
    return { window, document: window.document, $, rendered, rows, shown, search };
}

test('the list renders all status groups in date order without calendar assets or saved view state', (t) => {
    const f = fixture(t, { view: 'week' });
    assert.equal(f.$('#dfacm-calendar').dataset.ready, 'true');
    assert.equal(f.window.FullCalendar, undefined);
    assert.equal(f.$('#dfacm-calendar-grid'), null);
    assert.equal(f.$('[data-calendar-view]'), null);
    assert.equal(f.$('[src*="fullcalendar"]'), null);
    assert.equal(f.$('[href*="fullcalendar"]'), null);
    assert.equal(f.shown().length, 8);
    assert.deepEqual([...f.document.querySelectorAll('[data-calendar-group]')].map(g => g.dataset.group), ['ongoing', 'upcoming', 'uncertain', 'ended']);
    assert.deepEqual([...f.$('[data-group="upcoming"]').querySelectorAll('[data-calendar-card]')].map(e => e.dataset.id), ['cf', 'official', 'atcoder', 'unsafe-title']);
    assert.deepEqual([...f.$('[data-group="ended"]').querySelectorAll('[data-calendar-card]')].map(e => e.dataset.id), ['ended', 'ended-old']);
    assert.equal(f.$('.dfacm-cal__archive').open, false);
    assert.equal(f.$('[data-id="cf"] time').getAttribute('datetime'), '2026-10-22');
    assert.match(f.$('[data-id="cf"]').textContent, /2026年10月22日.*20:00 – 22:00/s);
    assert.match(f.$('[data-id="official"]').textContent, /10月24日.*10月25日/s);
    assert.match(f.$('[data-id="month"]').textContent, /2027年4月（日期待公布）/);
    assert.equal(f.$('[data-id="month"] time').getAttribute('datetime'), '2027-04');
    assert.equal(f.$('[data-id="month"] .dfacm-cal__date-weekday').textContent, '日期待公布');
});

test('type filters broaden the original server selection and combine platforms without duplicate rows', (t) => {
    const f = fixture(t, { options: { types: 'cf' } });
    assert.equal(f.shown().length, 2);
    f.$('[data-calendar-type=""]').click();
    assert.equal(f.shown().length, 8);
    assert.equal(f.$('.dfacm-cal__archive').open, false);
    f.$('[data-calendar-type="cf"]').click();
    f.$('[data-calendar-type="atcoder"]').click();
    assert.equal(f.shown().length, 3);
    assert.equal(f.$('[data-calendar-type="cf"]').getAttribute('aria-pressed'), 'true');
    assert.equal(f.$('#dfacm-calendar-selected-types').value, 'cf,atcoder');
    assert.equal(new URL(f.window.location.href).searchParams.get('types'), 'cf,atcoder');
    assert.equal(new URL(f.$('[data-calendar-feed]').href).searchParams.get('types'), 'cf,atcoder');
    for (let i = 0; i < 10; i++) f.$('[data-calendar-type="atcoder"]').click();
    assert.equal(f.rows().length, 8);
    assert.equal(f.shown().length, 3);
});

test('live search updates counts and empty groups, including month-only races and deadlines', (t) => {
    const f = fixture(t);
    f.search('成都');
    assert.equal(f.shown().length, 1);
    assert.match(f.$('#dfacm-calendar-count').textContent, /^1 场赛事$/);
    assert.equal(f.$('[data-group="ongoing"]').hidden, true);
    assert.equal(f.$('[data-group="upcoming"] [data-group-count]').textContent, '1');
    f.search('蓝桥杯');
    assert.equal(f.shown().length, 1);
    assert.equal(f.$('[data-group="uncertain"]').hidden, false);
    assert.equal(f.$('#dfacm-calendar-no-results').hidden, true);
    assert.equal(f.$('#dfacm-calendar-count').textContent, '1 场赛事 · 1 项报名截止');
    assert.match(f.$('[data-id="month"] [data-calendar-registration]').textContent, /12月18日.*14:00/);
    f.search('nothing matches');
    assert.equal(f.shown().length, 0);
    assert.equal(f.$('#dfacm-calendar-no-results').hidden, false);
    assert.ok([...f.document.querySelectorAll('[data-calendar-group]')].every(g => g.hidden));
    f.search('');
    assert.equal(f.shown().length, 8);
    assert.equal(f.$('#dfacm-calendar-no-results').hidden, true);
});

test('matching archive rows open during search and clearing restores the original disclosure state', (t) => {
    const f = fixture(t);
    const archive = f.$('.dfacm-cal__archive');
    f.search('Past CF');
    assert.equal(archive.hidden, false);
    assert.equal(archive.open, true);
    assert.equal(f.shown().length, 1);
    f.search('');
    assert.equal(archive.open, false);
    archive.open = true;
    f.search('Past CF');
    f.search('');
    assert.equal(archive.open, true);
});

test('missing script or invalid boot keeps filtered server rows and ordinary form/link behavior', (t) => {
    for (const settings of [{ noScript: true }, { badBoot: true }]) {
        const f = fixture(t, { ...settings, options: { types: 'lqb' } });
        assert.equal(f.$('#dfacm-calendar').dataset.ready, undefined);
        assert.equal(f.shown().length, 1);
        assert.equal(f.$('[data-group="uncertain"]').hidden, false);
        assert.equal(f.$('#dfacm-calendar-no-results').hidden, true);
        const submit = new f.window.Event('submit', { cancelable: true });
        f.$('#dfacm-calendar-search-form').dispatchEvent(submit);
        assert.equal(submit.defaultPrevented, false);
        assert.equal(f.$('#dfacm-calendar-selected-types').value, 'lqb');
        assert.equal(f.$('[data-calendar-type=""]').href, 'https://dfacm.website/calendar');
        assert.equal(new URL(f.$('[data-calendar-feed]').href).searchParams.get('types'), 'lqb');
    }
    const past = fixture(t, { noScript: true, options: { q: 'Past CF' } });
    assert.equal(past.$('.dfacm-cal__archive').open, true);
    assert.equal(past.shown().length, 1);
});

test('untrusted titles remain plain text and external contest links keep normal navigation', (t) => {
    const f = fixture(t);
    assert.equal(f.document.querySelectorAll('img').length, 0);
    assert.equal(f.$('[data-id="unsafe-title"] h3').textContent, hostile);
    const link = f.$('[data-id="unsafe-title"] .dfacm-cal__event-link');
    assert.equal(link.getAttribute('rel'), 'noopener noreferrer');
    assert.equal(link.getAttribute('target'), '_blank');
    assert.equal(link.getAttribute('aria-label'), '查看赛事：' + hostile);
    const click = new f.window.Event('click', { bubbles: true, cancelable: true });
    link.dispatchEvent(click);
    assert.equal(click.defaultPrevented, false);
    const modified = new f.window.MouseEvent('click', { bubbles: true, cancelable: true, ctrlKey: true });
    f.$('[data-calendar-type="cf"]').dispatchEvent(modified);
    assert.equal(modified.defaultPrevented, false);
    assert.equal(f.shown().length, 8);
});

test('search submission refreshes row filters and keeps legacy type, query and hash links consistent', (t) => {
    const f = fixture(t, { options: { type: 'cf', q: 'Thursday' } });
    assert.equal(f.shown().length, 1);
    assert.equal(new URL(f.window.location.href).searchParams.has('type'), false);
    f.window.history.replaceState(null, '', f.window.location.href + '#schedule');
    f.$('#dfacm-calendar-search').value = 'Past CF';
    const submit = new f.window.Event('submit', { cancelable: true });
    f.$('#dfacm-calendar-search-form').dispatchEvent(submit);
    assert.equal(submit.defaultPrevented, true);
    assert.equal(f.shown().length, 1);
    assert.equal(f.shown()[0].dataset.id, 'ended');
    assert.equal(f.window.location.hash, '#schedule');
    const all = new URL(f.$('[data-calendar-type=""]').href);
    assert.equal(all.searchParams.get('q'), 'Past CF');
    assert.equal(all.searchParams.has('types'), false);
});

test('subscription dialog follows current filters and copying has a manual fallback', async (t) => {
    const f = fixture(t);
    f.$('[data-calendar-type="cf"]').click();
    f.search('Thursday');
    f.$('#dfacm-subscribe-open').click();
    assert.equal(f.$('#dfacm-calendar-subscribe').open, true);
    const address = f.$('#dfacm-calendar-feed-url').value;
    assert.equal(new URL(address).searchParams.get('types'), 'cf');
    assert.equal(new URL(address).searchParams.get('q'), 'Thursday');
    f.$('#dfacm-subscribe-copy').click();
    assert.equal(f.document.activeElement.id, 'dfacm-calendar-feed-url');
    assert.match(f.$('#dfacm-subscribe-message').textContent, /请复制/);
    let copied;
    Object.defineProperty(f.window.navigator, 'clipboard', { value: { writeText: async value => { copied = value; } } });
    f.$('#dfacm-subscribe-copy').click();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(copied, address);
    assert.equal(f.$('#dfacm-subscribe-message').textContent, '订阅地址已复制');
    f.$('#dfacm-subscribe-close').click();
    assert.equal(f.$('#dfacm-calendar-subscribe').open, false);
    const fallback = fixture(t, { dialogSupported: false });
    const click = new fallback.window.Event('click', { bubbles: true, cancelable: true });
    fallback.$('#dfacm-subscribe-open').dispatchEvent(click);
    assert.equal(click.defaultPrevented, false);
});

test('enhancement initializes once and unavailable URL history does not disable filtering', (t) => {
    const f = fixture(t);
    f.window.eval(client);
    f.$('[data-calendar-type="cf"]').click();
    assert.equal(f.shown().length, 2);
    f.window.history.replaceState = () => { throw new Error('History unavailable'); };
    f.search('Thursday');
    assert.equal(f.shown().length, 1);
    assert.equal(new URL(f.$('[data-calendar-feed]').href).searchParams.get('q'), 'Thursday');
});
