# swpu-regcode — 数字验证码注册插件

Hydro v5 的原生注册流程是「邮箱 → 点邮件里的链接 → 设账密」。国内用户更习惯**输数字验证码**。本插件在 Hydro 旁边实现了验证码注册 + 验证码免密登录（双标签页），登录后按来源跳转（新号直达训练路线）。

## 工作方式

```
GET  /reg            注册 + 验证码登录双标签页（读取插件目录下的 reg.html）
POST /reg/code       {mail, purpose}   发送 6 位验证码（purpose: reg=注册 / login=免密登录）
POST /reg/complete   {mail, code, uname, password}   注册并自动登录
POST /reg/login      {mail, code}      验证码免密登录
```

- 验证码存独立集合 `regcode`，邮件发送成功后 **5 分钟内有效**；校验显式检查到期时间，TTL 索引仅负责清理
- 单邮箱 **60 秒 1 条**、单 IP 默认 **每小时 200 条**、全站默认 **每小时 500 条**；注册与登录共用发送额度
- 邮箱域黑名单复用 Hydro `BlackListModel`；已注册邮箱直接提示去登录
- 建号复用 `UserModel.create`；QQ 邮箱注册自动挂 QQ 头像
- 登录保留 Hydro 5.0.7 的会话更新、认证事件与审计，通过 JSON 中的 `redirect` 让现有页面跳转
- 登录码只发给账号已绑定的完整邮箱，并绑定 UID；新账号必须使用收到注册邮件的同一邮箱完成注册
- reg.html 由插件直接读取同目录文件输出，**放在 addon 目录里，UI 重装/升级不影响**

## 安装

```bash
# 1. 上传本目录到服务器
mkdir -p /root/.hydro/addons/swpu-regcode
#    把本目录运行文件一起上传：index.ts / auth.ts / codes.ts / config.ts / reg.html / package.json

# 2. 让插件能 require('hydrooj')（按你的 hydrooj 包实际路径调整软链目标）
mkdir -p /root/.hydro/addons/swpu-regcode/node_modules
ln -sfn /usr/local/share/.config/yarn/global/node_modules/hydrooj \
        /root/.hydro/addons/swpu-regcode/node_modules/hydrooj

# 3. 注册 addon：编辑 /root/.hydro/addon.json，在数组末尾追加
#    "/root/.hydro/addons/swpu-regcode"

# 4. 重启
pm2 restart hydrooj
```

> TS 说明：Hydro 通过自带的 `@hydrooj/register` loader 用 esbuild 直接编译 `.ts`（含装饰器），插件无需预编译。

## 依赖

- Hydro 的 SMTP 已配置（`smtp.host / user / pass / from / secure`），验证码邮件走 `sendMail`
- reg.html 引用 `/swpu-display.woff2`、`/swpu-mono.woff2` 与 `/favicon.png`（同源路径，配合本仓库 `landing/` 部署；缺失时优雅降级系统字体）
- 已对照 `hydrooj@5.0.7` 的 API 实现；Hydro 升级时先在备用实例验证插件

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

跳转只允许站内路径；限流值必须是 1–100000 的整数。邮箱归一化后的冷却仍为 60 秒，验证码最多有 5 次校验机会。默认 IP 额度提高的同时增加全站额度，不建议关闭限流。Hydro 的无限制权限或启动参数仍可绕过原生 `limitRate`，上线时检查这些配置。

关闭 `server.login` 会关闭此插件的注册和免密登录；关闭 Guest 的 `PRIV_REGISTER_USER` 会禁止发注册码及建号。禁用账号、比赛 IP 绑定也会检查。启用两步验证或通行密钥的账号应使用 Hydro 原生登录，本页面不采集第二因素。

严格比赛模式下，新号自动登录也须遵守每 IP 账号绑定；如果建号成功但登录被拒绝，会明确提示“账号已创建”，管理员需要核对 IP 绑定。现场赛建议提前关闭自助注册并分配比赛账号。

## 从 1.0.0 更新

先备份并在备用实例验证，再一起更新全部 `.ts` 运行文件。旧版本发出的验证码不会被新版接受，用户需重新获取；已有账号不受此数据格式变化影响。原来写死的注册跳转已改为后台配置，默认指向 `/training`；若要保留原训练路线，设置 `swpu.regcode.register_redirect` 为该路线路径。

如果部署服务器另有邮箱白名单，请保留并核对其实现。本仓库现有代码使用 Hydro 邮箱域黑名单，无法据此确定服务器上的额外白名单规则。

## 安全细节

- 使用 `crypto.randomInt` 生成 6 位码，数据库只保存随机盐和 SHA-256 摘要；短码仍是低熵凭据，摘要不替代数据库访问控制
- 原子预留最多 5 次校验机会，显式检查用途、账号和有效期，原子消费确保并发请求仅一次成功
- 邮件发送期间验证码不可使用；失败仅清理本次发送版本，不会删除后来发送的新码
- 注册先检查用户名，已占用时不消费验证码；并发建号冲突捕获 Hydro 业务异常，要求重新获取验证码
- 保留 `auth/before-login`、`auth/login` 和登录审计；审计记录不包含验证码或密码

## 本地验证

仓库根目录使用 Node >=22.18：`pnpm install --ignore-scripts`，然后 `pnpm test`、`pnpm check`。测试使用内存 Mongo 操作模型与 Hydro API 替身，不连接线上数据库、SMTP 或判题机；上线前仍须执行部署文档的备用实例验收。
