# 部署清单

从一台全新 Debian 12 服务器到完整上线的步骤。**本文件不含任何密钥**，密码和授权码请存放在私有渠道。

## 1. Hydro 安装

```bash
LANG=zh . <(curl https://hydro.ac/setup.sh)
```

- 默认装 hydrooj + ui-default + hydrojudge + mongodb，Web 端口 127.0.0.1:8888，Caddy 对外 80/443。
- 4G 内存机器记得调小 MongoDB WiredTiger cache（安装器会自动处理）。
- 判题机配置 `~/.hydro/judge.yaml`，`pm2 start hydrojudge`。
- 建议把本仓库克隆到 `/root/swpu-oj`，后续脚本都从这里运行。

## 2. 门面资源（UI 重建免疫）

Hydro 重装或升级会重建 `/root/.hydro/static/`。门面资源放在独立目录，由 Caddy 优先服务：

```bash
bash /root/swpu-oj/deploy/install-landing.sh /root/.hydro/custom
```

脚本会处理两个容易漏掉的细节：

- 把 `landing/index.html` 安装为 `home.html`，与 Caddy 的 `rewrite / /home.html` 对齐。
- 把 `landing/assets/*` 展平到 `/root/.hydro/custom/`，让 `/favicon.png`、`/og-cover.png` 等根路径可以直接访问。

Caddy 站点块中的 `@custom` 和 `handle @custom` 见 [Caddyfile.example](Caddyfile.example)。

## 3. 主题：原生 Dark + 品牌薄层

Hydro `ui-default` 自带持续维护的 Dark 主题。推荐只追加 `theme/00-native-dark-brand.css`，不要重新启用 01-05 的旧全量覆盖；旧文件仅保留作回退参考。

```bash
bash /root/swpu-oj/deploy/install-theme.sh
```

脚本会同时处理两处主题 CSS：

1. `/root/.hydro/static/theme-<版本>.css`：Caddy 实际直出的文件。
2. `.../ui-default/public/theme-<版本>.css`：UI 重建时的来源。

如果 Hydro 版本不同，先指定版本：

```bash
THEME_VERSION=5.0.0 bash /root/swpu-oj/deploy/install-theme.sh
```

旧浅色 Hydro 需要完整回退时，显式开启：

```bash
SWPU_THEME_LEGACY=1 bash /root/swpu-oj/deploy/install-theme.sh
```

还需要把系统和已有用户的主题设为 dark，见 [theme/README.md](../theme/README.md)。

## 4. 注册插件

```bash
mkdir -p /root/.hydro/addons/swpu-regcode
cp /root/swpu-oj/plugin-swpu-regcode/{index.ts,logic.ts,reg.html,package.json} \
   /root/.hydro/addons/swpu-regcode/
mkdir -p /root/.hydro/addons/swpu-regcode/node_modules
ln -sfn /usr/local/share/.config/yarn/global/node_modules/hydrooj \
        /root/.hydro/addons/swpu-regcode/node_modules/hydrooj
# 参考 plugin-swpu-regcode/addon.json.example，把插件路径加入 /root/.hydro/addon.json
pm2 restart hydrooj
```

**不要**在 `/root/.hydro/addons/swpu-regcode/` 里运行 `npm install`：它会重建 `node_modules`，覆盖指向 Hydro 的软链。插件测试用 `npm test`，`tsx` 由 `npx` 临时下载，不写入 addon 目录。

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

- [ ] `bash deploy/install-theme.sh` 重新追加 00 品牌薄层（版本变化时先设置 `THEME_VERSION`）。
- [ ] 确认 static 与源包两处都能 `grep -c "native-dark brand overlay"`。
- [ ] 门面、字体、图标在 `custom/`，**无需重放**。
- [ ] 如果 Hydro 头部引用 static 下的默认 favicon，确认 `@custom` 路径列表覆盖同名文件。

## 10. 验证清单

- [ ] `https://<域名>/` 返回门面并包含 `og:image`。
- [ ] `/p` `/login` `/reg` `/training` 全部 200。
- [ ] `/reg/complete` 在无验证码时返回 `{ ok: false }`，不会 500。
- [ ] `curl -I` 检查字体和图标有 `Cache-Control`。
- [ ] 注册流程走通（验证码邮件到达）。
- [ ] 找回密码邮件里的链接是绝对地址（`server.url` 必须是完整 `https://域名`）。
- [ ] `request.ip` 不再是 127.0.0.1。
