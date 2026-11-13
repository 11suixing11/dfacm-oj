# 播报恢复、身份与赛事采集修复 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 恢复停机/重判播报正确性，纠正身份归属并准确呈现采集失败。

**Architecture:** 在现有bot内做局部修复；用新增投递字段区分通知资格和真正发送，稳定分页对账。采集源验证必要结构，stats并入抓取日志来源。

**Tech Stack:** Python / SQLite / AstrBot boundary stubs / FastAPI / HTTP fixtures / unittest

**Spec:** [2026-11-13-project-repairs.md](2026-11-13-project-repairs.md)；审查编号和全局验收约束以总计划为准。

**Status（2026-11-14）:** F1–F5 代码、RED→GREEN 和独立任务评审完成，Python 3.14 纯离线广播与锁定采集 fixtures 已纳入 CI；本地集成检查已执行。未联系真实消息通道或赛事源，未生产发布或纠正既有数据。 原计划与分支日期保留 2026-11-13；原审查基线 main / 31afcb8。

## Global Constraints

- Hydro **5.0.7**、ui-default **4.58.5**；Node.js **>=22.13**。测试实例以 Node 22 为主要兼容基线。
- 依赖按现有锁文件安装，保持当前版本；生产 addon 复用已有 Hydro 包，不在运行目录执行 npm ci。
- 保留 swpu 集合、路由与生产 addon 名称；数据迁移采用新增字段/状态，不删除已有记录、队列、水位或人工复核。
- 本轮只修已确认行为；退款后的商品重试规则、训练摘要权限策略两个候选项单独决策。
- 单进程内存锁不能作为多进程保证。发布前核对实际 worker 数和独立消费入口；多 worker 场景必须增加持久互斥/原子扣款并通过跨进程测试。
- 本计划的生产发布和真实数据修正分别准备可审查的发布包、备份、清单和回退；不能由本地测试通过推断已完成线上验收。

---

## F1：投递状态迁移、首次初始化与重启恢复

**覆盖问题：** 13

**Files:**
- Modify: plugin-dfacm-broadcast/main.py、README.md
- Create: plugin-dfacm-broadcast/tests/support.py、test_recovery.py

**Interfaces:** notify_eligible表示是否在应通知范围；delivered_at仅实际发送成功设置；这两个字段独立于verdict，旧card_sent继续兼容。

**修复设计：** 独立delivery_schema加notify_eligible/delivered_at，保留card_sent。旧card_sent=0迁为待发资格；旧=1不猜测已发/历史抑制，不自动重播。首次无水位持久bootstrap_floor_ts，分页中途重启保持门槛；已有水位之后新摄入不再受本次启动时间过滤。禁止升records_schema触发DROP。

**回归用例和通过条件：** 首次历史静默、跨页/中途重启仍静默；已有水位停机AC可入队；挂起队列保留；迁移重复执行不清表/重置水位；重复摄入不重复入队。

- [x] 将上述案例写入列出的可提交测试文件，加载真实生产模块；Mongo 替身的 findOne 返回独立快照，外部网络/消息使用明确的本地替身。
- [x] 先运行下面命令，确认新增案例因当前缺陷失败；记录具体失败断言。
- [x] 按上述设计修改实现，保持接口、数据兼容和失败分支；禁止用弱化断言让测试通过。
- [x] 重跑同一命令，确认新旧测试全部通过，并执行本任务涉及的构建/语法检查。
- [x] 独立评审通过后形成一个提交，建议提交主题：`fix(broadcast): preserve pending delivery across restarts`。

```bash
python -m unittest discover -s plugin-dfacm-broadcast/tests -p "test_*.py"
```

## F2：失效卡片撤队和发送前复检

**覆盖问题：** 12

**Files:**
- Modify: plugin-dfacm-broadcast/main.py
- Create: plugin-dfacm-broadcast/tests/test_pending_delivery.py

**Interfaces:** 沿用现有公开接口；新增内部接口在本任务定义并同步调用方。

