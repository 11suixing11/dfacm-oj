# 服务器 /root 与本地工作区清单 · 2026-10-12

> 目的：把"哪些能删、哪些绝不能删"固化成表，防止下一次清理时误删重放资产，
> 也防止把一次性工作目录当成生产依赖供着。
> 复核方式：`ls -d /root/*/` + `du -sh` 逐目录实测 + 本地 `Get-ChildItem` 盘点，
> 关键"必留"项（重放目录、数据源）均与既有部署文档交叉确认。
> 磁盘现状：14G/50G（27%）——本文档解决的是管理面，不是容量。

---

## 执行记录 · 2026-10-12 08:46 CST（站长拍板"删掉"，全部执行完毕）

**服务器**：表一 ✅可删 全部执行。补录并删除了 3 个漏分类的 2026-10-03 迁移回滚目录
（`swpu-backup-authclean-20261003-152055` / `swpu-regcode-backup-20261003-020419` /
`swpu-native-dark-backup-20261003-000749`）。附条件项也已完成：`p5-spj` 在确认
#10003 testdata 内 spj.cc 副本无恙后删除（源码已归档 `deploy/checkers/`）；vjudge CF
账号先备份（`/root/backups/vjudge-cf-account-backup-20261012.json`，849B）再删，
**POJ 账号完好**。`/root` 终态 = 六个必留目录：backups / fps / NOIP / packs /
swpu-rank-deploy / swpu-theme-deploy。

- ai_* 空集合实际有 17 个（本表初版写的 `ai_msg` 名字不准）：删掉 15 个空的；
  **保留** `ai_plugin_install`（1 条，已摘除的 ai-helper 插件的 install 标记，含
  `telemetryEnabled: true` 字段——死数据，将来可清）。
- **新发现，未删、待拍板**：`oplog`(929) / `a.oplog.access`(146) / `a.oplog.error`(56)
  ——已摘除的 hydro-aoplog 插件存活期留下的访问日志，非空所以保守保留；确认无用
  可随时清。
- 审计 JSON 已归档 `/root/backups/audit-json-20261012/`（3 个）；全程日志
  `/root/backups/cleanup-log-2026-10-12.txt`（含每项体积与 df 前后对比）。

**本地**：`landing` / `taxonomy` / `diag-10003` / `culture_seed` / `zcode_run` /
`temp_oj_fix` / `_archive` 七个目录 + 4 张截图 + `zcode-shop-spec.md` 原件全部删除。
工作区只剩必留：`swpu-oj` / `promo` / `assets_src` / `xcpc-fix` / `CODELY.md`。

---

## 表一 · OJ 服务器 `/root`（107.151.246.137 / dfacm.website）

### ✅ 必留（生产依赖或唯一数据源）

| 路径 | 实测大小 | 理由 |
|---|---|---|
| `/root/backups` | 1.8G | 每日备份目标（cron 03:17，zip 自动保留 7 份）+ 全部变更前 JSON 备份。⚠️ JSON 备份无保留策略会持续增长，建议季度性裁剪已入旧 CHANGELOG 条目的批次 |
| `/root/NOIP` | 2.7G | 蓝桥杯 4464 个数据文件 + **一本通提高版 90 题 TestData**——提高版尚未导入站内，这里是未来导入的唯一数据源 |
| `/root/fps` | 220M | 全部 FPS 原始包（spj 溯源、重导、题库对账的唯一源；2026-10-12 的 spj 终扫即用此处） |
| `/root/packs` | 8.1M | ybtbas / srqc / hydroac-client 三个安装 zip（重装复用，deployment.md 引用） |
| `/root/swpu-theme-deploy` | <1M | 主题热补丁重放目录（install-theme.sh 的来源副本） |
| `/root/swpu-rank-deploy` | <1M | 排名模板 / rating floor 补丁重放目录 |
| `/root/daily-backup.sh` + root crontab | — | 备份基础设施（cron 里仅剩这一条） |
| `/root/.hydro/`（不含 addons 死目录） | — | 生产配置 / addon.json / custom 静态资产 / Caddyfile |
| `/root/p5-spj` | 32K | #10003 checker staging——spj.cc 已归档进 repo `deploy/checkers/`（2026-10-12），但保留此目录直到确认线上 testdata 内副本无恙后可转"可删" |

### ✅ 可删（一次性工作产物；结论已沉淀进 repo 或已部署）

