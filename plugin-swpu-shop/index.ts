/* swpu-shop — 积分商店（SWPU ACM 定制插件）
 * GET  /shop            商店页：上架徽章列表（游客可看）
 * POST /shop/redeem     {badgeId} 花积分兑换徽章（badge-for-hydrooj 持有链路）
 * GET  /shop/history    我的积分流水（分页 20/页，时间正序累计余额）
 * GET  /manage/shop     徽章定价管理（域管理员）
 * POST /manage/shop     operation=price {badgeId, price, enabled}
 * 事件 record/change：首次 AC 按难度入账（幂等键 solve:{domainId}:{docId}）
 * 脚本 swpuShopBackfill：回填历史 AC（kind=backfill，可与事件互不冲突重复跑）
 */
import {
    Context, db, Handler, Logger, param, post, PRIV, RecordModel, Schema, Types,
} from 'hydrooj';
import {
    LEDGER_PAGE_SIZE, awardSolve, getBalance, listLedger, problemDifficulty,
    redeem, setPrice, ShopError,
} from './points';

const logger = new Logger('swpu-shop');

const STATUS_ACCEPTED = 1;
// badge-for-hydrooj 把模型挂在 global.Hydro.model；只调用，绝不 fork。
function badgeModels() {
    const hydro = global as unknown as {
        Hydro?: { model?: { badge?: any; userBadge?: any } };
    };
    return {
        badge: hydro.Hydro?.model?.badge,
        userBadge: hydro.Hydro?.model?.userBadge,
    };
}

const ledger = db.collection('swpuPointsLedger' as any);
const price = db.collection('swpuBadgePrice' as any);

function collections() {
    return {
        ledger,
        price,
        userBadge: db.collection('userBadge' as any),
    };
}

const now = () => new Date();

class ShopPageHandler extends Handler {
    noCheckPermView = true;
    async get() {
        const models = badgeModels();
        const rows: any[] = [];
        if (models.badge) {
            // badge-for-hydrooj 的模型函数内部访问 ctx.db：必须传 Handler 的路由
            // 上下文（this.ctx），Handler 实例本身没有 db 服务。
            // 其模型是 async 函数返回 Promise<cursor>，需要双层 await（与其自身
            // handler 的 await (await BadgeModel.badgeGetMulti(this.ctx)) 一致）。
            const bdocs = await (await models.badge.badgeGetMulti(this.ctx)).toArray();
            const priceDocs = await price.find({}).toArray();
            const priceMap = new Map(priceDocs.map((doc: any) => [doc._id, doc]));
            for (const bdoc of bdocs) {
                const priceDoc = priceMap.get(bdoc._id);
                rows.push({
                    _id: bdoc._id,
                    short: bdoc.short || '',
                    title: bdoc.title || '',
                    backgroundColor: bdoc.backgroundColor || '#2a5caa',
                    fontColor: bdoc.fontColor || '#ffffff',
                    price: priceDoc ? +priceDoc.price : 0,
                    enabled: !!priceDoc?.enabled,
                });
            }
            rows.sort((a, b) => Number(b.enabled) - Number(a.enabled) || b.price - a.price || a._id - b._id);
        }
        const signedIn = this.user._id > 0 && this.user.hasPriv(PRIV.PRIV_USER_PROFILE);
        let balance = null;
        let ownedIds = new Set<number>();
        if (signedIn) {
            balance = await getBalance(collections(), this.user._id);
            if (models.userBadge) {
                const owned = await (await models.userBadge.userBadgeGetMulti(this.ctx, this.user._id)).toArray();
                ownedIds = new Set(owned.map((doc: any) => doc.badgeId));
            }
        }
        this.response.body = {
            _id: this.user._id,
            uname: this.user.uname,
            signedIn,
            balance,
            // Echoed back by a failed form POST so the member sees why.
            error: shopError(this),
            badges: rows.map((row) => ({ ...row, owned: ownedIds.has(row._id) })),
        };
        this.response.template = 'shop.html';
    }
}

// A ShopError carries a message meant for the member ("积分不足：当前 12 分，
// 兑换需 50 分。"). Uncaught it became a generic 500 and the text was lost.
//
// Both clients are plain HTML form POSTs, so a JSON body is never rendered —
// Koa's redirect wins and the browser would only ever see raw JSON. The member
// is sent back to the page they came from with the message in the query string,
// which the GET handler hands to the template. Unexpected errors are re-thrown
// untouched: they are bugs and must still surface as 500s.
function failShop(handler: Handler, e: unknown, back: string): never {
    if (!(e instanceof ShopError)) throw e;
    handler.response.body = { ok: false, message: e.message };
    handler.response.redirect = `${back}?error=${encodeURIComponent(e.message)}`;
    throw e;
}

