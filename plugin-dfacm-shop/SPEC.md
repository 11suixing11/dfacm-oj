# plugin-dfacm-shop 实现规格书（SWPU OJ 积分商店）

> 本文档是给实现者的完整规格。你无法访问线上服务器，所有服务器侧事实已内嵌在本文档第 4 节，以其为准，不要凭空猜测 Hydro API。

## 1. 背景与目标

SWPU OJ（Hydro v5.0.7，线上 https://swpuacm.xyz，本仓库是站点定制层开源仓库 github.com/11suixing11/dfacm-oj）已有徽章功能（第三方插件 badge-for-hydrooj，装在服务器，仓库里没有它的源码）。产品决策已定：把徽章做成**积分兑换机制**。

要实现的 `plugin-dfacm-shop`（仓库第 4 个自研插件，前三个：plugin-dfacm-regcode / plugin-dfacm-train / plugin-dfacm-ops）：

1. **做题赚积分**：用户每道题**首次 AC**（Accepted）按题目难度入账 1~10 积分。难度来源与站内 Hydro RP 系统同源（详见 4.4 节难度算法）。
2. **花积分兑徽章**：管理员给徽章定价并上架，用户积分余额足够即可兑换，兑换即获得该徽章的持有权（复用 badge-for-hydrooj 的持有/佩戴/展示全链路，我们**只调用它的模型，绝不 fork**）。
3. 用户可查积分流水；管理员可定价/上下架。

## 2. 硬约束（违反任何一条=返工）

1. **不 fork、不修改 badge-for-hydrooj**。它把模型挂在 `global.Hydro.model.badge` / `global.Hydro.model.userBadge`（见 4.2 节 API），我们直接调用。
2. **不引入任何 npm 运行时依赖**。线上曾有 yarn global 依赖树污染（bson 版本冲突）导致全站 500 的事故。插件源码只允许 `import ... from 'hydrooj'` 和 Node 内置模块；测试只用 `node:test` 内置框架。`package.json` 的 devDependencies 允许且只允许 `hydrooj`（版本写法对齐现有插件）。**不要**生成 package-lock.json，除非现有插件有此惯例（检查 regcode 是否有 lock 及 CI 怎么用它——regcode 有 lock 是历史遗留，新插件不需要）。
3. **不改动既有插件/主题/落地页/部署脚本的既有行为**。集成分只做增量：`deploy/deployment.md` 加段落、`deploy/smoke.sh` 加检查项、`.github/workflows/ci.yml` 加测试行、`deployment.test.mjs` 加 wiring 断言、`addon.json.example`（如存在，找一下实际文件名）加注册行、`CHANGELOG.md` 加条目、`README.md` 插件清单加一行（若 README 有此清单）。
4. **不要 `git push`**。完成后做本地 commit（conventional commit 风格，参考 `git log`），由人审查后推送。
5. 代码风格对齐 `plugin-dfacm-regcode/index.ts`（TypeScript + Hydro 装饰器路由）；模板 Nunjucks，对齐 regcode/train 页面结构（`{% extends "layout/basic.html" %}` + `.section` / `.data-table` / `.rounded primary button` 等现有类）；测试风格对齐 `plugin-dfacm-regcode/handlers.test.cjs`（node:test + stub db，避免真实 Mongo）。

## 3. 必读参考文件（动工前读完，再开始写代码）

- `plugin-dfacm-regcode/` 全部源文件——Handler/路由/@param/i18n/模板/测试 stub 模式
- `plugin-dfacm-train/`——数据接口拆分（index.ts + 独立 cjs）、mongosh 部署辅助脚本、测试
- `plugin-dfacm-ops/index.ts` 与 `plugin-dfacm-ops/live-rp.cjs`——`ctx.on('record/change', ...)` 事件钩子的**确切负载签名**（以 live-rp.cjs 中 hook 的实际用法为准）、pm2 instance-0 守卫、`ctx.addScript(...)` 注册后台脚本的模式、`ctx.on('dispose', ...)` 清理
- `deploy/deployment.md`、`deploy/deploy.sh`、`deploy/smoke.sh`——部署清单 cp 块格式（**deploy.sh 会解析 deployment.md 的 cp 块来同步文件**，写错格式会破坏部署）、smoke 检查项格式
- `.github/workflows/ci.yml`、`deployment.test.mjs`——wiring 断言写法（测试会 grep 文件内容锁定集成）
- `CHANGELOG.md`——版本条目格式（当前最新版本号以文件为准，新增条目顺延）

