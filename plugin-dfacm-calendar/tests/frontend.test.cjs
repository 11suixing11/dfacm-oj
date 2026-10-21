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
    { id: 'cf', name: 'CF Thursday', type: 'cf', source: 'cf', form: 'online', start: '2026-10-22T20:00:00+08:00', end: '2026-10-22T22:00:00+08:00', url: 'https://codeforces.com/contest/999' },
    { id: 'atcoder', name: 'AtCoder Saturday', type: 'atcoder', form: 'online', start: '2026-10-24T20:00:00+08:00', end: '2026-10-24T21:40:00+08:00' },
    { id: 'official', name: 'ICPC 成都', type: 'icpc', start: '2026-10-24T00:00:00+08:00', end: '2026-10-25T23:59:59+08:00' },
    { id: 'unsafe-title', name: hostile, type: 'school', start: '2026-10-26T09:00:00+08:00' },
    { id: 'month', name: '蓝桥杯', type: 'lqb', approx: true, start: '2027-04-01T00:00:00+08:00', regDeadline: '2026-12-18T14:00:00+08:00' },
];
const template = fs.readFileSync(path.join(ROOT, 'templates/calendar.html'), 'utf8').replace('{% extends "layout/basic.html" %}', '').replace('{% block content %}', '').replace('{% endblock %}', '');
const client = fs.readFileSync(path.join(ROOT, 'public/calendar.js'), 'utf8');
const vendor = fs.readFileSync(path.join(ROOT, 'vendor/fullcalendar-7.1.3.js'), 'utf8');

function fixture(t, { options = {}, mobile = false, view, noVendor = false } = {}) {
    const data = pageData(loadCalendar(JSON.stringify({ events })), NOW, options);
    const env = new nunjucks.Environment(null, { autoescape: true });
    const rendered = env.renderString(template, data);
    const dom = new JSDOM(`<!doctype html><html lang="zh-CN"><body>${rendered}</body></html>`, {
        runScripts: 'outside-only', pretendToBeVisual: true, url: 'https://dfacm.website/calendar',
    });
    t.after(() => dom.window.close());
    const window = dom.window;
    window.matchMedia = () => ({ matches: mobile, addEventListener() {}, removeEventListener() {} });
    if (view) window.localStorage.setItem('dfacm-calendar-view', view);
    const warnings = [];
    window.console.warn = (value) => warnings.push(value);
    let calendar;
    if (!noVendor) {
        window.eval(vendor);
        const Original = window.FullCalendar.Calendar;
        window.FullCalendar.Calendar = class extends Original { constructor(...args) { super(...args); calendar = this; } };
    }
    for (const dialog of window.document.querySelectorAll('dialog')) {
        dialog.showModal = () => { dialog.open = true; };
        dialog.close = () => { dialog.open = false; };
    }
    window.eval(client);
    t.after(() => { if (calendar) calendar.destroy(); });
    const $ = (selector) => window.document.querySelector(selector);
    return { window, document: window.document, $, warnings, get calendar() { return calendar; }, rendered };
}

test('actual FullCalendar bundle initializes without warnings and uses Beijing time in both views', (t) => {
    const f = fixture(t);
    assert.equal(f.$('#dfacm-calendar').dataset.ready, 'true');
    assert.deepEqual(f.warnings, []);
    assert.equal(f.$('#dfacm-calendar-grid').hidden, false);
    assert.equal(f.$('#dfacm-calendar-list').hidden, true);
    assert.equal(f.calendar.getOption('timeZone'), 'Asia/Shanghai');
    f.calendar.gotoDate('2026-10-22');
    assert.equal(f.calendar.getEventById('cf').startStr, '2026-10-22T20:00:00+08:00');
    assert.match(f.$('#dfacm-calendar-grid').textContent, /20:00/);
    f.$('[data-calendar-view="week"]').click();
    assert.equal(f.calendar.view.type, 'timeGridWeek');
    assert.match(f.$('#dfacm-calendar-grid').textContent, /20:00/);
    const official = f.calendar.getEventById('official');
    assert.equal(official.allDay, true);
    assert.equal(official.endStr, '2026-10-26');
});

