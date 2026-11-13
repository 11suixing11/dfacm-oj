# RP 重算互斥与停止生命周期修复 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 统一同 worker 的所有 RP 入口，并停止尚未开始的卸载队列作业。

**Architecture:** 在入口注册前创建唯一 createRpLock，传入手动/实时/定时重算；停止标记在取得锁及各副作用阶段前复查。

**Tech Stack:** CommonJS / TypeScript / Hydro / node:test

**Spec:** [2026-11-13-project-repairs.md](2026-11-13-project-repairs.md)；审查编号和全局验收约束以总计划为准。

**Status:** 修复计划，尚未执行。基线 main / 31afcb8。

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

- [ ] 将上述案例写入列出的可提交测试文件，加载真实生产模块；Mongo 替身的 findOne 返回独立快照，外部网络/消息使用明确的本地替身。
- [ ] 先运行下面命令，确认新增案例因当前缺陷失败；记录具体失败断言。
- [ ] 按上述设计修改实现，保持接口、数据兼容和失败分支；禁止用弱化断言让测试通过。
- [ ] 重跑同一命令，确认新旧测试全部通过，并执行本任务涉及的构建/语法检查。
- [ ] 独立评审通过后形成一个提交，建议提交主题：`fix(ops): share RP lock and cancel stopped queued work`。

```bash
cd plugin-dfacm-ops
npm test
```