## 4. Hydro v5 线上事实（以此为准）

### 4.1 基础

- Hydro v5.0.7，UI 包 ui-default 4.58.5，服务监听 127.0.0.1:8888，由 Caddy 反代 https://swpuacm.xyz
- 域：`system`（本地题 4298 道）与 `poj`（vjudge 远程判题 3031 道）。积分对**全部域**生效（POJ 远程 AC 也是真实做题）
- 用户 uid：0=Guest，1=Hydro（系统），2=kitty（超管），3=judge（priv=-1 root），4=core
- 前缀约定：本插件所有新集合名以 `swpu` 开头（现网沿用此前缀，未随仓库改名），避免与 Hydro/第三方插件冲突

### 4.2 badge-for-hydrooj 模型（global.Hydro.model，直接调用）

```text
BadgeModel = global.Hydro.model.badge:
  badgeGetMulti(ctx)                       -> FindCursor<Badge>   // 全部徽章
  badgeGet(ctx, id: number)                -> Badge | null
UserBadgeModel = global.Hydro.model.userBadge:
  userBadgeAdd(ctx, uid: number, badgeId: number)      -> Promise<ObjectId>  // 插一条持有记录
  userBadgeGetMulti(ctx, uid: number)                  -> FindCursor          // 某人的持有列表
  userBadgeDel(ctx, uid: number, badgeId: number)
  userBadgeSel(ctx, uid: number, badgeId: number)      // 佩戴（设置 user.badge 序列化串）
  userBadgeUnset(ctx, uid: number)                     // 摘下佩戴
```

Mongo 集合（Hydro 默认库内）：
- `badge`：`{ _id: number(徽章id), short: string(徽章上的字,≤3字), title: string(悬停/详情标题), backgroundColor: string(形如 #2a5caa,含#), fontColor: string(形如 #ffffff), content: string(Markdown介绍), users: number[](被管理员直接分配的uid), createAt: Date }`
- `userBadge`：`{ _id: ObjectId, owner: number(uid), badgeId: number, getAt: Date }`（持有关系表）

佩戴机制（只读了解，**本插件不要碰**）：badge 插件会把 `user.badgeId` 和序列化串 `user.badge = "{id}#{short}{bg}{font}#{title}"` 冗余进 user 文档，供全站用户名旁渲染。兑换成功后我们**不自动佩戴**——页面提示用户去 /mybadge 自行佩戴（/mybadge 是 badge 插件的路由）。

### 4.3 record（评测记录）与判题事件

- record 文档关键字段：`{ domainId: string, docId: number, uid: number, status: number, score: number, ... }`，**status === 1 表示 Accepted**（Hydro STATUS.STATUS_ACCEPTED = 1）
- 判题落库后触发的事件：`ctx.on('record/change', hook)`。**hook 收到的负载形态以 plugin-dfacm-ops/live-rp.cjs 中 hook 函数的实际实现为准**（它从负载里取了 domainId 并判断终态），照抄其取值方式，不要自己发明字段名
- 防重入守卫（多 pm2 实例时只跑一份）：`if (!process.env.NODE_APP_INSTANCE || process.env.NODE_APP_INSTANCE === '0')`，照抄 swpu-ops
- 题目 document 字段：`{ domainId, docId, docType: 10, title, difficulty: number|null, hidden: boolean, nSubmit: number, nAccept: number, owner: number(uid) }`。**线上 7329 题的 difficulty 全部为空**，难度靠 4.4 节算法从 nSubmit/nAccept 推导；nSubmit/nAccept 数据有效

### 4.4 难度算法（Hydro 内置 lib/difficulty.ts，全文照抄移植进本插件，不要改逻辑）

