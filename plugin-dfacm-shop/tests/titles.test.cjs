'use strict';

// 称号工坊纯逻辑层测试。titles.ts 经 esbuild 打包（points.ts 内联），
// `hydrooj` 保持 external 并 stub；全部 Mongo / badge 模型走 Fake，无网络。

const assert = require('node:assert/strict');
const { test } = require('node:test');
const path = require('node:path');
const Module = require('node:module');
const esbuild = require('esbuild');

const pluginDir = path.resolve(__dirname, '..');
const compiledTitles = esbuild.buildSync({
    entryPoints: [path.join(pluginDir, 'titles.ts')],
    bundle: true, platform: 'node', format: 'cjs', write: false,
    external: ['hydrooj'],
}).outputFiles[0].text;

function loadTitles() {
    const file = path.join(pluginDir, 'titles.ts');
    const loaded = new Module(file, module);
    loaded.filename = file;
    loaded.paths = module.paths;
    loaded.require = (id) => (id === 'hydrooj' ? {} : require(id));
    loaded._compile(compiledTitles, file);
    return loaded.exports;
}

const NOW = new Date('2026-10-16T12:00:00Z');
const now = () => new Date(NOW.getTime());
const UID = 42;

class DuplicateKeyError extends Error {
    constructor() { super('E11000 duplicate key'); this.code = 11000; }
}

class FakeLedger {
    constructor() { this.docs = []; }
    async insertOne(doc) {
        if (this.docs.some((d) => d.uid === doc.uid && d.ref === doc.ref)) throw new DuplicateKeyError();
        this.docs.push({ ...doc, _id: `oid-${this.docs.length + 1}` });
        return { insertedId: `oid-${this.docs.length}` };
    }
    async findOne(filter) {
        return this.docs.find((d) => Object.entries(filter).every(([k, v]) => d[k] === v)) || null;
    }
    aggregate(pipeline) {
        let rows = [...this.docs];
        for (const stage of pipeline) {
            if (stage.$match) rows = rows.filter((d) => Object.entries(stage.$match).every(([k, v]) => d[k] === v));
            if (stage.$group) rows = [{ _id: null, total: rows.reduce((s, d) => s + (d.delta || 0), 0) }];
        }
        return { async toArray() { return [...rows]; } };
    }
}

class FakeTitles {
    constructor(docs = []) { this.docs = [...docs]; }
    async findOne(filter) {
        return this.docs.find((d) => Object.entries(filter).every(([k, v]) => d[k] === v)) || null;
    }
    async insertOne(doc) {
        if (this.docs.some((d) => d.uid === doc.uid)) throw new DuplicateKeyError();
        this.docs.push({ ...doc, _id: `toid-${this.docs.length + 1}` });
        return { insertedId: `toid-${this.docs.length}` };
    }
    async updateOne(filter, update) {
        const doc = this.docs.find((d) => Object.entries(filter).every(([k, v]) => d[k] === v));
        if (doc) Object.assign(doc, update.$set || {});
        return { matchedCount: doc ? 1 : 0 };
    }
    find(filter) {
        const rows = this.docs.filter((d) => Object.entries(filter).every(([k, v]) => d[k] === v));
        return {
            _rows: rows,
            sort(spec) {
                const [key, dir] = Object.entries(spec)[0];
                this._rows = [...this._rows].sort((a, b) => (a[key] > b[key] ? 1 : a[key] < b[key] ? -1 : 0) * dir);
                return this;
            },
            async toArray() { return [...this._rows]; },
        };
    }
}