**修复设计：** 同步和发送前验证原始status=1及score>=100；源不存在/不再完整AC撤队但保留资格，之后重新完整AC可再次排队。Mongo失败保留待发；发送False/异常不标已发。普通卡和比赛卡一致。

**回归用例和通过条件：** AC→WA和Accepted/100→Accepted/50均不发送；未实际发的WA→AC可恢复；已实际发同RID不重复；源删除撤队、源故障保留；通道关闭/冷却不丢队列。

- [x] 将上述案例写入列出的可提交测试文件，加载真实生产模块；Mongo 替身的 findOne 返回独立快照，外部网络/消息使用明确的本地替身。
- [x] 先运行下面命令，确认新增案例因当前缺陷失败；记录具体失败断言。
- [x] 按上述设计修改实现，保持接口、数据兼容和失败分支；禁止用弱化断言让测试通过。
- [x] 重跑同一命令，确认新旧测试全部通过，并执行本任务涉及的构建/语法检查。
- [x] 独立评审通过后形成一个提交，建议提交主题：`fix(broadcast): revalidate queued AC cards before sending`。

```bash
python -m unittest discover -s plugin-dfacm-broadcast/tests -p "test_*.py"
```

## F3：身份以已验证 UID 为准

**覆盖问题：** 16

**Files:**
- Modify: plugin-dfacm-broadcast/main.py、README.md
- Create: plugin-dfacm-broadcast/tests/test_binding_identity.py

**Interfaces:** 沿用现有公开接口；新增内部接口在本任务定义并同步调用方。

**修复设计：** 普通/比赛卡共用绑定查询，使用binding_profiles[qq].user_id与card user_id比较。展示名/用户名只展示。缺UID的旧绑定显示未确认并引导重新确认，不用当前同名账号自动迁移；多个合法绑定沿用现有规则并固定排序。

**回归用例和通过条件：** 展示名碰撞不归他人QQ；改用户名不改UID归属；两种卡一致；旧无UID不猜测；确认/解绑更新配套字段；多绑定输出稳定。

- [x] 将上述案例写入列出的可提交测试文件，加载真实生产模块；Mongo 替身的 findOne 返回独立快照，外部网络/消息使用明确的本地替身。
- [x] 先运行下面命令，确认新增案例因当前缺陷失败；记录具体失败断言。
- [x] 按上述设计修改实现，保持接口、数据兼容和失败分支；禁止用弱化断言让测试通过。
- [x] 重跑同一命令，确认新旧测试全部通过，并执行本任务涉及的构建/语法检查。
- [x] 独立评审通过后形成一个提交，建议提交主题：`fix(broadcast): attribute cards by verified user ID`。

```bash
python -m unittest discover -s plugin-dfacm-broadcast/tests -p "test_*.py"
```

## F4：近窗复查跨页公平前进

**覆盖问题：** 17

**Files:**
- Modify: plugin-dfacm-broadcast/main.py
- Create: plugin-dfacm-broadcast/tests/test_reconciliation.py

**Interfaces:** 新增_db_fetch_recent_page(lower_hex,upper_hex,after_hex,limit=400)；独立meta保存复查快照，保持当前终态近窗/窗口外未决的历史范围。

**修复设计：** 近30分钟复查与新提交水位分离；每轮固定lower/upper，分页after持久化，每poll可限制2页但整轮完成再开新窗口。小时非终态兜底同样稳定分页，避免固定首屏被永久未决占满。源查询失败不推进，状态更新完成才推进。

**回归用例和通过条件：** 402条同秒最后2条重判同步；多页跨poll/重启完整覆盖；不滑动窗口丢尾页；新提交水位不受影响；查询失败不跳页；永久未决首屏不饿死后续记录。

- [x] 将上述案例写入列出的可提交测试文件，加载真实生产模块；Mongo 替身的 findOne 返回独立快照，外部网络/消息使用明确的本地替身。
- [x] 先运行下面命令，确认新增案例因当前缺陷失败；记录具体失败断言。
- [x] 按上述设计修改实现，保持接口、数据兼容和失败分支；禁止用弱化断言让测试通过。
- [x] 重跑同一命令，确认新旧测试全部通过，并执行本任务涉及的构建/语法检查。
- [x] 独立评审通过后形成一个提交，建议提交主题：`fix(broadcast): paginate recent verdict reconciliation`。

