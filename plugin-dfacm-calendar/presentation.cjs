'use strict';

const { createHash } = require('node:crypto');
const { TYPE_META, cstParts, describeEvent, selectEvents, fmtDate, fmtTime } = require('./calendar.cjs');

function dateOnly(value) {
    const p = cstParts(new Date(value));
    return `${p.y}-${String(p.m).padStart(2, '0')}-${String(p.d).padStart(2, '0')}`;
}

function isAllDay(event) {
    const start = cstParts(event._start);
    const end = event._end && cstParts(event._end);
    return event.allDay || (event.form === 'onsite' && start.hh === 0 && start.mm === 0
        && (!end || (end.hh === 23 && end.mm === 59)));
}

function calendarEvent(event, now) {
    if (event.approx) return null;
    const allDay = isAllDay(event);
    const meta = TYPE_META[event.type];
    // FullCalendar's all-day end is exclusive; our manual end is inclusive.
    const end = allDay
        ? dateOnly(new Date(Date.parse(`${dateOnly(event._end || event._start)}T00:00:00+08:00`) + 86400000))
        : event.end || undefined;
    return {
        id: event.id, title: event.name, allDay,
        start: allDay ? dateOnly(event._start) : event.start, end,
        backgroundColor: meta.color, borderColor: meta.color, textColor: meta.fg,
        extendedProps: { ...describeEvent(event, now), kind: 'contest', source: event.source, start: event.start, end: event.end, regDeadline: event.regDeadline },
    };
}

function registrationEvent(event, now) {
    if (!event._reg) return null;
    return {
        id: `${event.id}:registration`, title: `报名截止：${event.name}`, allDay: false,
        start: event.regDeadline, end: new Date(event._reg.getTime() + 60000).toISOString(),
        backgroundColor: '#fff2cd', borderColor: '#c9a227', textColor: '#5c4610',
        extendedProps: { ...describeEvent(event, now), kind: 'registration',
            dateText: fmtDate(event._reg), timeText: fmtTime(event._reg),
            countdownText: now.getTime() > event._reg.getTime() ? '报名已截止' : '报名截止',
        },
    };
}

function pageData(parsed, now, { type = '', types = '', q = '' } = {}, sourceStatuses = []) {
    const { describeEvents } = require('./calendar.cjs');
    const view = describeEvents(parsed, now, type, { types, q });
    const selected = new Set(selectEvents(parsed.events, { type, types, q }).map((event) => event.id));
    const all = describeEvents(parsed, now, '');
    const groups = ['ongoing', 'upcoming', 'ended'].map((key) => {
        const events = all[key].filter((event) => !event.approx).map((event) => ({ ...event, hidden: !selected.has(event.id) }));
        const count = events.filter((event) => !event.hidden).length;
        return { key, label: { ongoing: '进行中', upcoming: '即将到来', ended: '已结束' }[key], events, count, hidden: !count };
    });
    const uncertain = parsed.events.filter((event) => event.approx).map((event) => ({ ...describeEvent(event, now), hidden: !selected.has(event.id) }));
    const events = parsed.events.flatMap((event) => [calendarEvent(event, now), registrationEvent(event, now)]).filter(Boolean);
    const sources = sourceStatuses.map((source) => ({ ...source, text: {
        fresh: '已同步', stale: '使用上次赛程', pending: '正在同步', unavailable: '暂不可用', unconfigured: '尚未启用', disabled: '未启用',
    }[source.status] || '正在同步' }));
    const params = new URLSearchParams();
    if (view.currentTypes.length) params.set('types', view.currentTypes.join(','));
    if (view.query) params.set('q', view.query);
    return {
        ...view, groups, uncertain, uncertainCount: uncertain.filter((event) => !event.hidden).length,
        exactCount: events.filter((event) => event.extendedProps.kind === 'contest' && selected.has(event.id)).length,
        registrationCount: parsed.events.filter((event) => event._reg && selected.has(event.id)).length,
        selectedTypesValue: view.currentTypes.join(','), sources,
        subscribeUrl: `/calendar/feed.ics${params.size ? `?${params}` : ''}`,
        bootJson: serializeBoot({ events, selectedTypes: view.currentTypes, query: view.query, sources, generatedAt: now.toISOString() }),
    };
}

