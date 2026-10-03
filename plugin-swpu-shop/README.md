# swpu-shop — 积分商店：做题赚积分，花积分兑徽章

Hydro **5.0.7** 的小型 addon。把徽章产品化为积分兑换机制：每道题**首次 AC** 按难度入账 1~10 积分，管理员给徽章定价上架后，用户在商店页花积分兑换，兑换即获得徽章持有权。

## 能做什么

- **赚积分**：`record/change` 判题终态事件里，status === 1（Accepted）且是该用户该题首次通过时，按题目难度入账（难度口径与 Hydro RP 脚本完全一致：显式 `difficulty` 优先，缺失时用 `nSubmit/nAccept` 推导，`lib/difficulty.ts` 全文移植，1~10 分）。隐藏题、自建题（owner 是本人）、uid ≤ 1（Guest/系统号）不入账。只在 pm2 instance 0 注册，失败只记日志，绝不影响判题流程。
- **花积分**：`/shop`（游客可看）列出徽章卡片：预览色块、标题（链到 badge 插件详情页 `/badge/<id>`）、价格、状态；登录者显示「我的积分」与兑换按钮，游客显示「登录后兑换」。`POST /shop/redeem` 兑换：未上架/已持有/余额不足各返回明确业务错误，成功后跳转 `/mybadge` 提示佩戴。
- **积分流水**：`/shop/history`（登录）分页 20 条/页，时间正序，列：时间/类型/明细/变动/累计余额（跨页前缀和）。
- **管理**：`/manage/shop`（域管理员 `PRIV_MANAGE_ALL_DOMAIN`）列出全部徽章（含未定价），每行价格 input + 上架 checkbox，单行保存。
- **回填**：`swpuShopBackfill` 脚本扫历史 AC 记录入账（`kind: 'backfill'`），幂等可重跑，与实时入账互不冲突。

## 与 badge-for-hydrooj 的关系

徽章的创建、持有、佩戴、全站展示**全部由服务器已装的第三方插件 badge-for-hydrooj 提供**。本插件只调用它的模型（`global.Hydro.model.badge` / `global.Hydro.model.userBadge`，如 `badgeGetMulti` / `userBadgeAdd`），**不 fork、不修改它**。兑换成功只写持有关系（`userBadgeAdd`），佩戴由用户在 badge 插件的 `/mybadge` 自行完成（本插件不自动佩戴）。

## 数据

- `swpuPointsLedger`（积分流水，追加式）：`{ uid, delta(正=入账/负=扣减), kind: 'solve'|'redeem'|'admin'|'backfill', ref(幂等键), detail, ts }`。唯一索引 `{uid, ref}` 是防刷与防双花的根基：solve 用 `solve:{domainId}:{docId}`（同一人同一题只入账一次），redeem 用 `redeem:{badgeId}`（同一人对同一徽章只能扣一次分）；insert 撞重复键静默吸收。查询索引 `{uid, ts: -1}`。
- `swpuBadgePrice`（定价表，`_id` 即 badgeId）：`{ price, enabled, updatedAt }`。
- 余额 = `sum(delta)` 实时聚合（用户量小不做缓存，将来可加缓存集合）。
- 集合名以 `swpu` 前缀隔离，不触碰 Hydro/第三方插件的集合（读 `userBadge` 只查不改）。

并发说明：单实例 pm2 + redeem 唯一键后，双花只剩"两请求同时过余额检查"的窄窗口，v1 接受（用户量级极小），未来可升级 Mongo transaction。

## 安装

见 [deploy/deployment.md](../deploy/deployment.md) 第 4 节积分商店段落（cp 块同样被 `deploy/deploy.sh` 解析发货）。安装后：

1. 在 `/manage/shop` 给徽章定价并勾选上架。
2. 跑一次回填：`hydrooj cli script swpuShopBackfill '{}'`（空 domainId 回填 `system` 与 `poj` 两个域）。
3. 验收 `/shop`（游客 200）、`/shop/history`（登录 200，未登录 302）、`/manage/shop`（管理员可见）。

## 验证

`npm ci && npm test`（仓库内开发目录运行；服务器 addon 目录禁止 npm install）。测试用 node:test + stub db（内存 ledger/price 模拟唯一键冲突与聚合），不起真实 Mongo：难度算法移植正确性、awardSolve 幂等与排除、redeem 四分支与幂等、余额聚合、流水分页、路由/权限/i18n/UI 注入/事件守卫、回填去重幂等，另在 `scripts/deployment.test.mjs` 有部署 wiring 断言。
