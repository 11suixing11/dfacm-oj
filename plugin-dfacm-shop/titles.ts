/* 称号工坊纯逻辑层（plugin-dfacm-shop）
 * 学生花积分解锁「DIY 称号」特权（2026-10-16 站长拍板：解锁 500 分含首次
 * 铸造、每次修改 50 分、先显后管、≤4 个码点、只许预设色板）。
 *
 * 技术路线 = 合成徽章：badge-for-hydrooj 的 badgeAdd 会按 max(_id)+1 分配
 * 编号并把持有关系写进 userBadge，佩戴后徽章 chip 出现在全站用户名旁
 * （ranking / discuss / solution）；badgeEdit 会给所有佩戴者重写 user.badge
 * 序列化串并失效用户缓存——改名即时生效，展示端零开发。只调用其模型，
 * 绝不修改它（仓库铁律）。
 *
 * 集合与外部模型全部通过参数注入，node:test 用 stub 覆盖，不连真实 Mongo；
 * 余额与业务错误复用 points.ts 的 getBalance / ShopError。
 */
import type { Context } from 'hydrooj';
import { getBalance, ShopError } from './points';

export const TITLE_UNLOCK_PRICE = 500;
export const TITLE_EDIT_PRICE = 50;
export const TITLE_MAX_CHARS = 4;

// 预设色板：色值只从这里出——任意 CSS 是经典注入洞，绝不放开。
// 取色与「攀登者之路」徽章套系同源（石板灰蓝/品牌蓝/冰川蓝/金/午夜金）。
export const TITLE_PALETTES: { id: string; name: string; bg: string; fg: string }[] = [
    { id: 'brand', name: '品牌蓝', bg: '#2a5caa', fg: '#ffffff' },
    { id: 'slate', name: '石板灰蓝', bg: '#5b6b80', fg: '#ffffff' },
    { id: 'glacier', name: '冰川蓝', bg: '#8ac4de', fg: '#12314f' },
    { id: 'gold', name: '登顶金', bg: '#c9a227', fg: '#ffffff' },
    { id: 'jade', name: '松绿', bg: '#1f7a4d', fg: '#ffffff' },
    { id: 'midnight', name: '午夜金', bg: '#16233d', fg: '#e8d592' },
];

// 冒充与低俗词拦截（子串匹配、不区分大小写）——先显后管模式下的第一道闸，
// 管理员在 /manage/shop 的一键停用是最终兜底。
const BLOCKED_WORDS = ['官方', '系统', '管理', '站长', '裁判', '出题', '客服', '审核', 'admin', 'root', 'staff'];

const TITLE_CONTENT = 'd&f算法网·称号工坊铸造的专属称号。';

export function titleBadgeTitle(text: string) {
    return `「${text}」·专属称号`;
}

function isDuplicateKey(e: any) {
    return e && (e as { code?: number }).code === 11000;
}

export interface TitleCollections {
    ledger: {
        insertOne(doc: any): Promise<any>;
        aggregate(pipeline: any[]): any;
        findOne(filter: any): Promise<any>;
    };
    titles: {
        findOne(filter: any): Promise<any>;
        insertOne(doc: any): Promise<any>;
        updateOne(filter: any, update: any, options?: any): Promise<any>;
        find(filter: any): any;
    };
}

export interface TitleModels {
    badge: {
        badgeAdd(ctx: Context, short: string, title: string, backgroundColor: string,
            fontColor: string, content: string, users: number[]): Promise<number>;
        badgeGet(ctx: Context, badgeId: number): Promise<any>;
        badgeEdit(ctx: Context, badgeId: number, short: string, title: string, backgroundColor: string,
            fontColor: string, content: string, users: number[], usersOld: number[]): Promise<number>;
    };
    userBadge: {
        userBadgeDel(ctx: Context, uid: number, badgeId: number): Promise<number>;
    };
}

// 校验称号文本：1~4 个码点，只收中文/字母/数字（正则天然排除表情、空格与
// 标点，chip 是内联元素，脏字符会撑坏排版），保留词子串拦截。
export function validateTitleText(raw: unknown): string {
    if (typeof raw !== 'string') throw new ShopError('称号不能为空。');
    const text = raw.trim();
    const chars = [...text];
    if (!chars.length) throw new ShopError('称号不能为空。');
    if (chars.length > TITLE_MAX_CHARS) throw new ShopError(`称号最多 ${TITLE_MAX_CHARS} 个字。`);
    if (!/^[\p{Script=Han}\p{L}\p{N}]+$/u.test(text)) throw new ShopError('称号只能用中文、字母或数字。');
    const lower = text.toLowerCase();
    for (const word of BLOCKED_WORDS) {
        if (lower.includes(word)) throw new ShopError('该称号含保留词，请换一个。');
    }
    return text;
}

