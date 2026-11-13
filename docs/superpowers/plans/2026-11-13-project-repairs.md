# dfacm 项目修复总计划 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复 20 项新增确认问题和 1 项历史积分回填问题，形成逐批可测试、可发布、可回退的变更。

**Architecture:** 按业务一致性、页面入口、部署与维护、RP、AI、播报与采集六个模块拆分。每个任务先加入失败回归，再修实现；模块间可并行，集成和发布逐批验证。

**Tech Stack:** Hydro addon / TypeScript / CommonJS / MongoDB / HTML / Python / SQLite / Bash

**Spec:** 本文的“修复范围与批次”“迁移与既有数据”“设计边界”构成六份模块计划共同的修复需求。审查依据保存在本机 `qa/audit-2026-11-13/audit-report.md`，执行不依赖该私有目录。

**Status（2026-11-14）:** A–F 实现已提交，C1/C2/D1/F1–F5 的独立任务评审完成；I1 本地 CI/发货/文档集成及最终验证完成。2026-11-14 最终独立全分支评审覆盖全部 17 个任务，明确确认恢复的 A/B/E 当前规格 PASS，无 Critical/Important；历史 RED 缺口不补造，生产发布、真实页面/服务验收和实际数据修正仍未执行。原审查基线 main / 31afcb8；原计划日期与修复分支标识保留 2026-11-13。

## Global Constraints

- Hydro **5.0.7**、ui-default **4.58.5**；Node.js **>=22.13**。测试实例以 Node 22 为主要兼容基线。
- 依赖按现有锁文件安装，保持当前版本；生产 addon 复用已有 Hydro 包，不在运行目录执行 npm ci。
- 保留 swpu 集合、路由与生产 addon 名称；数据迁移采用新增字段/状态，不删除已有记录、队列、水位或人工复核。
- 本轮只修已确认行为；退款后的商品重试规则、训练摘要权限策略两个候选项单独决策。
- 单进程内存锁不能作为多进程保证。发布前核对实际 worker 数和独立消费入口；多 worker 场景必须增加持久互斥/原子扣款并通过跨进程测试。
- 本计划的生产发布和真实数据修正分别准备可审查的发布包、备份、清单和回退；不能由本地测试通过推断已完成线上验收。

---

## 修复范围与批次

下表同时作为六份模块计划的需求清单。QA 审查证据仅用于辅助；所有修复回归必须进入可提交 tests，不依赖本机 qa 文件存在。

| 批次 | 模块计划 | 覆盖编号 | 交付和验收重点 |
| --- | --- | --- | --- |
| A，最先处理 | [积分、称号与回填](2026-11-13-commerce-repairs.md) | 01、02、03、04、K01 | 自测/生成不入账；所有消费共用 UID 锁；余额不透支；首存仅铸造一枚；停用之后无新增持有；回填越过 20,000 条并可续跑 |
| B | [登录与多域](2026-11-13-auth-domain-repairs.md) | 05、06 | /d/poj 的读写和跳转始终在本域；游客可发现原生第二因素入口 |
| C | [部署与题库维护](2026-11-13-deploy-taxonomy-repairs.md) | 07、15 | 安装任一步失败即停止并恢复已写文件；受控题解验证不修改正式统计，清理只处理本批验证记录 |
| D | [RP 调度](2026-11-13-rp-repairs.md) | 08、19 | 同 worker 的手动/实时/定时计算 maxActive=1；停止后队列不再开始副作用 |
| E | [AI 流与审核恢复](2026-11-13-ai-repairs.md) | 09、10、11、18 | DONE 后无需 EOF；迟到记录有界补扫；重启后状态对账；同秒来源保留但不虚构先后 |
| F | [播报与赛事采集](2026-11-13-broadcast-collector-repairs.md) | 12、13、14、16、17、20 | 停机 AC 可恢复；失效卡片不发送；身份用 UID；复查跨页前进；坏响应显示失败；失败源出现在 stats |

K01 是之前发现的历史积分回填无游标问题。编号 01–20 与深入审查报告一致。

## 推荐顺序与并行边界

1. A 先完成计分资格和共同消费锁，再完成称号生命周期与历史回填。前四个行为共享 points/titles，不拆给同时修改同文件的执行者。
2. B 和 C 的部署部分可在独立分支并行；A、B 的修复发布之前必须先验证 C 的失败停止与回退。
3. D、E、F 可按文件范围并行。F 内先修队列迁移/启动恢复，再修投递、身份和分页；collector 两项可独立于 bot 实施。
4. C 的题库计数任务应在下一次题解批处理前完成。真实数据核对与纠正只在相应代码修复验收后开展。
5. deploy/deployment.md、.github/workflows/ci.yml 和顶层文档由集成人统一合并；新增运行文件必须进入发货清单，避免多个模块同时改这些文件冲突。

## 任务验收与集成门槛

