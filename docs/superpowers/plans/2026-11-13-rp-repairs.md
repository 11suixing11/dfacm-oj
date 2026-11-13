# RP 重算互斥与停止生命周期修复 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 统一同 worker 的所有 RP 入口，并停止尚未开始的卸载队列作业。

**Architecture:** 在入口注册前创建唯一 createRpLock，传入手动/实时/定时重算；停止标记在取得锁及各副作用阶段前复查。

**Tech Stack:** CommonJS / TypeScript / Hydro / node:test

**Spec:** [2026-11-13-project-repairs.md](2026-11-13-project-repairs.md)；审查编号和全局验收约束以总计划为准。

**Status（2026-11-14）:** D1 代码、原生生命周期补充 RED→GREEN 和独立任务评审完成，本地 Node 22 集成测试已执行。锁只保证同 worker，实际 worker/独立 CLI 入口拓扑仍须发布前核对。 原计划与分支日期保留 2026-11-13；原审查基线 main / 31afcb8。

## Global Constraints

- Hydro **5.0.7**、ui-default **4.58.5**；Node.js **>=22.13**。测试实例以 Node 22 为主要兼容基线。
- 依赖按现有锁文件安装，保持当前版本；生产 addon 复用已有 Hydro 包，不在运行目录执行 npm ci。
- 保留 swpu 集合、路由与生产 addon 名称；数据迁移采用新增字段/状态，不删除已有记录、队列、水位或人工复核。
- 本轮只修已确认行为；退款后的商品重试规则、训练摘要权限策略两个候选项单独决策。
- 单进程内存锁不能作为多进程保证。发布前核对实际 worker 数和独立消费入口；多 worker 场景必须增加持久互斥/原子扣款并通过跨进程测试。
- 本计划的生产发布和真实数据修正分别准备可审查的发布包、备份、清单和回退；不能由本地测试通过推断已完成线上验收。

---

## D1：共享调度锁与停止检查

**覆盖问题：** 08、19

**Files:**
- Modify: plugin-dfacm-ops/index.ts、rp-sweep.cjs、live-rp.cjs、README.md
- Test: plugin-dfacm-ops/tests/rp-sweep.test.cjs、live-rp.test.cjs
- Create: plugin-dfacm-ops/tests/scheduler-entry.test.cjs

**Interfaces:** createRpLock 现有接口保持；所有 createRpSweep/createLiveRp 调用方注入同一个 lock 实例，stop 生命周期保持幂等。

**修复设计：** 先创建共享 lock，再创建/注册 manualSweep/live/scheduled，三者注入同一 lock。manual 同样注册 dispose。work 取锁后复查 stopped；purge/reconcile/RP 各阶段开始前检查，正在进行的 DB 调用按当前调用完成，不启动下一阶段。锁链失败可恢复。

**回归用例和通过条件：** 真实 apply 注册的网页脚本与自动事件 maxActive=1；manual/scheduled/live 任意组合不重叠；队列 stop 后 purge/reconcile/rp 全0次；运行中 stop 后不启动下一阶段；异常不毒化队列；独立 CLI 不冒充同进程覆盖。

- [x] 将上述案例写入列出的可提交测试文件，加载真实生产模块；Mongo 替身的 findOne 返回独立快照，外部网络/消息使用明确的本地替身。
- [x] 先运行下面命令，确认新增案例因当前缺陷失败；记录具体失败断言。
- [x] 按上述设计修改实现，保持接口、数据兼容和失败分支；禁止用弱化断言让测试通过。
- [x] 重跑同一命令，确认新旧测试全部通过，并执行本任务涉及的构建/语法检查。
- [x] 独立评审通过后形成一个提交，建议提交主题：`fix(ops): share RP lock and cancel stopped queued work`。

```bash
cd plugin-dfacm-ops
npm test
```

## 当前状态（2026-11-14）

D1 `eb6280b` / `6b98a26`。真实 Cordis 4.0.0-rc.8 / Hydro 5.0.7 原生卸载采用 `ctx.effect`，三进程 queued/armed/inflight fixture 确认三类 scheduler 各 stop 一次，卸载后不启动后续 purge/reconcile/RP 或定时器。I1 仅收窄原生 fixture 的定时器断言描述，不改变其行为。独立 CLI 与主进程不共享内存锁；未宣称多进程 RP 互斥。

最终本地命令、计数与证据范围见 [本轮修复报告](../reports/2026-11-14-project-repairs.md)。未勾选项保留历史 RED/独立评审证据未恢复或真实发布验收限制；已勾选的实现与本地测试不表示线上验收。最终全分支评审和归档哈希清单由集成负责人在评审后完成。
