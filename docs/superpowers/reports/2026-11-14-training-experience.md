# 训练草稿与继续训练本地完成报告（2026-11-14）

[实施计划](../plans/2026-11-14-training-experience.md) 的首批行为优化已实现；Task 1、Task 2 均获得独立规格与质量评审批准，无 Critical/Important。Task 3 已完成本地集成检查并补上 JSON 读取期限回归。**最终独立全分支评审仍待 root 给出结论**，当前报告不代替该评审。分支为 `fix/training-drafts-and-resume`，基线为 `103091246eea059132b6afdc49fe7e3b815ea535`，保留在本地。

## 已实现的行为

| 任务 | 提交 / 状态 | 行为与覆盖 |
| --- | --- | --- |
| Task 1：错题草稿与最新查询 | `cadd81a`；独立规格/质量批准 | 服务器注入的正 UID（包括已授权 UID 1）与 domain/PID 确定草稿范围；脏草稿可留在同一标签页的 sessionStorage，失败时明确使用页面内存。切换、同步、分页或操作另一题保留编辑。保存仅清除提交时相同快照，期间的新编辑和失败重试保留；成功移除只清对应 PID。固定 GET 查询快照、序号/abort 所有权与 10 秒完整读取期限保护最新列表、计数、分页和状态；现有 POST CSRF 与 15 秒期限保留。 |
| Task 2：首页继续训练 | `a9ee9d6`；独立规格/质量批准 | 所有已加入路线按活动/pin/docId 排序，先计算状态再选未完成路线；无加入路线保留旧活动回退。状态联合查询一次、可见下一题批量查询一次。DTO 的 current/next 字段为增量；卡片与欢迎区共用安全目标，未完成优先下一题/当前章节/路线，完成项明确回顾。旧缓存、已编码域路径、游客、空/失败与 bfcache 保留。 |
| Task 3：集成与报告 | 本次本地集成；最终全分支评审待完成 | 实际页面用例覆盖 `response.json()` 卡住：9,999 ms 保持加载，10,000 ms 显示失败并结束加载；草稿/已存笔记保持，迟到 JSON 不能覆盖成功重试。只扩展测试基础设施和文档，运行源码无新增修改。 |

## 回归证据

Task 1 在实现前的原始页面上 24/24 失败，记录了 A 编辑被替换为已存笔记、旧响应拼接当前列表等实际断言；自查追加的两项保留 DOM 边界回归在修复前 2/2 失败，最终 focused 26/26 通过。Task 2 在改动核心与首页前共 72 项、47 通过/25 失败，失败覆盖未完成 D 被 A/B/C 隐藏、缺少下一步/回顾及编码域链接；最终 focused 73/73 通过。

Task 3 的新增 JSON 期限用例使用实际页面/原有 handler、独立响应快照和假时钟，仅阻塞响应体读取。在私有 HTML 副本中让期限竞争失效，RED 为 0/1，准确失败于 10,000 ms 后 `#error.hidden` 仍为 `true`、期望为 `false`；同一用例对未修改生产页面 GREEN 1/1。没有为了 RED 临时修改运行源码。此项关闭 Task 1 唯一的非阻塞覆盖建议。

## 最终本地验证

使用已有 **Node 22.23.5**，npm 和子进程 PATH 指向同一版本；支持基线继续为 Hydro **5.0.7**、ui-default **4.58.5**、Node **>=22.13**，沿用已锁定安装依赖。

| 检查 | 结果 |
| --- | --- |
| train `npm test` | **113/113**，零失败、零取消、零跳过；包括 27 项错题实际页面用例 |
| 根 landing / preview / repository / deployment | **118/118**，零失败、零取消、零跳过 |
| 最终两组 Node 合计 | **231/231**；focused 与历史运行不重复加入合计 |
| train `npm run check:build` | exit 0；Backend 56853 bytes，原生 frontend `.js` / `.css` |
| 相关 CommonJS / fixture / 测试 `node --check` | 全部 exit 0；当前 HTML 在实际页面/首页测试中解析并执行，TypeScript 由原生构建检查 |
| 整分支及集成差异 `git diff --check` | exit 0；整分支基线 `103091246eea059132b6afdc49fe7e3b815ea535` |

最终完整 train、build 与根四组检查各运行一次，依次执行，未在部署测试临时改写/恢复主题 fixture 时并发执行其他主题检查。最终日志没有新的依赖/实验警告。

在 `plugin-dfacm-train` 运行 `npm test`、`npm run check:build`；在根目录运行 `node --test scripts/landing.test.cjs scripts/preview.test.cjs scripts/repository.test.cjs scripts/deployment.test.mjs`。完整命令、退出码、私有 RED/GREEN 副本及原始日志保存在本机忽略目录 `.superpowers/sdd/2026-11-14-training-experience/task-3-report.md` 与 `verification/`；既有 Task 2 日志已复制保存。未改动的其他模块与昂贵原生验收未重复运行，也不计入 231。

## 交付与剩余边界

无新增运行文件。现有 [部署清单](../../../deploy/deployment.md) 已复制 train 的 `index.ts`、`mistakes.html`、`workbench.cjs` 及全部既有加载资产，实际临时 installed-addon 检查确认依赖/文件齐全；自动发货包含整个 `landing/`。预览读取当前首页和错题 HTML，未注入登录草稿身份时沿用明确的页面内存回退。无需修改部署或预览代码。

验证只使用本地 loopback 预览、模型/浏览器/存储/网络基础设施替身及临时安装目录/模拟部署命令。**没有执行真实浏览器或已部署 Hydro 的端到端验收、生产部署、远端 CI、PR、推送、合并、真实消息/外部来源或生产数据操作。** 最终全分支独立评审和后续集成由 root 处理。

存储不可用时草稿仍只能留在当前页面，重新加载无法保留，页面明确提示。近期活动仍使用既有有界扫描，下一题不可见时回退当前章节；这些既有边界没有扩大。保留原生训练 DAG、域/CSRF、`swpu-*` 路由与集合，无依赖升级或新服务。
