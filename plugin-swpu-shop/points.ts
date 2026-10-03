/* 积分商店纯逻辑层（plugin-swpu-shop）
 * 难度算法全文移植自 Hydro lib/difficulty.ts（v5.0.7），口径与 rp 脚本一致：
 *   const difficulty = +pdoc.difficulty || difficultyAlgorithm(pdoc.nSubmit, pdoc.nAccept) || 5;
 * 集合与外部模型全部通过参数注入，node:test 用 stub 覆盖，不连真实 Mongo。
 */
import type { Context } from 'hydrooj';

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

function isDuplicateKey(e: any) {
    return e && (e as { code?: number }).code === 11000;
}

export interface AwardResult {
    awarded: boolean;
    delta: number;
}

// 首次 AC 入账。uid<=1 早退（Guest/系统号；事件路径拿不到 udoc，
// 与 rp 脚本 udoc?.hasPriv(PRIV_USER_PROFILE) 的过滤目标一致）；
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
}

// 兑换：未上架/已持有/余额不足各抛业务错误；扣分入账（redeem:{badgeId}
// 唯一键）+ userBadgeAdd 发放。
// 并发说明：单实例 pm2 + ledger 唯一键，双花只剩"两请求同时过余额检查"
// 的窄窗口，v1 接受（用户量级极小）；未来可升级 Mongo transaction。
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
    const priceDoc = await collections.price.findOne({ _id: badgeId });
    if (!priceDoc || !priceDoc.enabled) throw new ShopError('该徽章未上架兑换。');
    const bdoc = await models.badge.badgeGet(ctx, badgeId);
    if (!bdoc) throw new ShopError('徽章不存在。');
    const owned = await collections.userBadge.findOne({ owner: uid, badgeId });
    if (owned) throw new ShopError('你已拥有该徽章，无需重复兑换。');
    const balance = await getBalance(collections, uid);
    const price = +priceDoc.price;
    if (balance < price) throw new ShopError(`积分不足：当前 ${balance} 分，兑换需 ${price} 分。`);
    try {
        await collections.ledger.insertOne({
            uid,
            delta: -price,
            kind: 'redeem',
            ref: redeemRef(badgeId),
            detail: `兑换徽章：${bdoc.title}`,
            ts: now(),
        });
    } catch (e) {
        if (isDuplicateKey(e)) throw new ShopError('你已拥有该徽章，无需重复兑换。');
        throw e;
    }
    await models.userBadge.userBadgeAdd(ctx, uid, badgeId);
    return { badgeTitle: bdoc.title, price };
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
