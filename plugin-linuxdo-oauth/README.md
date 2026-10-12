# plugin-linuxdo-oauth — linux.do Connect 第三方登录

## 启用步骤

1. 在 [connect.linux.do](https://connect.linux.do) 申请一个 OAuth 应用：
   - **回调地址**填 `https://dfacm.website/oauth/linuxdo/callback`
   - 获得 Client ID 和 Client Secret
2. 在站长后台 → 系统设置（/manage/setting）添加两个键：
   - `linuxdo.client_id` = 你的 Client ID
   - `linuxdo.client_secret` = 你的 Client Secret
3. `pm2 restart hydrooj`——插件启动时检测到配置即注册 OAuth provider；`/reg` 页面的
   第三方登录按钮列表（来自 Hydro 的 `handler.loginMethods` 注册表）会自动出现
   「使用 linux.do 登录」。

## 架构关系

- 本插件**走原生 OAuth 通道**（`ctx.oauth.provide`）：登录路由 `/oauth/linuxdo/login`
  和回调路由 `/oauth/linuxdo/callback` 由 Hydro 核心 `user.ts` 的
  `UserOauthHandler` / `UserOauthCallbackHandler` 提供，本插件只提供 provider 配置
  （授权 URL、token 交换、用户信息映射）——不 fork、不新增路由、零引擎改动。
- 未配置（client_id/secret 为空）时插件不注册 provider，`/reg` 页面不会渲染死按钮。
- 新用户经 OAuth 回调后走原生 `UserRegisterWithCodeHandler`（补全用户名步骤），
  auto-join 由 swpu-ops 的 `auth/login` 钩子兜底——与其他 OAuth 路径一致。

## 与无密码化的关系

学生账号无密码不影响 OAuth 登录——OAuth 建号的账号同样不设密码（`UserRegisterWithCodeHandler`
的 password 字段可选）；已有验证码账号绑定 linux.do 后，两种方式都能进同一账号。
