# swpu-regcode — 数字验证码注册插件

Hydro v5 的原生注册流程是「邮箱 → 点邮件里的链接 → 设账密」。国内用户更习惯**输数字验证码**。本插件在 Hydro 旁边实现了验证码注册 + 验证码免密登录（双标签页），登录后按来源跳转（新号直达训练路线）。v1.1 起核心校验逻辑独立到 `logic.ts`，并补了单元测试。

## 工作方式

```
GET  /reg            注册 + 验证码登录双标签页（读取插件目录下的 reg.html）
POST /reg/code       {mail, purpose}   发送 6 位验证码（purpose: reg=注册 / login=免密登录）
POST /reg/complete   {mail, code, uname, password}   注册并自动登录
POST /reg/login      {mail, code}      验证码免密登录
```

- 验证码存独立集合 `regcode`，MongoDB TTL 索引 **5 分钟自动过期**
- 单邮箱 **60 秒 1 条**、单 IP **每小时 20 条** 限速（复用 Hydro `limitRate`，显式使用真实客户端 IP）
- 邮箱域黑名单复用 Hydro `BlackListModel`；已注册邮箱直接提示去登录
- 建号复用 `UserModel.create`；QQ 邮箱注册自动挂 QQ 头像
- 登录逻辑复刻 Hydro 核心 `successfulAuth`（session.uid / scope / recreate），完成后 302 到训练路线
- reg.html 由插件直接读取同目录文件输出，**放在 addon 目录里，UI 重装/升级不影响**

## 安装

```bash
# 1. 上传本目录到服务器
mkdir -p /root/.hydro/addons/swpu-regcode
#    把 index.ts / logic.ts / reg.html / package.json 放进去

# 2. 让插件能 require('hydrooj')（按你的 hydrooj 包实际路径调整软链目标）
mkdir -p /root/.hydro/addons/swpu-regcode/node_modules
ln -sfn /usr/local/share/.config/yarn/global/node_modules/hydrooj \
        /root/.hydro/addons/swpu-regcode/node_modules/hydrooj

# 3. 注册 addon：参考 addon.json.example，编辑 /root/.hydro/addon.json

# 4. 重启
pm2 restart hydrooj
```

> TS 说明：Hydro 通过自带的 `@hydrooj/register` loader 用 esbuild 直接编译 `.ts`（含装饰器），插件无需预编译。
>
> 不要在 addon 目录执行 `npm install`。该目录的 `node_modules/hydrooj` 是软链，`npm install` 会重建 `node_modules` 并破坏运行时依赖。

## 测试

```bash
npm test
```

测试使用 Node 内置 test runner，`tsx` 由 `npx` 临时下载，不会写入插件目录。当前覆盖验证码生成格式、邮箱归一化、TTL、purpose 绑定和原子校验过滤条件。

## 依赖

- Hydro 的 SMTP 已配置（`smtp.host / user / pass / from / secure`），验证码邮件走 `sendMail`
- reg.html 引用 `/swpu-display.woff2`、`/swpu-mono.woff2` 与 `/favicon.png`（同源路径，配合本仓库 `landing/` 部署；缺失时优雅降级系统字体）
- 反向代理部署时，Caddy 需要覆盖客户端传入的 XFF，Hydro 建议同时设置 `server.xproxy: true`，见 [部署清单](../../deploy/deployment.md)

## 安全细节

- 验证码使用 `crypto.randomInt` 生成，不使用 `Math.random`
- 验证码带 `purpose` 绑定，注册码不能用于登录，登录码不能用于注册
- 每次校验都通过 MongoDB 原子自增记录失败次数，5 次即作废重发，避免并发绕过
- 验证码显式检查 `expireAt`，不完全依赖 TTL 清理的延迟
- 验证码使用后立即删除；TTL 由 MongoDB 索引兜底
- 邮件发送失败自动清除验证码记录并返回明确错误
- 用户名复用 Hydro `Types.Username` 校验；重名冲突（E11000）返回友好提示
- IP 限速和 `loginip` 使用真实客户端 IP：直连时用 `request.ip`，只有直接对端是回环地址时才信任 XFF 首段