```bash
python -m unittest discover -s plugin-dfacm-broadcast/tests -p "test_*.py"
```

## F5：必要结构验证与失败源状态

**覆盖问题：** 14、20

**Files:**
- Modify: plugin-dfacm-ai-contests/backend/app/crawlers/devpost.py、datafountain.py、base.py、api/stats.py
- Create: plugin-dfacm-ai-contests/tests/test_crawl_response_validation.py、test_stats_sources.py
- Test: plugin-dfacm-ai-contests/tests/test_devpost.py、test_datafountain.py、test_website.py

**Interfaces:** 沿用现有公开接口；新增内部接口在本任务定义并同步调用方。

**修复设计：** JSON验证列表/分页字段类型，明确error或缺必要结构抛CrawlError；HTML需要实际fixture证明的列表或合法空页面标识，维护/登录/错误页失败。有效空列表仍成功0条；坏源保留旧数据。stats以competitions来源和最新crawl_runs来源并集生成，保持响应字段。

**回归用例和通过条件：** 正常fixtures不变；合法空列表成功；HTTP200错误JSON/维护HTML失败且ok=0；旧内容/last_seen不被坏源覆盖；其他源继续；首次失败无数据源出现total=active=0且有真实失败；最新日志选择和总数正确。

- [x] 将上述案例写入列出的可提交测试文件，加载真实生产模块；Mongo 替身的 findOne 返回独立快照，外部网络/消息使用明确的本地替身。
- [x] 先运行下面命令，确认新增案例因当前缺陷失败；记录具体失败断言。
- [x] 按上述设计修改实现，保持接口、数据兼容和失败分支；禁止用弱化断言让测试通过。
- [x] 重跑同一命令，确认新旧测试全部通过，并执行本任务涉及的构建/语法检查。
- [x] 独立评审通过后形成一个提交，建议提交主题：`fix(collector): validate source responses and expose failed sources`。

```bash
cd plugin-dfacm-ai-contests
ACH_ENABLE_SCHEDULER=0 python -B -m unittest discover -s tests -p "test_*.py"
cd ..
cd plugin-dfacm-calendar
npm test
```

## CI、迁移与回退

- [x] 用支持的隔离Python安装现有requirements.lock，CI补充broadcast纯离线unittest，禁止测试向真实群/赛事源发送请求。
- [x] support.py加载真实生产方法与SQLite，替换框架注册/外部边界，不复制镜像业务实现。测试明确覆盖本次新增迁移和恢复字段。
- [ ] SQLite Connection.backup和state.json备份后执行幂等加列；原records_schema与mongo_last_id保持。
- [ ] 回滚旧代码保留新增字段和meta，不删表；旧代码运行期间不会维护delivered_at，再上线新代码前核对该段状态，不能直接假定可无损自动重播。
- [x] F1→F2→F3顺序实施；F4可在F1状态接口稳定后并行；F5可独立开发。部署分别遵循bot和collector的独立安装文档。

## 当前状态（2026-11-14）

F1 `78d883f`，F2 `b20d624`，F3 `02a8f1b`，F4 `610807e`，F5 `198f3a9`。SQLite additive delivery_schema 保留已发证据和水位；每次 image/text 投递前复查原始来源，错误保留 pending；QQ 归属取原始 submission UID，统计合并后的 personID 仍用于计数/展示；固定分页快照与独立 meta 游标推进；坏采集响应保存失败且保留旧数据，stats 包括首次失败源。既有已填 legacyUID 的猜测来源无法恢复，未授权历史自动修正；空 UID 需重新确认。旧 card_sent=1 不自动重播。

最终本地命令、计数与证据范围见 [本轮修复报告](../reports/2026-11-14-project-repairs.md)。未勾选项保留历史 RED/独立评审证据未恢复或真实发布验收限制；已勾选的实现与本地测试不表示线上验收。最终全分支评审和归档哈希清单由集成负责人在评审后完成。