export function paletteById(id: unknown) {
    if (typeof id !== 'string') throw new ShopError('请选择称号配色。');
    const palette = TITLE_PALETTES.find((p) => p.id === id);
    if (!palette) throw new ShopError('配色不存在，请从预设色板中选择。');
    return palette;
}

export async function getTitleState(collections: TitleCollections, uid: number) {
    if (!Number.isSafeInteger(uid) || uid <= 0) return null;
    return collections.titles.findOne({ uid });
}

// badgeAdd 内部用 max(_id)+1 分配编号，两个会员同时铸造会撞号（E11000）。
// 撞号重试一次即可拿到新号；单实例 pm2 + 下面的全局锁已把窗口压到极窄。
async function mintWithRetry(
    ctx: Context, models: TitleModels, text: string, palette: { bg: string; fg: string }, uid: number,
) {
    const attempt = () => models.badge.badgeAdd(
        ctx, text, titleBadgeTitle(text), palette.bg, palette.fg, TITLE_CONTENT, [uid],
    );
    try {
        return await attempt();
    } catch (e) {
        if (!isDuplicateKey(e)) throw e;
        return await attempt();
    }
}

// Serializes every mint/save: badgeAdd's max(_id)+1 allocation is not atomic,
// so concurrent mints from different members could collide. Same single-instance
// doctrine as points.ts's redeemLocks; multi-node would need a Mongo transaction.
let titleLock: Promise<unknown> = Promise.resolve();
function runInTitleLock<T>(work: () => Promise<T>): Promise<T> {
    const run = titleLock.then(work, work);
    titleLock = run.catch(() => undefined);
    return run;
}

// 解锁：扣 500 分 + 建 swpuTitles 状态行。幂等三重保障：状态行存在直接拒；
// ledger `title_unlock` 固定 ref 撞 {uid,ref} 唯一键；状态行 uid 唯一索引。
// 历史故障自愈在余额检查**之前**：扣过分但状态行缺失（两步之间崩溃）的会员，
// 余额必然被那笔 -500 拖着，余额检查会误伤——所以先查解锁流水，在则直接补建。
export async function unlockTitle(collections: TitleCollections, now: () => Date, uid: number) {
    if (!Number.isSafeInteger(uid) || uid <= 0) throw new ShopError('请先登录。');
    const row = await collections.titles.findOne({ uid });
    if (row) throw new ShopError('你已解锁称号工坊。');
    const paidBefore = await collections.ledger.findOne({ uid, ref: 'title_unlock' });
    if (paidBefore) {
        await insertTitleRow(collections, now, uid);
        return;
    }
    const balance = await getBalance(collections, uid);
    if (balance < TITLE_UNLOCK_PRICE) {
        throw new ShopError(`积分不足：解锁称号工坊需 ${TITLE_UNLOCK_PRICE} 分，当前 ${balance} 分。`);
    }
    try {
        await collections.ledger.insertOne({
            uid, delta: -TITLE_UNLOCK_PRICE, kind: 'title', ref: 'title_unlock',
            detail: '解锁称号工坊', ts: now(),
        });
    } catch (e) {
        if (!isDuplicateKey(e)) throw e;
        await insertTitleRow(collections, now, uid);
        return;
    }
    try {
        await insertTitleRow(collections, now, uid);
    } catch (e) {
        if (!isDuplicateKey(e)) throw e; // titles.uid 唯一索引撞 = 已解锁
    }
}

function insertTitleRow(collections: TitleCollections, now: () => Date, uid: number) {
    return collections.titles.insertOne({
        uid, badgeId: null, minted: 0, text: '', bg: '', fg: '',
        active: true, createdAt: now(), updatedAt: now(),
    });
}

// 流水 ref 的时基问题：注入的 now() 在同一毫秒内的两次保存会产生同一个
// `title_edit:{ts}`/`refund:title:{ts}` 而撞 {uid,ref} 唯一键（测试的固定
// 时钟实锤了这个窗口）。进程内单调序号兜底唯一性，与时间戳拼接保持可读。
let titleLedgerSeq = 0;

