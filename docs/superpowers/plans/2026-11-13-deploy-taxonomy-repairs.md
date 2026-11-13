# 部署失败恢复与题解验证统计修复 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 部署失败不留下混合安装，题解验证清理不覆盖真实用户统计。

**Architecture:** 部署使用暂存哈希、激活日志和逆序恢复；维护验证使用受控判题及持久批次，结果隔离，按精确RID清理，取消旧总计数快照回写。

**Tech Stack:** Bash / Python or Node fixtures / MongoDB / Hydro / node:test

**Spec:** [2026-11-13-project-repairs.md](2026-11-13-project-repairs.md)；审查编号和全局验收约束以总计划为准。

**Status（2026-11-14）:** C1/C2 代码、补充 RED→GREEN 和独立任务评审完成；发货清单、交付布局及 CI 已集成，本地 Node 22 检查已执行。隔离真实服务器故障注入、生产 callback/worker 拓扑和 daemon/沙箱验收仍未完成。 原计划与分支日期保留 2026-11-13；原审查基线 main / 31afcb8。

## Global Constraints

- Hydro **5.0.7**、ui-default **4.58.5**；Node.js **>=22.13**。测试实例以 Node 22 为主要兼容基线。
- 依赖按现有锁文件安装，保持当前版本；生产 addon 复用已有 Hydro 包，不在运行目录执行 npm ci。
- 保留 swpu 集合、路由与生产 addon 名称；数据迁移采用新增字段/状态，不删除已有记录、队列、水位或人工复核。
- 本轮只修已确认行为；退款后的商品重试规则、训练摘要权限策略两个候选项单独决策。
- 单进程内存锁不能作为多进程保证。发布前核对实际 worker 数和独立消费入口；多 worker 场景必须增加持久互斥/原子扣款并通过跨进程测试。
- 本计划的生产发布和真实数据修正分别准备可审查的发布包、备份、清单和回退；不能由本地测试通过推断已完成线上验收。

---

## C1：失败立即停止并恢复本批文件

**覆盖问题：** 07

**Files:**
- Modify: deploy/deploy.sh、install-landing.sh、install-theme.sh、deployment.md
- Test: scripts/deployment.test.mjs

**Interfaces:** 沿用现有公开接口；新增内部接口在本任务定义并同步调用方。

**修复设计：** 远端批次自行启用 set -euo pipefail。激活前对 runtime 文件及 landing/theme 的派生目标保存私有备份、原先是否存在、权限和哈希；部署互斥；激活日志逐项记录已写目标。任一安装/叶脚本/安装后哈希失败则逆序恢复并校验，未通过不得重启。当前文件已被其他操作改变时拒绝覆盖并给出具体恢复清单。

**回归用例和通过条件：** 首/中/末 install 失败都停止；landing/theme/hash 故障恢复全部已写目标；原先不存在的文件只删除本批创建项；保留权限、备份不在公开目录；回退失败清楚报错；stage-only/sync-only 语义保持。

- [x] 将上述案例写入列出的可提交测试文件，加载真实生产模块；Mongo 替身的 findOne 返回独立快照，外部网络/消息使用明确的本地替身。
- [x] 先运行下面命令，确认新增案例因当前缺陷失败；记录具体失败断言。
- [x] 按上述设计修改实现，保持接口、数据兼容和失败分支；禁止用弱化断言让测试通过。
- [x] 重跑同一命令，确认新旧测试全部通过，并执行本任务涉及的构建/语法检查。
- [x] 独立评审通过后形成一个提交，建议提交主题：`fix(deploy): stop and roll back failed activation batches`。

```bash
node --test scripts/deployment.test.mjs scripts/repository.test.cjs
bash -n deploy/deploy.sh
```

## C2：受控判题隔离正式统计，清理可恢复

**覆盖问题：** 15

**Files:**
- Modify: scripts/taxonomy/solutions-apply.cjs、run-solutions.sh、README.md
- Create: scripts/taxonomy/verify-solutions.cjs、verification-state.cjs、tests/solutions-apply.test.cjs

