# 部署清单

从一台全新 Debian 12 服务器到完整上线的步骤。**本文件不含任何密钥**，密码和授权码请存放在私有渠道。

## 0. 一键部署（推荐入口）

`deploy/deploy.sh` 在**本地仓库**运行（Git Bash 可用）：把全部文件上传到服务器上的临时暂存目录 → **对暂存副本**做双端 sha256 对账 → 通过后才安装到真实位置并安装主题/门面 → 再对已安装文件对账 → 才执行**唯一一次** `pm2 restart hydrooj` → 等新进程就绪（≥75s）→ 在服务器上跑 `deploy/smoke.sh` 匿名冒烟电池。

```bash
bash deploy/deploy.sh --stage-only # 只上传并对账暂存副本，完全不碰线上（演练用）
bash deploy/deploy.sh --sync-only  # 再安装+对账，但不重启（适合只改静态资源）
bash deploy/deploy.sh              # 完整部署
```

- **先对账后安装**：早期版本先安装再对账，哈希不一致时虽然拒绝重启，但服务器已经被改动（新 CSS / 新 SW / 新插件源码），旧进程却还在提供这些新资源，且没有回退手段。现在暂存对账失败时线上完全未被触碰。
- 暂存目录用 `mktemp -d` 随机生成并在退出时清理（早期固定的 `/tmp/swpu-deploy-stage` 可被本机低权限用户预先创建或植入符号链接）。
- SSH 默认 `StrictHostKeyChecking=accept-new`：首次连接固定主机密钥，之后任何变更都会被拒绝（本次会话以 root 同时走 Tailscale 与公网）。应急可用 `SSH_STRICT_HOST_KEY_CHECKING=no` 临时关闭。
- 发货清单覆盖 `landing/` **整棵树**（两个子集化 woff2 字体与整套图标）。早期清单只有 `landing/index.html`，换字体或图标必须手工跑 `install-landing.sh`，而本脚本永远不会替你做。
- 插件文件清单直接解析第 4 节的 `cp /root/swpu-oj/<插件>/{...}` 块，文档与实际发货不会漂移；**新增插件文件必须先改本文档**。
- 退出码：64 用法；65 双端哈希不一致（**绝不重启**）；66 本地缺文件或服务器不可达；67 新进程 75 秒内未就绪；68 冒烟有失败项。
- 环境变量：`SSH_TARGET`（默认 `root@100.69.19.62` 走 Tailscale，断连时用 `root@107.151.246.137`）、`SSH_KEY`、`SSH_STRICT_HOST_KEY_CHECKING`、`WAIT_SECONDS`、`SMOKE_HOST`。
- Caddyfile 与 footer 的 mongosh 迁移仍按第 7/4 节手动执行（改动频率远低于插件代码）。
- 冒烟电池覆盖：boot 三维度服务端注入（tab/embed/oauth）、裸 /login /register 收敛、访客门禁 302、regcode 恶意 purpose 拒绝、安全头、缓存头、字体与图标可达、404 无缓存、308、Service Worker killswitch。**教训**：2026-10-04 曾因文件在重启之后才落盘，线上进程跑旧代码而磁盘哈希全对——顺序即正确性。

## 1. Hydro 安装

```bash
LANG=zh . <(curl https://hydro.ac/setup.sh)
```

- 默认装 hydrooj + ui-default + hydrojudge + mongodb，Web 端口 127.0.0.1:8888，Caddy 对外 80/443。
- 4G 内存机器记得调小 MongoDB WiredTiger cache（安装器会自动处理）。
- 判题机配置 `~/.hydro/judge.yaml`，`pm2 start hydrojudge`。
- 建议把本仓库克隆到 `/root/swpu-oj`，后续脚本都从这里运行。当前这台机器以 `/root/swpu-theme-deploy/` 存放可重放资产（`deploy/`、`theme/`），文档里的 `/root/swpu-oj` 路径在此机器上对应它。

新站上线前，把 Hydro 的公开身份切换到独立品牌（不要继续使用旧学校站点配置）：

```yaml
server:
  name: 'd&f算法网'
  url: https://dfacm.website/
```

`server.url` 必须保留结尾 `/`，它会被找回密码、OAuth 和站内绝对链接复用。`dfacm.website` 是主域名；`swpuacm.xyz`、`www.swpuacm.xyz` 与 `www.dfacm.website` 作为同站入口保留，但公开页面统一显示 d&f算法网与主域名。保存系统配置后重启 `hydrooj`，再按下面的 Caddy、DNS、GitHub OAuth 和 Cloudflare 步骤切换域名。

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