```js
const _CACHE_INFO = {
    s: 0.0,
    y: 0,
    values: [0.0],
};

function _LOGP(x) {
    const sqrtPi = 2.506628274631; // Sqrt[Pi]
    return (2 * Math.exp(-2.0 * (Math.log(x) ** 2))) / x / sqrtPi;
}

function _intergrateEnsureCache(y) {
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

function _integrate(y) {
    _intergrateEnsureCache(y);
    return _CACHE_INFO.values[y];
}

function difficultyAlgorithm(nSubmit, nAccept) {
    if (!nSubmit) return null;
    const s = _integrate(nSubmit);
    const acRate = nAccept / nSubmit;
    const ans = Math.round(10 - 13 * s * acRate);
    return Math.max(ans, 1);
}
```

难度取值口径（与 Hydro rp 脚本完全一致）：`const difficulty = +pdoc.difficulty || difficultyAlgorithm(pdoc.nSubmit, pdoc.nAccept) || 5;` 返回范围 1~10。

### 4.5 权限常量

- `PRIV.PRIV_USER_PROFILE`：登录用户（badge 插件的 /mybadge 用它）
- `PRIV.PRIV_MANAGE_ALL_DOMAIN`：域管理员（badge 插件的 /manage/badge 用它）
- 游客路由权限常量请在本地 `node_modules/hydrooj/src/model/builtin.ts` 核对（PRIV.PERM_BASIC 或等价物），确认后再用

### 4.6 i18n 与 UI 注入

- `ctx.i18n.load('zh', {...})` / `('en', {...})` 中文英文都要（参考 badge 插件 i18n 键列表风格）
- `ctx.injectUI('UserDropdown', 'shop', () => ({ icon: 'credit-card', displayName: 'shop' }))`——用户下拉菜单加入口（badge 插件对 user_badge_manage 的做法是 `icon: 'crown', displayName: 'user_badge_manage'`，i18n 里对应 `shop: '积分商店'`）
- `ctx.injectUI('ControlPanel', 'shop_manage')`——控制面板加"积分商店管理"入口

## 5. 详细设计

### 5.1 新增 Mongo 集合（2 个）

**`swpuPointsLedger`（积分流水账本，追加式）**
```
{ _id: ObjectId,
  uid: number,
  delta: number,          // 正=入账 负=扣减
  kind: 'solve' | 'redeem' | 'admin' | 'backfill',
  ref: string,           // 幂等键：solve 用 `solve:{domainId}:{docId}`；redeem 用 `redeem:{badgeId}`；admin/backfill 也各带可读 ref
  detail: string,        // 人类可读明细，如 "P1000 A+B问题" / "兑换徽章：队长"
  ts: Date }
```
- **唯一索引 `{uid:1, ref:1}`**——这是防刷与防双花的根基（同一人同一题只入账一次；同一人对同一徽章只能扣一次分）
- 查询索引 `{uid:1, ts:-1}`
- **余额 = sum(delta)**，用 aggregation `$sum` 实时算，v1 不做缓存（用户量小；在代码注释里注明将来可加缓存集合）

**`swpuBadgePrice`（徽章定价表，_id 即 badgeId）**
```
{ _id: number(badgeId), price: number(正整数), enabled: boolean, updatedAt: Date }
```

### 5.2 赚分逻辑（points.ts 导出纯逻辑 + index.ts 挂事件）