// badge-for-hydrooj 模型桩：badgeAdd 按 max(_id)+1 分配编号并把持有关系写进
// userBadge（与其源码同款）；badgeEdit 记录调用参数（真实实现会重序列化佩戴者
// 的 user.badge 串，那不是本层的职责）。
function makeModels({ failFirstMint = false, failEdit = false } = {}) {
    const badges = [];
    const holdings = [];
    const dels = [];
    const edits = [];
    let dupOnce = failFirstMint;
    return {
        badge: {
            async badgeAdd(ctx, short, title, backgroundColor, fontColor, content, users) {
                if (dupOnce) { dupOnce = false; throw new DuplicateKeyError(); }
                const id = badges.reduce((m, b) => Math.max(m, b._id), 0) + 1;
                badges.push({ _id: id, short, title, backgroundColor, fontColor, content, users: [...users] });
                for (const uid of users) holdings.push({ owner: uid, badgeId: id });
                return id;
            },
            async badgeGet(ctx, id) { return badges.find((b) => b._id === id) || null; },
            async badgeEdit(ctx, badgeId, short, title, backgroundColor, fontColor, content, users, usersOld) {
                if (failEdit) throw new Error('badge plugin exploded');
                const badge = badges.find((x) => x._id === badgeId);
                if (!badge) throw new Error('badge missing');
                edits.push({ badgeId, short, backgroundColor, fontColor, users: [...users], usersOld: [...usersOld] });
                Object.assign(badge, { short, title, backgroundColor, fontColor, content });
                return 1;
            },
        },
        userBadge: {
            async userBadgeDel(ctx, uid, badgeId) {
                dels.push({ uid, badgeId });
                const i = holdings.findIndex((d) => d.owner === uid && d.badgeId === badgeId);
                if (i >= 0) holdings.splice(i, 1);
                return 1;
            },
        },
        _state: { badges, holdings, dels, edits },
    };
}

const collections = (ledger = new FakeLedger(), titles = new FakeTitles()) => ({ ledger, titles });

async function seed(ledger, amount, pid = 1000) {
    await ledger.insertOne({ uid: UID, delta: amount, ref: `solve:system:${pid}`, kind: 'solve', detail: `P${pid}`, ts: now() });
}

// 一个解锁好的会员 + models，返回可用句柄。
async function unlockedFixture({ balance = 600, modelsOpts = {} } = {}) {
    const t = loadTitles();
    const ledger = new FakeLedger();
    const titles = new FakeTitles();
    await seed(ledger, balance);
    await t.unlockTitle(collections(ledger, titles), now, UID);
    return { t, ledger, titles, models: makeModels(modelsOpts) };
}

test('validateTitleText: 1~4 码点、中文/字母/数字、保留词拦截', () => {
    const t = loadTitles();
    assert.equal(t.validateTitleText(' 卷王 '), '卷王');
    assert.equal(t.validateTitleText('AK47'), 'AK47');
    assert.equal(t.validateTitleText('摆烂大师'), '摆烂大师'); // 4 码点
    assert.throws(() => t.validateTitleText('今天也要加油鸭'), /最多 4 个字/);
    assert.throws(() => t.validateTitleText('  '), /不能为空/);
    assert.throws(() => t.validateTitleText(undefined), /不能为空/);
    assert.throws(() => t.validateTitleText('官方认证'), /保留词/);
    assert.throws(() => t.validateTitleText('Root'), /保留词/); // root 子串拦截（4 字内，长度检查先放行）
    assert.throws(() => t.validateTitleText('AK👍'), /中文、字母或数字/); // 表情拒绝
    assert.throws(() => t.validateTitleText('AK!'), /中文、字母或数字/); // 标点拒绝
});

test('paletteById: 只认预设色板，任意色值进不来', () => {
    const t = loadTitles();
    const gold = t.paletteById('gold');
    assert.equal(gold.bg, '#c9a227');
    assert.equal(gold.fg, '#ffffff');
    assert.throws(() => t.paletteById('#ff0000'), /色板/);
    assert.throws(() => t.paletteById(undefined), /配色/);
});

test('getTitleState: 未登录与陌生人返回 null', async () => {
    const t = loadTitles();
    const titles = new FakeTitles([{ uid: UID, active: true, minted: 0 }]);
    assert.equal(await t.getTitleState(collections(new FakeLedger(), titles), 0), null);
    const row = await t.getTitleState(collections(new FakeLedger(), titles), UID);
    assert.equal(row.uid, UID);
});