**Interfaces:** `verifySolutions(api, batch, stateStore)` 接收 Hydro 原生 API、带唯一批次/条目标识的题解列表和持久状态存储；返回已通过的条目及原生验证 RID。`stateStore` 对批次/RID/判题结果/清理进度做原子文件替换与持久化，重启后读取同一批次。

**选定设计：** 改为管理员 CLI 下的原生受控判题，避免先污染正式计数再猜测回退。用 `RecordModel.add(..., addTask=false)` 创建本批验证记录，再以 `RecordModel.judge(..., meta={rejudge:'controlled'})` 调度同一题目的完整测试数据；读取 `collHistory` 中的受控结果。Hydro 5.0.7 的受控回调不走原记录终态更新和 postJudge；绕过 HTTP 提交页也不会执行其 nSubmit 增量。该原生路径必须先在同版本实例验证，不能仅凭模型替身断言成立。

- [x] 添加可提交原生 API 替身测试：调度参数必须是 addTask=false 和 controlled，验证结果来自 collHistory；禁止恢复旧快照的 $set 调用。
- [x] 保存本次草稿补充/原生适配/重放修复的 RED→GREEN 断言；最初草稿前的 RED 未恢复，不补造该证据。
- [ ] 在 Hydro 5.0.7 测试实例提交能 AC/WA/CE 的验证程序，确认确实使用完整题库数据，正式 nSubmit/nAccept、用户统计、document.status 和积分账本均不变；明确远端题所走的任务类型。未验证的题型不进入可发布清单。
- [x] 接入持久批次与 RID 识别；每条 C++ 代码附唯一批次注释，以恢复创建记录后尚未来得及写状态的中断。只清理精确 UID/domain/RID/批次匹配的验证记录及对应 collHistory；AC、非 AC 统一处理。
- [x] 超时任务保持待核对状态，等到受控终态或确认取消后清理，不直接删除仍在处理的记录然后宣布完成。
- [x] 删除旧 nSubmit/nAccept 总快照回写及仅为 ready 项恢复计数的分支；快照如保留，仅用于审计。发布题解仍须受控结果 AC，并校验原题身份/数据版本。
- [ ] 验收真实用户并发 AC、验证失败和每个持久化/清理边界的重启：初始10/4加真实AC后应为11/5，验证无论AC/WA/CE都不能改变这个结果；没有真实用户活动时始终10/4。
- [x] 运行本任务测试及原生验收，独立评审后提交：`fix(taxonomy): isolate verification from live counters`。

```bash
node --test scripts/taxonomy/tests/solutions-apply.test.cjs
node --test scripts/repository.test.cjs
```

## 专项验收门槛

C1 在模拟 SSH/临时目录验证后，用隔离服务器执行完整故障注入；不拿生产首轮发布测试回滚。C2 的受控判题原生路径、完整数据、并发真实提交和中断恢复是必需验收；验证结果隔离不成立时不得切换维护脚本，也不得回退到旧总快照恢复。修复应在下一次题解批处理之前上线，历史统计另做只读核对。

## 当前状态（2026-11-14）

C1 `3555e5c` / `44e4fd3`，C2 `bb3d2d7` / `d3560ec`。部署模拟 SSH/临时文件系统回归覆盖回退、中断和重启不确定状态；C2 隔离 Hydro 5.0.7 原生回调证据覆盖 AC/WA/CE、完整 fixture 数据、并发普通原生 AC 计数、持久化/清理重启、所有权冲突和同上下文晚到重放。该外部 worker fixture 不代表真实 daemon、WebSocket 消费或生产沙箱。原生缺少 history 所有权关联的取舍为 opt-in 严格适配器；`DFACM_CONTROLLED_HISTORY=1` 须配置所有 callback host。保守 pending/人工核对策略、精确清理及交付绝对 locator 见部署文档。

最终本地命令、计数与证据范围见 [本轮修复报告](../reports/2026-11-14-project-repairs.md)。未勾选项保留历史 RED/独立评审证据未恢复或真实发布验收限制；已勾选的实现与本地测试不表示线上验收。最终全分支评审和归档哈希清单由集成负责人在评审后完成。