```
awardSolve(ctx, {uid, domainId, docId}):
  1. 防守卫：uid 必须有 PERM_USER_PROFILE 权限（排除 uid 0 Guest / uid 1 Hydro 系统号，参考 rp 脚本 `udoc?.hasPriv(PRIV.PRIV_USER_PROFILE)` 判法——但事件路径拿不到 udoc 时，直接 uid<=1 早退即可，注释说明）
  2. 查题目 document {domainId, docId}：不存在/hidden/owner===uid -> 直接返回 0（自建题不算，防刷口径与 rp 脚本一致）
  3. const difficulty = +pdoc.difficulty || difficultyAlgorithm(pdoc.nSubmit, pdoc.nAccept) || 5
  4. insert ledger {uid, delta: difficulty, kind:'solve', ref:`solve:${domainId}:${docId}`, detail: pdoc.title, ts:new Date()}
     —— 用唯一索引兜底幂等：insert 冲突（E11000 duplicate）静默返回"已入账"，绝不报错（重交已 AC 题 / 事件重放都靠这个挡）
  5. 返回入账分值
```
- 事件挂载：`ctx.on('record/change', hook)`，hook 里判断 record 终态为 AC（status===1，以 live-rp.cjs 从负载取 status 的方式为准）后调用 awardSolve。**注意**：事件负载里如果拿不到 domainId/docId/uid 完整字段（看 live-rp 怎么取），缺什么就反查 record（`RecordModel` 或 ctx.db.collection('record') 按 rid 查）
- **错误隔离**：hook 内 try/catch，计分失败只 console.error，绝不让异常冒泡影响判题流程（照 live-rp 的容错风格）

### 5.3 兑换逻辑

```
redeem(ctx, uid, badgeId):
  1. priceDoc = swpuBadgePrice.findOne({_id: badgeId})，不存在或 !enabled -> 抛业务错误"该徽章未上架"
  2. badge = BadgeModel.badgeGet(ctx, badgeId)，不存在 -> "徽章不存在"
  3. 已持有检查：userBadge 集合 findOne({owner: uid, badgeId})，存在 -> "你已拥有该徽章"
  4. balance = sum(ledger)；balance < price -> "积分不足"（错误信息带上当前余额与所需积分）
  5. 扣分入账：insert ledger {uid, delta: -price, kind:'redeem', ref:`redeem:${badgeId}`, detail:`兑换徽章：${badge.title}`}
     —— 唯一索引天然防重复兑换/双花；insert 失败(重复键)按"已兑换过"处理
  6. 发放：UserBadgeModel.userBadgeAdd(ctx, uid, badgeId)
  7. 重定向 /mybadge，提示"兑换成功，请在此佩戴徽章"
```
- 并发说明（写进代码注释）：单实例 pm2 + 第 5 步唯一键，双花窗口仅剩"两请求同时过第 4 步检查"的窄场景，v1 接受（用户量级极小），未来可升级 Mongo transaction
- 用户在 badge 插件 /mybadge 佩戴后，徽章即出现在全站用户名旁——不需要本插件做任何展示端工作

### 5.4 路由表（index.ts）

| 路由 | 权限 | 说明 |
|---|---|---|
| GET `/shop` | 游客可看（用 4.5 节核对的游客常量） | 商店页：徽章卡片表格（预览色块/标题/价格/状态/操作）。登录者显示"我的积分"与兑换按钮；游客按钮显示"登录后兑换"（链接 /reg?tab=login） |
| POST `/shop/redeem` | PRIV_USER_PROFILE | 兑换，表单 hidden badgeId + submit（参考 regcode 密码登录表单的写法） |
| GET `/shop/history` | PRIV_USER_PROFILE | 我的流水（分页 20/页），列：时间/类型/明细/变动/累计余额（按 ts 升序前缀和） |
| GET `/manage/shop` | PRIV_MANAGE_ALL_DOMAIN | 定价管理：列出全部徽章（含未定价），每行价格 input + enabled checkbox，单行保存 |
| POST `/manage/shop` | PRIV_MANAGE_ALL_DOMAIN | operation=price，字段 badgeId/price/enabled，@param 校验（price: Types.PositiveInt，enabled: Types.Boolean 或 checkbox 约定——看仓库现有表单怎么处理 checkbox） |

模板：`templates/shop.html`、`templates/history.html`、`templates/manage.html`，全部 `{% extends "layout/basic.html" %}`。徽章预览沿用 badge 插件的 DOM 约定：`<span class="user-profile-badge v-center" style="background-color:{{ bdoc.backgroundColor }};color:{{ bdoc.fontColor }};" data-tooltip="{{ bdoc.title }}">{{ bdoc.short }}</span>`（backgroundColor/fontColor 存库时已含 `#`，直接用）。徽章标题链接到 `/badge/{{ id }}`（badge 插件详情页）。

