'use strict';

const { createHash } = require('node:crypto');
const { TYPE_META, cstParts, describeEvent, selectEvents, fmtDate } = require('./calendar.cjs');

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

function allDayRange(event) {
    // RFC 5545 uses an exclusive end date; manual race ranges are inclusive.
    return {
        start: dateOnly(event._start),
        end: dateOnly(new Date(Date.parse(`${dateOnly(event._end || event._start)}T00:00:00+08:00`) + 86400000)),
    };
}

function scheduleRow(event, now) {
    const dto = describeEvent(event, now);
    const start = cstParts(event._start);
    const end = event._end && cstParts(event._end);
    const dateValue = event.approx ? `${start.y}-${String(start.m).padStart(2, '0')}` : dateOnly(event._start);
    const dateText = event.approx ? `${dto.dateText}（日期待公布）`
        : `${start.y}年${fmtDate(event._start)}${end && dateOnly(event._start) !== dateOnly(event._end)
            ? ` – ${end.y === start.y ? '' : `${end.y}年`}${fmtDate(event._end)}` : ''}`;
    return {
        ...dto, dateValue, scheduleDateText: dateText,
        dateMonth: event.approx ? `${start.y}年` : `${start.y}年${start.m}月`,
        dateDay: event.approx ? `${start.m}月` : String(start.d).padStart(2, '0'),
        dateWeekday: event.approx ? '日期待公布' : ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][start.weekday],
    };
}

function pageData(parsed, now, { type = '', types = '', q = '' } = {}, sourceStatuses = []) {
    const { describeEvents } = require('./calendar.cjs');
    const view = describeEvents(parsed, now, type, { types, q });
    const selected = new Set(selectEvents(parsed.events, { type, types, q }).map((event) => event.id));
    const rows = parsed.events.map((event) => ({ ...scheduleRow(event, now), hidden: !selected.has(event.id) }));
    const groups = ['ongoing', 'upcoming', 'uncertain', 'ended'].map((key) => {
        const events = rows.filter((event) => (event.approx ? 'uncertain' : event.status) === key);
        if (key === 'ended') events.reverse();
        const count = events.filter((event) => !event.hidden).length;
        return { key, label: { ongoing: '进行中', upcoming: '即将到来', uncertain: '日期待公布', ended: '已结束' }[key], events, count, hidden: !count };
    });
    const sources = sourceStatuses.map((source) => ({ ...source, text: {
        fresh: '已同步', stale: '使用上次赛程', pending: '正在同步', unavailable: '暂不可用', unconfigured: '尚未启用', disabled: '未启用',
    }[source.status] || '正在同步' }));
    const params = new URLSearchParams();
    if (view.currentTypes.length) params.set('types', view.currentTypes.join(','));
    if (view.query) params.set('q', view.query);
    return {
        ...view, filters: view.filters.map((filter) => ({ ...filter, color: TYPE_META[filter.key]?.color || '#64748b' })),
        groups,
        registrationCount: parsed.events.filter((event) => event._reg && selected.has(event.id)).length,
        selectedTypesValue: view.currentTypes.join(','), sources,
        subscribeUrl: `/calendar/feed.ics${params.size ? `?${params}` : ''}`,
        bootJson: serializeBoot({ selectedTypes: view.currentTypes, query: view.query }),
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
            const item = allDayRange(event);
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

module.exports = { pageData, dateOnly, isAllDay, serializeBoot, buildIcs, foldLine, escapeText };
