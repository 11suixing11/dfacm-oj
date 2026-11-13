# AI SSE 与审核补扫修复 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 正确结束 SSE 并恢复审核漏扫、过时终态及同秒来源线索。

**Architecture:** SSE 按终止标记停止；Watch 增量、重叠扫描及报告状态对账分工，游标可恢复且每轮有界。无精确时间时使用秒区间与先后不确定的线索。

**Tech Stack:** CommonJS / MongoDB / JavaScript / Hydro / node:test

**Spec:** [2026-11-13-project-repairs.md](2026-11-13-project-repairs.md)；审查编号和全局验收约束以总计划为准。

**Status（2026-11-14）:** E1/E2/E3 的代码与回归已提交，本地 Node 22 集成、构建和公开资源检查已执行；当前隔离 Watch 原生 Mongo 用例通过，2026-11-14 最终独立全分支评审明确确认 E1/E2/E3 当前本地规格 PASS；历史 RED 记录未完整恢复，不补造。生产补扫与真实页面/服务验收未完成。 原计划与分支日期保留 2026-11-13；原审查基线 main / 31afcb8。

## Global Constraints

- Hydro **5.0.7**、ui-default **4.58.5**；Node.js **>=22.13**。测试实例以 Node 22 为主要兼容基线。
- 依赖按现有锁文件安装，保持当前版本；生产 addon 复用已有 Hydro 包，不在运行目录执行 npm ci。
- 保留 swpu 集合、路由与生产 addon 名称；数据迁移采用新增字段/状态，不删除已有记录、队列、水位或人工复核。
- 本轮只修已确认行为；退款后的商品重试规则、训练摘要权限策略两个候选项单独决策。
- 单进程内存锁不能作为多进程保证。发布前核对实际 worker 数和独立消费入口；多 worker 场景必须增加持久互斥/原子扣款并通过跨进程测试。
- 本计划的生产发布和真实数据修正分别准备可审查的发布包、备份、清单和回退；不能由本地测试通过推断已完成线上验收。

---

## E1：DONE 终止读取

**覆盖问题：** 09

**Files:**
- Modify: plugin-dfacm-assistant/stream.cjs
- Test: plugin-dfacm-assistant/tests/stream.test.cjs、client.test.cjs

**Interfaces:** 沿用现有公开接口；新增内部接口在本任务定义并同步调用方。

**修复设计：** parser 完成 dispatch 后观察 done，停止 reader 并 cancel；EOF 才 flush 未结束 parser。DONE 前独立 usage 事件保留，不能在 finish_reason 时提前停；DONE 后尾随事件不修改结果。保留 length/error、工具调用完整性、JSON/引用校验。

**回归用例和通过条件：** 合法完整 DONE 且 HTTP 保持连接及时成功；DONE 跨 chunk 正常；finish→usage→DONE 统计正确；缺 finish、length、error、不完整工具调用继续失败；不新增自动重试。

- [x] 将上述案例写入列出的可提交测试文件，加载真实生产模块；Mongo 替身的 findOne 返回独立快照，外部网络/消息使用明确的本地替身。
- [ ] 先运行下面命令，确认新增案例因当前缺陷失败；记录具体失败断言。
- [x] 按上述设计修改实现，保持接口、数据兼容和失败分支；禁止用弱化断言让测试通过。
- [x] 重跑同一命令，确认新旧测试全部通过，并执行本任务涉及的构建/语法检查。
- [x] 当前独立全分支评审通过，实现已提交；原建议提交主题：`fix(assistant): finish SSE on terminal marker`。

```bash
cd plugin-dfacm-assistant
npm test
npm run check-build
```

## E2：有界重叠补扫与终态对账

**覆盖问题：** 10、18

**Files:**
- Modify: plugin-dfacm-ai-watch/store.cjs、engine.cjs、config.cjs
- Test: plugin-dfacm-ai-watch/tests/store-engine.test.cjs

**Interfaces:** 版本化修复扫描状态保存 scope/lower/upper/after；增量发现与对账不共享一个永久最大ObjectId；不承诺恢复超出10分钟迟到窗口的任意新插入。

**修复设计：** 保留快速增量主水位，新增最近10分钟的独立重叠扫描；固定每轮上下界并持久分页 cursor，完成后才开启下一段，不能每tick回首屏。已有非终态报告高频对账，保留期内报告低频轮转对账以恢复重判；只更新verdict，不清 analysis/review/history。多worker有扫描租约或等价幂等保障。

