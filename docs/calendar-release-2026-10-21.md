# 赛事日历 v1.36.0 部署记录

2026-10-21 已部署至 [d&f算法网赛事日历](https://dfacm.website/calendar)。日历插件版本为 0.2.0，QQ 播报插件为 2.4.1。

## 使用与配置

- FullCalendar 7.1.3（MIT）提供月 / 周视图；手机默认赛事列表，支持多类型筛选、搜索、详情和记忆视图。
- [ICS 订阅](https://dfacm.website/calendar/feed.ics) 支持同样的筛选，定时赛事包含赛前 30 分钟提醒，报名截止包含提前 3 天 / 1 天提醒。是否通知和同步频率由日历应用决定。
- CF / AtCoder 自动同步；CLIST 在验收时尚未配置，新增平台需管理员在 [系统设置 → 赛事日历](https://dfacm.website/manage/setting#setting_swpu_calendar) 填写用户名和 Key。
- 配置键为 `dfacm_calendar.clist_username`、`dfacm_calendar.clist_api_key`，恰好包含一个点，兼容 Hydro 原生表单的一层保存逻辑。Key 留空保留原值，清空用户名关闭同步。

## 验证证据

- 54 项日历测试通过，覆盖真实 FullCalendar 包的离线 DOM 交互、北京时间、筛选、资源失败回退、单源故障、密钥轮换及独立 iCalendar 解析。
- 60 项部署 / 门面 / 仓库检查通过；48 项运维插件测试通过。播报 Python 和变更的 shell 脚本语法通过。
- 用真实 co-body 6.2.0 表单解析器、Hydro 5.0.7 保存代码和 ui-default 4.58.5 模板离线验证：用户名 / Key 保存、空 Key 保留、空用户名保存、已存 Key 不回显均通过；仅使用虚构凭据。
- 标准全量部署完成资源 SHA-256 对账、重启、就绪检查与 48 项 smoke。最后的配置键 / 页面标题修正通过单文件 staging、原文件哈希检查、备份、安装哈希检查、重启及同样的 48 项 smoke。
- 外网验收 `/calendar`、`/calendar/data`、`/calendar/feed.ics` 均返回 200，数据接口含 17 条赛程，CF / AtCoder 状态为 fresh。QQ 容器运行正常，插件 2.4.1 已初始化，数据库 / 健康检查通过，并成功刷新 17 条日历数据。
- 浏览器打开和页面观察被自动审批拒绝，未做视觉验收；没有绕过浏览器限制。CLIST 实际账号联通性待管理员完成配置后验证。

## 回退与维护

OJ 全量升级前备份：`/root/backups/calendar-before-v1.36.0-20261021T064402Z.tar.gz`；最终 handler 修正前备份：`/root/backups/calendar-handler-before-final-20261021T074447Z.ts`。

QQ 更新前备份：`/opt/swpu-acm/backups/broadcast-before-v2.4.1-20261021T070712Z`。

以后修改浏览器 JS / CSS 需同时更新带版本的资源 URL，避免七天 immutable 缓存继续使用旧文件。运行时缓存和 CLIST 凭据不进 Git。生产 addon 不执行 npm 安装，以免破坏 Hydro 软链；部署和配置细节见 [插件说明](../plugin-dfacm-calendar/README.md) 与 [部署清单](../deploy/deployment.md)。