运行前会检查四个目标是否存在且可读写；路径或版本不对时以非零状态退出，不会跳过后报告成功。完成后校验资源，**校验失败会自动回滚本次已改动的全部文件**。默认主题用 `deploy/set-theme-light.js` 设置，它支持空页脚配置并保留用户主题选择。

- **备份写在资产目录之外**：备份目录默认 `/root/swpu-theme-backups`（`BACKUP_DIR` 可改）。绝不能放在 `/root/.hydro/static` 里——Caddy 用 `root *` + `try_files {path}` + `file_server` 服务该目录，任何 `*.bak-*` 都是公开可下载的。脚本会检测并拒绝这种配置。每个目标保留最近 `SWPU_THEME_BACKUP_KEEP`（默认 10）份，更早的自动清理。
- **写入是原子的**：新内容先在目标同目录暂存，再单次 `mv` 换入，因此中断只会留下旧文件或新文件，不会留下被截断的样式表。
- 主题备份只在两个 theme CSS 与两个 service-worker.js 上产生；手动回滚可从 `/root/swpu-theme-backups` 取对应时间戳最新的那份覆盖回去。

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
cp /root/swpu-oj/plugin-swpu-ops/{index.ts,operations.cjs,report.cjs,live-rp.cjs,rp-sweep.cjs,package.json} \
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

积分商店可选安装（做题赚积分、花积分兑徽章，徽章能力由服务器已装的 badge-for-hydrooj 提供）：

```bash
mkdir -p /root/.hydro/addons/swpu-shop/templates
cp /root/swpu-oj/plugin-swpu-shop/{index.ts,points.ts,package.json} \
   /root/.hydro/addons/swpu-shop/
cp /root/swpu-oj/plugin-swpu-shop/{templates/shop.html,templates/history.html,templates/manage.html} \
   /root/.hydro/addons/swpu-shop/templates/
mkdir -p /root/.hydro/addons/swpu-shop/node_modules
ln -sfn /usr/local/share/.config/yarn/global/node_modules/hydrooj \
        /root/.hydro/addons/swpu-shop/node_modules/hydrooj
# 参考 plugin-swpu-shop/addon.json.example，把插件路径加入 /root/.hydro/addon.json
pm2 restart hydrooj
```

安装后用户下拉菜单出现「积分商店」（`/shop`），控制面板出现「积分商店管理」（`/manage/shop`）。每道题首次 AC 按难度（Hydro RP 同源算法，1~10 分）自动入账；管理员在 `/manage/shop` 给徽章定价并上架后，用户即可用积分兑换，兑换记录进 `swpuPointsLedger`，徽章持有关系写入 badge 插件的 `userBadge`（只调用其模型，不修改它）。佩戴仍在 badge 插件的 `/mybadge` 完成。

历史 AC 回填（站点 2026-10-01 上线，记录量极小，一次跑完）：

```bash
hydrooj cli script swpuShopBackfill '{"domainId":""}'   # 空 domainId 时回填 system 与 poj 两个域
```

脚本幂等（唯一键 `solve:{domainId}:{docId}` 挡重复），可重复运行、增量运行；`kind` 记 `backfill`，与实时入账互不冲突。

验收：

- `/shop` 游客可达（200），徽章卡片显示预览色块/标题/价格/状态；登录后显示「我的积分」与兑换按钮。
- `/shop/history` 登录后 200，显示时间/类型/明细/变动/累计余额，分页 20/页。
- `/manage/shop` 域管理员可见，每行价格 + 上架 checkbox 可保存。
- 兑换成功后跳转 `/mybadge`，佩戴后全站用户名旁出现徽章。

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

2. Caddy 按入口双路钉死 XFF（[Caddyfile.example](Caddyfile.example) 已包含），客户端自带任何转发头都到不了 Hydro：

   - **来自 CF 边缘**（连接对端命中 `@fromcf remote_ip` CF 段）：`header_up X-Forwarded-For {http.request.header.CF-Connecting-IP}`——CF 会用真实访客 IP 覆写客户端伪造的 `CF-Connecting-IP`，因此可安全作为 XFF；
   - **其他直连**：`header_up X-Forwarded-For {remote_host}`——对端即访客，伪造头一律不透传。

   不能只靠全局 `trusted_proxies + client_ip_headers`：Caddy 对可信代理是**保留并追加**入站 XFF 而非替换，CF 会把客户端伪造的 XFF 首段透传在链首，按首段取 IP 的 Hydro 会被绕过限速。全局块保留，用于访问日志 `client_ip` 字段的正确性。CF 的 IP 段以 <https://www.cloudflare.com/ips/> 为准，全局块与 `@fromcf` 匹配器两处要保持同步。

