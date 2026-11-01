/* swpu-calendar — d&f算法网赛事日历，保留历史 addon 名兼容现网。
 * /calendar 赛事清单，/calendar/data 兼容 QQ 只读数据，/calendar/feed.ics 订阅。
 * 手工 calendar.json 每次现读，坏文件回退；CF / AtCoder / CLIST 独立缓存和后台刷新。
 * 固定浏览器资源经 /calendar/assets/:file 白名单提供，CLIST 凭据仅留在服务器。
 */
import fs from 'fs';
import { join } from 'path';
import { Context, Handler, Logger, param, SettingModel, SystemModel, Types } from 'hydrooj';

const { loadCalendar, mergeCalendar } = require('./calendar.cjs');
const { getAutoEvents, getAutoStatus, warmup } = require('./auto.cjs');
const { createClistSource } = require('./clist.cjs');
const { getAiEvents, getAiStatus, warmupAi } = require('./ai.cjs');
const { filterParams } = require('./calendar.cjs');
const { pageData, buildIcs, buildRss } = require('./presentation.cjs');

const logger = new Logger('swpu-calendar');

// SWPU_CALENDAR_FILE 供运维指向临时数据文件排障（默认随插件目录）。
const DATA_FILE = process.env.SWPU_CALENDAR_FILE || join(__dirname, 'calendar.json');
const ASSETS = new Map([
    ['calendar-1.37.1.js', ['public/calendar.js', 'application/javascript; charset=utf-8']],
    ['calendar-1.37.1.css', ['public/calendar.css', 'text/css; charset=utf-8']],
]);
const clist = createClistSource({ credentials: () => ({
    username: SystemModel.get('dfacm_calendar.clist_username'),
    key: SystemModel.get('dfacm_calendar.clist_api_key'),
}) });

async function currentCalendar() {
    const parsed = readCalendar();
    const [auto, extra, ai] = await Promise.all([getAutoEvents(), clist.get(), getAiEvents()]);
    return { ...mergeCalendar(parsed, [...auto, ...extra, ...ai]), broken: parsed.broken };
}

function sources() { return [...getAutoStatus(), clist.status(), getAiStatus()]; }

function requestOptions(args: any = {}) {
    return Object.fromEntries(['type', 'types', 'q', 'scope', 'interests', 'source', 'status', 'sort']
        .map((key) => [key, String(args[key] || '').slice(0, key === 'q' ? 80 : 240)]));
}

function legacyOptions(args: any = {}, feed = false) {
    const options = requestOptions(args);
    const category = String(args.category || '');
    if (!options.types && !options.type && ['datascience', 'aigc', 'llm_agent', 'hackathon'].includes(category)) options.types = category;
    if (category === 'other') options.types = 'ai_other';
    if (['vibe-coding', 'agent'].includes(category)) options.interests = category;
    if (category === 'oj') options.scope = 'algorithm';
    if (options.source === 'codeforces') options.source = 'cf';
    if (feed && !options.status) options.status = 'active';
    return options;
}

function legacyRedirect(handler: Handler, address: string) {
    // Hydro 5's response.redirect always sends 302. A raw response preserves
    // the permanent status for existing bookmarks and calendar subscribers.
    handler.response.status = 308;
    handler.response.addHeader('Location', address);
    handler.response.type = 'text/plain; charset=utf-8';
    handler.response.body = `Moved to ${address}`;
}

type ParsedCalendar = { updated: string; events: any[]; skipped: string[] };

let lastGood: ParsedCalendar | null = null;

function readCalendar(): ParsedCalendar & { broken: boolean } {
    try {
        const parsed = loadCalendar(fs.readFileSync(DATA_FILE, 'utf-8'));
        lastGood = parsed;
        return { ...parsed, broken: false };
    } catch (e) {
        // 站长改数据文件时手滑是常态：宁可服务上一份好数据 + 页面提示，
        // 也不能让整页 500。
        logger.error('calendar.json 解析失败，回退上一份好数据:', e);
        if (lastGood) return { ...lastGood, broken: true };
        return { updated: '', events: [], skipped: [], broken: true };
    }
}

class CalendarPageHandler extends Handler {
    noCheckPermView = true;
    @param('type', Types.String, true)
    @param('types', Types.String, true)
    @param('q', Types.String, true)
    async get(domainId: string, type = '', types = '', q = '') {
        const merged = await currentCalendar();
        const now = new Date();
        this.response.body = {
            ...pageData(merged, now, { ...requestOptions(this.args), type, types, q }, sources()), broken: merged.broken, page_name: 'swpu_calendar',
        };
        this.response.template = 'calendar.html';
    }
}

class CalendarDataHandler extends Handler {
    noCheckPermView = true;
    async get() {
        // 公开情报页面的 JSON 镜像：内容与日历页一致，无任何敏感字段。
        // 机器人低频轮询 + 全站共享一个限速桶即可。
        await this.limitRate('swpu_calendar_data', 60, 120, 'public');
        const merged = await currentCalendar();
        this.response.body = {
            ok: !merged.broken,
            updated: merged.updated,
            generatedAt: new Date().toISOString(),
            sources: sources(),
            events: merged.events.map((event: any) => ({
                id: event.id,
                name: event.name,
                type: event.type,
                form: event.form,
                approx: !!event.approx,
                allDay: !!event.allDay,
                source: event.source,
                sources: event.sources,
                dateUnknown: event.dateUnknown,
                openEnded: event.openEnded,
                tags: event.tags,
                organizer: event.organizer,
                prizeText: event.prizeText,
                prizeAmount: event.prizeAmount,
                currency: event.currency,
                teamsCount: event.teamsCount,
                firstSeenAt: event.firstSeenAt,
                location: event.location,
                start: event.start,
                end: event.end,
                regDeadline: event.regDeadline,
                url: event.url,
                note: event.note,
            })),
        };
    }
}

