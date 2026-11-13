# d&f算法网积分商店（内部 addon 标识：swpu-shop）

Hydro **5.0.7** 的小型 addon。把徽章产品化为积分兑换机制：每道题**首次 AC** 按难度入账 1~10 积分，管理员给徽章定价上架后，用户在商店页花积分兑换，兑换即获得徽章持有权。

## 能做什么

- **赚积分**：`record/change` 判题终态事件里，status === 1（Accepted）且是该用户该题首次通过时，按题目难度入账（难度口径与 Hydro RP 脚本完全一致：显式 `difficulty` 优先，缺失时用 `nSubmit/nAccept` 推导，`lib/difficulty.ts` 全文移植，1~10 分）。隐藏题、自建题（owner 是本人）、uid ≤ 1（Guest/系统号）、服务号（`SWPU_SERVICE_UIDS`，默认 `3` = hydsvc-0074 判题号，留空关闭）不入账。只在 pm2 instance 0 注册，失败只记日志，绝不影响判题流程。
- **花积分**：`/shop`（游客可看）是品牌化卡片货架：徽章大色块预览、用户名旁真实 chip 效果、价格牌、每卡余额进度条与「还差 N 分」提示、下一枚目标（progress/need/can/next 均由服务端算好——生产 Nunjucks 是裁剪版，模板只输出）；登录者可兑换，游客按钮为登录入口。只有上架徽章进货架（未定价/未上架的身份徽章只在管理页可见），卡序=价格升序。`POST /shop/redeem` 兑换：未上架/已持有/余额不足各返回明确业务错误，成功后跳转 `/mybadge` 提示佩戴。
- **积分流水**：`/shop/history`（登录）分页 20 条/页，时间正序，列：时间/类型/明细/变动/累计余额（跨页前缀和）。
- **管理**：`/manage/shop`（域管理员 `PRIV_MANAGE_ALL_DOMAIN`）列出全部徽章（含未定价），每行价格 input + 上架 checkbox，单行保存。
- **回填**：`swpuShopBackfill` 脚本按域扫描历史记录，页内仅给当前正式 AC 入账（`kind: 'backfill'`）；排除 Hydro 的两个保留预测试/生成比赛 ID，真实比赛计分。每域每次最多扫描 20,000 条，每页 500 条，达到上限保存断点，下次继续同一轮；一轮完成后再次运行从头建立新轮，覆盖旧记录重判。账本原 `{uid, ref}` 唯一键继续保证幂等与实时计分去重。

## 与 badge-for-hydrooj 的关系

徽章的创建、持有、佩戴、全站展示**全部由服务器已装的第三方插件 badge-for-hydrooj 提供**。本插件只调用它的模型（`global.Hydro.model.badge` / `global.Hydro.model.userBadge`，如 `badgeGetMulti` / `userBadgeAdd`），**不 fork、不修改它**。兑换成功只写持有关系（`userBadgeAdd`），佩戴由用户在 badge 插件的 `/mybadge` 自行完成（本插件不自动佩戴）。

## 数据

- `swpuPointsLedger`（积分流水，追加式）：`{ uid, delta(正=入账/负=扣减), kind: 'solve'|'redeem'|'admin'|'backfill', ref(幂等键), detail, ts }`。唯一索引 `{uid, ref}` 是防刷与防双花的根基：solve 用 `solve:{domainId}:{docId}`（同一人同一题只入账一次），redeem 用 `redeem:{badgeId}`（同一人对同一徽章只能扣一次分）；insert 撞重复键静默吸收。查询索引 `{uid, ts: -1}`。
- `swpuShopBackfillState`：一域一行，`_id=domainId`，保存 `{ round(UUID), upper(固定 BSON _id 上界), after(BSON _id 页游标/null), scanned, awarded, completed, startedAt, updatedAt }`。按 `_id` 读写，利用 Mongo 默认唯一索引；换轮与页提交按旧 `round/after` 条件更新，过期执行者不能回写新状态。初始化和整页处理成功后才保存进度，页内读取/入账/计数/写状态失败向上报错，失败页下次重跑。
- 新回填流水附加 `backfillRound`、`backfillRecord`（原始记录 BSON `_id`），不改 `ref`，不改旧流水；稀疏索引 `{backfillRound:1, backfillRecord:1}` 用于每页计数，即使页中断前已写部分流水，也能恢复本轮累计入账数。状态中的 `scanned/awarded` 是本轮累计；报告另给 `scannedThisRun/awardedThisRun`，分别表示本次成功提交页扫描量与本次真实新插入数。
- Hydro `record` 集合增加 `{domainId:1,_id:1}` 索引 `swpu_shop_backfill_scan`；无 status 预过滤的有界游标保证旧非 AC 重判可在新轮覆盖。所有扫描、状态操作与页计数设置 10 秒数据库查询预算。每域每次最多 40 页，另加一条单记录上界查询；每页计数只覆盖本页 ID 范围，最多对应 500 个记录，避免重复累计扫描整个轮次。
- `swpuBadgePrice`（定价表，`_id` 即 badgeId）：`{ price, enabled, updatedAt }`。
- 余额 = `sum(delta)` 实时聚合（用户量小不做缓存，将来可加缓存集合）。
- 集合名以 `swpu` 前缀隔离（现网集合名，未随仓库改名，避免迁移存量数据），不修改 Hydro/第三方插件的业务记录（`record` 仅增加扫描索引；读 `userBadge` 只查不改）。

并发说明：单实例 pm2 + redeem 唯一键后，双花只剩"两请求同时过余额检查"的窄窗口，v1 接受（用户量级极小），未来可升级 Mongo transaction。

## 安装

见 [deploy/deployment.md](../deploy/deployment.md) 第 4 节积分商店段落（cp 块同样被 `deploy/deploy.sh` 解析发货）。安装后：

1. 在 `/manage/shop` 给徽章定价并勾选上架（或直接跑 `deploy/shop/badges-seed.js` 上架「攀登者之路」5 级套系：大本营 30 / 雪线 100 / 冰川 250 / 冲顶 500 / 登顶 1000 分；mongosh 幂等脚本，可重复运行）。
2. 运行回填；看到某域「已保存断点」时用同一命令重跑，直到各域「扫描完成」。完成后再跑会开启新轮覆盖旧记录重判：`hydrooj cli script swpuShopBackfill '{}'`（空 domainId 回填 `system` 与 `poj` 两个域）。
3. 存量污染清理（可选，历史部署的判题测试曾给 uid 3 攒 686 分）：`deploy/shop/ledger-cleanup.js`（mongosh；同时清已删测试号的孤儿流水行；守卫：uid 3 的 uname 必须以 `hydsvc` 开头）。
4. 验收 `/shop`（游客 200）、`/shop/history`（登录 200，未登录 302）、`/manage/shop`（管理员可见）。

## 验证

`npm ci && npm test`（仓库内开发目录运行；服务器 addon 目录禁止 npm install）。测试用 node:test + stub db（内存 ledger/price 模拟唯一键冲突与聚合），不起真实 Mongo：难度算法移植正确性、awardSolve 幂等与排除、redeem 四分支与幂等、余额聚合、流水分页、路由/权限/i18n/UI 注入/事件守卫、回填去重幂等、跨 20,000 条续扫、双域独立统计、失败页恢复/部分入账去重、固定上界与旧记录重判，另在 `scripts/deployment.test.mjs` 有部署 wiring 断言。
