'use strict';

// swpu-calendar 纯逻辑模块：数据校验、状态分组、展示文案。
// 所有时间计算显式走 Asia/Shanghai（UTC+8，无夏令时）——与站点受众一致，
// 不依赖服务器本地时区，测试也因此完全确定。
//
// calendar.json 的条目字段：
//   id          必填，字符串，全局唯一（QQ 播报机器人的防重键）
//   name        必填，赛事名称
//   type        必填，见下方分类指南
//   form        可选，onsite（默认）| online | hybrid
//   location    可选，地点（现场赛城市 / 承办高校）
//   start       必填，ISO 8601（带 +08:00 偏移）；多日赛事给首日 00:00
//   end         可选，ISO 8601；多日赛事给末日 23:59:59
//   approx      可选，true = 日期只精确到月：start/end 圈出月份窗口，
//               展示为"2027年4月（日期待公布）"，不显示倒计时与具体星期；
//               报名截止等精确时间不受影响
//   regDeadline 可选，ISO 8601，报名截止（bot 会在 D-3 / D-1 提醒）
//   url         可选，官方/报名链接，必须 http(s):// 开头
//   note        可选，一行备注
//
// 分类指南（type 选型，徽章色即品牌色板）：
//   icpc        ICPC 全体系（网络预选赛/区域赛/EC-Final/世界总决赛）
//   ccpc        CCPC 全体系（网络赛/分站赛/女生专场/高职专场/总决赛）
//   provincial  各省程序设计竞赛（四川省赛、广东省赛 GDCPC 等）
//   invitational 全国邀请赛（西安/湘潭/深圳/南昌邀请赛等）
//   school      本校比赛（校内选拔等）
//   lqb         蓝桥杯（省赛/全国决赛）
//   ladder      中国高校计算机大赛-团体程序设计天梯赛（CCCC-GPLT）
//   asta        百度之星（Astar 程序设计大赛）
//   industry    企业赛（华为软件精英挑战赛、字节青训营赛等厂商主办）
//   ccsp        CCF 大学生计算机系统与程序设计竞赛（CCSP）
//   cf          Codeforces Round 等（auto.cjs 自动抓取）
//   atcoder     AtCoder ABC/ARC 等（auto.cjs 自动抓取）
//   other       其余算法类赛事（睿抗 RAICOM 程序设计赛道等）

const TYPES = ['icpc', 'ccpc', 'provincial', 'invitational', 'school', 'lqb', 'ladder', 'asta', 'industry', 'ccsp', 'cf', 'atcoder', 'nowcoder', 'luogu', 'leetcode', 'codechef', 'other'];
const TYPE_META = {
    icpc: { label: 'ICPC', color: '#2a5caa', fg: '#ffffff' },
    ccpc: { label: 'CCPC', color: '#c9a227', fg: '#1a2940' },
    provincial: { label: '省赛', color: '#3d9ad1', fg: '#ffffff' },
    invitational: { label: '邀请赛', color: '#57708a', fg: '#ffffff' },
    school: { label: '校级赛', color: '#3f8f5f', fg: '#ffffff' },
    lqb: { label: '蓝桥杯', color: '#2a8f8f', fg: '#ffffff' },
    ladder: { label: '天梯赛', color: '#b3541e', fg: '#ffffff' },
    asta: { label: '百度之星', color: '#d9534f', fg: '#ffffff' },
    industry: { label: '企业赛', color: '#7a5cae', fg: '#ffffff' },
    ccsp: { label: 'CCSP', color: '#8f5a44', fg: '#ffffff' },
    cf: { label: 'CF', color: '#4a90d9', fg: '#ffffff' },
    atcoder: { label: 'AtCoder', color: '#5aa02c', fg: '#ffffff' },
    nowcoder: { label: '牛客', color: '#16856d', fg: '#ffffff' },
    luogu: { label: '洛谷', color: '#348ac7', fg: '#ffffff' },
    leetcode: { label: 'LeetCode', color: '#a66714', fg: '#ffffff' },
    codechef: { label: 'CodeChef', color: '#85624b', fg: '#ffffff' },
    other: { label: '其他', color: '#8a94a6', fg: '#ffffff' },
};
const FORM_LABELS = { onsite: '现场', online: '线上', hybrid: '线上/线下' };
const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
const CST = 8 * 3600 * 1000;

function cstParts(date) {
    const shifted = new Date(date.getTime() + CST);
    return {
        y: shifted.getUTCFullYear(),
        m: shifted.getUTCMonth() + 1,
        d: shifted.getUTCDate(),
        hh: shifted.getUTCHours(),
        mm: shifted.getUTCMinutes(),
        weekday: shifted.getUTCDay(),
    };
}