class CalendarFeedHandler extends Handler {
    noCheckPermView = true;
    async get() {
        await this.limitRate('swpu_calendar_feed', 60, 120, 'public');
        const merged = await currentCalendar();
        this.response.type = 'text/calendar; charset=utf-8';
        this.response.addHeader('Cache-Control', 'public, max-age=300');
        this.response.disposition = 'inline; filename="dfacm-contests.ics"';
        this.response.body = buildIcs(merged, requestOptions(this.args));
    }
}

class CalendarRssHandler extends Handler {
    noCheckPermView = true;
    async get() {
        await this.limitRate('swpu_calendar_feed', 60, 120, 'public');
        this.response.type = 'application/rss+xml; charset=utf-8';
        this.response.addHeader('Cache-Control', 'public, max-age=300');
        this.response.body = buildRss(await currentCalendar(), requestOptions(this.args));
    }
}

class LegacyAiPageHandler extends Handler {
    noCheckPermView = true;
    async get() {
        const params = filterParams(legacyOptions(this.args));
        legacyRedirect(this, `/calendar${params.size ? `?${params}` : ''}`);
    }
}

class LegacyAiIcsHandler extends Handler {
    noCheckPermView = true;
    async get() {
        const params = filterParams(legacyOptions(this.args, true));
        legacyRedirect(this, `/calendar/feed.ics${params.size ? `?${params}` : ''}`);
    }
}

class LegacyAiRssHandler extends Handler {
    noCheckPermView = true;
    async get() {
        const params = filterParams(legacyOptions(this.args, true));
        legacyRedirect(this, `/calendar/feed.xml${params.size ? `?${params}` : ''}`);
    }
}

class CalendarAssetHandler extends Handler {
    noCheckPermView = true;
    @param('file', Types.String)
    async get(domainId: string, file: string) {
        const asset = ASSETS.get(file);
        if (!asset) { this.response.status = 404; this.response.body = 'Not found'; return; }
        this.response.type = asset[1];
        this.response.addHeader('Cache-Control', 'public, max-age=604800, immutable');
        this.response.body = fs.readFileSync(join(__dirname, asset[0]), 'utf-8');
    }
}

export async function apply(ctx: Context) {
    const { Setting, SystemSetting, FLAG_SECRET } = SettingModel;
    // Hydro's native settings form expands dots, but its save handler visits
    // only one nested level. Keep exactly one dot in these setting keys.
    ctx.effect(() => SystemSetting(
        Setting('setting_swpu_calendar', 'dfacm_calendar.clist_username', '', 'text',
            'CLIST 用户名', '填写 CLIST 账号用户名；与 API Key 配对后自动同步牛客、洛谷、LeetCode、CodeChef。', 0),
        Setting('setting_swpu_calendar', 'dfacm_calendar.clist_api_key', '', 'password',
            'CLIST API Key', '在 clist.by 登录后取得。仅用于服务器请求，保存后不回显；此处留空保留原 Key，清空用户名可关闭同步。', FLAG_SECRET),
    ));
    ctx.Route('swpu_calendar', '/calendar', CalendarPageHandler);
    ctx.Route('swpu_calendar_data', '/calendar/data', CalendarDataHandler);
    ctx.Route('swpu_calendar_feed', '/calendar/feed.ics', CalendarFeedHandler);
    ctx.Route('swpu_calendar_rss', '/calendar/feed.xml', CalendarRssHandler);
    ctx.Route('swpu_calendar_asset', '/calendar/assets/:file', CalendarAssetHandler);
    ctx.Route('dfacm_ai_contests', '/ai-contests', LegacyAiPageHandler);
    ctx.Route('dfacm_ai_contests_calendar', '/ai-contests/calendar', LegacyAiPageHandler);
    ctx.Route('dfacm_ai_contests_ics', '/ai-contests/feed.ics', LegacyAiIcsHandler);
    ctx.Route('dfacm_ai_contests_rss', '/ai-contests/feed.xml', LegacyAiRssHandler);
    // 赛事情报对游客也有价值：注入不传 priv，全站可见；before: 'ranking'
    // 让它落在「评测记录」旁（与工作台/错题本同款定位法）。
    // 注入名必须与 ctx.Route 第一参同名：ui-default 用 url(item.name) 生成
    // href，名字对不上路由表会渲染出字面量错误串（2026-10-13 的老 bug）。
    ctx.injectUI('Nav', 'swpu_calendar', { prefix: 'calendar', before: 'ranking' });
    ctx.i18n.load('zh', { swpu_calendar: '赛事日历', setting_swpu_calendar: '赛事日历' });
    ctx.i18n.load('en', { swpu_calendar: 'Contest Calendar' });
    // 启动预热平台赛缓存：加载几秒后首批访客就能看到 CF/AtCoder；
    // 预热失败与后续刷新失败一样，只影响平台区块，官方日历无感。
    warmup();
    warmupAi();
    clist.get().catch(() => {});
    logger.info('swpu-calendar routes ready: /calendar, /calendar/data, /calendar/feed.ics, /calendar/feed.xml');
}
