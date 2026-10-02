# SWPU OJ — 西南石油大学 ACM 在线训练站

> 基于 [Hydro OJ](https://hydro.ac) v5.0.7 的院校级定制层：获奖级门面首页、数字验证码注册插件、品牌主题系统与一套完整的部署方案。

**线上实例**：[swpuacm.xyz](https://swpuacm.xyz) · [swpuacm.bot.cd](https://swpuacm.bot.cd)（别名）

![门面首页](docs/img/01-hero.png)

## 这是什么

OJ 内核使用开源的 Hydro，本仓库收录的是我们围绕它做的**全部自研定制**——让一个开箱即用的 Hydro 实例变成有自己品牌、自己注册流程、自己性能策略的训练站。

| 模块 | 说明 |
|---|---|
| [`landing/`](landing/) | 门面首页：单文件 HTML/CSS/JS，零框架。「向山顶，提交你的答案」——登山/海拔隐喻贯穿全站：滚动海拔标尺、训练路线海拔剖面图、判题终端动画（复现真实首次评测 8.1ms/776KB）、品牌图标与 OG 图 |
| [`plugin-swpu-regcode/`](plugin-swpu-regcode/) | 数字验证码注册插件：填邮箱 → 收 6 位验证码 → 建号自动登录直达训练路线。5 分钟 TTL、单邮箱 60s/IP 每小时限速、QQ 号自动头像 |
| [`theme/`](theme/) | 三段 Hydro 主题 overlay：导航/表格深色条带、全站排版精修、登录注册等沉浸式页面品牌深色化。纯 CSS 追加，升级安全 |
| [`deploy/`](deploy/) | Caddy 配置范例 + 脱敏部署清单：UI 重建免疫的自定义资源目录、全站缓存策略、BBR/HTTP-3 |
| [`scripts/`](scripts/) | 品牌资产生成：字体子集化（展示字体 440 字 107KB）、Pillow 图标全套渲染 |

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

## 文件结构

```
├── landing/               门面首页 + 注册页（单文件）+ 字体/图标资源
├── plugin-swpu-regcode/   数字验证码注册插件（Hydro addon）
├── theme/                 主题 overlay（深色条带 / 排版精修 / 沉浸式页面）
├── deploy/                Caddyfile 范例 + 部署清单
├── scripts/               字体子集化 / 品牌图标生成
└── docs/img/              截图
```

## 致谢与许可

- OJ 内核：[Hydro OJ](https://hydro.ac)（本仓库不含其代码）
- 字体：[ZCOOL QingKe HuangYou](https://fonts.google.com/specimen/ZCOOL+QingKe+HuangYou)、[JetBrains Mono](https://www.jetbrains.com/lp/mono/)（均为 OFL 许可，见 `landing/FONTS-LICENSE.md`）
- 本仓库代码以 [MIT](LICENSE) 许可发布，供院校社团学习交流

> 西南石油大学 ACM 集训队 · 山高处见 — See you at the summit
