# 部署清单

从一台全新 Debian 12 服务器到完整上线的步骤。**本文件不含任何密钥**，密码和授权码请存放在私有渠道。

## 0. 一键部署（推荐入口）

`deploy/deploy.sh` 在**本地仓库**运行（Git Bash 可用）：同步插件、门面、主题与冒烟脚本 → 双端 sha256 对账 → 才执行**唯一一次** `pm2 restart hydrooj` → 等新进程就绪（≥75s）→ 在服务器上跑 `deploy/smoke.sh` 匿名冒烟电池。

```bash
bash deploy/deploy.sh             # 完整部署：同步 → 对账 → 重启 → 等就绪 → 冒烟
bash deploy/deploy.sh --sync-only # 只同步+对账，不重启（适合只改静态资源）
```

- 插件文件清单直接解析第 4 节的 `cp /root/swpu-oj/<插件>/{...}` 块，文档与实际发货不会漂移；**新增插件文件必须先改本文档**。
- 退出码：64 用法；65 双端哈希不一致（**绝不重启**）；66 本地缺文件或服务器不可达；67 新进程 75 秒内未就绪；68 冒烟有失败项。
- 环境变量：`SSH_TARGET`（默认 `root@100.69.19.62` 走 Tailscale，断连时用 `root@107.151.246.137`）、`SSH_KEY`、`WAIT_SECONDS`、`SMOKE_HOST`。
- Caddyfile 与 footer 的 mongosh 迁移仍按第 7/4 节手动执行（改动频率远低于插件代码）。
- 冒烟电池覆盖：boot 三维度服务端注入（tab/embed/oauth）、裸 /login /register 收敛、访客门禁 302、regcode 恶意 purpose 拒绝、安全头、缓存头、404 无缓存、308、Service Worker killswitch。**教训**：2026-10-04 曾因文件在重启之后才落盘，线上进程跑旧代码而磁盘哈希全对——顺序即正确性。

## 1. Hydro 安装

```bash
LANG=zh . <(curl https://hydro.ac/setup.sh)
```

- 默认装 hydrooj + ui-default + hydrojudge + mongodb，Web 端口 127.0.0.1:8888，Caddy 对外 80/443。
- 4G 内存机器记得调小 MongoDB WiredTiger cache（安装器会自动处理）。
- 判题机配置 `~/.hydro/judge.yaml`，`pm2 start hydrojudge`。
- 建议把本仓库克隆到 `/root/swpu-oj`，后续脚本都从这里运行。当前这台机器以 `/root/swpu-theme-deploy/` 存放可重放资产（`deploy/`、`theme/`），文档里的 `/root/swpu-oj` 路径在此机器上对应它。

## 2. 门面资源（UI 重建免疫）

Hydro 重装或升级会重建 `/root/.hydro/static/`。门面资源放在独立目录，由 Caddy 优先服务：

```bash
bash /root/swpu-oj/deploy/install-landing.sh /root/.hydro/custom
```

脚本会处理两个容易漏掉的细节：

- 把 `landing/index.html` 安装为 `home.html`，与 Caddy 的 `rewrite / /home.html` 对齐。
- 把 `landing/assets/*` 展平到 `/root/.hydro/custom/`，让 `/favicon.png`、`/og-cover.png` 等根路径可以直接访问。

Caddy 站点块中的 `@custom` 和 `handle @custom` 见 [Caddyfile.example](Caddyfile.example)。

落地页自带白天/夜间双主题：默认白天，导航与移动端菜单有切换按钮，选择存 `localStorage 'swpu-theme'`（同源下 OJ 页脚的切换也会写这个键，首页自动跟随 OJ 的选择）。更新 `footer_extra_html` 后按 `deploy/update-footer-toggle-sync.js` 重跑 mongosh 并 `pm2 restart hydrooj`。

## 3. 主题：原生双主题（默认 light）+ 品牌薄层

Hydro `ui-default` 自带持续维护的 Light / Dark 双主题，站点默认 light，用户可在偏好设置或页脚切换。推荐只追加 `theme/00-brand.css`（同时覆盖两种模式），不要重新启用 01-05 的旧全量覆盖；旧文件仅保留作回退参考。