test('initial type filter can broaden to all and multiple platforms without losing SSR cards', (t) => {
    const f = fixture(t, { options: { types: 'cf' }, view: 'list' });
    const shown = () => [...f.document.querySelectorAll('[data-calendar-card]')].filter((e) => !e.hidden);
    assert.equal(shown().length, 1);
    f.$('[data-calendar-type=""]').click();
    assert.equal(shown().length, 5);
    f.$('[data-calendar-type="cf"]').click();
    f.$('[data-calendar-type="atcoder"]').click();
    assert.equal(shown().length, 2);
    assert.equal(f.calendar.getEvents().length, 2);
    assert.match(f.window.location.search, /types=cf%2Catcoder/);
    assert.equal(f.$('#dfacm-calendar-selected-types').value, 'cf,atcoder');
    const feed = new URL(f.$('[data-calendar-feed]').href);
    assert.equal(feed.searchParams.get('types'), 'cf,atcoder');
    for (let i = 0; i < 10; i++) f.$('[data-calendar-type="atcoder"]').click();
    assert.equal(f.calendar.getEventSources().length, 1, 'repeated filters must not accumulate event sources');
});

test('search stays consistent between the grid and SSR list, clears to restore data', (t) => {
    const f = fixture(t, { view: 'list' });
    const field = f.$('#dfacm-calendar-search');
    field.value = '成都'; field.dispatchEvent(new f.window.Event('input'));
    assert.equal(f.calendar.getEvents().length, 1);
    assert.equal([...f.document.querySelectorAll('[data-calendar-card]')].filter((e) => !e.hidden).length, 1);
    field.value = 'nothing matches'; field.dispatchEvent(new f.window.Event('input'));
    assert.equal(f.$('#dfacm-calendar-no-results').hidden, false);
    field.value = ''; field.dispatchEvent(new f.window.Event('input'));
    assert.equal(f.calendar.getEvents().length, 5);
    assert.equal(f.$('#dfacm-calendar-no-results').hidden, true);
});

test('mobile defaults to list, saved view works, asset failure keeps the filtered SSR list', (t) => {
    const mobile = fixture(t, { mobile: true });
    assert.equal(mobile.$('#dfacm-calendar-list').hidden, false);
    assert.equal(mobile.$('#dfacm-calendar-grid').hidden, true);
    const saved = fixture(t, { mobile: true, view: 'week' });
    assert.equal(saved.calendar.view.type, 'timeGridWeek');
    const fallback = fixture(t, { noVendor: true, options: { types: 'cf' } });
    assert.equal(fallback.$('#dfacm-calendar-list').hidden, false);
    assert.equal(fallback.$('#dfacm-calendar-tools').hidden, true);
    assert.equal([...fallback.document.querySelectorAll('[data-calendar-card]')].filter((e) => !e.hidden).length, 1);
    assert.ok(fallback.$('[data-calendar-type=""]').href.endsWith('/calendar'));
});

test('upstream title remains plain text in template, grid and details; subscription dialog follows filters', (t) => {
    const f = fixture(t);
    assert.equal(f.document.querySelectorAll('img').length, 0);
    const click = f.calendar.getOption('eventClick');
    click({ event: f.calendar.getEventById('unsafe-title'), jsEvent: { preventDefault() {} } });
    assert.equal(f.$('#dfacm-detail-title').textContent, hostile);
    assert.equal(f.$('#dfacm-detail-title img'), null);
    assert.equal(f.$('#dfacm-calendar-detail').open, true);
    f.$('#dfacm-detail-close').click();
    assert.equal(f.$('#dfacm-calendar-detail').open, false);
    f.$('[data-calendar-type="cf"]').click();
    f.$('#dfacm-subscribe-open').click();
    assert.equal(f.$('#dfacm-calendar-subscribe').open, true);
    assert.equal(f.$('#dfacm-calendar-feed-url').value, 'https://dfacm.website/calendar/feed.ics?types=cf');
    f.$('#dfacm-subscribe-close').click();
    assert.equal(f.$('#dfacm-calendar-subscribe').open, false);
});
