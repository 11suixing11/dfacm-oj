/* swpu-train — 个人训练工作台 + 错题复习（d&f算法网定制插件；目录名保留 swpu 以兼容现网）
 * GET  /workbench            训练工作台页面（当前路线 / 下一题 / 本周进度 / 最近未通过）
 * GET  /workbench/data       工作台 JSON 数据
 * GET  /mistakes             错题本页面
 * GET  /mistakes/data        错题列表 JSON（filter: open|done|all, page）
 * POST /mistakes/update      {pid, reason?, note?, resolved?}  保存错误原因 / 复盘笔记 / 补题状态
 * POST /mistakes/remove      {pid}  从错题本移除
 * POST /mistakes/sync        手动回填近期未 AC 记录（每用户每分钟一次）
 */
import fs from 'fs';
import { join } from 'path';
import { randomBytes, timingSafeEqual } from 'crypto';
import {
    Context, db, Handler, Logger, param, post, PRIV, ProblemModel, RecordModel, Time, TrainingModel, Types,
} from 'hydrooj';
const {
    BACKFILL_SCAN_DEFAULT, createMistakeStore, NOTE_MAX_LENGTH, REASONS,
} = require('./mistakes.cjs');
const {
    buildWorkbench, FAILED_STATUSES, STATUS_LABELS, STATUS_TEXTS,
} = require('./workbench.cjs');

const logger = new Logger('swpu-train');
const mistakes = createMistakeStore(db.collection('swpu_train' as any));

const WORKBENCH_PAGE = fs.readFileSync(join(__dirname, 'workbench.html'), 'utf-8');
const MISTAKES_PAGE = fs.readFileSync(join(__dirname, 'mistakes.html'), 'utf-8');

const WEEKLY_SCAN_LIMIT = 2000;
const RECENT_SCAN_LIMIT = 60;
const RECENT_LIMIT = 8;
const MAX_TRAININGS = 3;

// --- CSRF -----------------------------------------------------------------
// /mistakes/update, /mistakes/remove and /mistakes/sync all change state for
// the signed-in member using nothing but the session cookie. Hydro sessions are
// plain mutable objects (regcode's loginAs sets viewLang, oauthBind and sudo on
// the same one), so the token is minted there and only its value reaches the
// page. Defined locally because each addon ships as an independent directory.
const CSRF_SESSION_KEY = 'swpuTrainCsrf';
const CSRF_MARKER = '/*__SWPU_CSRF__*/';

function csrfToken(handler: Handler): string {
    const session = handler.session;
    if (!session) return '';
    const existing = session[CSRF_SESSION_KEY];
    if (typeof existing === 'string' && existing.length === 64) return existing;
    const token = randomBytes(32).toString('hex');
    session[CSRF_SESSION_KEY] = token;
    return token;
}

function csrfRejected(handler: Handler, sent: unknown): boolean {
    const expected = handler.session && handler.session[CSRF_SESSION_KEY];
    if (typeof expected !== 'string' || typeof sent !== 'string') return true;
    const a = Buffer.from(sent);
    const b = Buffer.from(expected);
    return a.length === 0 || a.length !== b.length || !timingSafeEqual(a, b);
}

function servePage(handler: Handler, page: string) {
    // Only /mistakes mutates, and only that page carries the marker, so a
    // read-only page mints no token at all. The replacement is a hex token, but
    // a function replacer keeps that guarantee local.
    let body = page;
    if (page.includes(CSRF_MARKER)) {
        body = page.replace(CSRF_MARKER, () => `window.__SWPU_CSRF__=${JSON.stringify(csrfToken(handler))};`);
    }
    handler.response.body = body;
    handler.response.type = 'text/html; charset=utf-8';
    handler.response.addHeader('Cache-Control', 'no-store');
}

async function weeklyRecords(domainId: string, uid: number, weekStart: Date) {
    const sinceId = Time.getObjectID(weekStart);
    const docs = await RecordModel.getMulti(domainId, {
        uid, contest: null, _id: { $gte: sinceId },
    }).project({ pid: 1, status: 1 }).limit(WEEKLY_SCAN_LIMIT).toArray();
    return docs.map((doc) => ({ pid: doc.pid, status: doc.status, at: doc._id.getTimestamp() }));
}

async function recentFailedRecords(domainId: string, uid: number) {
    const docs = await RecordModel.getMulti(domainId, {
        uid, contest: null, status: { $in: [...FAILED_STATUSES] },
    }).sort({ _id: -1 }).project({ pid: 1, status: 1 }).limit(RECENT_SCAN_LIMIT).toArray();
    return docs.map((doc) => ({
        pid: doc.pid, status: doc.status, rid: doc._id, at: doc._id.getTimestamp(),
    }));
}