```bash
bash /root/swpu-oj/deploy/install-theme.sh
```

脚本会先剥掉两处 CSS 里所有 `==== SWPU ACM` 旧 overlay，再追加 `00-brand.css`，并把两处 `service-worker.js` 换成自注销清缓存版本。这样 UI 重建、重复执行和旧主题残留都不会覆盖最新品牌层。

运行前会检查四个目标是否存在且可读写；路径或版本不对时以非零状态退出，不会跳过后报告成功。首次和重复部署都会备份，完成后校验资源。默认主题用 `deploy/set-theme-light.js` 设置，它支持空页脚配置并保留用户主题选择。

它同时处理两处主题 CSS：

1. `/root/.hydro/static/theme-<版本>.css`：Caddy 实际直出的文件。
2. `.../ui-default/public/theme-<版本>.css`：UI 重建时的来源。

Hydro 的 webpack 运行时会再注入一份 `theme-<版本>.css?<hash>`。旧 Service Worker 可能把这个 URL 的旧响应放在品牌层之后，导致主题回退。kill-switch 在首次激活时清空 CacheStorage 并注销自身，之后浏览器只使用正常的 HTTP 缓存。

验证 kill-switch 已生效：

```bash
curl -s https://<域名>/service-worker.js | grep -q unregister && echo "sw kill-switch ok"
```

如果 Hydro 版本不同，先指定版本：

```bash
THEME_VERSION=5.0.0 bash /root/swpu-oj/deploy/install-theme.sh
```

旧浅色 Hydro 需要完整回退时，显式开启：

```bash
SWPU_THEME_LEGACY=1 bash /root/swpu-oj/deploy/install-theme.sh
```

系统和用户的主题默认已恢复 light，切换与恢复默认的步骤见 [theme/README.md](../theme/README.md)。

## 4. 注册插件

```bash
mkdir -p /root/.hydro/addons/swpu-regcode
cp /root/swpu-oj/plugin-swpu-regcode/{index.ts,auth.ts,codes.ts,config.ts,logic.ts,reg.html,package.json} \
   /root/.hydro/addons/swpu-regcode/
mkdir -p /root/.hydro/addons/swpu-regcode/node_modules
ln -sfn /usr/local/share/.config/yarn/global/node_modules/hydrooj \
        /root/.hydro/addons/swpu-regcode/node_modules/hydrooj
# 参考 plugin-swpu-regcode/addon.json.example，把插件路径加入 /root/.hydro/addon.json
pm2 restart hydrooj
```

验证码限流、跳转路径和邮箱冷却都在系统设置里调整，见 [plugin-swpu-regcode/README.md](../plugin-swpu-regcode/README.md)。升级到本版本后旧验证码需要重新获取。

管理员周报与判题健康摘要可选安装：

```bash
mkdir -p /root/.hydro/addons/swpu-ops
cp /root/swpu-oj/plugin-swpu-ops/{index.ts,operations.cjs,report.cjs,live-rp.cjs,package.json} \
   /root/.hydro/addons/swpu-ops/
mkdir -p /root/.hydro/addons/swpu-ops/node_modules
ln -sfn /usr/local/share/.config/yarn/global/node_modules/hydrooj \
        /root/.hydro/addons/swpu-ops/node_modules/hydrooj
# 参考 plugin-swpu-ops/addon.json.example，把插件路径加入 /root/.hydro/addon.json
pm2 restart hydrooj
```

安装后在“控制面板 → 脚本管理”用 `hydrooj cli script swpuWeeklyReport '{}'` 或后台表单运行，详见 [plugin-swpu-ops/README.md](../plugin-swpu-ops/README.md)。

两个报表脚本只读；同一 addon 默认启用的 RP 钩子会更新排名。它过滤评测过程并串行合并重算，设置 `SWPU_LIVE_RP=0` 后重启可以关闭。

训练工作台与错题本可选安装（面向登录用户，无管理员权限要求）：

