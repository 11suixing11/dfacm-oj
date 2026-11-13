/* 积分商店纯逻辑层（plugin-dfacm-shop）
 * 难度算法全文移植自 Hydro lib/difficulty.ts（v5.0.7），口径与 rp 脚本一致：
 *   const difficulty = +pdoc.difficulty || difficultyAlgorithm(pdoc.nSubmit, pdoc.nAccept) || 5;
 * 集合与外部模型全部通过参数注入，node:test 用 stub 覆盖，不连真实 Mongo。
 */
import type { Context } from 'hydrooj';
import { RecordModel } from 'hydrooj';
import { randomUUID } from 'node:crypto';
import { withUserLock } from './user-lock';

export { pendingLockCount } from './user-lock';

const _CACHE_INFO = {
    s: 0.0,
    y: 0,
    values: [0.0],
};

function _LOGP(x: number) {
    const sqrtPi = 2.506628274631; // Sqrt[Pi]
    return (2 * Math.exp(-2.0 * (Math.log(x) ** 2))) / x / sqrtPi;
}

function _intergrateEnsureCache(y: number) {
    let lastY = _CACHE_INFO.y;
    if (y <= lastY) return _CACHE_INFO;
    let s = _CACHE_INFO.s;
    const dx = 0.1;
    const dT = 2;
    let x0 = (lastY / dT) * dx;
    while (y > lastY) {
        x0 += dx;
        s += _LOGP(x0) * dx;
        for (let i = 1; i <= dT; i++) _CACHE_INFO.values.push(s);
        lastY += dT;
    }
    _CACHE_INFO.y = lastY;
    _CACHE_INFO.s = s;
    return _CACHE_INFO;
}

_intergrateEnsureCache(10000);

function _integrate(y: number) {
    _intergrateEnsureCache(y);
    return _CACHE_INFO.values[y];
}

function difficultyAlgorithm(nSubmit: number, nAccept: number) {
    if (!nSubmit) return null;
    const s = _integrate(nSubmit);
    const acRate = nAccept / nSubmit;
    const ans = Math.round(10 - 13 * s * acRate);
    return Math.max(ans, 1);
}

// 与 Hydro rp 脚本完全一致的难度取值口径：显式难度优先，缺失时按提交/通过数推导。
export function problemDifficulty(pdoc: { difficulty?: number | null; nSubmit?: number; nAccept?: number } | null) {
    if (!pdoc) return 5;
    return +pdoc.difficulty || difficultyAlgorithm(pdoc.nSubmit, pdoc.nAccept) || 5;
}

export const LEDGER_PAGE_SIZE = 20;

export interface ShopCollections {
    ledger: {
        insertOne(doc: any): Promise<any>;
        find(filter: any): any;
        aggregate(pipeline: any[]): any;
        countDocuments(filter: any): Promise<number>;
    };
    price: {
        findOne(filter: any): Promise<any>;
        updateOne(filter: any, update: any, options?: any): Promise<any>;
    };
    userBadge: {
        findOne(filter: any): Promise<any>;
    };
}

export interface ShopModels {
    badge: {
        badgeGetMulti(ctx: Context): any;
        badgeGet(ctx: Context, id: number): Promise<any>;
    };
    userBadge: {
        userBadgeAdd(ctx: Context, uid: number, badgeId: number): Promise<any>;
        userBadgeGetMulti(ctx: Context, uid: number): any;
    };
    problem: {
        get(domainId: string, pid: number | string): Promise<any>;
    };
}

export function solveRef(domainId: string, docId: number) {
    return `solve:${domainId}:${docId}`;
}

export function redeemRef(badgeId: number) {
    return `redeem:${badgeId}`;
}

// Service accounts whose ACs are judging-infrastructure noise and must never
// credit points. Defaults to the judge account (uid 3 = hydsvc-0074) — the
// same policy the RP sweep applies to its document.status purge — because the
// judge session is routinely used to test the pipeline and its ACs already
// polluted the ledger once (686 points before this guard existed). Empty
// string disables the exclusion entirely; kept per-call so tests can tweak it.
export function serviceUidsFromEnv(env: { SWPU_SERVICE_UIDS?: string } = process.env): number[] {
    const raw = (env.SWPU_SERVICE_UIDS === undefined ? '3' : env.SWPU_SERVICE_UIDS).trim();
    if (!raw) return [];
    const uids = raw.split(',')
        .map((value) => Number.parseInt(value.trim(), 10))
        .filter((n) => Number.isInteger(n) && n > 0);
    return [...new Set(uids)].sort((a, b) => a - b);
}

