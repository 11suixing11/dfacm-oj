'use strict';

const { createHash } = require('node:crypto');
const { TYPE_META, INTEREST_META, SOURCE_META, cstParts, describeEvent, selectEvents, fmtDate, filterOptions, filterParams, trackOf, compareEvents } = require('./calendar.cjs');

function dateOnly(value) {
    const p = cstParts(new Date(value));
    return `${p.y}-${String(p.m).padStart(2, '0')}-${String(p.d).padStart(2, '0')}`;
}

function isAllDay(event) {
    if (!event._start) return false;
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
    if (!event._start) {
        const end = event._end && cstParts(event._end);
        return { ...dto, dateValue: end ? dateOnly(event._end) : '',
            scheduleDateText: end ? `开始日期待公布 · 截至 ${end.y}年${fmtDate(event._end)}` : '日期待公布',
            dateMonth: end ? `${end.y}年${end.m}月` : '赛事时间', dateDay: end ? String(end.d).padStart(2, '0') : '待定',
            dateWeekday: end ? '截止日期' : '待公布' };
    }
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

function pageData(parsed, now, options = {}, sourceStatuses = []) {
    const { describeEvents } = require('./calendar.cjs');
    const current = filterOptions(options);
    const view = describeEvents(parsed, now, options.type || '', { ...options, now });
    const selected = new Set(selectEvents(parsed.events, { ...options, now }).map((event) => event.id));
    const rows = parsed.events.map((event) => ({ ...scheduleRow(event, now), hidden: !selected.has(event.id) }));
    const groups = ['ongoing', 'upcoming', 'uncertain', 'ended'].map((key) => {
        const events = rows.filter((event) => event.filterStatus === key);
        events.sort(compareEvents(current.sort, key));
        const count = events.filter((event) => !event.hidden).length;
        return { key, label: { ongoing: '进行中', upcoming: '即将到来', uncertain: '日期待公布', ended: '已结束' }[key], events, count, hidden: !count };
    });
    const sources = sourceStatuses.map((source) => ({ ...source, text: {
        fresh: '已同步', stale: '使用上次赛程', pending: '正在同步', unavailable: '暂不可用', unconfigured: '尚未启用', disabled: '未启用',
    }[source.status] || '正在同步' }));
    const params = filterParams(options);
    const link = (change) => { const next = filterParams({ ...options, ...change }); return `/calendar${next.size ? `?${next}` : ''}`; };
    const scopeFilters = [{ key: '', label: '全部赛事' }, { key: 'algorithm', label: '算法赛' }, { key: 'ai', label: 'AI / 黑客松' }]
        .map((item) => ({ ...item, selected: current.scope === item.key,
            count: parsed.events.filter((event) => !item.key || trackOf(event) === item.key).length, href: link({ scope: item.key }) }));
    const interestFilters = [{ key: '', label: '不限' }, ...Object.entries(INTEREST_META).map(([key, label]) => ({ key, label }))]
        .map((item) => ({ ...item, selected: item.key ? current.interests.includes(item.key) : !current.interests.length,
            count: parsed.events.filter((event) => !item.key || event.tags.includes(item.key)).length,
            href: link({ interests: !item.key ? '' : current.interests.includes(item.key)
                ? current.interests.filter((tag) => tag !== item.key).join(',') : [...current.interests, item.key].join(',') }) }));
    const sourceOptions = [{ key: '', label: '全部平台' }, ...Object.entries(SOURCE_META)
        .filter(([key]) => parsed.events.some((event) => event.sources.includes(key)))
        .map(([key, label]) => ({ key, label }))].map((item) => ({ ...item, selected: current.source === item.key }));
    const statusOptions = Object.entries({ '': '全部状态', active: '未结束', ongoing: '进行中', upcoming: '即将到来', uncertain: '日期待公布', ended: '已结束' })
        .map(([key, label]) => ({ key, label, selected: current.status === key }));
    const sortOptions = Object.entries({ schedule: '按赛程', deadline: '按截止时间', newest: '最新收录', prize: '按奖金（同币种）' })
        .map(([key, label]) => ({ key, label, selected: current.sort === key }));
    return {
        ...view, filters: view.filters.map((filter) => ({ ...filter, color: TYPE_META[filter.key]?.color || '#64748b' })),
        groups,
        registrationCount: parsed.events.filter((event) => event._reg && selected.has(event.id)).length,
        selectedTypesValue: view.currentTypes.join(','), selectedInterestsValue: current.interests.join(','), sources,
        scopeFilters, interestFilters, sourceOptions, statusOptions, sortOptions, currentScope: current.scope,
        hasFilters: !!(current.selectedTypes.length || current.interests.length || current.query || current.scope || current.status || current.source),
        prizeSort: current.sort === 'prize',
        subscribeUrl: `/calendar/feed.ics${params.size ? `?${params}` : ''}`,
        rssUrl: `/calendar/feed.xml${params.size ? `?${params}` : ''}`,
        bootJson: serializeBoot(current),
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

function buildIcs(parsed, options = {}) {
    const now = options.now || new Date();
    const rows = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//DFACM//Contest Calendar//ZH-CN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
        'X-WR-CALNAME:d&f算法网赛事日历', 'X-WR-TIMEZONE:Asia/Shanghai', 'REFRESH-INTERVAL;VALUE=DURATION:PT1H', 'X-PUBLISHED-TTL:PT1H'];
    const dtstamp = utc(now);

    function append(event, registration, deadline = false) {
        const dto = describeEvent(event, now);
        const summary = registration ? `报名截止：${event.name}` : deadline ? `赛事截止：${event.name}` : event.name;
        rows.push('BEGIN:VEVENT', `UID:${uid(`${event.id}${registration ? ':registration' : deadline ? ':deadline' : ''}`)}`, `DTSTAMP:${dtstamp}`, `SUMMARY:${escapeText(summary)}`);
        if (registration || deadline) {
            const at = registration ? event._reg : event._end;
            rows.push(`DTSTART:${utc(at)}`, `DTEND:${utc(new Date(at.getTime() + 60000))}`);
        }
        else if (isAllDay(event)) {
            const item = allDayRange(event);
            rows.push(`DTSTART;VALUE=DATE:${item.start.replace(/-/g, '')}`, `DTEND;VALUE=DATE:${item.end.replace(/-/g, '')}`);
        } else {
            rows.push(`DTSTART:${utc(event._start)}`);
            if (event._end) rows.push(`DTEND:${utc(event._end)}`);
        }
        const credit = event.source === 'clist' ? '赛事数据由 CLIST 提供（https://clist.by）' : '赛事时间以官方最终通知为准。';
        rows.push(`DESCRIPTION:${escapeText([dto.typeLabel, dto.sourceLabel, event.organizer, event.prizeText,
            event.tags.join(' / '), event.note, dto.regText, credit, event.url].filter(Boolean).join('\n'))}`);
        if (event.location) rows.push(`LOCATION:${escapeText(event.location)}`);
        if (event.url) rows.push(`URL:${event.url.replace(/[\r\n]/g, '')}`);
        if (registration || deadline || !isAllDay(event)) {
            for (const trigger of registration || deadline ? ['-P3D', '-P1D'] : ['-PT30M']) {
                rows.push('BEGIN:VALARM', 'ACTION:DISPLAY', `TRIGGER:${trigger}`, `DESCRIPTION:${escapeText(summary)}`, 'END:VALARM');
            }
        }
        rows.push('END:VEVENT');
    }

    for (const event of selectEvents(parsed.events, { ...options, now })) {
        // Month-only announcements cannot be exported as invented race dates.
        if (!event.approx && event._start) append(event, false);
        else if (!event._start && event._end) append(event, false, true);
        if (event._reg) append(event, true);
    }
    rows.push('END:VCALENDAR');
    return rows.map(foldLine).join('\r\n') + '\r\n';
}

const escapeXml = (value) => String(value || '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')
    .replace(/[<>&"']/g, (char) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[char]));

function buildRss(parsed, options = {}) {
    const now = options.now || new Date();
    const params = filterParams(options);
    const address = `https://dfacm.website/calendar${params.size ? `?${params}` : ''}`;
    const events = selectEvents(parsed.events, { ...options, now }).sort(compareEvents('newest'));
    const items = events.map((event) => {
        const dto = scheduleRow(event, now);
        const description = [dto.typeLabel, dto.sourceLabel, dto.scheduleDateText, dto.timeText, event.organizer,
            event.prizeText, event.tags.join(' / '), event.note].filter(Boolean).join(' · ');
        const pubDate = event.firstSeenAt ? `<pubDate>${new Date(event.firstSeenAt).toUTCString()}</pubDate>` : '';
        return `<item><title>${escapeXml(event.name)}</title><link>${escapeXml(event.url || address)}</link>`
            + `<guid isPermaLink="false">${uid(event.id)}</guid><description>${escapeXml(description)}</description>${pubDate}</item>`;
    });
    return '<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel>'
        + `<title>d&amp;f算法网 · 赛事日历</title><link>${escapeXml(address)}</link><description>算法赛、AI 赛与黑客松</description>`
        + `<lastBuildDate>${now.toUTCString()}</lastBuildDate>${items.join('')}</channel></rss>`;
}

module.exports = { pageData, scheduleRow, dateOnly, isAllDay, serializeBoot, buildIcs, buildRss, escapeXml, foldLine, escapeText };