```bash
mkdir -p /root/.hydro/addons/swpu-train
cp /root/swpu-oj/plugin-swpu-train/{index.ts,mistakes.cjs,workbench.cjs,workbench.html,mistakes.html,package.json} \
   /root/.hydro/addons/swpu-train/
mkdir -p /root/.hydro/addons/swpu-train/node_modules
ln -sfn /usr/local/share/.config/yarn/global/node_modules/hydrooj \
        /root/.hydro/addons/swpu-train/node_modules/hydrooj
# 参考 plugin-swpu-train/addon.json.example，把插件路径加入 /root/.hydro/addon.json
pm2 restart hydrooj
```

安装后 `/workbench` 与 `/mistakes` 出现在登录用户导航中。错题收集只在 pm2 instance 0 运行；设置 `SWPU_TRAIN_MISTAKES=0` 并重启可关闭收集（页面仍可用）。数据口径与限制见 [plugin-swpu-train/README.md](../plugin-swpu-train/README.md)。

**不要**在 `/root/.hydro/addons/swpu-regcode/` 运行 `npm install` 或 `npm ci`（其他插件同理），避免重建运行目录的 `node_modules` 和 Hydro 软链。开发测试在独立仓库检出目录的插件目录中运行 `npm ci && npm test`，依赖按锁文件安装。

## 5. 邮件系统

系统设置（或 `db.system`）写入以下键：

| 键 | 值示例 |
|---|---|
| `smtp.host` | `smtp.gmail.com` / `smtp.qq.com` |
| `smtp.port` | `465` |
| `smtp.secure` | `true` |
| `smtp.user` / `smtp.from` | 发件邮箱（from 可带显示名） |
| `smtp.pass` | 授权码（不是邮箱登录密码） |
| `smtp.verify` | 注册是否强制邮箱验证（false = 注册零摩擦） |

注意：Hydro 仅在 `smtp.verify && smtp.user` 同时为真时发验证邮件。

## 6. 反向代理真实 IP

Caddy 反代到 `127.0.0.1:8888`。如果 Hydro 不知道自己在代理后面，`request.ip` 会变成 127.0.0.1，导致按 IP 限速、登录日志和风控全部失真。

两层都要设置。

1. Hydro 系统配置：

```yaml
server:
  xproxy: true
```

2. Caddy 覆盖客户端传入的 XFF，只信任自己的直接连接（[Caddyfile.example](Caddyfile.example) 已包含）：

```caddyfile
reverse_proxy http://127.0.0.1:8888 {
  header_up X-Forwarded-For {remote_host}
}
```

改完执行 `pm2 restart hydrooj`，并确认注册接口日志里的 IP 不再是 127.0.0.1。

## 7. 安全响应头

[Caddyfile.example](Caddyfile.example) 已包含：

- `Strict-Transport-Security`
- `X-Content-Type-Options`
- `Referrer-Policy`
- `Permissions-Policy`
- `X-Frame-Options` + `Content-Security-Policy: frame-ancestors 'none'`

验证：

```bash
curl -sSI https://<域名>/ | grep -Ei 'strict-transport|x-content-type|referrer-policy|permissions-policy|content-security-policy'
```

## 8. 字体与图标

- 展示字体子集化：`python scripts/subset_fonts.py <zcool.ttf> <jbmono.ttf> landing`（需 fonttools + brotli）。脚本会同时读取 `landing/index.html` 和 `plugin-swpu-regcode/reg.html`，产出约 100KB 的 woff2。
- 图标全套由 Pillow 渲染（4x 超采样）：favicon 96px、logo 192px、apple-touch 180px、android-chrome 192px。

## 9. UI 重建后的重放清单

- [ ] `bash deploy/install-theme.sh` 重新追加 00 品牌薄层（脚本会先剥掉旧 overlay；版本变化时先设置 `THEME_VERSION`）。
- [ ] 确认 static 与源包两处都能 `grep -c "SWPU ACM brand overlay"`。
- [ ] 确认 `/service-worker.js` 是 kill-switch（`grep -q unregister`）。
- [ ] 门面、字体、图标在 `custom/`，**无需重放**。
- [ ] 如果 Hydro 头部引用 static 下的默认 favicon，确认 `@custom` 路径列表覆盖同名文件。

## 10. 验证清单

