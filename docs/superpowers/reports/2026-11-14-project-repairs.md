# dfacm 项目修复本地集成报告（2026-11-14）

原计划为 [2026-11-13-project-repairs.md](../plans/2026-11-13-project-repairs.md)，修复分支保留 `fix/project-audit-2026-11-13`。A–F 的实现已提交，I1 完成 CI、实际发货/安装清单及文档集成，本地最终检查通过。C1/C2/D1/F1–F5 已有独立任务评审记录；恢复的 A/B/E 独立评审证据未完整取得，最终全分支评审和归档哈希清单尚待负责人完成。没有执行生产发布、推送、合并、真实数据纠正或真实消息/赛事源访问。

## 问题与提交

| 批次 / 问题 | 实现提交 | 行为与证据 |
| --- | --- | --- |
| A1 / 01 | `fc3218e` | 自测/生成排除在正式积分之外，实时与回填共用资格。shop 回归覆盖原有资格、去重与判题不受影响。 |
| A2 / 02、03、04 | `b28abc2` | 同 UID 的消费、称号首存/修改/管理共用锁，首存铸造和停用生命周期一致；只保证单 worker。shop 本地并发/异常回归通过。 |
| A3 / K01 | `8a9abaa` | 固定上界、原生 BSON 游标和按域/轮次 checkpoint 续跑；保留原账本。已有独立原生 146 断言覆盖 20,001 条、五个 fresh CLI 进程、插入后异常与重试、新轮次旧记录重判。 |
| B1 / 06 | `1afa86c` | 游客可找到原生第二因素登录入口，管理员密码门控、安全 redirect 与 iframe 行为保留；regcode DOM/handler 回归通过。真实登录仍待验收。 |
| B2 / 05 | `dd8fddb` | 训练 API、DTO 与导航保留当前域；train/根 preview 回归及原生构建通过。system/poj 真页面操作仍待验收。 |
| C1 / 07 | `3555e5c`、`44e4fd3` | 预备、备份、逐项发布与逆序安全回退；任何失败停止后续重启。重启中信号/失败保留 INCOMPLETE 和诊断，不假定进程全切换或全恢复。真实文件系统/模拟 SSH 故障回归通过。 |
| C2 / 15 | `bb3d2d7`、`d3560ec` | 原生受控 full-data 验证隔离正式统计，精确持久 RID/history 所有权、清理封存和同上下文终态重放封锁；保守 pending。taxonomy/ops 回归与既有隔离原生证据通过。 |
| D1 / 08、19 | `eb6280b`、`6b98a26` | 同 worker manual/live/scheduled 共用 RP 锁，取锁后与各副作用阶段复查停止；真实 Cordis `ctx.effect` 卸载停止全部实例。已核验三进程 queued/armed/inflight 原生证据；I1 仅修定时器断言说明。 |
| E1 / 09 | `0c8ee84` | SSE DONE 后无需等待 EOF；assistant 新旧流/客户端回归与构建通过。 |
| E2 / 10、18 | `3fcb78e` | 有界迟到补扫、独立版本游标、重启后对账；人工复核与旧 key 保留。Watch 本地回归含隔离原生 Mongo 双进程/杀 owner 两例，零跳过。 |
| E3 / 11 | `3057a7c` | ObjectId 使用秒区间，同秒来源保留为先后不确定上下文；规则、证据和 UI 同批更新，`time.cjs` 保留在 Watch 独立发布清单。 |
| F1 / 12 | `78d883f` | additive delivery_schema、启动/停机恢复与成功投递证据，已 delivered RID 不因重队列再播；SQLite 资源关闭。 |
| F2 / 13 | `b20d624` | 同步结果和每次 image/text 投递前复查原始来源；非 AC/失效撤队，错误保留资格/pending，重新有效可恢复。 |
| F3 / 14 | `02a8f1b` | QQ 归属取原始 submission UID 的活动已验证绑定；兼容统计 personID，旧空 UID 不按名字猜测，提供重新确认。 |
| F4 / 16 | `610807e` | recent/stale 固定快照与持久 after 游标，每轮有界跨页；只有成功同步/去重后推进，新记录水位独立。 |
| F5 / 17、20 | `198f3a9` | Devpost/DataFountain 必要响应结构与真空列表区分；失败保存旧数据并继续其他源，stats 包括首次失败源且 latest 按 MAX(id)。 |
| I1 / 集成 | 本报告所在集成提交 | ops helper 与四个 taxonomy runtime 实际安装，交付绝对 locator 验证；CI helper 重启检查、逐文件 shell 解析、锁定 ops 安装及 offline taxonomy/broadcast；总计划与六模块状态更新。 |

