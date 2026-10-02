# SWPU OJ — 西南石油大学 ACM 在线训练站

> 基于 [Hydro OJ](https://hydro.ac) v5.0.7 的院校级定制层：获奖级门面首页、数字验证码注册插件、品牌主题系统与一套完整的部署方案。

**线上实例**：[swpuacm.xyz](https://swpuacm.xyz)

![门面首页](docs/img/01-hero.png)

## 这是什么

OJ 内核使用开源的 Hydro，本仓库收录的是我们围绕它做的**全部自研定制**——让一个开箱即用的 Hydro 实例变成有自己品牌、自己注册流程、自己性能策略的训练站。

| 模块 | 说明 |
|---|---|
| [`landing/`](landing/) | 门面首页：单文件 HTML/CSS/JS，零框架。「向山顶，提交你的答案」——登山/海拔隐喻贯穿全站：滚动海拔标尺、训练路线海拔剖面图、判题终端动画（复现真实首次评测 8.1ms/776KB）、品牌图标与 OG 图 |
| [`plugin-swpu-regcode/`](plugin-swpu-regcode/) | 数字验证码注册插件：填邮箱 → 收 6 位验证码 → 建号自动登录直达训练路线。5 分钟 TTL、单邮箱 60s/IP 每小时限速、QQ 号自动头像 |
| [`plugin-swpu-ops/`](plugin-swpu-ops/) | 管理员训练周报与判题健康摘要：按域/小组导出 CSV、Markdown、JSON，复用 Hydro 脚本权限，无需新增页面 |
| [`theme/`](theme/) | 三段 Hydro 主题 overlay：导航/表格深色条带、全站排版精修、登录注册等沉浸式页面品牌深色化。纯 CSS 追加，升级安全 |
| [`deploy/`](deploy/) | Caddy 配置范例 + 脱敏部署清单：UI 重建免疫的自定义资源目录、全站缓存策略、BBR/HTTP-3 |
| [`scripts/`](scripts/) | 字体子集化、备份包装器、只读部署检查与本地测试入口 |

<p float="left">
  <img src="docs/img/02-routes.png" width="49%" alt="训练路线海拔剖面图">
  <img src="docs/img/05-mobile-reg.png" width="24%" alt="数字验证码注册页">
  <img src="docs/img/06-mobile-login.png" width="24%" alt="品牌化登录页">
</p>

## 为什么这么做

- **门面单文件零依赖**：中文展示字体按实际用字子集化后自托管（99KB），不依赖任何第三方 CDN，首屏无第三方阻塞
- **数字验证码注册**：Hydro 原生只有「邮件点链接」确认，对国内用户不友好；本插件实现输码即注册，验证码走与找回密码相同的 SMTP 通道
- **UI 重建免疫**：Hydro 重装/升级会重建静态资源目录，所有自定义文件放独立目录由 Caddy 优先服务，升级零损失
- **为国内访问调优**：BBR 拥塞控制、HTTP/3（QUIC）全链路、静态资源 7 天强缓存、DNS 层 HTTPS 记录（`alpn="h3,h2"`）让新访客首次连接即尝试 QUIC

## 快速开始

前置：一台已按[官方文档](https://docs.hydro.ac)装好 Hydro v5 的服务器（内置 Caddy）。

1. **门面**：把 `landing/` 下所有文件上传到服务器 `/root/.hydro/custom/`，在 Caddy 站点块加一行 `rewrite / /home.html` 后 `caddy reload`（完整说明见 [deploy/deployment.md](deploy/deployment.md)）
2. **注册插件**：把 `plugin-swpu-regcode/` 上传到 `/root/.hydro/addons/swpu-regcode`，建立 `node_modules/hydrooj` 软链指向 Hydro 安装目录，加入 `addon.json` 后 `pm2 restart hydrooj`（详见 [插件说明](plugin-swpu-regcode/README.md)）
3. **主题**：把 `theme/` 下四个 CSS 按序追加到 Hydro 主题文件尾部（静态副本 + 源包两处，方法见 [theme/README.md](theme/README.md)）
4. **邮件**：在系统设置配置 `smtp.host/user/pass/from/secure`，找回密码与验证码邮件即刻可用

## 后端与运维更新

注册插件 1.1.0 只修改后端：登录码发往账号已绑定邮箱并绑定 UID；注册码绑定实际收件地址；校验用途和到期时间，原子消费及限制尝试次数，发送失败仅清理本次版本。保留 Hydro 原生认证事件、禁用账号、注册权限和比赛 IP 检查；已有两步验证/通行密钥账号使用原生登录。

校园网默认 IP 发码上限调整为每小时 200，并增加全站每小时 500 上限；限流和跳转路径可在系统设置调整。更新时上传插件全部运行文件，旧验证码需要重新获取，详见[更新说明](plugin-swpu-regcode/README.md)。额外的服务器邮箱白名单规则仍需管理员核对。

新增后台 addon 安装和运行方式见 [swpu-ops](plugin-swpu-ops/README.md)。管理员可执行：

```bash
hydrooj cli script swpuWeeklyReport '{}'
hydrooj cli script swpuHealthSummary '{"domainId":"system","staleMinutes":10}'
```

周报按最近七个完整自然日统计，默认北京时间，导出 UID、首次新增 AC、活跃天数及错误分布；可按小组筛选。健康摘要区分未领取任务与未结束提交。完整文件保存在管理员账户的 `~/.hydro/reports/swpu-ops/`，不通过公开页面提供下载。

Caddy 缓存仅在真实静态文件的成功响应生效，动态 `/resource/*` 保留 Hydro 的缓存决定；首页两个入口均显式重新验证缓存。部署清单增加版本记录、异机备份、恢复演练和真实 AC/WA/TLE 验收。脚本由管理员手动运行，不自动安装、重启或注册定时任务：

```bash
bash scripts/check-deployment.sh --role all --url https://swpuacm.xyz
bash scripts/backup-hydro.sh --output-dir /data/backups/swpu-oj
```

备份目录应异机保存并验证恢复；包装器不删除历史备份，失败保留诊断资料。详细参数和操作步骤见[部署文档](deploy/deployment.md)。

## 本地验证

使用 Node >=22.18，在仓库根目录执行：

```bash
pnpm install --ignore-scripts
pnpm test
pnpm check
```

本地测试使用内存数据库模型、Hydro API 替身和临时脚本夹具，不连接线上数据库、邮件或判题机。部署脚本测试需要 Bash、tar、unzip、sha256sum 等；Windows 可通过 `TEST_BASH` 指定 Git Bash。`pnpm check` 检查两个插件的编译，不能替代真实 Hydro/MongoDB 集成验收。

## 文件结构

```
├── landing/               门面首页 + 注册页（单文件）+ 字体/图标资源
├── plugin-swpu-regcode/   数字验证码注册插件（Hydro addon）
├── plugin-swpu-ops/       管理员训练周报与判题健康摘要
├── theme/                 主题 overlay（深色条带 / 排版精修 / 沉浸式页面）
├── deploy/                Caddyfile 范例 + 部署清单
├── scripts/               字体子集化 / 备份 / 部署检查 / 本地验证
└── docs/img/              截图
```

## 致谢与许可

- OJ 内核：[Hydro OJ](https://hydro.ac)（本仓库不含其代码）
- 字体：[ZCOOL QingKe HuangYou](https://fonts.google.com/specimen/ZCOOL+QingKe+HuangYou)、[JetBrains Mono](https://www.jetbrains.com/lp/mono/)（均为 OFL 许可，见 `landing/FONTS-LICENSE.md`）
- 本仓库代码以 [MIT](LICENSE) 许可发布，供院校社团学习交流

> 西南石油大学 ACM 集训队 · 山高处见 — See you at the summit