test('unlockTitle: 余额足够扣 500 建状态行；不足带数字报错；重复解锁拦截', async () => {
    const t = loadTitles();
    const ledger = new FakeLedger();
    const titles = new FakeTitles();
    await seed(ledger, 300);
    await assert.rejects(
        () => t.unlockTitle(collections(ledger, titles), now, UID),
        /积分不足：解锁称号工坊需 500 分，当前 300 分/,
    );
    assert.equal(ledger.docs.length, 1);
    await seed(ledger, 300, 1001); // 总 600
    await t.unlockTitle(collections(ledger, titles), now, UID);
    assert.equal(ledger.docs.length, 3);
    assert.deepEqual(
        { delta: ledger.docs[2].delta, kind: ledger.docs[2].kind, ref: ledger.docs[2].ref, detail: ledger.docs[2].detail },
        { delta: -500, kind: 'title', ref: 'title_unlock', detail: '解锁称号工坊' },
    );
    const row = await titles.findOne({ uid: UID });
    assert.ok(row, '状态行建好');
    assert.equal(row.minted, 0);
    assert.equal(row.active, true);
    // 二次解锁被状态行拦下，不再扣分
    await assert.rejects(() => t.unlockTitle(collections(ledger, titles), now, UID), /已解锁/);
    assert.equal(ledger.docs.length, 3);
});

test('unlockTitle 自愈：扣过分但状态行缺失时补建，不再收费', async () => {
    const t = loadTitles();
    const ledger = new FakeLedger();
    const titles = new FakeTitles();
    // 模拟历史故障：title_unlock 流水在、状态行丢了
    await ledger.insertOne({ uid: UID, delta: -500, kind: 'title', ref: 'title_unlock', detail: '解锁称号工坊', ts: now() });
    await t.unlockTitle(collections(ledger, titles), now, UID);
    assert.equal(ledger.docs.length, 1, '未再扣费');
    const row = await titles.findOne({ uid: UID });
    assert.ok(row, '状态行补建');
    assert.equal(row.minted, 0);
});

test('saveTitle 首铸免费：badgeAdd 带 users=[uid]，持有与状态行落位', async () => {
    const { t, ledger, titles, models } = await unlockedFixture();
    const result = await t.saveTitle({}, models, collections(ledger, titles), now, UID, '卷王', 'gold');
    assert.deepEqual(result, { text: '卷王', bg: '#c9a227', fg: '#ffffff', badgeId: 1, paid: false });
    assert.equal(ledger.docs.length, 2, '只有解锁扣费，首铸免费');
    const badge = models._state.badges[0];
    assert.equal(badge.short, '卷王');
    assert.equal(badge.backgroundColor, '#c9a227');
    assert.deepEqual(badge.users, [UID]);
    assert.ok(models._state.holdings.some((h) => h.owner === UID && h.badgeId === 1), '持有关系写入');
    const row = await titles.findOne({ uid: UID });
    assert.equal(row.minted, 1);
    assert.equal(row.badgeId, 1);
    assert.equal(row.text, '卷王');
    assert.equal(row.bg, '#c9a227');
});

test('saveTitle 修改扣 50 走 badgeEdit 热更新；余额耗尽后拒绝', async () => {
    // 600 解锁后剩 100：两次修改各 50 → 0 → 第三次报错
    const { t, ledger, titles, models } = await unlockedFixture();
    await t.saveTitle({}, models, collections(ledger, titles), now, UID, '卷王', 'gold');
    const first = await t.saveTitle({}, models, collections(ledger, titles), now, UID, '摆烂', 'midnight');
    assert.equal(first.paid, true);
    assert.equal(ledger.docs.length, 3);
    assert.deepEqual(
        { delta: ledger.docs[2].delta, kind: ledger.docs[2].kind, detail: ledger.docs[2].detail },
        { delta: -50, kind: 'title', detail: '修改称号：摆烂' },
    );
    assert.match(ledger.docs[2].ref, /^title_edit:\d+:\d+$/, '时基同毫秒碰撞由序号兜底');
    assert.equal(models._state.edits.length, 1);
    assert.equal(models._state.edits[0].short, '摆烂');
    assert.equal(models._state.edits[0].backgroundColor, '#16233d');
    assert.deepEqual(models._state.edits[0].users, [UID]);
    assert.deepEqual(models._state.edits[0].usersOld, [UID]);
    const second = await t.saveTitle({}, models, collections(ledger, titles), now, UID, 'AK', 'gold');
    assert.equal(second.paid, true);
    await assert.rejects(
        () => t.saveTitle({}, models, collections(ledger, titles), now, UID, '再来', 'gold'),
        /积分不足：修改称号需 50 分，当前 0 分/,
    );
    assert.equal(ledger.docs.length, 4, '失败的修改不落账');
});