- [ ] `https://<域名>/` 返回门面并包含 `og:image`。
- [ ] `/p` `/login` `/reg` `/training` 全部 200。
- [ ] 裸 `GET /login` 直接 200 返回品牌页（Caddy `rewrite`，非 302），`curl -s https://<域名>/login | grep -c '__SWPU_BOOT.tab="pwd"'` 为 1；带 query 的 `GET /login?x=1` 返回原生页。
- [ ] `/reg` 响应头为 `X-Frame-Options: SAMEORIGIN` 且 CSP 含 `frame-ancestors 'self'`（登录内嵌层依赖）；其余路由仍是 `DENY` / `'none'`。
- [ ] 未登录在任意页触发登录（顶栏「登录」或「登录后递交」）弹出的是品牌页内嵌层（`#swpu-auth-overlay`），原生 `dialog--signin` 不再显示；iframe 加载期间就有 loading、右上角关闭 ✕ 与「直接打开登录页」入口，加载失败/超时进入错误态并保留同样的出口；「直接打开登录页」必须指向**不带 `embed=1` 的顶层 `/reg`**（带上 embed=1 时顶层页面会以内嵌模式启动，卡内 ✕ 与登录成功回传都无人接收）；iframe 成功判定要认 `/reg` 特有标记（`#tab-reg`），不能只看 URL，防止 Caddy/Hydro 错误页冒充登录卡；内嵌页的站内链接必须跳到顶层页面；`footer_extra_html` 中所有脚本必须保持单行（Hydro 会把多行脚本按行拆碎成不执行的文本）。
- [ ] `/reg/complete` 在无验证码时返回 `{ ok: false }`，不会 500。
- [ ] `curl -I` 检查字体和图标有 `Cache-Control`。
- [ ] 注册流程走通（验证码邮件到达）。
- [ ] `/reg?tab=pwd` 密码登录后回首页；合法 `return` 回原页面，`//外站`、反斜杠及控制字符输入均不能导致站外导航。
- [ ] 两步验证 / 通行密钥账号能通过常显原生入口完成登录；iframe 内的原生入口、OAuth、找回密码都在顶层打开。
- [ ] 登录后 `/workbench` 与 `/mistakes` 返回 200 且出现在导航中；未登录访问被重定向到登录页。
- [ ] 提交一份固定错误输出（WA）判题结束后，该题出现在 `/mistakes`；补题 AC 后自动标记已补题。
- [ ] 找回密码邮件里的链接是绝对地址（`server.url` 必须是完整的 `https://域名/`，当前为 `https://swpuacm.xyz/`，**保留结尾 `/`**）。

## 15. 第三方登录（GitHub）

官方 `@hydrooj/login-with-github` 已安装。启用步骤：

1. 用 GitHub 账号在 https://github.com/settings/developers 新建 OAuth App（New OAuth App）：
   - Homepage URL 填 `https://swpuacm.xyz`
   - Authorization callback URL 填 `https://swpuacm.xyz/oauth/github/callback`
   - 这里的 GitHub callback **末尾不要加 `/`**；它与 Hydro 配置里的 `server.url` 不同，后者必须保留结尾 `/`。GitHub 会严格匹配 callback，保存后点击绿色的 `Update application`。
2. 把得到的 Client ID 和 Client Secret 写入系统设置（`/manage/config`）：
   ```yaml
   login-with-github:
     id: <Client ID>
     secret: <Client Secret>
   ```
   （或 `db.system` 的 `config` 文档追加同名键后 `pm2 restart hydrooj`。）
3. 重启后品牌 `/reg` 页与原地登录弹层会自动出现「使用 GitHub 登录」按钮（按钮由服务端 `loginMethods` 注入，未配置时自动隐藏）。
4. 已于 2026-10-03 配置完成并验证：按钮出现、`/oauth/github/login` 302 到 GitHub 授权页。凭据只存服务器 `db.system` 的 `config` 文档，**不得写入本仓库**（secret-scan 也会拦截）。

## 16. 角色分组