改完执行 `caddy reload --config /root/.hydro/Caddyfile`（或 `pm2 restart caddy`），并确认注册接口日志里的 IP 不再是 127.0.0.1；前置 CF 后 `tail /data/access.log` 里 `remote_ip` 应为 CF 边缘 IP、`client_ip` 应为访客 IP。

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
- 注意 `swpu-mono.woff2` 同时是 OJ 全站 code/pre 字体（`theme/00-brand.css`），子集已覆盖题面代码常用符号（箭头/数学运算符/制表框线等）；需要扩充时改 `subset_fonts.py` 里的 `unicodes` 重新生成并上传即可，无需改 CSS。
- 图标全套由 Pillow 渲染（4x 超采样）：favicon 96px、logo 192px、apple-touch 180px、android-chrome 192px。

## 9. UI 重建后的重放清单

- [ ] `bash deploy/install-theme.sh` 重新追加 00 品牌薄层（脚本会先剥掉旧 overlay；版本变化时先设置 `THEME_VERSION`）。
- [ ] 确认 static 与源包两处都能 `grep -c "SWPU ACM brand overlay"`。
- [ ] 确认 `/service-worker.js` 是 kill-switch（`grep -q unregister`）。
- [ ] 门面、字体、图标在 `custom/`，**无需重放**。
- [ ] 如果 Hydro 头部引用 static 下的默认 favicon，确认 `@custom` 路径列表覆盖同名文件。
- [ ] `bash deploy/patch-ranking-template.sh` 重新打排名页模板补丁（own-row 去重 + 自己行高亮，上游升级会换掉整个模板文件），然后 `pm2 restart hydrooj`。
- [ ] `bash deploy/patch-rating-floor.sh` 重打单题 RP 保底补丁（上游升级会覆盖 rating.ts），重启后触发一次 `hydrooj cli script swpuRpSweep '{}'` 重算。

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
- [ ] 找回密码邮件里的链接是绝对地址（`server.url` 必须是完整的 `https://域名/`，新站应为 `https://dfacm.website/`，**保留结尾 `/`**）。
- [ ] 注册接口日志里的 `request.ip` 不再是 127.0.0.1（真实 IP 链路见第 6 节）。

## 11. 第三方登录（GitHub）

官方 `@hydrooj/login-with-github` 已安装。启用步骤：

1. 用 GitHub 账号在 https://github.com/settings/developers 新建 OAuth App（New OAuth App）：
   - Homepage URL 填 `https://dfacm.website`
   - Authorization callback URL 填 `https://dfacm.website/oauth/github/callback`
   - 这里的 GitHub callback **末尾不要加 `/`**；它与 Hydro 配置里的 `server.url` 不同，后者必须保留结尾 `/`。GitHub 会严格匹配 callback，保存后点击绿色的 `Update application`。
2. 把得到的 Client ID 和 Client Secret 写入系统设置（`/manage/config`）：
   ```yaml
   login-with-github:
     id: <Client ID>
     secret: <Client Secret>
   ```
   （或 `db.system` 的 `config` 文档追加同名键后 `pm2 restart hydrooj`。）
3. 重启后品牌 `/reg` 页与原地登录弹层会自动出现「使用 GitHub 登录」按钮（按钮由服务端 `loginMethods` 注入，未配置时自动隐藏）。
4. 原站于 2026-10-03 配置完成并验证：按钮出现、`/oauth/github/login` 302 到 GitHub 授权页。新域名上线后需重新验证授权与回调。凭据只存服务器 `db.system` 的 `config` 文档，**不得写入本仓库**（secret-scan 也会拦截）。

## 12. 角色分组

`system` 域内已创建 `acmer`、`teamleader` 两个角色，权限与内置 `default` 相同；新用户注册后自动使用内置 default 角色，在「域管理 → 加域管理/管理用户」里把人分到对应角色即可。角色定义存 `db.domain` 的 `system.roles` 字段。

## 13. 缓存策略

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

