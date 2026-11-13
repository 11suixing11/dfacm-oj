# 积分、称号与历史回填修复 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 关闭错误计分与透支路径，并恢复称号一致性和历史回填续跑能力。

**Architecture:** 复用现有账本唯一键及徽章插件。抽出共享 UID 锁，所有用户消费/称号管理走同一锁；全局铸造锁仅保护第三方编号分配。

**Tech Stack:** TypeScript / MongoDB / Hydro / node:test

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

## A1：正式 AC 资格统一

**覆盖问题：** 01

**Files:**
- Modify: plugin-dfacm-shop/index.ts、points.ts
- Test: plugin-dfacm-shop/tests/handlers.test.cjs、points.test.cjs

**Interfaces:** 沿用现有公开接口；新增内部接口在本任务定义并同步调用方。

**修复设计：** 建立共用正式记录过滤：终态 AC、合法用户/题目，排除 RECORD_PRETEST/RECORD_GENERATE，保留服务号、隐藏题、自建题排除。实时和回填复用；不用自测 AC 代表题库通过。

**回归用例和通过条件：** 两类伪比赛各 0 入账；正常正式 AC 正常入账；同题重复/实时与回填重叠仅一笔；被过滤路径不影响判题。

- [ ] 将上述案例写入列出的可提交测试文件，加载真实生产模块；Mongo 替身的 findOne 返回独立快照，外部网络/消息使用明确的本地替身。
- [ ] 先运行下面命令，确认新增案例因当前缺陷失败；记录具体失败断言。
- [ ] 按上述设计修改实现，保持接口、数据兼容和失败分支；禁止用弱化断言让测试通过。
- [ ] 重跑同一命令，确认新旧测试全部通过，并执行本任务涉及的构建/语法检查。
- [ ] 独立评审通过后形成一个提交，建议提交主题：`fix(shop): exclude non-official judging from points`。

```bash
cd plugin-dfacm-shop
npm test
```

## A2：统一消费和称号管理锁

**覆盖问题：** 02、03、04

**Files:**
- Create: plugin-dfacm-shop/user-lock.ts
- Modify: plugin-dfacm-shop/points.ts、titles.ts
- Test: plugin-dfacm-shop/tests/commerce-concurrency.test.cjs、titles.test.cjs、points.test.cjs

**Interfaces:** 新增 withUserLock<T>(uid:number, work:()=>Promise<T>):Promise<T>，仅由 user-lock.ts 定义，points/titles 导入；所有加锁公开入口不再相互调用形成重入。

**修复设计：** redeem/unlockTitle/saveTitle/revokeTitle/restoreTitle 全部使用共享 UID 锁。锁内重读余额和 active/minted/badgeId；固定 UID 锁→全局铸造锁顺序，禁止反向加锁。冲正关联具体扣款的操作标识，只成功退款后报告已退回；失败补偿保留可审计记录。

**回归用例和通过条件：** 500 分的两笔 500 消费最多一笔成功、余额>=0；50 分兑换/改称同样；并发首次保存仅一枚首次免费，后续保存遵守费用；revoke 返回后旧请求不能再发放；失败不毒化锁队列且锁记录释放。

- [ ] 将上述案例写入列出的可提交测试文件，加载真实生产模块；Mongo 替身的 findOne 返回独立快照，外部网络/消息使用明确的本地替身。
- [ ] 先运行下面命令，确认新增案例因当前缺陷失败；记录具体失败断言。
- [ ] 按上述设计修改实现，保持接口、数据兼容和失败分支；禁止用弱化断言让测试通过。
- [ ] 重跑同一命令，确认新旧测试全部通过，并执行本任务涉及的构建/语法检查。
- [ ] 独立评审通过后形成一个提交，建议提交主题：`fix(shop): serialize all commerce and title mutations`。

```bash
cd plugin-dfacm-shop
npm test
```

## A3：历史回填分页和恢复

**覆盖问题：** K01

**Files:**
- Modify: plugin-dfacm-shop/index.ts、points.ts、README.md
- Create: plugin-dfacm-shop/tests/backfill.test.cjs
- Test: plugin-dfacm-shop/tests/handlers.test.cjs

**Interfaces:** 回填状态是新增按域/轮次的内部集合；不更改账本 ref 格式。状态持久化和扫描记录过滤均有索引/查询时间预算。

**修复设计：** 每域独立保存轮次、固定扫描上界、分页 after 游标和统计。无过滤的有界记录分页，页内按 A1 判断当前正式 AC；整页成功后推进游标，错误页不推进。完整新轮从头覆盖旧记录重判，原 uid/ref 唯一键去重。每域统计独立，不用全局 scanned 判截断。

**回归用例和通过条件：** 跨过 20,000 条后仍入账；两域统计分开；页处理中断重跑不丢不重；失败不误标完成；旧非 AC 变正式 AC 后新轮可覆盖；当前非 AC 不入账。

- [ ] 将上述案例写入列出的可提交测试文件，加载真实生产模块；Mongo 替身的 findOne 返回独立快照，外部网络/消息使用明确的本地替身。
- [ ] 先运行下面命令，确认新增案例因当前缺陷失败；记录具体失败断言。
- [ ] 按上述设计修改实现，保持接口、数据兼容和失败分支；禁止用弱化断言让测试通过。
- [ ] 重跑同一命令，确认新旧测试全部通过，并执行本任务涉及的构建/语法检查。
- [ ] 独立评审通过后形成一个提交，建议提交主题：`fix(shop): make historical points backfill resumable`。

```bash
cd plugin-dfacm-shop
npm test
```

## 发布验收

A1 可以先独立提交。A2 必须验证运行 worker 数，单进程方案满足单 worker 基线才可发布；扩容约束进入 README。新增 user-lock.ts 和回填运行模块必须同步 deploy/deployment.md 发货清单并通过 scripts/deployment.test.mjs。A3 的状态字段采用新增集合，不删除旧账本。