// The reason a failed form POST bounced back, capped and type-checked because it
// arrives from the query string.
function shopError(handler: Handler): string {
    const raw = handler.args && handler.args.error;
    return typeof raw === 'string' ? raw.slice(0, 200) : '';
}

class ShopRedeemHandler extends Handler {
    @post('badgeId', Types.PositiveInt)
    async post(domainId: string, badgeId: number) {
        const models = badgeModels();
        if (!models.badge || !models.userBadge) {
            failShop(this, new ShopError('徽章组件未就绪，请联系管理员。'), '/shop');
        }
        try {
            await redeem(this.ctx, {
                badge: models.badge,
                userBadge: models.userBadge,
                problem: { async get() { return null; } },
            }, collections(), now, this.user._id, badgeId);
        } catch (e) {
            failShop(this, e, '/shop');
        }
        // The badge is worn on /mybadge; a form POST cannot read a JSON body.
        this.response.redirect = '/mybadge';
    }
}

class ShopHistoryHandler extends Handler {
    @param('page', Types.UnsignedInt, true)
    async get(domainId: string, page = 1) {
        const result = await listLedger(collections(), this.user._id, page);
        // Prefix sums are computed over the full chronological ledger, not just
        // the current page: the balance column keeps running totals across pages.
        let running = 0;
        if (result.page > 1) {
            const prior = await collections().ledger.find({ uid: this.user._id })
                .sort({ ts: 1 }).limit((result.page - 1) * LEDGER_PAGE_SIZE).toArray();
            for (const doc of prior) running += doc.delta;
        }
        const items = result.docs.map((doc: any) => {
            running += doc.delta;
            return { ...doc, balance: running };
        });
        this.response.body = {
            page: result.page,
            pages: result.pages,
            total: result.total,
            pageSize: LEDGER_PAGE_SIZE,
            balance: await getBalance(collections(), this.user._id),
            items,
        };
        this.response.template = 'history.html';
    }
}

class ShopManageHandler extends Handler {
    async get() {
        const models = badgeModels();
        const rows: any[] = [];
        if (models.badge) {
            const bdocs = await (await models.badge.badgeGetMulti(this.ctx)).toArray();
            const priceDocs = await price.find({}).toArray();
            const priceMap = new Map(priceDocs.map((doc: any) => [doc._id, doc]));
            for (const bdoc of bdocs) {
                const priceDoc = priceMap.get(bdoc._id);
                rows.push({
                    _id: bdoc._id,
                    short: bdoc.short || '',
                    title: bdoc.title || '',
                    backgroundColor: bdoc.backgroundColor || '#2a5caa',
                    fontColor: bdoc.fontColor || '#ffffff',
                    price: priceDoc ? +priceDoc.price : null,
                    enabled: !!priceDoc?.enabled,
                });
            }
            rows.sort((a, b) => a._id - b._id);
        }
        this.response.body = { badges: rows, error: shopError(this) };
        this.response.template = 'manage.html';
    }
}

class ShopManageSaveHandler extends Handler {
    @post('operation', Types.String, true)
    @post('badgeId', Types.PositiveInt)
    @post('price', Types.PositiveInt)
    @post('enabled', Types.Boolean, true)
    async post(domainId: string, operation: string, badgeId: number, price: number, enabled?: boolean) {
        try {
            if (operation && operation !== 'price') throw new ShopError('不支持的操作。');
            await setPrice(collections(), now, badgeId, price, enabled !== false);
        } catch (e) {
            failShop(this, e, '/manage/shop');
        }
        this.response.redirect = '/manage/shop';
    }
}

// record/change 负载形态以 plugin-swpu-ops/live-rp.cjs 的 hook 为准：
// (rdoc, _set, _push, body)，终态判定 body.key === 'end'，AC 判定 rdoc.status。
function onRecordChange(rdoc: any, _set: any, _push: any, body: any) {
    if (!body || body.key !== 'end') return;
    if (!rdoc || rdoc.status !== STATUS_ACCEPTED) return;
    const { domainId, uid, pid } = rdoc;
    if (!domainId || !uid || !pid) return;
    const { ProblemModel } = require('hydrooj');
    awardSolve({
        badge: { badgeGetMulti() { return { async toArray() { return []; } }; }, async badgeGet() { return null; } },
        userBadge: { async userBadgeAdd() {}, userBadgeGetMulti() { return { async toArray() { return []; } }; } },
        problem: { get: (d: string, p: number) => ProblemModel.get(d, p) },
    }, collections(), now, { uid, domainId, docId: pid })
        .catch((e) => logger.error('solve award failed:', e));
}