**回归用例和通过条件：** 迟到小ObjectId在约定窗口最终有且仅1报告；超过两页仍前进；重启续扫；原记录AC时旧verdict最终一致；保留期重判恢复；查询失败不推进；范围变更与TTL处理一致；每tick有批量和时限。

- [x] 将上述案例写入列出的可提交测试文件，加载真实生产模块；Mongo 替身的 findOne 返回独立快照，外部网络/消息使用明确的本地替身。
- [ ] 先运行下面命令，确认新增案例因当前缺陷失败；记录具体失败断言。
- [x] 按上述设计修改实现，保持接口、数据兼容和失败分支；禁止用弱化断言让测试通过。
- [x] 重跑同一命令，确认新旧测试全部通过，并执行本任务涉及的构建/语法检查。
- [x] 当前独立全分支评审通过，实现已提交；原建议提交主题：`fix(watch): reconcile late submissions and verdicts`。

```bash
cd plugin-dfacm-ai-watch
npm test
npm run check-build
npm run check-public
```

## E3：同秒时间区间、线索和证据一致

**覆盖问题：** 11

**Files:**
- Create: plugin-dfacm-ai-watch/time.cjs、tests/time.test.cjs
- Modify: plugin-dfacm-ai-watch/config.cjs、store.cjs、detector.cjs、public/watch.js、templates/watch_content.html、README.md
- Test: plugin-dfacm-ai-watch/tests/detector.test.cjs、store-engine.test.cjs、http.test.cjs、deployment.test.cjs

**Interfaces:** 新增 submissionTime={precision,origin,lower,upper}；time.cjs提供纯函数分类，store/detector/evidence共用。firstSeenAt、事件到达或judgeAt不冒充提交创建时间。

**修复设计：** 统一时间模型：ObjectId产生半开区间[t0,t0+1000ms)；c<t0为确定早于，区间内为先后未知，c>=上界排除此前来源。同秒相似输出保留上下文信号及源码对照，但不能仅凭它进入high或断言提交前使用AI。store查询、detector、evidence读取和前端文案同时改。旧报告惰性兼容，规则升版本后有界重算保留期报告，保留人工复核。

**回归用例和通过条件：** 同秒.100来源不消失且不成为确定先后；上一秒确定早于、下一秒排除；证据接口与分析一致；旧报告可读；只有真正可信的创建元数据才允许毫秒精度；结论始终undetermined，无自动处罚。

- [x] 将上述案例写入列出的可提交测试文件，加载真实生产模块；Mongo 替身的 findOne 返回独立快照，外部网络/消息使用明确的本地替身。
- [ ] 先运行下面命令，确认新增案例因当前缺陷失败；记录具体失败断言。
- [x] 按上述设计修改实现，保持接口、数据兼容和失败分支；禁止用弱化断言让测试通过。
- [x] 重跑同一命令，确认新旧测试全部通过，并执行本任务涉及的构建/语法检查。
- [x] 当前独立全分支评审通过，实现已提交；原建议提交主题：`fix(watch): represent uncertain same-second source timing`。

```bash
cd plugin-dfacm-ai-watch
npm test
npm run check-build
npm run check-public
```

## 发布兼容

E1 独立发布。E2/E3 的新 key、runtime time.cjs 和前后端资源必须进入 scripts/public-files.cjs、scripts/deployment.cjs 对应发布清单及部署测试；规则、查询、证据展示同批发布。旧状态不删，人工复核不重置。补扫恢复边界和时间不确定性写入 README。

## 当前状态（2026-11-14）

E1 `0c8ee84`，E2 `3fcb78e`，E3 `3057a7c`。DONE 无需 EOF；补扫游标有界、重启可对账，旧 key 与人工复核字段保留；同秒来源保留为先后不确定上下文，不冒充毫秒时间。`time.cjs` 已在 Watch 独立 deployment/public-files 清单；Watch/assistant 沿用各自的独立交付流程。隔离 Mongo 双进程/杀 owner 用例不替代实际生产 worker 配置核对。

最终本地命令、计数与证据范围见 [本轮修复报告](../reports/2026-11-14-project-repairs.md)。2026-11-14 最终独立评审覆盖 `31afcb8..0cf0054` 的全部 96 个变更路径，明确确认本模块各任务当前规格 PASS，无 Critical/Important。该当前评审结论用于关闭评审复选框，不补造缺失的历史 RED/早期评审记录；未勾选的历史 RED 与真实发布验收门槛保留。本次仅跟进该评审的文档/空白 minor，收尾 scoped re-review 后再由负责人准备归档哈希清单。