`system` 域内已创建 `acmer`、`teamleader` 两个角色，权限与内置 `default` 相同；新用户注册后自动使用内置 default 角色，在「域管理 → 加域管理/管理用户」里把人分到对应角色即可。角色定义存 `db.domain` 的 `system.roles` 字段。
- [ ] `request.ip` 不再是 127.0.0.1。

## 11. 缓存策略

使用 [Caddyfile.example](Caddyfile.example) 的完整处理分支，不要把缓存头放在全站范围：

- `handle @custom` 内给 `/home.html` 设置 `no-cache`。这个分支在首页 rewrite 之后执行，因此 `/` 和 `/home.html` 都生效；Caddy 默认把 `header` 排在 `rewrite` 之前，顶层 `header /home.html` 匹配不到原始 `/` 请求。
- 固定名字的自定义字体和图标缓存 1 小时；主题 CSS 缓存 10 分钟；Hydro 静态目录中匹配的资源缓存 7 天。
- 缓存头只对成功的 `2xx` 静态响应设置；动态请求保留 Hydro 自己的缓存决定，不覆盖 `/resource/*`、题目文件或用户下载。

**最低版本：Caddy 2.9.1。** `header ... { match status 2xx }` 这个响应匹配子指令在 2.9.0 及更早版本的解析器里不存在，旧版 Caddy 会解析失败、整份配置加载不了（不只是缓存不生效）。升级 Caddy 或改造写法之前，先在目标机执行 `caddy adapt --config <实际配置> --adapter caddyfile`（可能预配置模块，属于变更操作，由管理员执行）。

验证：

```bash
curl -sSI https://<域名>/ | grep -i cache-control
curl -sSI https://<域名>/home.html | grep -i cache-control
```

两个入口都应是 `no-cache`。

## 12. 备份、异机副本与恢复演练

`scripts/backup-hydro.sh` 是显式执行的 Linux 包装器，不安装定时任务、不停止服务、不自动删除任何文件。需要 `hydrooj`、MongoDB Database Tools 的 `mongodump`、`zip`、`unzip`、`tar`、`flock`、`sha256sum`、`realpath`。以运行 Hydro 的同一用户执行；如使用 `HYDRO_PROFILE`，应使用与该实例相同的值。

```bash
bash /opt/swpu-oj/scripts/backup-hydro.sh \
  --output-dir /data/backups/swpu-oj \
  --caddy-config /root/.hydro/Caddyfile
```

- 输出目录必须在 `~/.hydro`、`~/.config/hydro` 和文件存储（`--file-store`，默认 `/data/file`）之外；脚本按输出目录加锁，重复运行返回 `75`。
- 每次成功生成一个独立目录：官方 `hydrooj backup --withAddons` 产出的 `backup-*.zip`（数据库、`/data/file` 文件存储、addons）、`hydro-state.tar.gz`（`~/.hydro` 配置与判题配置，排除可重建的 `static/`）、可选 `runtime-config.tar.gz`、`Caddyfile`、`manifest.txt`、`SHA256SUMS` 和私有诊断日志。
- 输出使用 `umask 077`。Hydro 5.0.7 的备份日志可能含 MongoDB 连接凭据，完整输出只写进私有 `hydro-backup.log`；不要把日志或备份包提交到公开仓库。
- 备份失败、ZIP 缺失/损坏、配置打包失败都会返回非零并保留 `.pending-*` 目录供排查，不会标成完整备份。
- 建议策略：每天 1 次完整备份，保留最近 7 个每日、4 个每周、3 个每月副本；**脚本只记录政策，不自动删除**。清理前人工核对异机副本与恢复演练结果。

备份完成后把**整个成功目录**复制到另一台机器或学校存储，再在备份机执行 `sha256sum -c SHA256SUMS`。首次上线前和重要升级后，在隔离的备用实例做一次恢复演练：核对组件版本和校验和 → 按官方文档恢复 ZIP（会覆盖目标数据库和文件，只能指向备用实例）→ 从 sidecar 归档核对 `addon.json`、自定义资源、判题配置和 Caddy 配置 → 登录测试账号并执行第 14 节判题验收。Caddyfile 引用的外部 `import`、目录外 addon、软链目标和对象存储需要另行备份。

