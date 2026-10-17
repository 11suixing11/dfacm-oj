'use strict';

// Pure-logic tests for calendar.cjs: validation, bucketing, display strings,
// filtering — plus a regression lock on the shipped calendar.json itself.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');

const {
    TYPES, cstDayDiff, describeEvents, loadCalendar,
} = require('../calendar.cjs');

const SEED = path.join(__dirname, '..', 'calendar.json');
const load = (obj) => loadCalendar(JSON.stringify(obj));
const at = (iso) => new Date(iso);

test('the shipped calendar.json parses cleanly with nothing skipped', () => {
    const parsed = loadCalendar(fs.readFileSync(SEED, 'utf-8'));
    assert.equal(parsed.skipped.length, 0, parsed.skipped.join('; '));
    assert.ok(parsed.events.length >= 10, 'the seed season should be populated');
    assert.match(parsed.updated, /^\d{4}-\d{2}-\d{2}$/);
    // sorted by start ascending, no duplicate ids
    for (let i = 1; i < parsed.events.length; i++) {
        assert.ok(parsed.events[i - 1]._start.getTime() <= parsed.events[i]._start.getTime());
    }
    assert.equal(new Set(parsed.events.map((e) => e.id)).size, parsed.events.length);
    // every event carries a verified type and an http(s) url if present
    for (const event of parsed.events) {
        assert.ok(TYPES.includes(event.type), `${event.id}: bad type`);
        assert.ok(event.name, `${event.id}: empty name`);
        if (event.url) assert.match(event.url, /^https?:\/\//, `${event.id}: bad url`);
    }
});

test('loadCalendar throws on broken JSON and on a wrong top-level shape', () => {
    assert.throws(() => loadCalendar('{oops'), /JSON/);
    assert.throws(() => loadCalendar('[]'), /events/);
    assert.throws(() => loadCalendar('{"events":1}'), /events/);
    assert.doesNotThrow(() => load({ events: [] }));
});

test('bad rows are skipped with reasons; good rows survive them', () => {
    const parsed = load({
        events: [
            { id: 'ok', name: '好条目', type: 'icpc', start: '2026-10-24T00:00:00+08:00' },
            { name: '缺 id', type: 'icpc', start: '2026-10-24T00:00:00+08:00' },
            { id: 'n2', type: 'icpc', start: '2026-10-24T00:00:00+08:00' }, // 缺 name
            { id: 'n3', name: '坏类型', type: 'hackathon', start: '2026-10-24T00:00:00+08:00' },
            { id: 'n4', name: '坏时间', type: 'icpc', start: 'not-a-date' },
            { id: 'n5', name: '倒序', type: 'icpc', start: '2026-10-30T00:00:00+08:00', end: '2026-10-24T00:00:00+08:00' },
            { id: 'ok', name: '重复 id', type: 'icpc', start: '2026-10-25T00:00:00+08:00' },
            { id: 'n7', name: '坏链接', type: 'icpc', start: '2026-10-24T00:00:00+08:00', url: 'javascript:alert(1)' },
        ],
    });
    assert.equal(parsed.events.length, 1);
    assert.equal(parsed.events[0].id, 'ok');
    assert.equal(parsed.skipped.length, 7);
    assert.match(parsed.skipped.join('\n'), /缺少 id/);
    assert.match(parsed.skipped.join('\n'), /缺少 name/);
    assert.match(parsed.skipped.join('\n'), /未知 type/);
    assert.match(parsed.skipped.join('\n'), /不是合法时间/);
    assert.match(parsed.skipped.join('\n'), /end 早于 start/);
    assert.match(parsed.skipped.join('\n'), /id 重复/);
    assert.match(parsed.skipped.join('\n'), /http/);
});

test('events are normalized: form defaults to onsite, strings trimmed', () => {
    const parsed = load({
        events: [{ id: 'e', name: '  某比赛  ', type: 'school', start: '2026-11-01T09:00:00+08:00', url: ' https://example.com ' }],
    });
    assert.equal(parsed.events[0].name, '某比赛');
    assert.equal(parsed.events[0].form, 'onsite');
    assert.equal(parsed.events[0].url, 'https://example.com');
    assert.equal(parsed.events[0].end, null);
    assert.equal(parsed.events[0].regDeadline, null);
    // the raw ISO string is preserved for the /calendar/data feed
    assert.equal(parsed.events[0].start, '2026-11-01T09:00:00+08:00');
});

// 2026-10-18 12:00 CST：周日，西安站进行中的第二天。
const NOW = at('2026-10-18T12:00:00+08:00');

function seasonFixture() {
    return load({
        updated: '2026-10-18',
        events: [
            { id: 'past', name: '已结束的网络赛', type: 'icpc', form: 'online', start: '2026-09-06T13:00:00+08:00', end: '2026-09-06T18:00:00+08:00' },
            { id: 'live', name: '进行中的区域赛', type: 'icpc', start: '2026-10-17T00:00:00+08:00', end: '2026-10-18T23:59:59+08:00', location: '西安' },
            { id: 'tonight', name: '今晚开赛', type: 'ccpc', start: '2026-10-18T20:00:00+08:00', end: '2026-10-18T23:00:00+08:00', form: 'online' },
            { id: 'tomorrow', name: '明天开赛', type: 'provincial', start: '2026-10-19T09:00:00+08:00', location: '成都' },
            { id: 'nextweek', name: '下周开赛', type: 'invitational', start: '2026-10-25T00:00:00+08:00', end: '2026-10-26T23:59:59+08:00', regDeadline: '2026-10-20T23:59:59+08:00' },
        ],
    });
}

test('events bucket into ongoing / upcoming / ended at a fixed instant', () => {
    const view = describeEvents(seasonFixture(), NOW, '');
    assert.deepEqual(view.ongoing.map((e) => e.id), ['live']);
    assert.deepEqual(view.upcoming.map((e) => e.id), ['tonight', 'tomorrow', 'nextweek']);
    assert.deepEqual(view.ended.map((e) => e.id), ['past']);
    // ended reversed inside describeEvents by start order → only one here; check with two
    const two = describeEvents(load({
        events: [
            { id: 'older', name: '更早', type: 'icpc', start: '2026-09-01T00:00:00+08:00', end: '2026-09-01T23:59:59+08:00' },
            { id: 'newer', name: '更近', type: 'icpc', start: '2026-09-12T13:00:00+08:00', end: '2026-09-12T18:00:00+08:00' },
        ],
    }), NOW, '');
    assert.deepEqual(two.ended.map((e) => e.id), ['newer', 'older'], 'ended must list the most recent first');
});

test('countdown texts follow calendar days, not 24h spans', () => {
    const view = describeEvents(seasonFixture(), NOW, '');
    const by = (id, group) => group.find((e) => e.id === id);
    assert.equal(by('live', view.ongoing).countdownText, '进行中');
    assert.equal(by('past', view.ended).countdownText, '已结束');
    assert.equal(by('tonight', view.upcoming).countdownText, '今天开赛');
    assert.equal(by('tomorrow', view.upcoming).countdownText, '明天开赛');
    assert.equal(by('nextweek', view.upcoming).countdownText, '还有 7 天');
    assert.equal(view.total, 5);
});

test('date and time texts: timed single-day, all-day single-day, multi-day', () => {
    const view = describeEvents(seasonFixture(), NOW, '');
    const past = view.ended[0];
    // 13:00–18:00 的线上赛：单日 + 时间段
    assert.equal(past.dateText, '9月6日（周日）');
    assert.equal(past.timeText, '13:00 – 18:00');
    const live = view.ongoing[0];
    // 10-17 00:00 → 10-18 23:59:59 的两天现场赛：日期区间，无时间段
    assert.equal(live.dateText, '10月17日（周六） – 10月18日（周日）');
    assert.equal(live.timeText, '');
    assert.equal(live.placeText, '西安');
    const tonight = view.upcoming[0];
    assert.equal(tonight.dateText, '10月18日（周日）');
    assert.equal(tonight.timeText, '20:00 – 23:00');
    assert.equal(tonight.placeText, '线上');
    const tomorrow = view.upcoming[1];
    assert.equal(tomorrow.placeText, '成都');
});

test('registration deadline: countdown within 3 days is flagged, past deadline reads closed', () => {
    const view = describeEvents(seasonFixture(), NOW, '');
    const nextweek = view.upcoming.find((e) => e.id === 'nextweek');
    // 截止 10-20，当前 10-18 → 剩 2 天
    assert.equal(nextweek.regText, '报名截止：10月20日（周二） 23:59（剩 2 天）');
    assert.equal(nextweek.regSoon, true);
    const far = describeEvents(load({
        events: [{ id: 'far', name: '远期', type: 'icpc', start: '2026-12-05T00:00:00+08:00', end: '2026-12-06T23:59:59+08:00', regDeadline: '2026-11-01T23:59:59+08:00' }],
    }), NOW, '');
    assert.equal(far.upcoming[0].regText, '报名截止：11月1日（周日） 23:59');
    assert.equal(far.upcoming[0].regSoon, false);
    const closed = describeEvents(load({
        events: [{ id: 'closed', name: '已截止', type: 'icpc', start: '2026-12-05T00:00:00+08:00', regDeadline: '2026-10-01T23:59:59+08:00' }],
    }), NOW, '');
    assert.equal(closed.upcoming[0].regText, '报名已截止（10月1日（周四） 23:59）');
});

test('type filter narrows the view; unknown filters fall back to all', () => {
    const parsed = seasonFixture();
    const icpc = describeEvents(parsed, NOW, 'icpc');
    assert.equal(icpc.total, 2);
    assert.ok(icpc.ongoing.every((e) => e.type === 'icpc'));
    assert.equal(icpc.currentType, 'icpc');
    const bogus = describeEvents(parsed, NOW, 'hackathon');
    assert.equal(bogus.total, 5);
    assert.equal(bogus.currentType, '');
    // filter chips only offer types that actually exist in the data
    assert.deepEqual(describeEvents(parsed, NOW, '').filters.map((f) => f.key), ['', 'icpc', 'ccpc', 'provincial', 'invitational']);
    assert.equal(describeEvents(parsed, NOW, '').filters[0].count, 5);
});

test('cstDayDiff is calendar-day based across months and years', () => {
    assert.equal(cstDayDiff(at('2026-10-17T23:00:00+08:00'), at('2026-10-24T00:01:00+08:00')), 7);
    assert.equal(cstDayDiff(at('2026-10-31T12:00:00+08:00'), at('2026-11-01T00:00:00+08:00')), 1);
    assert.equal(cstDayDiff(at('2026-12-31T23:59:59+08:00'), at('2027-01-01T00:00:00+08:00')), 1);
    assert.equal(cstDayDiff(at('2027-01-09T00:00:00+08:00'), at('2026-10-18T00:00:00+08:00')), -83);
});

test('empty data renders an empty-but-valid view', () => {
    const view = describeEvents(load({ updated: '', events: [] }), NOW, '');
    assert.equal(view.total, 0);
    assert.deepEqual(view.filters, [{ key: '', label: '全部', count: 0 }]);
    assert.equal(view.updated, '');
});

// --- 扩展生态分类与 approx（月份级日期） -----------------------------------

test('new ecosystem types validate and get their badges', () => {
    const parsed = load({
        events: [
            { id: 'ccsp', name: 'CCSP', type: 'ccsp', start: '2026-10-21T00:00:00+08:00', end: '2026-10-22T23:59:59+08:00' },
            { id: 'ladder', name: '天梯赛', type: 'ladder', start: '2027-04-20T13:30:00+08:00' },
            { id: 'industry', name: '企业赛', type: 'industry', start: '2027-03-15T00:00:00+08:00' },
            { id: 'asta', name: '百度之星', type: 'asta', start: '2027-07-15T00:00:00+08:00' },
            { id: 'lqb', name: '蓝桥杯', type: 'lqb', start: '2027-04-11T09:00:00+08:00' },
        ],
    });
    assert.equal(parsed.skipped.length, 0);
    const view = describeEvents(parsed, at('2026-10-18T12:00:00+08:00'), '');
    // chips 只出现有数据的类型，且按 TYPES 定义的固定顺序排列
    assert.deepEqual(view.filters.map((f) => f.key),
        ['', 'lqb', 'ladder', 'asta', 'industry', 'ccsp']);
    const badges = Object.fromEntries(view.upcoming.concat(view.ended).map((e) => [e.id, [e.typeLabel, e.color]]));
    assert.equal(badges.ccsp[0], 'CCSP');
    assert.equal(badges.lqb[0], '蓝桥杯');
    assert.equal(badges.ladder[0], '天梯赛');
    assert.equal(badges.asta[0], '百度之星');
    assert.equal(badges.industry[0], '企业赛');
});

test('approx events show month-precision dates; deadlines stay exact', () => {
    const parsed = load({
        events: [{
            id: 'lqb18', name: '蓝桥杯', type: 'lqb', approx: true,
            start: '2027-04-01T00:00:00+08:00', end: '2027-04-30T23:59:59+08:00',
            regDeadline: '2026-12-18T14:00:00+08:00',
        }],
    });
    const view = describeEvents(parsed, NOW, '');
    const event = view.upcoming[0];
    assert.equal(event.approx, true);
    assert.equal(event.dateText, '2027年4月');
    assert.equal(event.timeText, '');
    assert.equal(event.countdownText, '日期待公布');
    // 报名截止是精确时间：正常显示并可触发 D-3/D-1 提醒
    assert.equal(event.regText, '报名截止：12月18日（周五） 14:00');
    assert.equal(event.regSoon, false);
});

test('approx without end defaults to a month window, never a single day', () => {
    const parsed = load({
        events: [{ id: 'x', name: '某赛事', type: 'industry', approx: true, start: '2027-05-01T00:00:00+08:00' }],
    });
    const event = parsed.events[0];
    assert.ok(event._end, 'month window must be synthesized');
    const view = describeEvents(parsed, at('2027-05-20T12:00:00+08:00'), '');
    assert.equal(view.upcoming.length, 0);
    assert.equal(view.ongoing.length, 1, 'May 20 sits inside the synthesized May window');
    assert.equal(view.ended.length, 0);
    const view2 = describeEvents(parsed, at('2027-05-02T12:00:00+08:00'), '');
    assert.equal(view2.ongoing.length, 1);
    assert.equal(view2.ongoing[0].countdownText, '临近 / 进行中');
    const view3 = describeEvents(parsed, at('2027-06-05T12:00:00+08:00'), '');
    assert.equal(view3.ended.length, 1, 'after May 2027 the window has passed');
});

test('the shipped seed carries the CCSP and Lanqiao entries with their verified facts', () => {
    const parsed = loadCalendar(fs.readFileSync(SEED, 'utf-8'));
    const ccsp = parsed.events.find((e) => e.id === 'ccsp-2026');
    assert.ok(ccsp, 'CCSP 2026 must be in the seed');
    assert.equal(ccsp.type, 'ccsp');
    const lqb = parsed.events.find((e) => e.id === 'lqb-18');
    assert.ok(lqb, 'Lanqiao 18th must be in the seed');
    assert.equal(lqb.approx, true);
    assert.ok(lqb.regDeadline, 'the 12-18 registration deadline is the actionable fact');
});
