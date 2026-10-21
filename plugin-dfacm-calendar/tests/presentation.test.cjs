'use strict';
const assert = require('node:assert/strict');
const { test } = require('node:test');
const ICAL = require('ical.js');
const { loadCalendar } = require('../calendar.cjs');
const { buildIcs, pageData, foldLine, serializeBoot } = require('../presentation.cjs');
const NOW = new Date('2026-10-18T12:00:00+08:00');
const rows = [
    { id: 'timed', name: 'CF 比赛', type: 'cf', form: 'online', start: '2026-10-22T20:00:00+08:00', end: '2026-10-22T22:00:00+08:00', source: 'cf' },
    { id: 'multi', name: 'ICPC 成都', type: 'icpc', start: '2026-10-24T00:00:00+08:00', end: '2026-10-25T23:59:59+08:00', location: '成都' },
    { id: 'single', name: '全天校赛', type: 'school', start: '2026-10-28T00:00:00+08:00' },
    { id: 'month', name: '蓝桥杯', type: 'lqb', approx: true, start: '2027-04-01T00:00:00+08:00', regDeadline: '2026-12-18T14:00:00+08:00' },
];
const parsed = (events = rows) => loadCalendar(JSON.stringify({ events }));
const components = (ics) => new ICAL.Component(ICAL.parse(ics)).getAllSubcomponents('vevent');

test('list dates use Beijing time across year boundaries and do not invent days for month-only races', () => {
    const data = parsed([
        { ...rows[0], id: 'cst', start: '2026-12-31T16:30:00Z', end: '2026-12-31T17:30:00Z' },
        { ...rows[1], id: 'years', start: '2026-12-31T00:00:00+08:00', end: '2027-01-02T23:59:59+08:00' },
        rows[3],
    ]);
    const list = pageData(data, NOW).groups.flatMap((g) => g.events);
    const timed = list.find((e) => e.id === 'cst');
    assert.equal(timed.dateValue, '2027-01-01');
    assert.equal(timed.dateMonth, '2027年1月');
    assert.equal(timed.dateDay, '01');
    assert.equal(timed.dateWeekday, '周五');
    assert.equal(timed.timeText, '00:30 – 01:30');
    assert.match(list.find((e) => e.id === 'years').scheduleDateText, /2026年12月31日.*2027年1月2日/);
    const uncertain = list.find((e) => e.id === 'month');
    assert.equal(uncertain.dateValue, '2027-04');
    assert.equal(uncertain.scheduleDateText, '2027年4月（日期待公布）');
    assert.equal(uncertain.timeText, '');
    assert.equal(uncertain.dateWeekday, '日期待公布');
});

test('ICS parses in an independent parser with UTC timed events and date-only inclusive ranges', () => {
    const output = buildIcs(parsed(), { now: NOW });
    const events = components(output);
    assert.equal(events.length, 4, 'three exact races and one exact deadline');
    const timed = new ICAL.Event(events.find((e) => e.getFirstPropertyValue('summary') === 'CF 比赛'));
    assert.equal(timed.startDate.toJSDate().toISOString(), '2026-10-22T12:00:00.000Z');
    assert.equal(timed.endDate.toJSDate().toISOString(), '2026-10-22T14:00:00.000Z');
    assert.equal(timed.component.getFirstSubcomponent('valarm').getFirstPropertyValue('trigger').toSeconds(), -1800);
    const multi = new ICAL.Event(events.find((e) => e.getFirstPropertyValue('summary') === 'ICPC 成都'));
    assert.equal(multi.startDate.isDate, true);
    assert.equal(multi.startDate.toString(), '2026-10-24');
    assert.equal(multi.endDate.toString(), '2026-10-26');
    const reg = events.find((e) => e.getFirstPropertyValue('summary') === '报名截止：蓝桥杯');
    assert.deepEqual(reg.getAllSubcomponents('valarm').map((a) => a.getFirstPropertyValue('trigger').toSeconds()), [-259200, -86400]);
    assert.ok(!events.some((e) => e.getFirstPropertyValue('summary') === '蓝桥杯'));
    assert.ok(!/(^|[^\r])\n/.test(output), 'all line breaks must be CRLF');
});

