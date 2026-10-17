/* swpu-calendar — XCPC 赛事日历（d&f算法网定制插件；仓库目录名 dfacm，服务器 addon 目录保留 swpu- 前缀以兼容现网）
 * GET  /calendar        赛事日历页（游客可看）：进行中 / 即将到来 / 已结束 三组，支持 ?type= 按类型筛选
 * GET  /calendar/data   日历 JSON 端点（QQ 播报机器人的只读数据源，公开、限速）
 *
 * 数据两路：
 * 1. 本目录 calendar.json，站长手动维护。每次请求现读磁盘：更新赛程只需
 *    改文件 + deploy.sh --sync-only，无需重启进程；文件解析失败回退上一份
 *    好数据并在页面提示，绝不 500。
 * 2. auto.cjs 自动抓取平台赛（Codeforces / AtCoder），磁盘缓存 + 后台刷新，
 *    与官方赛合并进同一条时间轴；抓取失败只是平台区块缺席，官方日历不受影响。
 */
import fs from 'fs';
import { join } from 'path';
import { Context, Handler, Logger, param, Types } from 'hydrooj';

const { describeEvents, loadCalendar, mergeCalendar } = require('./calendar.cjs');
const { getAutoEvents, warmup } = require('./auto.cjs');

const logger = new Logger('swpu-calendar');

// SWPU_CALENDAR_FILE 供运维指向临时数据文件排障（默认随插件目录）。
const DATA_FILE = process.env.SWPU_CALENDAR_FILE || join(__dirname, 'calendar.json');

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
    async get(domainId: string, type = '') {
        const parsed = readCalendar();
        // 平台自动条目与官方赛同一条时间轴（auto.cjs 磁盘水合毫秒级直接
        // await；外网刷新永远在后台，渲染永不被它阻塞）。
        const merged = mergeCalendar(parsed, await getAutoEvents());
        this.response.body = { ...describeEvents(merged, new Date(), type), broken: parsed.broken };
        this.response.template = 'calendar.html';
    }
}

class CalendarDataHandler extends Handler {
    noCheckPermView = true;
    async get() {
        // 公开情报页面的 JSON 镜像：内容与日历页一致，无任何敏感字段。
        // 机器人低频轮询 + 全站共享一个限速桶即可。
        await this.limitRate('swpu_calendar_data', 60, 120, 'public');
        const parsed = readCalendar();
        const merged = mergeCalendar(parsed, await getAutoEvents());
        this.response.body = {
            ok: !parsed.broken,
            updated: parsed.updated,
            generatedAt: new Date().toISOString(),
            events: merged.events.map((event: any) => ({
                id: event.id,
                name: event.name,
                type: event.type,
                form: event.form,
                approx: !!event.approx,
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

export async function apply(ctx: Context) {
    ctx.Route('swpu_calendar', '/calendar', CalendarPageHandler);
    ctx.Route('swpu_calendar_data', '/calendar/data', CalendarDataHandler);
    // 赛事情报对游客也有价值：注入不传 priv，全站可见；before: 'ranking'
    // 让它落在「评测记录」旁（与工作台/错题本同款定位法）。
    // 注入名必须与 ctx.Route 第一参同名：ui-default 用 url(item.name) 生成
    // href，名字对不上路由表会渲染出字面量错误串（2026-10-13 的老 bug）。
    ctx.injectUI('Nav', 'swpu_calendar', { prefix: 'calendar', before: 'ranking' });
    ctx.i18n.load('zh', { swpu_calendar: '赛事日历' });
    ctx.i18n.load('en', { swpu_calendar: 'Contest Calendar' });
    // 启动预热平台赛缓存：加载几秒后首批访客就能看到 CF/AtCoder；
    // 预热失败与后续刷新失败一样，只影响平台区块，官方日历无感。
    warmup();
    logger.info('swpu-calendar routes ready: /calendar, /calendar/data');
}