function isDuplicateKey(e: any) {
    return e && (e as { code?: number }).code === 11000;
}

export interface AwardResult {
    awarded: boolean;
    delta: number;
}

// Both event awards and historical scans must use the same definition of a
// formal AC. Match Hydro's two reserved contests exactly: other contest IDs,
// including IDs with the same zero prefix, still represent formal submissions.
// The event caller additionally requires body.key === 'end'; stored AC records
// in the backfill query have already reached that terminal result.
export function isOfficialAcceptedRecord(rdoc: any): boolean {
    if (!rdoc || rdoc.status !== 1) return false;
    if (!Number.isSafeInteger(rdoc.uid) || rdoc.uid <= 1) return false;
    if (typeof rdoc.domainId !== 'string' || !rdoc.domainId) return false;
    if (!Number.isSafeInteger(rdoc.pid) || rdoc.pid <= 0) return false;
    if (!rdoc.contest) return true;
    const contest = String(rdoc.contest);
    return contest !== String(RecordModel.RECORD_PRETEST)
        && contest !== String(RecordModel.RECORD_GENERATE);
}

// 首次 AC 入账。uid<=1 早退（Guest/系统号；事件路径拿不到 udoc，
// 与 rp 脚本 udoc?.hasPriv(PRIV_USER_PROFILE) 的过滤目标一致）；
// 服务号（SWPU_SERVICE_UIDS，默认判题号 uid 3）不入账——判题链路测试的 AC
// 是基础设施噪声，与 rp-sweep 清 document.status 的治理目标同一口径；
// 自建题（owner===uid）与隐藏题不计分，防刷口径与 rp 脚本相同。
// 幂等由 {uid, ref} 唯一索引兜底：insert 撞重复键静默返回未入账。
export async function awardSolve(
    models: ShopModels,
    collections: ShopCollections,
    now: () => Date,
    entry: { uid: number; domainId: string; docId: number; kind?: 'solve' | 'backfill' },
): Promise<AwardResult> {
    const { uid, domainId, docId } = entry;
    if (!Number.isSafeInteger(uid) || uid <= 1) return { awarded: false, delta: 0 };
    if (serviceUidsFromEnv().includes(uid)) return { awarded: false, delta: 0 };
    if (!domainId || !Number.isSafeInteger(docId) || docId <= 0) return { awarded: false, delta: 0 };
    const pdoc = await models.problem.get(domainId, docId);
    if (!pdoc || pdoc.hidden || pdoc.owner === uid) return { awarded: false, delta: 0 };
    const delta = problemDifficulty(pdoc);
    try {
        await collections.ledger.insertOne({
            uid,
            delta,
            kind: entry.kind || 'solve',
            ref: solveRef(domainId, docId),
            detail: String(pdoc.title || docId),
            ts: now(),
        });
    } catch (e) {
        if (isDuplicateKey(e)) return { awarded: false, delta: 0 };
        throw e;
    }
    return { awarded: true, delta };
}

// 余额 = sum(delta)，aggregation 实时计算；用户量小不做缓存，
// 将来可加 swpuPointsBalance 缓存集合。
export async function getBalance(collections: ShopCollections, uid: number) {
    const rows = await collections.ledger.aggregate([
        { $match: { uid } },
        { $group: { _id: null, total: { $sum: '$delta' } } },
    ]).toArray();
    if (!rows.length) return 0;
    return rows[0].total || 0;
}

export class ShopError extends Error {}

export interface RedeemResult {
    badgeTitle: string;
    price: number;
    refunded: boolean;
}

export function refundRef(badgeId: number) {
    return `refund:${badgeId}`;
}

export interface LedgerDebit {
    uid: number;
    delta: number;
    ref: string;
    operationId: string;
}

// Called only after this operation's debit was acknowledged. The refund key
// derives from that debit's identity, so compensation is both unique and
// auditable. A failed/ambiguous write is never reported as a successful refund.
export async function refundDebit(
    ledger: { insertOne(doc: any): Promise<any> }, now: () => Date,
    debit: LedgerDebit, detail: string, operationError: unknown,
) {
    const link = { uid: debit.uid, operationId: debit.operationId, debitRef: debit.ref };
    try {
        await ledger.insertOne({
            ...link, delta: -debit.delta, kind: 'refund',
            ref: `refund:${debit.operationId}`, detail, ts: now(),
        });
    } catch (refundError) {
        const errors = [operationError, refundError];
        try {
            await ledger.insertOne({
                ...link, delta: 0, kind: 'refund_pending',
                ref: `refund_pending:${debit.operationId}`, detail: `${detail}（退款待核对）`,
                failure: String(refundError), ts: now(),
            });
        } catch (auditError) {
            // If Mongo is unavailable, the original debit still carries the
            // operation ID and this error retains both failed write attempts.
            errors.push(auditError);
        }
        throw new ShopError(`操作失败，积分退款未确认，请联系管理员核对。流水号：${debit.operationId}`, {
            cause: new AggregateError(errors, 'Shop refund requires reconciliation'),
        });
    }
}