| 路径 | 实测大小 | 说明 |
|---|---|---|
| `/root/audit` | 400M | 10-08 全站体检工作区（报告进 repo `docs/audit-2026-10-08.md`；audit-*.json 汇总建议先拷进 backups 再删） |
| `/root/lqb-out` + `/root/lqb-out2` | 136M | 蓝桥题面重建中间产物（已部署；`/root/backups` 有原文） |
| `/root/lq-media` | 7.2M | 蓝桥 Word 配图提取中间产物（图已挂到题目 additional_file） |
| `/root/repair` / `repair3` / `repair4` | 8.1M | 三轮判题数据修复 staging（已部署，备份在 `/root/backups/fixround3-*`） |
| `/root/livedata` | 6.1M | 线上数据镜像快照（已过期；再复扫必须按 etag 重拉，此目录无复用价值） |
| `/root/swpu-theme-backups` | 32M | 旧 theme css 备份堆（static/ 里另有 18 份同类 .bak，见下） |
| `/root/xcpc-fix` | 3.1M | XCPC16 修复 payload（本地 `Desktop/swpuoj/xcpc-fix/fixed/` 有同款 + `/root/backups` 有每批改前原文 + verify 脚本已进 repo） |
| `/root/ranking-dupfix` | 180K | 排名补丁重放证据（补丁脚本在 repo `deploy/patch-ranking-template.sh`） |
| `/root/recon1` `recon2` `recon3` `probe4` `stds` `sweep3` `e2e` `fps-out` `culture-seed` | 各 <10M | 各轮一次性侦察 / 调试 / 种子 staging（种子已部署并沉淀 repo `deploy/culture/`） |
| `/root/swpu-oj-test` | 16K | 并行会话的部署工作区（repo 为唯一事实源） |
| `/root/srq15-auto.sh` | — | 深基样例 cron 残件（cron 早已卸载，文件遗留） |
| `/root/hydro-install.log` | — | 10-01 安装日志 |
| `/root/.hydro/addons/` 内 3 个死目录 | — | `LGSpider-HydroOJ`、`hydrooj-resetPwd`、`swpu-ops.bak-20261004-010035`——addon.json 均未引用 |
| `/root/.hydro/static/` 内 18 份 `theme-*.css.bak-*` | — | install-theme.sh 历史备份（当日验证过即可清） |
| mongod 空集合 `a.oplog` / `ai_msg` | 0 行 | 已摘除插件的残留集合 |
| `vjudge` 集合中 codeforces 账号文档 | — | CF 盾已判死（2026-10-02 终审）；保留仅是"将来指纹工具跟进可复活"，每次启动贡献一条 error 日志。删与否由站长拍板 |

**可释放合计 ≈ 600M**（不含 backups/NOIP/fps/packs 等必留项）。

---

## 表二 · 本地工作区 `C:\Users\yuki\Desktop\swpuoj`

### ✅ 必留

| 路径 | 大小 | 理由 |
|---|---|---|
| `swpu-oj/` | 43.8M | 仓库本体（main 与 origin 同步；**landing/index.html 与线上 home.html 已验证逐字节一致**） |
| `promo/` | 51.6M | 16:9 横片管线（未完成，clips/ 空）+ 已完成竖片 `swpu-oj-promo-vertical.mp4` + 发布文案（文案数字过期：4,325 题/两条路线，需重写后重渲染才可发布） |
| `assets_src/` | 8.1M | 原版 TTF——显示字体子集化唯一源（landing 文案每改一次就要重子集） |
| `xcpc-fix/` | 3.1M | XCPC16 修复 payload 的唯一本地副本（CHANGELOG v1.25.0 引用其路径；建议将来把 payload 也收进 repo，届时降级为可删） |
| `CODELY.md` | — | 工作区记忆 |

### ✅ 可删

| 路径 | 大小 | 说明 |
|---|---|---|
| `landing/` | 66K | **过期的 pre-repo 副本**——index.html 比 repo 版旧三轮（无 topic-grid、题数 4,295、SWPU 残留 11 处）。repo 的 `swpu-oj/landing/index.html` 才是部署源且与线上零 diff。**切勿再从此目录部署** |
| `taxonomy/` | 7.1M | 题解管线工作数据（管线脚本与批次产物在 repo `scripts/taxonomy/`） |
| `diag-10003/` | 3.3M | #10003 分析产物（checker 已部署服务器 + 源码已归档 repo `deploy/checkers/`） |
| `culture_seed/` | 72K | 文化种子 staging（已部署 + 已沉淀 repo `deploy/culture/`） |
| `zcode_run/` | 11.9M | zcode 会话一次性调试脚本（inspect_db*.py 等） |
| `temp_oj_fix/` | <1M | 2026-10-12 体检/施工脚本（结论已全部进 repo docs 与本文档） |
| 根目录 4 张截图 | 131K | `mistakes-320/390.png`、`workbench-320/390.png`（10-06 UI 验收调试图） |
| `_archive/` | 19.4M | pre-repo 时代归档（repo + 服务器日备已全覆盖；删除前由站长拍板） |

### ⚠️ 归档后可删（2026-10-12 已完成归档动作）

| 路径 | 动作 | 说明 |
|---|---|---|
| `zcode-shop-spec.md` | ✅ 已拷入 `plugin-swpu-shop/SPEC.md` | shop 插件实现规格（事实快照为 2026-10-04：当时域名/uid/题数与今天不同，仅作历史规格存档）；原件可删 |

---

## 会持续再产生的（无需清理，知悉即可）

- `/root/backups`：日增 ~250MB zip（脚本自轮转保留 7 份）+ 变更前 JSON 备份（无轮转，靠人季度裁剪）
- `/root/.hydro/static/theme-*.bak`：每跑一次 install-theme.sh 一份
- pm2 日志：pm2-logrotate 10M×8 自管
- `C:\Users\yuki\Desktop\oj备份\`：本机计划任务每日 09:07 拉取（14 天自轮转 + 一次性归档永不删）

## 复核记录（2026-10-12 00:30–01:10 CST）

- pm2 六进程 online / 判题队列 0 / 非终态记录 0 / 备份 cron 正常
- 热补丁 4 处全部在位（ranking 模板×2 标记、rating floor、KaTeX 限制、locale"未解锁"）
- `#4142` 修复后全站已无 U+FFFD 判题数据（页面 fffd=0）
- FPS 五包 `<spj>` 终扫零命中（`ybt-11.xml` 唯一一道已修）
- repo landing ≡ 线上 home.html（`git diff --no-index` 零输出）