test('saveTitle 修改失败自动冲正：扣费 + 退款两条流水', async () => {
    const { t, ledger, titles, models } = await unlockedFixture();
    await t.saveTitle({}, models, collections(ledger, titles), now, UID, '卷王', 'gold');
    // 余额 100：把 badgeEdit 弄炸 → 修改 → -50 扣费 → 抛错 → +50 冲正
    models.badge.badgeEdit = async () => { throw new Error('badge plugin exploded'); };
    await assert.rejects(
        () => t.saveTitle({}, models, collections(ledger, titles), now, UID, '炸了', 'gold'),
        /称号保存失败，积分已退回/,
    );
    const n = ledger.docs.length;
    assert.equal(ledger.docs[n - 2].delta, -50);
    assert.equal(ledger.docs[n - 1].delta, 50);
    assert.equal(ledger.docs[n - 1].kind, 'refund');
    assert.notEqual(ledger.docs[n - 1].ref, ledger.docs[n - 2].ref, '冲正 ref 不能撞扣费键');
    // 余额不变（100）：直接对流水求和（titles.ts 的 bundle 不转发 points 的导出）
    const bal = ledger.docs.reduce((s, d) => s + d.delta, 0);
    assert.equal(bal, 100, '冲正后余额不变');
});

test('saveTitle 徽章被清理后走重铸（照常 50 分）', async () => {
    const { t, ledger, titles, models } = await unlockedFixture();
    await t.saveTitle({}, models, collections(ledger, titles), now, UID, '卷王', 'gold');
    models._state.badges.splice(0, models._state.badges.length); // 管理员清空徽章库
    const result = await t.saveTitle({}, models, collections(ledger, titles), now, UID, '新卷王', 'jade');
    assert.equal(result.paid, true, '重铸按修改计费');
    assert.equal(result.badgeId, 1, 'max(_id)+1 重新分配');
    assert.equal(models._state.badges[0].short, '新卷王');
    const row = await titles.findOne({ uid: UID });
    assert.equal(row.text, '新卷王');
});

test('badgeAdd 撞号（E11000）重试一次成功', async () => {
    const { t, ledger, titles } = await unlockedFixture({ modelsOpts: { failFirstMint: true } });
    const models = makeModels({ failFirstMint: true });
    const result = await t.saveTitle({}, models, collections(ledger, titles), now, UID, '卷王', 'gold');
    assert.equal(result.badgeId, 1);
    assert.equal(models._state.badges.length, 1, '重试后恰好一枚');
    assert.ok(models._state.holdings.some((h) => h.owner === UID && h.badgeId === 1));
});

test('停用状态行拒绝保存；未解锁拒绝保存', async () => {
    const t = loadTitles();
    const titles = new FakeTitles([{
        uid: UID, badgeId: 1, minted: 1, text: 'x', bg: '#000', fg: '#fff',
        active: false, createdAt: now(), updatedAt: now(),
    }]);
    await assert.rejects(
        () => t.saveTitle({}, makeModels(), collections(new FakeLedger(), titles), now, UID, '卷王', 'gold'),
        /已被管理员停用/,
    );
    await assert.rejects(
        () => t.saveTitle({}, makeModels(), collections(new FakeLedger(), new FakeTitles()), now, UID, '卷王', 'gold'),
        /请先解锁/,
    );
});

test('revokeTitle 摘持有并停用；restoreTitle 恢复；未知成员报错', async () => {
    const t = loadTitles();
    const ledger = new FakeLedger();
    const titles = new FakeTitles([{
        uid: UID, badgeId: 3, minted: 1, text: 'x', bg: '#000', fg: '#fff',
        active: true, createdAt: now(), updatedAt: now(),
    }]);
    const models = makeModels();
    models._state.holdings.push({ owner: UID, badgeId: 3 });
    await t.revokeTitle({}, models, collections(ledger, titles), now, UID);
    assert.deepEqual(models._state.dels, [{ uid: UID, badgeId: 3 }], '持有被摘除');
    assert.equal(models._state.holdings.length, 0);
    assert.equal((await titles.findOne({ uid: UID })).active, false);
    await t.restoreTitle(collections(ledger, titles), now, UID);
    assert.equal((await titles.findOne({ uid: UID })).active, true);
    await assert.rejects(
        () => t.revokeTitle({}, models, collections(ledger, titles), now, 999),
        /尚未解锁/,
    );
});
