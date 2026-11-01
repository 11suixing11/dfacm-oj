'use strict';
const assert = require('node:assert/strict');
const { test } = require('node:test');
const ICAL = require('ical.js');
const { JSDOM } = require('jsdom');
const { normalizeCompetition, fetchAiEvents, collectorUrl, PAGE_SIZE } = require('../ai.cjs');
const { loadCalendar, mergeCalendar, selectEvents, statusOf, canonicalUrl, validateEvent } = require('../calendar.cjs');
const { buildIcs, buildRss, pageData } = require('../presentation.cjs');
const NOW = new Date('2026-10-31T12:00:00+08:00');
const epoch = (iso) => Date.parse(iso) / 1000;
const raw = (extra = {}) => ({ source: 'lablab', external_id: 'build', title: 'Build an Agent with Vibe Coding',
    category: 'hackathon', url: 'https://lablab.ai/event/build', start_time: epoch('2026-10-30T00:00:00+08:00'),
    end_time: epoch('2026-11-02T23:59:00+08:00'), tags: ['vibe-coding', 'agent', 'agent'], organizer: 'Example Labs',
    prize_text: '$10,000', prize_amount: 1, currency: 'USD', teams_count: 12, first_seen_at: epoch('2026-10-29T10:00:00+08:00'), ...extra });
const merged = (rows) => mergeCalendar(loadCalendar('{"events":[]}'), rows.map(normalizeCompetition).filter(Boolean));
const components = (ics) => new ICAL.Component(ICAL.parse(ics)).getAllSubcomponents('vevent');

test('collector mapping retains categories, interests, prizes, original timestamps and stable CF identity', () => {
    const event = merged([raw()]).events[0];
    assert.equal(event.type, 'hackathon');
    assert.equal(event.source, 'lablab');
    assert.deepEqual(event.tags, ['vibe-coding', 'agent']);
    assert.equal(event.prizeAmount, 1);
    assert.equal(event.prizeText, '$10,000');
    assert.equal(event.currency, 'USD');
    assert.equal(event.organizer, 'Example Labs');
    assert.equal(event._start.toISOString(), '2026-10-29T16:00:00.000Z');
    assert.equal(normalizeCompetition(raw({ source: 'codeforces', external_id: '1988', category: 'oj' })).id, 'cf-1988');
    assert.equal(normalizeCompetition(raw({ source: 'leetcode', category: 'oj' })).type, 'leetcode');
    assert.equal(normalizeCompetition(raw({ category: 'datascience' })).type, 'datascience');
    assert.equal(normalizeCompetition(raw({ category: 'other' })).type, 'ai_other');
    for (const bad of [raw({ source: 'untrusted' }), raw({ url: 'javascript:alert(1)' }), raw({ start_time: 'today' }), raw({ end_time: 1 })]) {
        assert.equal(normalizeCompetition(bad), null);
    }
});

test('pagination reads every page after 500; incomplete, oversized and changing results fail without partial success', async () => {
    const calls = [];
    const rows = Array.from({ length: PAGE_SIZE + 37 }, (_, index) => raw({ external_id: String(index), url: `https://example.com/event/${index}` }));
    const result = await fetchAiEvents(async (url, options) => {
        calls.push(new URL(url));
        assert.equal(options.redirect, 'error');
        const offset = Number(url.searchParams.get('offset'));
        return { ok: true, json: async () => ({ total: rows.length, items: rows.slice(offset, offset + PAGE_SIZE) }) };
    });
    assert.equal(result.length, rows.length);
    assert.deepEqual(calls.map((url) => url.searchParams.get('offset')), ['0', '500']);
    assert.ok(calls.every((url) => url.hostname === '127.0.0.1'));
    for (const payload of [{ total: 2, items: [] }, { total: 20001, items: [] }, { total: '2', items: [] }, { total: 1 }]) {
        await assert.rejects(fetchAiEvents(async () => ({ ok: true, json: async () => payload })), /Invalid/);
    }
    let page = 0;
    await assert.rejects(fetchAiEvents(async () => ({ ok: true, json: async () => ++page === 1
        ? { total: 501, items: rows.slice(0, 500) } : { total: 502, items: rows.slice(500, 502) } })), /changing/);
    await assert.rejects(fetchAiEvents(async () => ({ ok: false })), /unavailable/);
});

test('collector origin accepts only loopback and never forwards to an external or authenticated URL', () => {
    const saved = process.env.DFACM_CALENDAR_AI_URL;
    try {
        for (const value of ['https://example.com', 'http://user:pass@127.0.0.1', 'http://127.0.0.1/secret', 'http://127.0.0.1?key=secret']) {
            process.env.DFACM_CALENDAR_AI_URL = value;
            assert.throws(collectorUrl, /local HTTP/);
        }
        process.env.DFACM_CALENDAR_AI_URL = 'http://127.0.0.1:8765';
        assert.equal(collectorUrl().port, '8765');
    } finally { if (saved === undefined) delete process.env.DFACM_CALENDAR_AI_URL; else process.env.DFACM_CALENDAR_AI_URL = saved; }
});