## 最终本地检查

I1 使用 Node **22.23.5**、Python **3.14.4**、ShellCheck **0.11.0**；支持基线仍为 Hydro **5.0.7**、ui-default **4.58.5**、Node **>=22.13**。原生生命周期证据对应 Cordis **4.0.0-rc.8**。依赖沿用已提交锁定版本，I1 未改 package/lock/requirements，生产 addon 复用已安装 Hydro 包，保留历史 `swpu-*` 名称、路由和集合。

| 检查 | 当前 I1 结果 |
| --- | --- |
| 七包 npm test | regcode 70、train 77、shop 79、ops 93、calendar 72、assistant 156、Watch 48：595/595 |
| 根 preview / landing / repository / deployment | 90/90 |
| taxonomy offline | 31/31 |
| Node 合计 | **716/716，零失败、零取消、零跳过** |
| train check:build、assistant check-build、Watch check-build/check-public | 全部 exit 0；Watch 公开源码检查 38 文件、零问题 |
| Python 3.14 collector | 14 unittest 方法 OK；同次 discovery 执行原有 Devpost/DataFountain/DrivenData/M2 导入时 fixtures，全部 PASS |
| Python 3.14 broadcast | 57 unittest 方法 OK，ResourceWarning 作为 error |
| shell / Python / fixture 语法 | 12 脚本逐文件 bash -n + ShellCheck warning 级通过；24 Python 文件 compile 通过；D1 fixture node --check 通过 |
| 离线 CI 配置操作 | 实际 YAML 中主题/重启 wiring、注入 sink、CSRF 与文档 tuning 四项脚本通过；diff --check 通过 |

命令为七包各目录 `npm test`；根目录 `node --test scripts/preview.test.cjs scripts/landing.test.cjs scripts/repository.test.cjs scripts/deployment.test.mjs`、`node --test scripts/taxonomy/tests/solutions-apply.test.cjs`；两 Python 项目分别运行 `python -B -m unittest discover -s tests -p 'test_*.py'` 与广播 `python -B -W error::ResourceWarning -m unittest discover -s tests -p 'test_*.py'`。collector 设置 `ACH_ENABLE_SCHEDULER=0`。Watch 可选原生 tests 仅访问 `mongodb://127.0.0.1:27713`，创建随机隔离数据库，不使用生产库。

已有 shipping RED（漏 `controlled-history.cjs`）以及 I1 新 RED（真实 sync-only 漏 taxonomy runner）均保存；相同两项 focused case 修复后 2/2，通过结果已包含最终 90 项根用例，不重复计数。集中执行时主题 CI 检查与部署回归的临时品牌文件改写重叠，初次 exit 1；原检查单独诊断与部署完成后复跑均 exit 0，未改业务源码或隐藏初次日志。Node MockTimers/TypeScript strip 实验警告及锁定 Starlette/httpx TestClient deprecation 已记录，没有升级依赖以掩盖它们。