function serializeBoot(value) {
    return JSON.stringify(value).replace(/[<>&\u2028\u2029]/g, (char) => `\\u${char.charCodeAt(0).toString(16).padStart(4, '0')}`);
}

function escapeText(value) {
    return String(value || '').replace(/\\/g, '\\\\').replace(/\r\n|\r|\n/g, '\\n').replace(/;/g, '\\;').replace(/,/g, '\\,');
}

// Fold at 75 UTF-8 octets without cutting a code point. Continuation space
// counts toward the limit, as required by RFC 5545.
function foldLine(line) {
    const parts = [];
    let part = '';
    let bytes = 0;
    for (const char of line) {
        const width = Buffer.byteLength(char, 'utf8');
        if (bytes + width > 75) { parts.push(part); part = ' '; bytes = 1; }
        part += char;
        bytes += width;
    }
    parts.push(part);
    return parts.join('\r\n');
}

const utc = (value) => new Date(value).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
const uid = (id) => `${createHash('sha256').update(id).digest('hex')}@dfacm.website`;

function buildIcs(parsed, { type = '', types = '', q = '', now = new Date() } = {}) {
    const rows = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//DFACM//Contest Calendar//ZH-CN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
        'X-WR-CALNAME:d&f算法网赛事日历', 'X-WR-TIMEZONE:Asia/Shanghai', 'REFRESH-INTERVAL;VALUE=DURATION:PT1H', 'X-PUBLISHED-TTL:PT1H'];
    const dtstamp = utc(now);

    function append(event, registration) {
        const dto = describeEvent(event, now);
        const summary = registration ? `报名截止：${event.name}` : event.name;
        rows.push('BEGIN:VEVENT', `UID:${uid(`${event.id}${registration ? ':registration' : ''}`)}`, `DTSTAMP:${dtstamp}`, `SUMMARY:${escapeText(summary)}`);
        if (registration) rows.push(`DTSTART:${utc(event._reg)}`, `DTEND:${utc(new Date(event._reg.getTime() + 60000))}`);
        else if (isAllDay(event)) {
            const item = calendarEvent(event, now);
            rows.push(`DTSTART;VALUE=DATE:${item.start.replace(/-/g, '')}`, `DTEND;VALUE=DATE:${item.end.replace(/-/g, '')}`);
        } else {
            rows.push(`DTSTART:${utc(event._start)}`);
            if (event._end) rows.push(`DTEND:${utc(event._end)}`);
        }
        const credit = event.source === 'clist' ? '赛事数据由 CLIST 提供（https://clist.by）' : '赛事时间以官方最终通知为准。';
        rows.push(`DESCRIPTION:${escapeText([dto.typeLabel, event.note, dto.regText, credit, event.url].filter(Boolean).join('\n'))}`);
        if (event.location) rows.push(`LOCATION:${escapeText(event.location)}`);
        if (event.url) rows.push(`URL:${event.url.replace(/[\r\n]/g, '')}`);
        if (registration || !isAllDay(event)) {
            for (const trigger of registration ? ['-P3D', '-P1D'] : ['-PT30M']) {
                rows.push('BEGIN:VALARM', 'ACTION:DISPLAY', `TRIGGER:${trigger}`, `DESCRIPTION:${escapeText(summary)}`, 'END:VALARM');
            }
        }
        rows.push('END:VEVENT');
    }

    for (const event of selectEvents(parsed.events, { type, types, q })) {
        // Month-only announcements cannot be exported as invented race dates.
        if (!event.approx) append(event, false);
        if (event._reg) append(event, true);
    }
    rows.push('END:VCALENDAR');
    return rows.map(foldLine).join('\r\n') + '\r\n';
}

module.exports = { calendarEvent, registrationEvent, pageData, dateOnly, isAllDay, serializeBoot, buildIcs, foldLine, escapeText };
