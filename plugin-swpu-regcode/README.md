# swpu-regcode — 数字验证码注册插件

Hydro v5 的原生注册流程是「邮箱 → 点邮件里的链接 → 设账密」。国内用户更习惯**输数字验证码**。本插件在 Hydro 旁边实现了一套验证码注册流程，注册完成后自动登录并跳转到指定训练路线。

## 工作方式

```
GET  /reg            注册页（读取插件目录下的 reg.html，品牌一致的单页）
POST /reg/code       {mail}       发送 6 位数字验证码
POST /reg/complete   {mail, code, uname, password}   校验建号并登录
```

- 验证码存独立集合 `regcode`，MongoDB TTL 索引 **5 分钟自动过期**
- 单邮箱 **60 秒 1 条**、单 IP **每小时 20 条** 限速（复用 Hydro `limitRate`）
- 邮箱域黑名单复用 Hydro `BlackListModel`；已注册邮箱直接提示去登录
- 建号复用 `UserModel.create`；QQ 邮箱注册自动挂 QQ 头像
- 登录逻辑复刻 Hydro 核心 `successfulAuth`（session.uid / scope / recreate），完成后 302 到训练路线
- reg.html 由插件直接读取同目录文件输出，**放在 addon 目录里，UI 重装/升级不影响**

## 安装

```bash
# 1. 上传本目录到服务器
mkdir -p /root/.hydro/addons/swpu-regcode
#    把 index.ts / reg.html / package.json 放进去

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

## 安全细节

- 验证码校验失败 5 次即作废重发
- 验证码使用后立即删除；TTL 由 MongoDB 索引兜底
- 邮件发送失败自动清除验证码记录并返回明确错误
- 用户名复用 Hydro `Types.Username` 校验；重名冲突（E11000）返回友好提示