test('CF and regional LeetCode duplicates keep the calendar identity and enrich metadata without mutating the seed', () => {
    const seed = loadCalendar(JSON.stringify({ events: [
        { id: 'cf-1988', type: 'cf', source: 'cf', name: 'Preferred CF title', form: 'online', start: '2026-11-01T20:00:00+08:00', url: 'https://codeforces.com/contests/1988' },
        { id: 'clist-lc', type: 'leetcode', source: 'clist', name: 'LeetCode Weekly', form: 'online', start: '2026-11-01T10:30:00+08:00', url: 'https://leetcode.com/contest/weekly-contest-500/' },
    ] }));
    const combined = mergeCalendar(seed, [
        normalizeCompetition(raw({ source: 'codeforces', external_id: '1988', category: 'oj', url: 'https://codeforces.com/contest/1988/?utm_source=hub' })),
        normalizeCompetition(raw({ source: 'leetcode', category: 'oj', url: 'https://leetcode.cn/contest/weekly-contest-500/' })),
    ]);
    assert.equal(combined.events.length, 2);
    const cf = combined.events.find((event) => event.id === 'cf-1988');
    assert.equal(cf.name, 'Preferred CF title');
    assert.equal(cf.start, '2026-11-01T20:00:00+08:00');
    assert.equal(cf.prizeText, '$10,000');
    assert.deepEqual(cf.tags, ['vibe-coding', 'agent']);
    const lc = combined.events.find((event) => event.id === 'clist-lc');
    assert.deepEqual(lc.sources, ['clist', 'leetcode']);
    assert.deepEqual(seed.events[0].tags, []);
    assert.equal(selectEvents(combined.events, { source: 'leetcode' }).length, 1);
    assert.equal(canonicalUrl('https://leetcode.cn/contest/weekly-contest-500'), canonicalUrl('https://www.leetcode.com/contest/weekly-contest-500/'));
});

test('unknown dates never invent a start; published end dates become explicit deadline events in ICS', () => {
    const data = merged([raw({ external_id: 'unknown', start_time: null, end_time: null }),
        raw({ external_id: 'deadline', url: 'https://example.com/deadline', start_time: null }),
        raw({ external_id: 'past-deadline', url: 'https://example.com/past', start_time: null, end_time: epoch('2026-10-29T12:00:00+08:00') }),
        raw({ external_id: 'open', url: 'https://example.com/open', end_time: null })]);
    assert.equal(statusOf(data.events.find((event) => event.id.endsWith('-unknown')), NOW), 'uncertain');
    assert.equal(statusOf(data.events.find((event) => event.id.endsWith('-past-deadline')), NOW), 'ended');
    assert.equal(statusOf(data.events.find((event) => event.id.endsWith('-open')), NOW), 'ongoing');
    assert.equal(validateEvent({ id: 'bad-manual', name: 'Missing date', type: 'school' }, 0).ok, false);
    const view = pageData(data, NOW);
    const unknown = view.groups.flatMap((g) => g.events).find((event) => event.id.endsWith('-unknown'));
    assert.equal(unknown.dateValue, '');
    assert.equal(unknown.dateDay, '待定');
    assert.equal(view.groups.find((g) => g.key === 'uncertain').count, 2);
    const ics = components(buildIcs(data, { now: NOW, status: 'active' }));
    assert.equal(ics.length, 2, 'one actual start and one actual deadline, no fabricated unknown/past date');
    const deadline = ics.find((item) => item.getFirstPropertyValue('summary').startsWith('赛事截止：'));
    assert.equal(deadline.getFirstPropertyValue('dtstart').toJSDate().toISOString(), '2026-11-02T15:59:00.000Z');
    assert.deepEqual(deadline.getAllSubcomponents('valarm').map((a) => a.getFirstPropertyValue('trigger').toSeconds()), [-259200, -86400]);
});

test('direction, multiple interests, platform, status and search agree across the page, ICS and RSS', () => {
    const data = merged([raw(), raw({ external_id: 'past', url: 'https://example.com/past', start_time: 1, end_time: 2 }),
        raw({ external_id: 'ds', category: 'datascience', url: 'https://example.com/ds', tags: [] }),
        raw({ external_id: 'cf', source: 'codeforces', category: 'oj', url: 'https://codeforces.com/contest/123' })]);
    const options = { scope: 'ai', interests: 'vibe-coding,agent', source: 'lablab', status: 'ongoing', q: 'Example Labs', now: NOW };
    assert.equal(selectEvents(data.events, options).length, 1);
    const page = pageData(data, NOW, options);
    assert.equal(page.total, 1);
    assert.equal(components(buildIcs(data, options)).length, 1);
    const dom = new JSDOM(buildRss(data, options), { contentType: 'text/xml' });
    try {
        assert.equal(dom.window.document.querySelectorAll('item').length, 1);
        assert.equal(dom.window.document.querySelector('item title').textContent, raw().title);
        assert.ok(dom.window.document.querySelector('description').textContent);
    } finally { dom.window.close(); }
    for (const url of [page.subscribeUrl, page.rssUrl]) {
        const params = new URL(url, 'https://dfacm.website').searchParams;
        assert.equal(params.get('interests'), 'vibe-coding,agent');
        assert.equal(params.get('scope'), 'ai');
        assert.equal(params.get('source'), 'lablab');
    }
});

test('RSS escapes untrusted content, retains unknown dates, and uses stable item identities', () => {
    const title = '<script> & "赛事"';
    const data = merged([raw({ title, start_time: null, end_time: null })]);
    const xml = buildRss(data, { now: NOW });
    assert.ok(!xml.includes('<script>'));
    const dom = new JSDOM(xml, { contentType: 'text/xml' });
    try {
        assert.equal(dom.window.document.querySelector('item title').textContent, title);
        assert.match(dom.window.document.querySelector('item description').textContent, /日期待公布/);
        assert.match(dom.window.document.querySelector('guid').textContent, /@dfacm\.website$/);
    } finally { dom.window.close(); }
});