// Backfill only covers recent non-contest submissions (contest: null keeps the
// query on the {domainId,contest,uid,_id} index); live collection after
// installation also covers contest finals.
async function runBackfill(domainId: string, uid: number) {
    const docs = await RecordModel.getMulti(domainId, {
        uid, contest: null, status: { $in: [...FAILED_STATUSES] },
    }).sort({ _id: -1 }).project({ pid: 1, status: 1 }).limit(BACKFILL_SCAN_DEFAULT).toArray();
    const records = docs.map((doc) => ({
        pid: doc.pid, status: doc.status, rid: doc._id, at: doc._id.getTimestamp(),
    }));
    const pids = [...new Set(records.map((record) => record.pid))];
    const psdocs = pids.length ? await ProblemModel.getListStatus(domainId, uid, pids) : {};
    const acPids = new Set(pids.filter((pid) => psdocs[pid] && psdocs[pid].status === 1));
    return mistakes.backfill(domainId, uid, records, acPids);
}

class WorkbenchPageHandler extends Handler {
    async get() { servePage(this, WORKBENCH_PAGE); }
}

class WorkbenchDataHandler extends Handler {
    async get(domainId: string) {
        await this.limitRate('swpu_train_data', 60, 30, `u${this.user._id}`);
        const now = new Date();
        const data = await buildWorkbench({
            domainId,
            uid: this.user._id,
            uname: this.user.uname,
            trainingModel: TrainingModel,
            problemModel: ProblemModel,
            records: {
                weekly: (weekStart: Date) => weeklyRecords(domainId, this.user._id, weekStart),
                recentFailed: () => recentFailedRecords(domainId, this.user._id),
            },
            openMistakes: await mistakes.countOpen(domainId, this.user._id),
            now,
            maxTrainings: MAX_TRAININGS,
            recentLimit: RECENT_LIMIT,
        });
        this.response.body = { ok: true, data };
    }
}

function mistakeDto(doc: any, pdocs: Record<number, any>) {
    const pdoc = pdocs[doc.pid];
    const available = !!pdoc && pdoc.docId === doc.pid;
    return {
        pid: doc.pid,
        title: available ? pdoc.title : `#${doc.pid}（不可见或已删除）`,
        url: available ? `/p/${pdoc.pid || doc.pid}` : null,
        status: doc.status,
        statusLabel: STATUS_LABELS[doc.status] || String(doc.status ?? ''),
        statusText: STATUS_TEXTS[doc.status] || '未通过',
        attempts: doc.attempts || 1,
        reason: doc.reason || '',
        note: doc.note || '',
        resolved: !!doc.resolved,
        firstAt: doc.firstAt instanceof Date ? doc.firstAt.toISOString() : null,
        lastAt: doc.lastAt instanceof Date ? doc.lastAt.toISOString() : null,
        recordUrl: doc.rid ? `/record/${doc.rid}` : null,
        resolvedAt: doc.resolvedAt instanceof Date ? doc.resolvedAt.toISOString() : null,
    };
}

class MistakesPageHandler extends Handler {
    async get() { servePage(this, MISTAKES_PAGE); }
}

class MistakesDataHandler extends Handler {
    @param('filter', Types.String, true)
    @param('page', Types.UnsignedInt, true)
    async get(domainId: string, filter = 'open', page = 1) {
        await this.limitRate('swpu_train_data', 60, 30, `u${this.user._id}`);
        if (!await mistakes.isSynced(domainId, this.user._id)) {
            try {
                await runBackfill(domainId, this.user._id);
            } catch (e) {
                logger.error('first-visit backfill failed:', e);
            }
        }
        const result = await mistakes.list(domainId, this.user._id, { filter, page });
        const pids = result.items.map((doc: any) => doc.pid);
        const pdocs = pids.length ? await ProblemModel.getList(domainId, pids, this.user._id, false) : {};
        this.response.body = {
            ok: true,
            filter: result.filter,
            page: result.page,
            pages: result.pages,
            pageSize: result.pageSize,
            total: result.total,
            open: await mistakes.countOpen(domainId, this.user._id),
            reasons: REASONS,
            noteMaxLength: NOTE_MAX_LENGTH,
            items: result.items.map((doc: any) => mistakeDto(doc, pdocs)),
        };
    }
}