function fmtDate(date) {
    const p = cstParts(date);
    return `${p.m}月${p.d}日（${WEEKDAYS[p.weekday]}）`;
}

function fmtTime(date) {
    const p = cstParts(date);
    return `${String(p.hh).padStart(2, '0')}:${String(p.mm).padStart(2, '0')}`;
}

function fmtDateTime(date) {
    return `${fmtDate(date)} ${fmtTime(date)}`;
}

// CST 日历日差：按两边各自的 CST 午夜算差，而不是 24h 时长差——
// 10月17日 23:00 到 10月24日 00:01 也是整 7 天。
function cstDayDiff(from, to) {
    const a = cstParts(from);
    const b = cstParts(to);
    return Math.round((Date.UTC(b.y, b.m - 1, b.d) - Date.UTC(a.y, a.m - 1, a.d)) / 86400000);
}

function sameCstDay(a, b) {
    const pa = cstParts(a);
    const pb = cstParts(b);
    return pa.y === pb.y && pa.m === pb.m && pa.d === pb.d;
}

function parseDate(value, field, id) {
    if (typeof value !== 'string' || !value.trim()) {
        throw new Error(`${id}：${field} 必须是 ISO 8601 时间字符串`);
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) throw new Error(`${id}：${field} 不是合法时间：${value}`);
    return date;
}

// 返回 { ok: true, event } 或 { ok: false, id, reason }。绝不抛错——
// 一条坏数据只跳过自己，不能拖死整份日历。
function validateEvent(raw, index) {
    const where = `第 ${index + 1} 条`;
    if (typeof raw !== 'object' || raw === null) return { ok: false, id: where, reason: '不是对象' };
    if (typeof raw.id !== 'string' || !raw.id.trim()) return { ok: false, id: where, reason: '缺少 id' };
    const id = raw.id.trim();
    if (typeof raw.name !== 'string' || !raw.name.trim()) return { ok: false, id, reason: '缺少 name' };
    if (!TYPES.includes(raw.type)) return { ok: false, id, reason: `未知 type：${raw.type}` };
    let start;
    let end = null;
    let reg = null;
    try {
        start = parseDate(raw.start, 'start', id);
        if (raw.end !== undefined && raw.end !== null && raw.end !== '') {
            end = parseDate(raw.end, 'end', id);
            if (end.getTime() < start.getTime()) return { ok: false, id, reason: 'end 早于 start' };
        }
        if (raw.regDeadline !== undefined && raw.regDeadline !== null && raw.regDeadline !== '') {
            reg = parseDate(raw.regDeadline, 'regDeadline', id);
        }
    } catch (e) {
        return { ok: false, id, reason: e.message };
    }
    const form = raw.form === undefined || raw.form === null || raw.form === '' ? 'onsite' : raw.form;
    if (!Object.keys(FORM_LABELS).includes(form)) return { ok: false, id, reason: `未知 form：${raw.form}` };
    const url = raw.url === undefined || raw.url === null ? '' : String(raw.url).trim();
    if (url) {
        try {
            const parsed = new URL(url);
            if (!['https:', 'http:'].includes(parsed.protocol) || parsed.username || parsed.password || /[\r\n]/.test(url)) throw new Error();
        } catch { return { ok: false, id, reason: `url 必须是合法 http(s):// 链接：${url}` }; }
    }
    const approx = raw.approx === true;
    // approx 条目约定 start/end 圈出月份窗口（如 2027-04-01 ~ 2027-04-30），
    // end 缺席时补一个月窗口，避免"日期待公布"的条目被当成单日赛事。
    if (approx && !end) {
        const p = cstParts(start);
        const nextMonth = p.m === 12 ? { y: p.y + 1, m: 1 } : { y: p.y, m: p.m + 1 };
        end = new Date(Date.UTC(nextMonth.y, nextMonth.m - 1, 1) - (CST + 1));
    }
    return {
        ok: true,
        event: {
            id,
            name: raw.name.trim(),
            type: raw.type,
            form,
            approx,
            allDay: raw.allDay === true,
            source: raw.source === 'clist' ? 'clist' : raw.source === 'cf' || raw.source === 'atcoder' ? raw.source : 'manual',
            location: raw.location ? String(raw.location).trim() : '',
            // 原始 ISO 字符串原样保留（/calendar/data 端点与 bot 依赖）
            start: raw.start,
            end: raw.end || null,
            regDeadline: raw.regDeadline || null,
            url,
            note: raw.note ? String(raw.note).trim() : '',
            _start: start,
            _end: end,
            _reg: reg,
        },
    };
}

