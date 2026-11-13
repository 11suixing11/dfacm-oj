# 登录入口与多域修复 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让第二因素入口可发现，并使非默认域页面读写和跳转保持在本域。

**Architecture:** 沿用 Hydro 原生域感知路由与登录认证。后端生成 API/导航 URL，前端只验证同源路径；原生登录出口独立于管理员密码面板。

**Tech Stack:** TypeScript / Hydro templates / HTML / JavaScript / node:test

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

## B1：恢复面向游客的原生登录出口

**覆盖问题：** 06

**Files:**
- Modify: plugin-dfacm-regcode/reg.html、README.md
- Test: plugin-dfacm-regcode/frontend.test.cjs、handlers.test.cjs
- Check: deploy/clean-auth-entries.js、Caddyfile.example

**Interfaces:** 沿用现有公开接口；新增内部接口在本任务定义并同步调用方。

**修复设计：** 把 /login?fallback=1 的原生入口移出 canPwd 门控的面板和被删除的页脚区域；保留管理员密码面板门控。入口使用安全 redirect、iframe 时顶层打开；保留现有验证码、OAuth 和 noscript 行为。

**回归用例和通过条件：** 游客真实 DOM 仍存在原生链接；两步验证拒绝提示可找到入口；iframe 顶层跳转；站外/反斜线返回地址被拒；管理员与普通验证码流程保持。

- [ ] 将上述案例写入列出的可提交测试文件，加载真实生产模块；Mongo 替身的 findOne 返回独立快照，外部网络/消息使用明确的本地替身。
- [ ] 先运行下面命令，确认新增案例因当前缺陷失败；记录具体失败断言。
- [ ] 按上述设计修改实现，保持接口、数据兼容和失败分支；禁止用弱化断言让测试通过。
- [ ] 重跑同一命令，确认新旧测试全部通过，并执行本任务涉及的构建/语法检查。
- [ ] 独立评审通过后形成一个提交，建议提交主题：`fix(auth): keep native second-factor login discoverable`。

```bash
cd plugin-dfacm-regcode
npm test
```

## B2：域感知 API 与 DTO URL

**覆盖问题：** 05

**Files:**
- Modify: plugin-dfacm-train/index.ts、workbench.cjs、workbench.html、mistakes.html
- Test: plugin-dfacm-train/tests/handlers.test.cjs、pages.test.cjs
- Create: plugin-dfacm-train/tests/domain-frontend.test.cjs

**Interfaces:** DTO 组装新增可注入 url(name,args) 路由函数；生产 handler 注入域路由，预览/测试注入各自的确定路由函数。

**修复设计：** 页面用 handler.url() 输出 API/表单/导航目标；workbench DTO 接收路由生成函数，停止手写根路径。使用现有安全 JSON/UI 注入方式传 URL，前端同源校验允许正确 /d/<domain>/ 路径。

**回归用例和通过条件：** system 与 poj 相同 PID 的 GET/POST/训练/题目/record 均访问本域；sync、笔记修改、删除不越域；默认域与根预览正常；恶意站外 URL 仍拒绝。

- [ ] 将上述案例写入列出的可提交测试文件，加载真实生产模块；Mongo 替身的 findOne 返回独立快照，外部网络/消息使用明确的本地替身。
- [ ] 先运行下面命令，确认新增案例因当前缺陷失败；记录具体失败断言。
- [ ] 按上述设计修改实现，保持接口、数据兼容和失败分支；禁止用弱化断言让测试通过。
- [ ] 重跑同一命令，确认新旧测试全部通过，并执行本任务涉及的构建/语法检查。
- [ ] 独立评审通过后形成一个提交，建议提交主题：`fix(train): preserve domain in API and training links`。

```bash
cd plugin-dfacm-train
npm test
npm run check:build
cd ..
node --test scripts/preview.test.cjs
```