// 回填历史 AC：按 (uid, domainId, pid) 去重逐条 awardSolve；幂等键保证
// 脚本可重复跑、增量跑，且与事件入账天然互不冲突（同 ref 不重复入账）。
//
// 每域扫描上限 BACKFILL_SCAN_LIMIT：原来是无 limit 的游标，每条唯一记录都要
// 一次 ProblemModel.get + 一次 insertOne，在大实例上会长时间占住单线程。幂等键
// 让脚本可重复执行，所以截断只需报告、不需要断点续跑。
const BACKFILL_SCAN_LIMIT = 20000;
async function runBackfill(args: { domainId?: string }, report: (progress: any) => void) {
    const domainIds = args.domainId ? [args.domainId] : ['system', 'poj'];
    const { ProblemModel } = require('hydrooj');
    const models = {
        badge: { badgeGetMulti() { return { async toArray() { return []; } }; }, async badgeGet() { return null; } },
        userBadge: { async userBadgeAdd() {}, userBadgeGetMulti() { return { async toArray() { return []; } }; } },
        problem: { get: (d: string, p: number) => ProblemModel.get(d, p) },
    };
    let awarded = 0;
    let scanned = 0;
    const truncated: string[] = [];
    for (const domainId of domainIds) {
        const seen = new Set<string>();
        const cursor = RecordModel.coll.find({ domainId, status: STATUS_ACCEPTED })
            .project({ uid: 1, pid: 1 }).sort({ _id: 1 }).limit(BACKFILL_SCAN_LIMIT);
        for await (const rdoc of cursor) {
            scanned++;
            const key = `${rdoc.uid}:${rdoc.pid}`;
            if (seen.has(key)) continue;
            seen.add(key);
            try {
                const result = await awardSolve(models, collections(), now, {
                    uid: rdoc.uid, domainId, docId: rdoc.pid, kind: 'backfill',
                });
                if (result.awarded) awarded++;
            } catch (e) {
                logger.error('backfill award failed:', e);
            }
            if (scanned % 500 === 0) report({ progress: scanned, message: `${domainId}: 已扫描 ${scanned} 条` });
        }
        await cursor.close();
        if (scanned >= BACKFILL_SCAN_LIMIT) truncated.push(domainId);
        report({ message: `${domainId}: 扫描完成（${scanned} 条 AC，新入账 ${awarded} 条）` });
    }
    if (truncated.length) {
        report({ message: `注意：以下域达到单次回填上限 ${BACKFILL_SCAN_LIMIT} 条，剩余部分需再次运行本脚本（幂等可续）：${truncated.join('、')}` });
    }
    report({ message: `回填完成：共新入账 ${awarded} 条（幂等，可重复运行）` });
    return true;
}

export const inject = ['db'];

export async function apply(ctx: Context) {
    await db.ensureIndexes(
        db.collection('swpuPointsLedger' as any),
        { key: { uid: 1, ref: 1 }, name: 'uid_ref', unique: true },
        { key: { uid: 1, ts: -1 }, name: 'uid_ts' },
    );
    // No explicit index for swpuBadgePrice: the collection is a handful of
    // badges, and an _id spec is rejected by MongoDB ("background is not valid
    // for an _id index") because Hydro's ensureIndexes injects background:true.
    ctx.Route('swpu_shop', '/shop', ShopPageHandler);
    ctx.Route('swpu_shop_redeem', '/shop/redeem', ShopRedeemHandler, PRIV.PRIV_USER_PROFILE);
    ctx.Route('swpu_shop_history', '/shop/history', ShopHistoryHandler, PRIV.PRIV_USER_PROFILE);
    ctx.Route('swpu_shop_manage', '/manage/shop', ShopManageHandler, PRIV.PRIV_MANAGE_ALL_DOMAIN);
    ctx.Route('swpu_shop_manage_save', '/manage/shop', ShopManageSaveHandler, PRIV.PRIV_MANAGE_ALL_DOMAIN);
    ctx.injectUI('UserDropdown', 'shop', () => ({ icon: 'credit-card', displayName: 'shop' }), PRIV.PRIV_USER_PROFILE);
    ctx.injectUI('ControlPanel', 'shop_manage', { family: '积分商店', icon: 'credit-card' }, PRIV.PRIV_MANAGE_ALL_DOMAIN);
    ctx.i18n.load('zh', {
        shop: '积分商店',
        shop_manage: '积分商店管理',
    });
    ctx.i18n.load('en', {
        shop: 'Points Shop',
        shop_manage: 'Points Shop Management',
    });
    ctx.addScript('swpuShopBackfill', 'SWPU 积分商店：回填历史 AC 记录的积分', Schema.object({
        domainId: Schema.string().default(''),
    }), runBackfill);
    // 多 pm2 实例只跑一份（照抄 swpu-ops 守卫），错误隔离：计分失败只记日志。
    if (!process.env.NODE_APP_INSTANCE || process.env.NODE_APP_INSTANCE === '0') {
        ctx.on('record/change', onRecordChange);
    }
    logger.info('swpu-shop routes ready: /shop, /shop/history, /manage/shop');
}