本地完整命令、退出码、计数与日志保存在本机 `.superpowers/sdd/2026-11-13-project-repairs/I1-report.md` 与 `verification/i1-*.log` / `i1-results.json`；报告不包含私有 QA 内容。既有 A3/C2/D1 原生验收源码未变，按范围复用已核验结果，不重复昂贵验收，也不计入 716。本机没有安装 Caddy 或运行远端 GitHub Actions，真实 Caddy download/adapt、完整历史 secret scan 和远端 CI 结果未在此宣称。

## 两项实现取舍与交付要求

**受控 history：** stock Hydro 5.0.7 缺少 native RID/batch 到私有 history ID 的关联，选择在现有 ops addon 中安装 opt-in 严格 `controlled-history.cjs`。它校验准确版本/方法指纹、原生模型身份、service UID/username、代码和批次标记；默认关闭，卸载或不兼容就阻止提交/发布。代价是 loader/core 形态改变必须另行原生复核；判断错误时应保持 disabled，而非猜所有权。

自动部署把四个 taxonomy runtime 放在 `$REMOTE_DEPLOY/scripts/taxonomy/`，helper 在 `$REMOTE_ADDONS/swpu-ops/controlled-history.cjs`。交付布局须设置 `DFACM_CONTROLLED_HISTORY_MODULE` 为该 helper 的绝对路径，并在 CLI **及每个 callback host** 明确启用 `DFACM_CONTROLLED_HISTORY=1`。现有 `user-lock.ts` / `backfill.ts` 和 Watch `time.cjs` 发货保持；Watch/assistant/bot/collector 按各自文档独立发布。详细安装与恢复见 [deployment.md](../../../deploy/deployment.md) 和 [taxonomy README](../../../scripts/taxonomy/README.md)。

**QQ 身份：** original submission UID 决定绑定归属，统计合并后的 personID 不提供 QQ 到 source UID 的可信关系；canonical 计数、排名、头像/显示继续保留。代价是合并账户不会自动继承另一个 UID 的 QQ 归属，若需要继承须另设计显式多 UID 确认。既有已填 legacyUID 的猜测来源无法恢复，未授权根据用户名批量纠正；当前绑定数据保留。

## 迁移、回退与剩余发布门槛

- A 的回填状态按域/轮次新增；旧账本不重建。真实积分、重复称号或负余额纠正另备对象/依据清单、幂等标识、执行前备份、执行后核对与回退。单 worker UID/RP 内存锁须核对实际 worker/CLI 入口；多个消费 worker 必须先完成持久互斥/原子扣款与跨进程验收。
- C1 本批 inventory/journal/recovery、原文件哈希与权限保存在私有备份。重启未知或回退冲突时先停其他发布、持有同一 activation.lock、逐项核对 INCOMPLETE；核实后才清除标记，不能盲目重跑完整部署。真实隔离服务器故障注入仍待完成。
- C2 复用同主机同 canonical batch/state 路径；超时、调度不明或 history 冲突保留 pending，不盲目重判或清理。先证明终态/取消、精确 ownership 和数据身份，再人工决定恢复。真实 daemon、WebSocket 断线/消费拓扑、沙箱及未支持题型验收仍待完成，旧计数快照回写不能作为回退。
- E 的旧 key、analysis/review/reviewHistory 保留；只在有界保留期重算，秒级时间不能提高成确定“提交前 AI”。需验证实际 worker 与真实页面证据展示。
- F 发布前用 SQLite Connection.backup 同时保存数据库与 state.json；additive 加列不触发旧 DROP TABLE 路径、不删水位。旧 card_sent=1 不自动重播；回退旧代码保留新增字段，旧代码期间不维护 delivered_at，重新上线前需核对该段投递状态。实际备份/迁移、真实消息通道验收和历史身份修正未执行。
- 真实 Hydro 第二因素登录、system/poj 浏览器操作、正式 Web 提交/消费以及生产发布仍待验收。最终全分支评审后再生成 Git archive 与哈希清单、准备可审查发布/备份/回退材料；本次未生成提前的发布归档。