// 解析整份数据文件。JSON 本身坏了抛错（readCalendar 捕获后回退上一份好数据）；
// 条目级问题进 skipped 数组（页面上提示站长修数据）。
function loadCalendar(raw) {
    const data = JSON.parse(raw);
    if (typeof data !== 'object' || data === null || !Array.isArray(data.events)) {
        throw new Error('calendar.json 顶层必须是 { "updated": "...", "events": [...] }');
    }
    const seen = new Set();
    const events = [];
    const skipped = [];
    data.events.forEach((rawEvent, index) => {
        const result = validateEvent(rawEvent, index);
        if (!result.ok) {
            skipped.push(`${result.id}：${result.reason}`);
            return;
        }
        if (seen.has(result.event.id)) {
            skipped.push(`${result.event.id}：id 重复，已忽略后一条`);
            return;
        }
        seen.add(result.event.id);
        events.push(result.event);
    });
    events.sort((a, b) => a._start.getTime() - b._start.getTime());
    return {
        updated: typeof data.updated === 'string' ? data.updated : '',
        events,
        skipped,
    };
}

function statusOf(event, now) {
    const start = event._start.getTime();
    const p = cstParts(event._start);
    const end = event._end ? event._end.getTime() : event.allDay || (event.form === 'onsite' && p.hh === 0 && p.mm === 0)
        ? Date.UTC(p.y, p.m - 1, p.d + 1) - CST - 1 : start;
    const t = now.getTime();
    if (t < start) return 'upcoming';
    if (t > end) return 'ended';
    return 'ongoing';
}

// 合并手工日历与平台赛自动条目：自动条目走同一套 validateEvent，
// 与手工条目撞 id 时以手工为准，输出与 loadCalendar 同形（直接喂
// describeEvents）。自动源的坏行静默丢弃——官方赛永远优先。
function mergeCalendar(manual, autoRaw) {
    const events = [...manual.events];
    const skipped = [...manual.skipped];
    const seen = new Set(events.map((event) => event.id));
    const urls = new Set(events.filter((event) => event.url).map((event) => canonicalUrl(event.url)));
    let dropped = 0;
    for (const raw of Array.isArray(autoRaw) ? autoRaw : []) {
        const result = validateEvent(raw, events.length + dropped);
        if (!result.ok || seen.has(result.event.id) || (result.event.url && urls.has(canonicalUrl(result.event.url)))) {
            dropped++;
            continue;
        }
        seen.add(result.event.id);
        if (result.event.url) urls.add(canonicalUrl(result.event.url));
        events.push(result.event);
    }
    events.sort((a, b) => a._start.getTime() - b._start.getTime());
    return { updated: manual.updated, events, skipped, autoDropped: dropped };
}