### 5.5 回填脚本（addScript，模式照 swpu-ops 的 swpuWeeklyReport）

`ctx.addScript('swpuShopBackfill', 'SWPU 积分商店：回填历史 AC 记录的积分', Schema.object({ domainId: Schema.string().default('') }), runBackfill)`
- 扫 record 全域 status===1，按 (uid, domainId, docId) 去重逐条 awardSolve（幂等键保证脚本可重复跑、增量跑）
- kind 记 'backfill'（ref 仍用 solve: 前缀——同一人不重复，回填与事件入账天然互不冲突）
- 站点 2026-10-01 才上线，记录量极小，一次跑完即可；写 progress 上报

### 5.6 测试（node:test，全 stub，不起真 Mongo）

至少覆盖（文件名对齐仓库惯例，如 `plugin-dfacm-shop/points.test.cjs`）：
1. 难度算法移植正确性：nSubmit=0 → difficulty 链 fallback 到 5；正常 nSubmit/nAccept 产出 1~10；difficulty 显式存在时优先
2. awardSolve 幂等：同一 (uid, domainId, docId) 第二次 insert 撞唯一索引 → 返回"已入账"且不抛错
3. awardSolve 排除：hidden 题、owner===uid、uid<=1 不入账
4. redeem 四分支：未上架拒 / 已持有拒 / 余额不足拒（错误文案含余额数字）/ 成功（扣分+发徽章各调用一次）
5. redeem 幂等：同 badgeId 第二次兑换被"已持有"拦下
6. 余额 aggregation：多笔正负混合算对
7. wiring 断言（进 deployment.test.mjs，对齐现有 wiring 测试写法）：shop.html/history.html/manage.html 三个模板存在且含关键类名；deployment.md 出现 swpu-shop 的 cp 块；addon 注册示例文件含 swpu-shop；ci.yml 含 shop 测试行

### 5.7 集成分清单

- `deploy/deployment.md`：新增"积分商店插件"小节——cp 块（**格式必须能被 deploy.sh 解析**，照现有 regcode/train 插件段落抄结构）、服务器注册步骤（addon.json 加路径、node_modules/hydrooj 软链）、回填脚本执行步骤、验收项（/shop /shop/history /manage/shop 返回码与页面内容）
- `deploy/smoke.sh`：加 `/shop` 200 检查项（游客可达）与 `/shop/history` 登录态检查（看现有登录态 smoke 项怎么做，照抄模式）
- `.github/workflows/ci.yml`：shop 测试文件加进测试矩阵行（照现有行）
- `deployment.test.mjs`：5.6 节第 7 条的 wiring 断言
- `addon.json.example`（或实际文件名）：加 swpu-shop 路径行
- `CHANGELOG.md`：新版本条目（版本号顺延现有最新，内容用一句话+要点列表描述积分商店）
- `README.md`：插件清单加 plugin-dfacm-shop 一行（若有清单段落；没有就建一个简短的功能清单段落）

## 6. 预期产出文件清单

```
plugin-dfacm-shop/
  index.ts        路由/Handler/i18n/UI注入/事件钩子/addScript
  points.ts       纯逻辑层：difficultyAlgorithm 移植、awardSolve、redeem、余额、流水查询（便于单测注入 stub db）
  templates/shop.html
  templates/history.html
  templates/manage.html
  package.json    { name, version: 0.0.1, main: "index.ts", devDependencies: { hydrooj } }（对齐现有插件写法）
  points.test.cjs （命名若与仓库惯例不符按惯例改）
```
外加 5.7 节的集成分改动。**不要创建本规格书之外的文件**（比如不要造 standalone 网页/mock 页面）。

## 7. 验收（完成前自查）

1. `node --test` 跑全部新旧测试文件全绿（仓库现有 103 项测试零回归）
2. `bash -n` 校验所有改动的 .sh
3. 本地 `git status` 干净后再 commit；commit message conventional 风格
4. 报告：实现了什么、测试结果、遗留事项（如有）