// 兑换：未上架/已持有/余额不足各抛业务错误；扣分入账（redeem:{badgeId}
// 唯一键）+ userBadgeAdd 发放。
//
// 顺序刻意是"先扣分、后发徽章"：{uid, ref} 唯一键保证扣分至多发生一次，
// 所以并发重复请求最多变成一次扣分。反过来（先发徽章）一旦扣分失败就会
// 白送徽章。代价是 userBadgeAdd 失败时积分已经扣掉，因此这里写入一条
// refund 冲正流水关联本次扣款；退款失败保留待核对记录。商品退款后的重试
// 仍由原 redeem:{badgeId} 唯一键拒绝，保持现有规则。共享 UID 锁仅限单进程。
export async function redeem(
    ctx: Context,
    models: ShopModels,
    collections: ShopCollections,
    now: () => Date,
    uid: number,
    badgeId: number,
): Promise<RedeemResult> {
    if (!Number.isSafeInteger(uid) || uid <= 0) throw new ShopError('请先登录。');
    if (!Number.isSafeInteger(badgeId) || badgeId <= 0) throw new ShopError('徽章无效。');
    return withUserLock(uid, async () => {
        const priceDoc = await collections.price.findOne({ _id: badgeId });
        if (!priceDoc || !priceDoc.enabled) throw new ShopError('该徽章未上架兑换。');
        const bdoc = await models.badge.badgeGet(ctx, badgeId);
        if (!bdoc) throw new ShopError('徽章不存在。');
        const owned = await collections.userBadge.findOne({ owner: uid, badgeId });
        if (owned) throw new ShopError('你已拥有该徽章，无需重复兑换。');
        const balance = await getBalance(collections, uid);
        const price = +priceDoc.price;
        if (balance < price) throw new ShopError(`积分不足：当前 ${balance} 分，兑换需 ${price} 分。`);
        const debit: LedgerDebit = { uid, delta: -price, ref: redeemRef(badgeId), operationId: randomUUID() };
        try {
            await collections.ledger.insertOne({
                ...debit,
                kind: 'redeem',
                detail: `兑换徽章：${bdoc.title}`,
                ts: now(),
            });
        } catch (e) {
            if (isDuplicateKey(e)) throw new ShopError('你已拥有该徽章，无需重复兑换。');
            throw e;
        }
        try {
            await models.userBadge.userBadgeAdd(ctx, uid, badgeId);
        } catch (e) {
            // The debit already landed; hand the points back so a badge-plugin
            // failure cannot silently destroy them.
            await refundDebit(collections.ledger, now, debit, `兑换失败冲正：${bdoc.title}`, e);
            throw new ShopError('徽章发放失败，积分已退回，请联系管理员。');
        }
        return { badgeTitle: bdoc.title, price, refunded: false };
    });
}

// 流水分页（时间正序前缀和由调用方组装累计余额）。
export async function listLedger(collections: ShopCollections, uid: number, page: number) {
    const total = await collections.ledger.countDocuments({ uid });
    const pages = Math.max(1, Math.ceil(total / LEDGER_PAGE_SIZE));
    const safePage = Number.isSafeInteger(page) && page > 0 ? Math.min(page, pages) : 1;
    const docs = await collections.ledger.find({ uid })
        .sort({ ts: 1 }).skip((safePage - 1) * LEDGER_PAGE_SIZE).limit(LEDGER_PAGE_SIZE).toArray();
    return { page: safePage, pages, total, docs };
}

// 管理端：定价 + 上下架（upsert）。
export async function setPrice(collections: ShopCollections, now: () => Date, badgeId: number, price: number, enabled: boolean) {
    if (!Number.isSafeInteger(badgeId) || badgeId <= 0) throw new ShopError('徽章无效。');
    if (!Number.isSafeInteger(price) || price <= 0) throw new ShopError('价格必须是正整数。');
    await collections.price.updateOne(
        { _id: badgeId },
        { $set: { price, enabled: !!enabled, updatedAt: now() } },
        { upsert: true },
    );
}