这是在线备份，数据库与文件不是跨存储的原子快照；重要比赛前选择上传/改题较少的时段，必要时人工安排维护窗口。不要直接复制正在使用的 MongoDB `/data/db`。

### 异机副本：自动拉取到维护人电脑

服务器 cron（`17 3 * * *`）生成日备后，管理机每天 **09:07** 由 Windows 计划任务 `OJ backup pull` 运行 `C:\Users\yuki\Desktop\oj备份\pull_oj_backup.ps1`：

- 依次尝试 Tailscale（`100.69.19.62`）与公网（`107.151.246.137`），先通者为准；只拉本地缺失的文件（`.part` 中转，断网/中断不留半截文件）。
- 拉取范围：`/root/backups` 下全部平铺文件（含 `dead-19` / `ybt-remote-609` 等题库归档 JSON），本地 `backup-*.zip` 只保留最近 14 份，一次性归档永不删。
- 日志在 `pull.log`；任务设 `StartWhenAvailable`，电脑 09:07 没开机会在下次开机补跑。
- **恢复演练（轻量版）**：每次拉取后可直接用 `Expand-Archive` / 压缩软件打开 zip 核对 `dump/`（BSON）与 `file/`（测试数据）在位；完整恢复演练仍按本节上文流程在备用实例做。
- **应急大文件传输（深夜 SSH 批量被掐时）**：跨境链路深夜可能对 SSH 数据流整体限速（交互命令正常、scp/scp 并行全部 0 速率），而 443+代理路线实测 ~1MB/s。应急法：把文件以**不可猜测的随机名**放进 `/root/.hydro/static/`（Caddy 直出），本地 `curl --proxy <代理> -C -` 断点续传拉取，sha256 对账后**立即删除**并验证 URL 已 404。此法暴露完整数据库内容，仅限应急窗口使用。

## 13. 默认只读的部署检查

```bash
bash /opt/swpu-oj/scripts/check-deployment.sh \
  --role all --data-dir /data \
  --caddy-config /root/.hydro/Caddyfile
```

脚本读取 Hydro / hydrojudge 包版本，核对 Caddy 是否满足最低版本 2.9.1（低于该版本 `caddy adapt` 与运行时都会拒绝整份 Caddyfile，见第 11 节），显示 Node / Caddy 版本，检查 Web、MongoDB、Caddy、判题机与沙箱进程，检查数据盘与 Hydro 所在盘使用率，并用 `caddy adapt` 做语法/适配检查（丢弃可能含配置秘密的 JSON 输出）。磁盘使用率达到 90%、组件缺失、进程未发现、Caddy 版本过低、配置适配错误返回 `1`；参数错误返回 `64`。

- 组件分开部署时，Web 机使用 `--role web`，判题机使用 `--role judge`。judge 模式不要求 `hydrooj` 包、`config.json`、本地 MongoDB 或 Caddy，只核对 hydrojudge 与 `judge.yaml`，并且默认不检查 `/data`。
- 只有显式添加 `--url` 才执行 HTTP GET，检查 `/` 与 `/home.html` 为 `200` 且带 `no-cache`；不会发验证码或提交代码。
- `caddy adapt` 只做适配检查，不预配置模块；正式上线前的 `caddy validate` 由管理员在确认配置路径后执行。进程存在不代表判题正确，也不代表没有排队。

## 14. 人工判题验收与升级回退

在独立测试域准备一题明确的 A+B，用支持的 C++ 和 Python 各提交一份正确程序确认 AC；提交固定错误输出确认 WA、死循环确认 TLE、非法语法确认 CE。对照题目限时检查结果，确认有判题机执行、测试数据可读、沙箱限制生效。不要在正式比赛排名里运行这些测试。

升级流程：记录当前组件与自研插件版本 → 保存并核验完整备份和异机副本 → 备用实例升级 → 注册/登录与人工判题验收 → 在人工确认的维护窗口应用到正式机。升级失败时，优先切换到验证过的备用实例，或按相匹配的程序版本和数据备份恢复；数据库迁移后不要直接降级 npm 包当作回退。本仓库没有自动发布、重启或回滚脚本。