// 单条赛事的展示 DTO：全部文案服务端算好，模板只做输出（生产 Nunjucks
// 是裁剪版，没有日期运算能力）。
function canonicalUrl(value) {
    try {
        const url = new URL(value);
        const host = url.hostname.toLowerCase().replace(/^www\./, '');
        const pathname = host === 'codeforces.com' ? url.pathname.replace(/^\/contests\//, '/contest/') : url.pathname;
        // Preserve meaningful query parameters on announcement/listing URLs.
        for (const key of [...url.searchParams.keys()]) {
            if (/^utm_|^(fbclid|gclid)$/.test(key)) url.searchParams.delete(key);
        }
        url.searchParams.sort();
        return `${host}${pathname.replace(/\/+$/, '')}${url.search}`;
    } catch { return value; }
}

function selectedTypes({ type = '', types = '' } = {}) {
    const values = String(types || type).split(',').map((value) => value.trim()).filter((value) => TYPES.includes(value));
    return [...new Set(values)];
}

function selectEvents(events, options = {}) {
    const selected = selectedTypes(options);
    const query = String(options.q || '').trim().slice(0, 80).toLocaleLowerCase();
    return events.filter((event) => (!selected.length || selected.includes(event.type))
        && (!query || [event.name, event.location, event.note, TYPE_META[event.type].label].join(' ').toLocaleLowerCase().includes(query)));
}

function describeEvent(event, now) {
    const status = statusOf(event, now);
    const meta = TYPE_META[event.type] || TYPE_META.other;
    const start = event._start;
    const end = event._end;
    let dateText;
    let timeText = '';
    if (event.approx) {
        // 月份级条目：只说年月，不猜具体星期。
        const p = cstParts(start);
        dateText = `${p.y}年${p.m}月`;
    } else if (end && !sameCstDay(start, end)) {
        dateText = `${fmtDate(start)} – ${fmtDate(end)}`;
        if (!event.allDay && (event.form === 'online' || cstParts(start).hh !== 0 || cstParts(start).mm !== 0)) timeText = `${fmtTime(start)} – ${fmtTime(end)}`;
    } else {
        dateText = fmtDate(start);
        // 全天条目按约定写 00:00 开始：不显示时间段，避免刷出"00:00 – 23:59"。
        if (!event.allDay && (event.form === 'online' || cstParts(start).hh !== 0 || cstParts(start).mm !== 0)) {
            timeText = end ? `${fmtTime(start)} – ${fmtTime(end)}` : fmtTime(start);
        }
    }
    let countdownText;
    if (status === 'ongoing') countdownText = event.approx ? '临近 / 进行中' : '进行中';
    else if (status === 'ended') countdownText = '已结束';
    else if (event.approx) countdownText = '日期待公布';
    else {
        const days = cstDayDiff(now, start);
        if (days <= 0) countdownText = '今天开赛';
        else if (days === 1) countdownText = '明天开赛';
        else countdownText = `还有 ${days} 天`;
    }
    let regText = '';
    let regSoon = false;
    if (event._reg) {
        const days = cstDayDiff(now, event._reg);
        if (now.getTime() > event._reg.getTime()) regText = `报名已截止（${fmtDateTime(event._reg)}）`;
        else {
            regText = days <= 3
                ? `报名截止：${fmtDateTime(event._reg)}（剩 ${days} 天）`
                : `报名截止：${fmtDateTime(event._reg)}`;
            regSoon = days <= 3;
        }
    }
    // 地点 + 形式的组合文案：成都 / 线上 / 成都 · 线上
    let placeText = '';
    if (event.location && event.form === 'onsite') placeText = event.location;
    else if (event.location) placeText = `${event.location} · ${FORM_LABELS[event.form]}`;
    else if (event.form !== 'onsite') placeText = FORM_LABELS[event.form];
    return {
        id: event.id,
        name: event.name,
        type: event.type,
        typeLabel: meta.label,
        color: meta.color,
        fg: meta.fg,
        form: event.form,
        formLabel: FORM_LABELS[event.form],
        approx: !!event.approx,
        source: event.source,
        searchText: [event.name, event.location, event.note, meta.label].join(' '),
        placeText,
        url: event.url,
        note: event.note,
        status,
        dateText,
        timeText,
        countdownText,
        regText,
        regSoon,
    };
}

// 全页视图：类型筛选 chips + 三组分桶（进行中 / 即将到来 / 已结束）。
// 未知的 typeFilter 一律当作"全部"（不报错、不空页）。
function describeEvents(parsed, now, typeFilter, options = {}) {
    const filter = TYPES.includes(typeFilter) ? typeFilter : '';
    const currentTypes = selectedTypes({ ...options, type: filter });
    const query = String(options.q || '').trim().slice(0, 80);
    const counts = {};
    for (const event of parsed.events) counts[event.type] = (counts[event.type] || 0) + 1;
    const filters = [{ key: '', label: '全部', count: parsed.events.length }];
    for (const type of TYPES) {
        if (counts[type]) filters.push({ key: type, label: TYPE_META[type].label, count: counts[type] });
    }
    for (const item of filters) {
        item.selected = item.key ? currentTypes.includes(item.key) : !currentTypes.length;
        const nextTypes = !item.key ? [] : item.selected ? currentTypes.filter((value) => value !== item.key) : [...currentTypes, item.key];
        const params = new URLSearchParams();
        if (nextTypes.length) params.set('types', nextTypes.join(','));
        if (query) params.set('q', query);
        item.href = `/calendar${params.size ? `?${params}` : ''}`;
    }
    const ongoing = [];
    const upcoming = [];
    const ended = [];
    for (const event of selectEvents(parsed.events, { ...options, type: filter, q: query })) {
        const dto = describeEvent(event, now);
        if (dto.status === 'ongoing') ongoing.push(dto);
        else if (dto.status === 'upcoming') upcoming.push(dto);
        else ended.push(dto);
    }
    // loadCalendar 已按 start 升序：upcoming/ongoing 天然按开始时间正序，
    // ended 反转后即"最近的在前"。
    ended.reverse();
    return {
        updated: parsed.updated,
        skipped: parsed.skipped,
        filters,
        currentType: filter,
        currentTypes,
        query,
        ongoing,
        upcoming,
        ended,
        total: ongoing.length + upcoming.length + ended.length,
    };
}

module.exports = {
    CST,
    FORM_LABELS,
    TYPES,
    TYPE_META,
    cstDayDiff,
    cstParts,
    describeEvent,
    describeEvents,
    fmtDate,
    fmtDateTime,
    fmtTime,
    loadCalendar,
    mergeCalendar,
    selectEvents,
    selectedTypes,
    sameCstDay,
    statusOf,
    validateEvent,
};
