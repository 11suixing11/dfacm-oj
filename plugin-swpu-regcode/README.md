# swpu-regcode — 数字验证码注册插件

Hydro v5 的原生注册流程是「邮箱 → 点邮件里的链接 → 设账密」。国内用户更习惯**输数字验证码**。本插件在 Hydro 旁边实现了验证码注册 + 验证码免密登录（双标签页），登录后按来源跳转（新号直达训练路线）。v1.1 起验证码存储与消费独立到 `codes.ts`，登录策略独立到 `auth.ts`，真实客户端 IP 解析独立到 `logic.ts`，并补齐单元测试和 handler 回归测试。

## 工作方式

```
GET  /reg            注册 + 验证码登录双标签页（读取插件目录下的 reg.html）
POST /reg/code       {mail, purpose}   发送 6 位验证码（purpose: reg=注册 / login=免密登录）
POST /reg/complete   {mail, code, uname, password}   注册并自动登录
POST /reg/login      {mail, code}      验证码免密登录
```

- 验证码存独立集合 `regcode`，数据库只保存随机盐和 SHA-256 摘要，**不保存明文**；发送成功后 5 分钟内有效（TTL 索引只负责清理，校验显式检查 `expireAt`）
- 校验用 `findOneAndDelete` **原子消费，同一验证码并发只能成功一次**；每次失败原子预留一次机会，5 次即作废
- 登录码绑定账号 UID，且只发往账号**已绑定的完整邮箱**（输入别名只用于查找账号）；注册码绑定实际收件地址，注册时必须用收到邮件的同一地址完成
- 单邮箱 **60 秒 1 条**、单 IP 默认 **每小时 200 条**、全站默认 **每小时 500 条**；注册与登录共用发送额度
- 邮箱域黑名单复用 Hydro `BlackListModel`；已注册邮箱直接提示去登录
- 建号复用 `UserModel.create`；QQ 邮箱注册自动挂 QQ 头像
- 登录保留 Hydro 的会话更新、`auth/before-login` / `auth/login` 事件和 `user.loginSuccess` 审计；审计记录不包含验证码或密码
- 已启用两步验证 / 通行密钥的账号、被禁用账号、关闭 `server.login`、严格比赛模式 IP 绑定都会在发码和登录两步分别检查
- reg.html 由插件直接读取同目录文件输出，**放在 addon 目录里，UI 重装/升级不影响**

## 安装

```bash
# 1. 上传本目录到服务器
mkdir -p /root/.hydro/addons/swpu-regcode
#    把运行文件一起上传：index.ts / auth.ts / codes.ts / config.ts / logic.ts / reg.html / package.json

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
> 不要在上面的 addon 运行目录执行 `npm install`。该目录的 `node_modules/hydrooj` 是软链，`npm install` 会重建 `node_modules` 并破坏运行时依赖。测试请在仓库检出目录里跑（见下）。

## 后台配置

插件在 Hydro 系统设置中注册下列选项，无需改页面。`limit.*` 沿用 Hydro 的限流覆盖机制。

| 设置键 | 默认值 | 说明 |
|---|---|---|
| `limit.regcode_send_ip` | `200` | 每 IP 每小时发码上限，适配校园网共享出口 |
| `limit.regcode_send_global` | `500` | 全站每小时发码上限，按 SMTP 额度调整 |
| `limit.regcode_verify_ip` | `60` | 每 IP 每分钟校验请求上限 |
| `limit.regcode_verify_account` | `10` | 每邮箱每分钟校验请求上限 |
| `swpu.regcode.register_redirect` | `/training` | 注册成功跳转；可填写已有训练路线路径 |
| `swpu.regcode.login_redirect` | `/` | 验证码登录成功跳转 |

跳转只允许站内路径；限流值必须是 1–100000 的整数。旧版写死的训练路线地址已改为后台配置，升级后请把 `swpu.regcode.register_redirect` 设置为实际路线。

## 测试

在仓库检出目录执行（不要在上面的 addon 运行目录执行）：

```bash
cd plugin-swpu-regcode
npm test
```

`npm test` 先跑 `logic/codes/config` 的纯单元测试，再用 `node --test` 跑 `handlers.test.cjs`：后者通过 `npx` 调用 esbuild 编译 `index.ts`（首次运行需要联网缓存 `tsx` / `esbuild`），以 Hydro API 替身覆盖收件地址、登录策略、注册关闭、验证码一次性消费、审计脱敏和真实 IP 回退等行为。测试不连接线上数据库、SMTP 或判题机，也不需要在插件目录安装依赖。

## 依赖

- Hydro 的 SMTP 已配置（`smtp.host / user / pass / from / secure`），验证码邮件走 `sendMail`
- reg.html 引用 `/swpu-display.woff2`、`/swpu-mono.woff2` 与 `/favicon.png`（同源路径，配合本仓库 `landing/` 部署；缺失时优雅降级系统字体）
- 反向代理部署时，Caddy 需要覆盖客户端传入的 XFF，Hydro 建议同时设置 `server.xproxy: true`，见 [部署清单](../../deploy/deployment.md)

## 安全细节

- 验证码使用 `crypto.randomInt` 生成，不使用 `Math.random`
- 摘要绑定 salt、generation、purpose 和 UID；短码仍是低熵凭据，摘要不替代数据库访问控制
- 发送期间验证码为 `pending`，不可使用；发送失败只清理本次 generation，不会删掉后来重发的新码
- 校验与消费是原子操作：并发错误猜测最多预留 5 次，并发正确请求只有一个成功
- 注册先检查用户名，已占用时不消费验证码；并发建号冲突会明确要求重新获取验证码
- 用户名复用 Hydro `Types.Username` 校验；重名冲突（`UserAlreadyExistError` / E11000）返回友好提示
- IP 限速和 `loginip` 使用真实客户端 IP：直连时用 `request.ip`，只有直接对端是回环地址时才信任 XFF 首段（Caddy 会覆盖客户端传入的 XFF）
- 关闭 `server.login` 会关闭此插件的注册和免密登录；关闭 Guest 的 `PRIV_REGISTER_USER` 会禁止发注册码及建号
