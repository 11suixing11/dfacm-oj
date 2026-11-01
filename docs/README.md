# d&f算法网 · 文档索引

先了解 [产品定位](product.md)，再通过 [项目地图](project-map.md) 找到功能的维护位置。用户实践、开发维护与历史验收分别有以下入口。

## 产品与实践

| 文档 | 用途 |
| --- | --- |
| [产品定位](product.md) | 算法训练与 AI 开发两条主线、首页规则和建设顺序 |
| [项目地图](project-map.md) | 插件职责、运行关系、独立仓库与同步方式 |
| [AI 实践清单](ai-practice.md) | 应用、Agent、Vibe Coding 的任务和验收标准 |
| [设计规则](../DESIGN.md) | 品牌、配色、排版、入口与手机体验 |
| [训练插件](../plugin-dfacm-train/README.md) | 路线、工作台、错题本与数据口径 |
| [题目助手](../plugin-dfacm-assistant/README.md) | 算法讲解、代码诊断与个人供应商配置 |
| [赛事日历](../plugin-dfacm-calendar/README.md) | 算法和 AI 赛事、筛选与订阅 |

## 开发与维护

| 文档 | 用途 |
| --- | --- |
| [部署清单](../deploy/deployment.md) | 安装、连接参数、文件同步与检查 |
| [补丁清单](../deploy/PATCHES.md) | Hydro 与主题原地补丁、重放与备份 |
| [主题](../theme/README.md) | 样式接入与双主题维护 |
| [认证](../plugin-dfacm-regcode/README.md) · [linux.do OAuth](../plugin-linuxdo-oauth/README.md) | 登录、注册与第三方认证 |
| [赛事采集组件](../plugin-dfacm-ai-contests/README.md) | Python 服务、来源与数据库 |
| [积分商店](../plugin-dfacm-shop/README.md) · [QQ 播报](../plugin-dfacm-broadcast/README.md) | 用户激励和社区辅助 |
| [运维插件](../plugin-dfacm-ops/README.md) · [提交审核](../plugin-dfacm-ai-watch/README.md) | 排名、对账与人工审核 |
| [题库治理](../scripts/taxonomy/README.md) · [审计索引](../scripts/taxonomy/audit/README.md) | 题面、测试数据、题解与历史修复 |

依赖版本沿用已验证基线，升级需站长明确同意。不要把历史安装记录当作当前的全站状态。

## 发布与验收记录

| 日期 | 文档 | 范围 |
| --- | --- | --- |
| 2026-11-01 | [本次整理与首页发布](project-organization-2026-11-01.md) | 双主线首页上线、AI 实践、自动验收、文档与工作目录 |
| 2026-10-31 | [日历合并](calendar-ai-merge-2026-10-31.md) | 统一入口、筛选、订阅与手机布局 |
| 2026-10-31 | [提交审核说明](ai-watch-release-2026-10-31.md) | 公开插件与私有部署证据的位置 |
| 2026-10-23 | [训练与界面发布](ui-training-release-2026-10-23.md) | 多路线工作台、目录和主题 |
| 2026-10-22 / 23 | [助手发布](assistant-release-2026-10-22.md) | AI 设置、生成、诊断及验证边界 |
| 2026-10-21 | [此前日历发布](calendar-release-2026-10-21.md) | 合并前的算法赛事日历 |

## 历史参考

[前端调整说明](frontend-update.md)、[训练界面说明](ui-training-update.md)、[2026-10-08 审计](audit-2026-10-08.md)、[2026-10-11 计划](plan-2026-10-11-A.md)、[旧服务器文件清单](server-root-inventory-2026-10-12.md) 和 [注册接口排查](upstream-issue-regcode-content-type.md) 保留原路径作为参考。

`docs/img/` 保存此前界面截图；真实生产证据保存在忽略目录 `qa/`。工作目录顶层的早期架构图和零散验收截图归入 `reference/`，入口见工作目录 README。
