// d&f算法网积分商店：清理积分流水的历史污染（幂等，可重复运行）。
// 1) uid 3（hydsvc-0074 判题服务号）的 solve 行——判题链路测试的 AC 属于
//    基础设施噪声：上游 awardSolve 现已在源头排除（SWPU_SERVICE_UIDS），
//    这里只清 2026-10-04 部署以来积攒的存量（约 686 分）。
//    守卫（照 rp-sweep 的 assertServiceAccounts 口径）：uid 3 的 uname 必须
//    以 hydsvc 开头，防止将来 uid 被复用成真人账号时误删。
// 2) 孤儿 uid——流水里出现、但 db.user 已不存在的账号（历史 E2E 测试号）。
// 运行：mongosh "<URI>" deploy/shop/ledger-cleanup.js
const svc = db.getCollection('user').findOne({ _id: 3 });
if (!svc || !String(svc.uname || '').startsWith('hydsvc')) {
    throw new Error('uid 3 is "' + (svc && svc.uname) + '", expected a hydsvc-* service account. Refusing to purge.');
}
const delSvc = db.getCollection('swpuPointsLedger').deleteMany({ uid: 3 });
// 孤儿：流水里出现但用户已删除（含 uid 0——按口径 uid<=1 本就不入账）。
const uids = db.getCollection('swpuPointsLedger').distinct('uid');
const orphanUids = [];
for (const uid of uids) {
    if (uid === 3) continue; // 已按服务号口径单独清理
    if (!db.getCollection('user').findOne({ _id: uid })) orphanUids.push(uid);
}
let delOrphan = 0;
for (const uid of orphanUids) {
    delOrphan += db.getCollection('swpuPointsLedger').deleteMany({ uid: uid }).deletedCount;
}
const balances = db.getCollection('swpuPointsLedger').aggregate([
    { $group: { _id: '$uid', total: { $sum: '$delta' } } },
    { $sort: { total: -1 } },
]).toArray();
print(JSON.stringify({
    deletedServiceRows: delSvc.deletedCount,
    orphanUids: orphanUids,
    deletedOrphanRows: delOrphan,
    balancesAfter: balances,
}, null, 2));