class MistakesUpdateHandler extends Handler {
    @post('pid', Types.UnsignedInt)
    @post('reason', Types.String, true)
    @post('note', Types.String, true)
    @post('resolved', Types.Boolean, true)
    @post('csrf', Types.String, true)
    async post(domainId: string, pid: number, reason?: string, note?: string, resolved?: boolean, csrf?: string) {
        if (csrfRejected(this, csrf)) { this.response.body = { ok: false, message: '会话已过期，请刷新页面后重试。' }; return; }
        await this.limitRate('swpu_train_update', 60, 30, `u${this.user._id}`);
        const patch: { reason?: string; note?: string; resolved?: boolean } = {};
        if (reason !== undefined) patch.reason = reason;
        if (note !== undefined) patch.note = note;
        if (resolved !== undefined) patch.resolved = resolved;
        try {
            if (!await mistakes.update(domainId, this.user._id, pid, patch)) {
                this.response.body = { ok: false, message: '这道题不在你的错题本里。' };
                return;
            }
            this.response.body = { ok: true };
        } catch (e) {
            this.response.body = { ok: false, message: (e as Error).message };
        }
    }
}

class MistakesRemoveHandler extends Handler {
    @post('pid', Types.UnsignedInt)
    @post('csrf', Types.String, true)
    async post(domainId: string, pid: number, csrf?: string) {
        if (csrfRejected(this, csrf)) { this.response.body = { ok: false, message: '会话已过期，请刷新页面后重试。' }; return; }
        await this.limitRate('swpu_train_update', 60, 30, `u${this.user._id}`);
        try {
            // remove() reports whether a row actually went away; answering ok
            // regardless would claim a deletion that never happened.
            if (!await mistakes.remove(domainId, this.user._id, pid)) {
                this.response.body = { ok: false, message: '该题不在你的错题本中，无需删除。' };
                return;
            }
            this.response.body = { ok: true };
        } catch (e) {
            this.response.body = { ok: false, message: (e as Error).message };
        }
    }
}

class MistakesSyncHandler extends Handler {
    @post('csrf', Types.String, true)
    async post(domainId: string, csrf?: string) {
        if (csrfRejected(this, csrf)) { this.response.body = { ok: false, message: '会话已过期，请刷新页面后重试。' }; return; }
        await this.limitRate('swpu_train_sync', 60, 1, `u${this.user._id}`);
        try {
            const result = await runBackfill(domainId, this.user._id);
            this.response.body = { ok: true, ...result };
        } catch (e) {
            this.response.body = { ok: false, message: `同步失败：${(e as Error).message}` };
        }
    }
}

export const inject = ['db'];

export async function apply(ctx: Context) {
    await db.ensureIndexes(
        db.collection('swpu_train' as any),
        { key: { domainId: 1, uid: 1, pid: 1 }, name: 'target', unique: true },
        { key: { domainId: 1, uid: 1, resolved: 1, lastAt: -1 }, name: 'list' },
    );
    ctx.Route('swpu_workbench', '/workbench', WorkbenchPageHandler, PRIV.PRIV_USER_PROFILE);
    ctx.Route('swpu_workbench_data', '/workbench/data', WorkbenchDataHandler, PRIV.PRIV_USER_PROFILE);
    ctx.Route('swpu_mistakes', '/mistakes', MistakesPageHandler, PRIV.PRIV_USER_PROFILE);
    ctx.Route('swpu_mistakes_data', '/mistakes/data', MistakesDataHandler, PRIV.PRIV_USER_PROFILE);
    ctx.Route('swpu_mistakes_update', '/mistakes/update', MistakesUpdateHandler, PRIV.PRIV_USER_PROFILE);
    ctx.Route('swpu_mistakes_remove', '/mistakes/remove', MistakesRemoveHandler, PRIV.PRIV_USER_PROFILE);
    ctx.Route('swpu_mistakes_sync', '/mistakes/sync', MistakesSyncHandler, PRIV.PRIV_USER_PROFILE);
    ctx.injectUI('Nav', 'swpu_workbench', { prefix: 'workbench' }, PRIV.PRIV_USER_PROFILE);
    ctx.injectUI('Nav', 'swpu_mistakes', { prefix: 'mistakes' }, PRIV.PRIV_USER_PROFILE);
    ctx.i18n.load('zh', { swpu_workbench: '工作台', swpu_mistakes: '错题本' });
    ctx.i18n.load('en', { swpu_workbench: 'Workbench', swpu_mistakes: 'Mistakes' });
    // Collect judged results into each user's mistake book. pm2 instance 0 only:
    // a second instance would double-count attempts on the same record.
    if (process.env.SWPU_TRAIN_MISTAKES !== '0'
        && (!process.env.NODE_APP_INSTANCE || process.env.NODE_APP_INSTANCE === '0')) {
        ctx.on('record/change', (rdoc: any, _set: any, _push: any, body: any) => {
            mistakes.onRecordChange(rdoc, body).catch((e) => logger.error('mistake collect failed:', e));
        });
    }
    logger.info('swpu-train routes ready: /workbench, /mistakes');
}