## 14. Cloudflare 免费版接入

背景：小厂境外线路晚高峰跨境拥塞（TCP 可握手、传输掉到数百 B/s），应用层已无优化空间。用 CF 免费版把「访客 → 跨境烂路」换成「访客 → CF 骨干 → 回源」：静态资源（字体/图标/CSS/JS）按 Caddy 的 `Cache-Control` 在边缘缓存 1 小时~7 天，动态请求由 CF 回源到台湾机（CF 边缘到源站走海外骨干，不经过拥塞的跨境段）。

### 拓扑与职责

- DNS：注册商（阿里云）NS 迁到 CF 分配的两个 NS；`A @` 与 `A www` → `107.151.246.137`，全部开橙云（proxied）。
- TLS：SSL/TLS 模式必须 **Full (strict)**；源站 Caddy 继续用 Let's Encrypt，HTTP-01 挑战经 CF 80 端口可正常续期（TLS-ALPN 在 CF 后不可用，HTTP-01 成功即续期成功）。
- 真实 IP：见第 6 节（trusted_proxies + CF-Connecting-IP），是本次接入唯一的源站配置改动。
- 只有 80/443 流量过 CF；SSH、Tailscale、判题机出站、SMTP 出站均不经过 CF，不受影响。

### Dashboard 检查单

- SSL/TLS → Overview → **Full (strict)**。不要 Flexible：会出现重定向循环且 CF→源站明文。
- SSL/TLS → Edge Certificates → Always Use HTTPS：开。
- Speed → Optimization → Rocket Loader：**关**（会打乱 Hydro webpack 资源的执行顺序）。
- Network → HTTP/3、WebSockets：默认开，确认未被关闭（评测状态推送与 LSP websocket 依赖后者）。
- DNS 记录里的 HTTPS/SVCB 类型不用手动维护：CF 会为橙云主机自动发布自己的 HTTPS 记录（alpn h3,h2）。
- 免费 plan 上传体上限 100MB：给题目传超大测试数据若被 413，临时把 A 记录切灰云或直接走 SSH 上传。

### 新域名切换步骤（沿用 2026-10-04 的原站流程）

1. 源站先上第 6 节的 Caddy 配置并 reload（直连行为等价，可先于 NS 迁移执行）。
2. CF 添加站点 `dfacm.website`（Free plan），核对自动导入的 `A @`/`A www` 与源 IP 一致，全部开橙云；`swpuacm.xyz` 及其 `www` 记录继续指向同一站点。
3. 阿里云域名控制台把 DNS 服务器改为 CF 分配的两个 NS（站点未启用 DNSSEC，无需预处理）。
4. CF 「Check nameservers now」等待激活；旧 zone TTL 600s，一般 1 小时内。
5. 激活后按 Dashboard 检查单逐项配置。

### 验证

- `curl -sI https://dfacm.website/ | grep -iE 'server|cf-ray'` → `server: cloudflare`。
- 服务器 `tail -f /data/access.log`：`remote_ip` 变为 CF 边缘段 IP，`client_ip` 保持访客 IP。
- `bash deploy/smoke.sh` 仍全部通过（注意它默认 `SMOKE_IP=127.0.0.1`，永远直测源站、**绕过 CF**——它验证回源链路，不能证明 CF 生效）。
- 门面、`/p`、`/login`、提交一次代码看评测状态推送（websocket）。

### 回滚

- 快速：CF DNS 面板把 A 记录切灰云（DNS only），流量立即回到直连，NS 不用改回。
- 彻底：阿里云把 NS 改回 `dns1.hichina.com` / `dns2.hichina.com`。
- 源站 Caddy 配置无需回滚（灰云/橙云两种模式下行为等价）。

### 已知边界

- CF 免费版对国内访客通常回落美西节点，RTT 约 150–250ms：比直连拥塞线路强一个量级，但根治仍需国内服务器 + 备案。
- `service-worker.js` 是 kill-switch 静态文件，可能被边缘缓存至多一周，无行为影响。

## 15. 备份、异机副本与恢复演练

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

## 16. 默认只读的部署检查

```bash
bash /opt/swpu-oj/scripts/check-deployment.sh \
  --role all --data-dir /data \
  --caddy-config /root/.hydro/Caddyfile
```