test('UIDs survive refresh and filtering, new deadline has a distinct identity', () => {
    const all = components(buildIcs(parsed(), { now: NOW }));
    const next = components(buildIcs(parsed(), { types: 'cf', now: new Date(NOW.getTime() + 3600000) }));
    const original = all.find((e) => e.getFirstPropertyValue('summary') === 'CF 比赛');
    assert.equal(next[0].getFirstPropertyValue('uid'), original.getFirstPropertyValue('uid'));
    assert.match(original.getFirstPropertyValue('uid'), /@dfacm\.website$/);
    const raceAndReg = components(buildIcs(parsed([{ ...rows[0], regDeadline: '2026-10-20T12:00:00+08:00' }]), { now: NOW }));
    assert.notEqual(raceAndReg[0].getFirstPropertyValue('uid'), raceAndReg[1].getFirstPropertyValue('uid'));
});

test('Chinese, emoji, quotes, newlines and separators round-trip without calendar injection', () => {
    const name = '中文比赛🏆'.repeat(18) + '\\,;\nEND:VEVENT\nBEGIN:VEVENT';
    const note = '备注\\;逗号,\n下一行';
    const output = buildIcs(parsed([{ ...rows[0], name, note }]), { now: NOW });
    assert.ok(output.split('\r\n').every((line) => Buffer.byteLength(line) <= 75));
    assert.ok(!output.includes('\ufffd'));
    const events = components(output);
    assert.equal(events.length, 1);
    assert.equal(events[0].getFirstPropertyValue('summary'), name);
    assert.ok(events[0].getFirstPropertyValue('description').includes(note));
    const original = 'SUMMARY:' + '汉字🗓️'.repeat(20);
    assert.equal(foldLine(original).replace(/\r\n /g, ''), original);
});

test('ICS filters multiple platforms and search; CLIST credit is present', () => {
    const data = parsed([...rows, { ...rows[0], id: 'clist-22', name: '牛客周赛', type: 'nowcoder', source: 'clist' }]);
    assert.equal(components(buildIcs(data, { types: 'cf,nowcoder', now: NOW })).length, 2);
    const one = components(buildIcs(data, { q: '牛客', now: NOW }));
    assert.equal(one.length, 1);
    assert.match(one[0].getFirstPropertyValue('description'), /CLIST/);
});

test('page DTO retains all list rows while counting and grouping the server selection', () => {
    const view = pageData(parsed(), NOW, { types: 'cf', q: '比赛' });
    assert.equal(view.total, 1);
    assert.equal(view.groups.flatMap((g) => g.events).length, 4);
    assert.equal(view.groups.flatMap((g) => g.events).filter((e) => e.hidden).length, 3);
    assert.equal(view.groups.find((g) => g.key === 'uncertain').events[0].hidden, true);
    const boot = JSON.parse(view.bootJson);
    assert.deepEqual(boot, { selectedTypes: ['cf'], query: '比赛' });
    const month = pageData(parsed(), NOW, { types: 'lqb' });
    assert.equal(month.total, 1);
    assert.equal(month.registrationCount, 1);
    assert.equal(month.groups.find((g) => g.key === 'uncertain').count, 1);
    assert.equal(new URL(view.subscribeUrl, 'https://dfacm.website').searchParams.get('types'), 'cf');
});

test('boot JSON cannot terminate a script element and preserves literal user strings', () => {
    const payload = { title: '</script><img src=x onerror=alert(1)>&\u2028\u2029' };
    const serialized = serializeBoot(payload);
    assert.ok(!/[<>&\u2028\u2029]/.test(serialized));
    assert.deepEqual(JSON.parse(serialized), payload);
});
