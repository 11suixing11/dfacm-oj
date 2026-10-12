// d&f算法网积分商店：「攀登者之路」徽章套系上架。
// 幂等脚本（mongosh），可重复运行：badge 文档用 $set 只覆盖本脚本拥有的
// 字段（users 管理员直发名单、createAt 只在插入时写入，均不受影响）；
// swpuBadgePrice upsert 定价并上架。
// 运行：mongosh "<URI>" deploy/shop/badges-seed.js
const NOW = new Date();
// 阶梯价与站点「向山顶，提交你的答案」的登山隐喻一致：大本营 → 登顶。
// short ≤3 字（徽章方块上的字），backgroundColor/fontColor 含 #（badge 插件约定）。
const LADDER = [
    {
        _id: 3, short: '大本营', title: '大本营·初来乍到',
        backgroundColor: '#57708a', fontColor: '#ffffff', price: 30,
        content: '每一次远征都从大本营出发。在 d&f算法网通过一道又一道题，攒下 30 积分，换上这枚徽章，向山走去。',
    },
    {
        _id: 4, short: '雪线', title: '雪线行者',
        backgroundColor: '#2a5caa', fontColor: '#ffffff', price: 100,
        content: '越过云海，抵达雪线。100 积分，记录了你与题库走过的第一段长路。',
    },
    {
        _id: 5, short: '冰川', title: '冰川征服者',
        backgroundColor: '#3d9ad1', fontColor: '#ffffff', price: 250,
        content: '冰川地带，每一步都要踩实。250 积分是大量 AC 换来的地形图——继续保持。',
    },
    {
        _id: 6, short: '冲顶', title: '冲顶突击手',
        backgroundColor: '#c9a227', fontColor: '#1a2940', price: 500,
        content: '主峰已在望。500 积分说明你已经把训练当成了日常，向主峰发起冲刺吧。',
    },
    {
        _id: 7, short: '登顶', title: '登顶传奇',
        backgroundColor: '#101d32', fontColor: '#ffd75e', price: 1000,
        content: '向山顶，提交你的答案。1000 积分——站上山顶的人，全站用户名旁都会看到这枚金色印记。',
    },
];
const report = [];
for (const badge of LADDER) {
    const bres = db.getCollection('badge').updateOne(
        { _id: badge._id },
        {
            $set: {
                short: badge.short, title: badge.title,
                backgroundColor: badge.backgroundColor, fontColor: badge.fontColor,
                content: badge.content,
            },
            $setOnInsert: { users: [], createAt: NOW },
        },
        { upsert: true },
    );
    const pres = db.getCollection('swpuBadgePrice').updateOne(
        { _id: badge._id },
        { $set: { price: badge.price, enabled: true, updatedAt: NOW } },
        { upsert: true },
    );
    report.push({
        badgeId: badge._id, short: badge.short, price: badge.price,
        badgeUpserted: bres.upsertedCount === 1, priceUpserted: pres.upsertedCount === 1,
    });
}
print(JSON.stringify({ seeded: report }, null, 2));
print('上架徽章总数：' + db.getCollection('swpuBadgePrice').countDocuments({ enabled: true }));