脚本读取 Hydro / hydrojudge 包版本，核对 Caddy 是否满足最低版本 2.9.1（低于该版本 `caddy adapt` 与运行时都会拒绝整份 Caddyfile，见第 11 节），显示 Node / Caddy 版本，检查 Web、MongoDB、Caddy、判题机与沙箱进程，检查数据盘与 Hydro 所在盘使用率，并用 `caddy adapt` 做语法/适配检查（丢弃可能含配置秘密的 JSON 输出）。磁盘使用率达到 90%、组件缺失、进程未发现、Caddy 版本过低、配置适配错误返回 `1`；参数错误返回 `64`。

- 组件分开部署时，Web 机使用 `--role web`，判题机使用 `--role judge`。judge 模式不要求 `hydrooj` 包、`config.json`、本地 MongoDB 或 Caddy，只核对 hydrojudge 与 `judge.yaml`，并且默认不检查 `/data`。
- 只有显式添加 `--url` 才执行 HTTP GET，检查 `/` 与 `/home.html` 为 `200` 且带 `no-cache`；不会发验证码或提交代码。
- `caddy adapt` 只做适配检查，不预配置模块；正式上线前的 `caddy validate` 由管理员在确认配置路径后执行。进程存在不代表判题正确，也不代表没有排队。

## 17. 人工判题验收与升级回退

在独立测试域准备一题明确的 A+B，用支持的 C++ 和 Python 各提交一份正确程序确认 AC；提交固定错误输出确认 WA、死循环确认 TLE、非法语法确认 CE。对照题目限时检查结果，确认有判题机执行、测试数据可读、沙箱限制生效。不要在正式比赛排名里运行这些测试。

升级流程：记录当前组件与自研插件版本 → 保存并核验完整备份和异机副本 → 备用实例升级 → 注册/登录与人工判题验收 → 在人工确认的维护窗口应用到正式机。升级失败时，优先切换到验证过的备用实例，或按相匹配的程序版本和数据备份恢复；数据库迁移后不要直接降级 npm 包当作回退。本仓库没有自动发布、重启或回滚脚本。

## 18. 排名页模板补丁（own-row 去重 + 自己行高亮）

上游 `ui-default` 的 `templates/ranking.html` 有两个问题，`deploy/patch-ranking-template.sh` 一次运行按序打两个补丁（幂等、各自带标记）：

1. **own-row 去重**：上游把登录用户自己的排名行**无条件**渲染在榜单之前：第 1 名登录后看到自己出现两次，序号变成 1、1、2、3…（置顶行显示存储的 `rank`，榜单行显示循环序号；游客不受影响）。补丁把置顶行改成仅当用户存储的 `rank` **不在**当前页排名区间内才渲染——用户已被本页列出时不再重复；翻到后面页或没有排名（rp=0）时置顶行照常出现，保留上游"显示自己位置"的设计意图。标记：`SWPU ACM patch: ranking own-row dedup`。
2. **自己行高亮**：人一多就很难在榜单里找到自己。补丁给登录用户自己的行（置顶行与榜内行）加 `swpu-row--self` 类，`theme/00-brand.css` 画品牌蓝高亮 + 左侧色条 + "你"徽章；类判定用 `handler.user._id == udoc._id`（两侧都是数字 uid，Guest 是 0 不会误匹配）。标记：`SWPU ACM patch: ranking self-row highlight`。

- 应用：`bash deploy/patch-ranking-template.sh`（全新上游文件一次补齐两块；ui-default 升级会覆盖模板文件，重跑即可恢复）。模板加载进内存后不再读盘，改完必须 `pm2 restart hydrooj`。
- 补丁条件刻意只用纯算术：随 ui-default 附带的 nunjucks 裁剪版没有 `namespace` 全局、没有 `map` 过滤器，属性式 `{% set ns.v = ... %}` 会直接编译崩溃。
- 验证：匿名 `/ranking` 行数 = 榜单人数；登录已上榜用户查看 `/ranking` 不应再出现第二行自己，且自己的行带 `swpu-row--self` 类与"你"徽章。

## 19. 单题 RP 保底补丁（problem 组件）

上游 `hydrooj` 的 `src/script/rating.ts` problem 组件把每人原始分压成 `max(0, min(raw, log(raw) / log(1.03)))`：log 分支在 raw==1 时恰好为 0，而一道 d1（难度 1）题 AC 恰好贡献 raw 1——只做出第一道简单题的成员 rp=0，被排名页 `rp>0` 过滤器和 calcLevel 的排名字段**同时**排除，"明明 AC 了却查无此人"，个人页显示 `RP: 0 (No. ?)`。上游 contest 组件本就自带 `max(1, ...)` 保底，本补丁给 problem 组件同样的保底：任何正原始分至少 1 RP（部分分也保底，"有得分就上榜"）。