- [ ] 把现有 QA 的缺陷断言转为“预期正确行为”的可提交回归，确认红→绿；复现脚本 exit 0 原本表示缺陷存在，不能直接当修复验收。
- [x] 2026-11-14 最终独立全分支评审覆盖全部 17 个任务的当前本地规格、共享消费锁、恢复游标、迁移与补偿异常/中断/重跑条件；无 Critical/Important，不补造缺失的早期评审记录。
- [x] 使用既有隔离工作树 `/home/core/.codex/worktrees/afd6/dfacm` 与 `fix/project-audit-2026-11-13` 分支实施，保留原批准计划。
- [x] 集成后执行七个 Node 包及根/题库新增回归：716/716，零失败/跳过；Python 3.14 collector 14 个 unittest 方法加原有导入时 fixtures，广播 57 个纯离线方法通过，不用旧 535 固定计数。
- [x] train check:build、assistant check-build、watch check-build/check-public、根 preview/repository/deployment 检查通过；新增运行文件进入实际发货/安装清单和 CI。最终归档与哈希清单在全分支评审之后准备。
- [ ] Hydro 5.0.7/ui-default 4.58.5 测试实例验收正式提交与自测、同 UID 并发消费、system/poj 多域、第二因素、两进程提示/补扫、重判和进程重启。
- [x] 使用 Python 3.14.4 与现有 collector requirements.lock 安装的隔离环境完成 fixtures/广播本地验收；CI 保持 Python 3.14，未声称远端工作流已运行。
- [x] 广播用假消息通道和本地源验证投递结果；真实消息通道验收仍未执行，须另备明确测试对象。
- [ ] 每批记录提交、版本、测试输出、发布文件哈希、旧文件备份与回退命令。发布失败先恢复本批文件，避免继续重启混合版本。

## 迁移与既有数据

A：保持原账本、价格和称号集合；新回填状态单独按域/轮次保存。修复先阻止新的错误积分与透支，随后只读核对可疑记录、重复称号和负余额，输出带依据的修正清单；不自动全量重建账本或批量扣分。

E：新扫描游标使用版本化 key；旧报告缺时间元数据时按 ObjectId 的秒区间惰性兼容。只更新/重算保留期内报告，保留原 analysis、review、reviewHistory，自动结论继续 undetermined。

F：SQLite 加列使用独立 delivery_schema，禁止触发现有 records_schema 升级的 DROP TABLE 路径。旧 card_sent=1 同时包含已发与历史抑制，不能猜测并自动重播。备份使用 SQLite Connection.backup，同时保存 state.json。

所有实际数据纠正必须有对象清单、幂等操作标识、执行前备份、执行后核对和回退方式；与代码提交分开记录。

## 设计边界

- 共享 UID 内存锁方案只保证单 worker。若部署实际存在多个消费 worker，A 的发布验收必须增加数据库原子余额预留/持久操作状态和两个真实进程的并发测试；不能照搬本机单进程通过结论。
- 无可信毫秒时间的旧记录使用 [t0,t0+1000ms)；同秒相似来源属于先后不确定的上下文，不能直接提高为确定的“提交前使用 AI”。
- RP 的共享锁覆盖同 worker 网页脚本；独立 CLI 仍须错峰或走统一调度，不声称进程内锁覆盖 CLI。
- 两个候选项（退款后重兑策略、训练摘要权限）不纳入本轮语义变更；修复过程中发现与它们有关的失败应单独记录。

## 当前状态

A–F 代码已提交并通过本地最终验证，I1 完成共享发货与 CI 集成。实际提交及新当前证据详见 [2026-11-14 修复报告](../reports/2026-11-14-project-repairs.md)。2026-11-14 最终独立全分支评审已逐项确认全部 17 个任务的当前本地规格 PASS，覆盖 `31afcb856a860bb88ba8b0efab2ebfe9479d5195..0cf00540bac44bb73187e6ae7f468c5864c1702e` 的 22 个提交、96 个变更路径，无 Critical/Important。恢复的 A1–A3/B1–B2/E1–E3 当前评审复选框据此关闭；原始历史 RED/早期评审记录未完整恢复，不由当前 PASS 或本地绿色结果补造。三项非阻塞 minor 在本次文档/空白收尾中处理，仍由负责人执行一次 scoped re-review。

当前本地证据：七包 595 项 + 根 preview/landing/repository/deployment 90 项 + taxonomy 31 项，共 716/716；collector 14 方法和 legacy fixtures、broadcast 57 方法、四项 build/public 与 12 个 shell 脚本语法/ShellCheck 通过。A3 146 项原生断言、C2 原生回调/计数/重启与 D1 三阶段卸载证据为本执行链中已核验的既有结果，未重复计入 I1 测试总数。

真实 Hydro 登录/第二因素、多域页面操作、正式 Web 提交与消费、生产 worker/CLI/callback 拓扑、隔离服务器故障注入、真实 daemon/WebSocket/沙箱验收、真实消息通道以及实际数据纠正仍未完成。未升级依赖、部署、推送或合并；最终全分支评审已完成；本次 minor 收尾的 scoped re-review、Git 归档与哈希清单仍由负责人后续完成。