// 保存（铸造或修改）：首次铸造含在解锁价里，之后每次保存扣 TITLE_EDIT_PRICE。
// 顺序刻意「先扣分、后写徽章」：失败走 refund 冲正（同 points.ts redeem 教义，
// 单机无跨集合事务）。badgeId 存在且徽章仍在 → badgeEdit 热更新（badgeEdit 会
// 给所有佩戴者重写 user.badge 并失效缓存）；徽章缺失（管理员清理过）→ 重铸。
export async function saveTitle(
    ctx: Context, models: TitleModels, collections: TitleCollections, now: () => Date,
    uid: number, rawText: string, paletteId: string,
) {
    if (!Number.isSafeInteger(uid) || uid <= 0) throw new ShopError('请先登录。');
    const row = await collections.titles.findOne({ uid });
    if (!row) throw new ShopError('请先解锁称号工坊。');
    if (row.active === false) throw new ShopError('你的称号已被管理员停用，请联系管理员。');
    const text = validateTitleText(rawText);
    const palette = paletteById(paletteId);
    const isEdit = row.minted === 1;
    return runInTitleLock(async () => {
        if (isEdit) {
            const balance = await getBalance(collections, uid);
            if (balance < TITLE_EDIT_PRICE) {
                throw new ShopError(`积分不足：修改称号需 ${TITLE_EDIT_PRICE} 分，当前 ${balance} 分。`);
            }
            await collections.ledger.insertOne({
                uid, delta: -TITLE_EDIT_PRICE, kind: 'title',
                ref: `title_edit:${now().getTime()}:${++titleLedgerSeq}`, detail: `修改称号：${text}`, ts: now(),
            });
        }
        try {
            let badgeId: number | null = row.badgeId;
            const existing = badgeId ? await models.badge.badgeGet(ctx, badgeId) : null;
            if (existing) {
                await models.badge.badgeEdit(
                    ctx, badgeId as number, text, titleBadgeTitle(text),
                    palette.bg, palette.fg, TITLE_CONTENT, [uid], [uid],
                );
            } else {
                badgeId = await mintWithRetry(ctx, models, text, palette, uid);
            }
            await collections.titles.updateOne({ uid }, { $set: {
                badgeId, minted: 1, text, bg: palette.bg, fg: palette.fg, updatedAt: now(),
            } });
            return { text, bg: palette.bg, fg: palette.fg, badgeId, paid: isEdit };
        } catch (e) {
            if (isEdit) {
                // 扣分已落库：冲正退回，保证最终一致且有审计痕迹。
                await collections.ledger.insertOne({
                    uid, delta: TITLE_EDIT_PRICE, kind: 'refund',
                    ref: `refund:title:${now().getTime()}:${++titleLedgerSeq}`, detail: `修改称号失败冲正：${text}`, ts: now(),
                });
                throw new ShopError('称号保存失败，积分已退回，请稍后重试。');
            }
            throw e;
        }
    });
}

// 管理员停用：摘持有（userBadgeDel 内部会顺带摘下佩戴）+ active=false。
// 停用是先显后管的兜底闸；恢复只翻回 active，被删掉的持有关系由成员在
// 工坊里重新保存铸造（照常按 50 分/次计费）。
export async function revokeTitle(
    ctx: Context, models: TitleModels, collections: TitleCollections, now: () => Date, uid: number,
) {
    if (!Number.isSafeInteger(uid) || uid <= 0) throw new ShopError('成员无效。');
    const row = await collections.titles.findOne({ uid });
    if (!row) throw new ShopError('该成员尚未解锁称号工坊。');
    if (row.badgeId) await models.userBadge.userBadgeDel(ctx, uid, row.badgeId);
    await collections.titles.updateOne({ uid }, { $set: { active: false, updatedAt: now() } });
}

export async function restoreTitle(collections: TitleCollections, now: () => Date, uid: number) {
    if (!Number.isSafeInteger(uid) || uid <= 0) throw new ShopError('成员无效。');
    const row = await collections.titles.findOne({ uid });
    if (!row) throw new ShopError('该成员尚未解锁称号工坊。');
    await collections.titles.updateOne({ uid }, { $set: { active: true, updatedAt: now() } });
}