- 应用：`bash deploy/patch-rating-floor.sh`（幂等：带 `SWPU ACM patch: problem RP floor` 标记即跳过；hydrooj 升级会覆盖 rating.ts，重跑即可恢复）。rating.ts 是启动时编译的 TS，改完必须 `pm2 restart hydrooj`，再触发一次重算：`hydrooj cli script swpuRpSweep '{}'`（或等 swpu-ops 每小时清扫、重启后 3 分钟的首次清扫）。
- 验证：只 AC 过一道简单题的成员出现在 `/ranking`（RP 1），个人页显示 `RP: 1 (No. N)`；零得分账号仍不上榜；已有 rp 的成员数值不变（保底只影响原本算成 0 的正原始分）。

## 20. 文化基建种子（讨论区 / 关于页 / 题单 / 首场比赛）

把老站（acm.mangata.ltd，同一实验室的前代 OJ）沉淀的"血肉"迁到本站：队史与制度文化、讨论区置顶帖、出题流水线、比赛文化。种子文件在 `deploy/culture/`（hw_seed.sh + 帖子 / 关于页 / 节点 YAML / 题单脚本），**一次性**运行：

```sh
scp -r deploy/culture root@SERVER:/root/culture-seed
ssh root@SERVER 'bash /root/culture-seed/hw_seed.sh prep'   # 只读检查（Types.Boolean/凭据/登录/时区）
ssh root@SERVER 'bash /root/culture-seed/hw_seed.sh run'    # 正式执行
```

种子动作（全部经服务号 hydsvc-0074 会话 + sudo，curl `--resolve` 直连源站）：

1. **讨论节点**：`discussion.nodes` 系统设置加 `SWPU` 分类（公告 / 云剪切板 / 闲聊），POST `/domain/dashboard` `operation=init_discussion_node` 重建节点（16→19）。
2. **四篇置顶帖**（docType 21，全 pin；作者事后改写为 bot爱摸鱼 uid2）：新生入门须知（highlight，老站搬运改写）、出题规范与数据制作教程（highlight，config.yaml / SPJ / 交互题 / 对拍）、周赛怎么打（赛前赛中赛后 + 赛后题解文化）、提问的智慧（问答节点）。
3. **关于页**：`ui-default.about` 的 about/contact 两节换成本队介绍与联系方式（2017 成立、国奖 50 余项、答疑群 879670443），privacy/tos 原文保留（python 定位 `\n# privacy` 拼接后半段）。
4. **题单**：两个训练计划 dag[].title 登山化（一本通：大本营→林间小径→…→登顶眺望；蓝桥杯：热身步道→半山营地→冲顶路段→峰顶实录），content 描述改学长口吻（`mongosh hw_train.js`，幂等）。
5. **首场比赛**：海拔周赛 R0 · 新生热身专场——ACM 赛制、rated=false、allowViewCode=true、5 道 d1-d2 热身题（pids `3677,3676,3712,3717,3736`），赛后开放代码互看。
6. **页脚**：`ui-default.footer_extra_html` 追加「新生指南 / 云剪切板」两行链接。

坑与边界（重要）：

- **sudo 流程**：`POST /user/sudo` 前必须先 GET 一次任意 `@requireSudo` 页面（如 `/manage/setting`）让服务端 session 写入 sudoArgs，直接 POST 密码是 403；激活后 1 小时有效。`POST /manage/setting` 返回 302 **不等于成功**——sudo 未激活时它 302 去 /user/sudo，必须用 DB 读值复核。
- **设置更新免重启**：三个设置键全走 `POST /manage/setting`（表单键 = 设置键，如 `discussion.nodes=<YAML>`；点分键由框架解析成嵌套对象再落库），进程缓存即时生效，无需 pm2 restart。
- **init_discussion_node 是全删重建**（`flushNodes` = deleteMulti docType 20）：帖子存在后**绝不能重跑**——帖子的 parentId 指向节点 ObjectId，重建后悬空（帖子无法访问）。以后加节点：直接向 db.document 插 TYPE_DISCUSSION_NODE(20) 文档（domainId + docId null + parentType null + title=节点名 + category），或走管理页，不再动 discussion.nodes 重放。
- **Types.Boolean**（@hydrooj/framework/validator.ts）：非 `false/off/no/0` 即真，`true` / `on` 都行。
- **服务号发帖要洗 author**：帖子以 hydsvc-0074 会话创建（owner=3），需 mongosh 把 document 的 owner/editor 与 discussion.history 的 uid 批量改成 uid2（uid3 的 /user/3 被 Caddy 404，展示作者名即露服务号）。
- **种子非幂等**：重跑会重复建帖 / 建同名比赛，只应运行一次；内容微调走帖子编辑页 `/discuss/<did>/edit` 或比赛编辑页。

回滚：每次运行前备份在 `/root/backups/culture-seed-<ts>/`（about / nodes / footer 原值 + trainings / node docs JSON）；恢复 = 原值 POST 回 `/manage/setting`（或 db.system 直写）+ 删除新增的 docType 21/30 文档。

2026-10-05 执行记录：帖子 did——入门须知 `6ac380a38b364d5443b9edc5`、出题规范 `6ac380a38b364d5443b9edbf`、提问的智慧 `6ac380a38b364d5443b9edc1`、周赛怎么打 `6ac380a38b364d5443b9edc3`；比赛 tid `6ac380a38b364d5443b9edbe`（2026-10-11 19:00 CST 开赛）；备份 `/root/backups/culture-seed-20261005-184850/`。

## 21. XCPC 专题进阶训练计划（由浅入深主线）

队内日常刷题在外部平台（CF/洛谷/牛客），本站定位"教学/训练工具"：`【进阶】XCPC 专题训练 108 题`（tid `6ac38fb88b364d5443b9ee22`，2026-10-05 创建，作者 bot爱摸鱼）是继一本通 396 新手村之后的第二级台阶——自定节奏、不限时的专题进阶路线。

**结构**（DAG）：第 1-4 章顺序链（热身路段·综合基础 → 密林寻径·搜索 → 行囊整理·基础数据结构 → 冰川横渡·图论）；第 5-8 章为并列专题支线（崖壁栈道·进阶数据结构 / 岩壁攀登·动态规划 / 星空导航·数学 / 密码石壁·字符串，均完成第 4 章后解锁）；第 9 章「冲顶突击·综合挑战」为毕业关，需 5-8 章全部完成。难度台阶 d2→d8 逐章抬升，章内分层抽样爬坡。

**选题管线**（可复用于扩章/换题）：

1. 导出题库 slim 目录：mongosh 投影 docType 10 的 `data` 数组——注意 **data 元素是对象 `{_id,name,size,etag}`，配对测试点要数 `e.name`**（按字符串统计会全为 0），外加 docId/title/difficulty/tag/hidden/config（含 `remote_judge` 判定）；
2. `node scripts/xcpc_select.cjs <catalog.json.gz> <outdir>`：过滤规则=system 域 + 非 hidden +（本地题 in/out 配对 ≥4 或 remote 在线判）+ 排除两个既有计划的 docId 段（3676-4325）+ 人工黑名单（`BLACKLIST`：网络流/ZJOI 级别等被启发式难度误标、不该卡在必经链上的题）；每章按难度窗分层配额抽取、章内升序；热身章给中文远程题（深基 srqc）留 4 个缓冲位；
3. 产出 `dag.json` + `selection.md`（人工审核清单，已归档 `deploy/culture/selection.md`）；
4. `bash deploy/culture/xcpc_create.sh` 建计划（POST `/training/create`）。

**训练计划 API 实锤**（`hydrooj/src/handler/training.ts` 的 `TrainingEditHandler.post`）：表单字段 `title` / `content`（计划页正文）/ `dag`（**JSON 字符串** `[{_id,title,requireNids,pids:[数字]}]`）/ `pin`（**UnsignedInt**，0/1，非布尔）/ `description`（列表页导语）。tid 缺省=创建，带 tid POST `/training/:tid/edit`=编辑。**解锁语义**（`model/training.ts isDone/isInvalid`）：`requireNids` 指向的章节**全部题目 AC** 才解锁本章——全完成制、无比例，所以必经链上的章节别放真 d8+ 的题。

**调整方式**：换题/改章节名=计划页「编辑」或 mongosh 直改 docType 40 的 dag（无需重启）；创建者会话是服务号，新建计划后记得把 owner 3→2（xcpc_create.sh 已含此步）。
