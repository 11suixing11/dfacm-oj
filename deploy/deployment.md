# 部署清单

从一台全新服务器到完整上线的步骤记录（CentOS/Debian 均可，以下以 Debian 12 为例）。**本文件不含任何密钥**——密码/授权码请存放在私有渠道。

## 1. Hydro 安装

```bash
LANG=zh . <(curl https://hydro.ac/setup.sh)
```

- 默认装 hydrooj + ui-default + hydrojudge + mongodb，Web 端口 127.0.0.1:8888，Caddy 对外 80/443
- 4G 内存机器记得调小 MongoDB WiredTiger cache（安装器会自动处理）
- 判题机配置 `~/.hydro/judge.yaml`，`pm2 start hydrojudge`

## 2. 自定义资源目录（UI 重建免疫）

Hydro 重装/升级会**重建** `/root/.hydro/static/`，把所有自定义文件放独立目录，Caddy 优先服务它：

```bash
mkdir -p /root/.hydro/custom
# 上传 landing/ 下所有文件到 /root/.hydro/custom/
```

Caddyfile 站点块内（`handle @static` 之前）：

```caddyfile
@custom {
    path /home.html /favicon.png /logo.png /favicon-16x16.png /favicon-32x32.png
         /apple-touch-icon-180x180.png /android-chrome-192x192.png
         /swpu-display.woff2 /swpu-mono.woff2 /og-cover.png
}
handle @custom {
    root * /root/.hydro/custom
    file_server
}
rewrite / /home.html
```

完整范例见 [Caddyfile.example](Caddyfile.example)。

## 3. 缓存策略

```caddyfile
@cacheable {
    path *.woff2 *.png *.chunk.js *.worker.js *.css *.svg *.ico
    not path /theme-*          # 主题 css 单独 10 分钟，保证 overlay 及时生效
}
header @cacheable Cache-Control "public, max-age=604800"
header /theme-*.css Cache-Control "max-age=600"
header /home.html Cache-Control "no-cache"
```

> Caddy 的 encode 中间件会剥离 ETag，没有显式 Cache-Control 时浏览器行为不可控。

## 4. 跨境/弱网优化

```bash
# BBR 拥塞控制（跨境丢包下 cubic 会导致 30s 级卡死）
echo tcp_bbr > /etc/modules-load.d/bbr.conf
printf "net.core.default_qdisc=fq\nnet.ipv4.tcp_congestion_control=bbr\n" > /etc/sysctl.d/99-bbr.conf
sysctl --system

# HTTP/3：Caddy 默认广播 alt-svc，但防火墙要放行 UDP 443
ufw allow 443/udp
```

## 5. 邮件系统

系统设置（或 `db.system`）写入以下键，找回密码与验证码邮件即刻可用：

| 键 | 值示例 |
|---|---|
| `smtp.host` | `smtp.gmail.com` / `smtp.qq.com` |
| `smtp.port` | `465` |
| `smtp.secure` | `true` |
| `smtp.user` / `smtp.from` | 发件邮箱（from 可带显示名） |
| `smtp.pass` | 授权码（**不是**邮箱登录密码） |
| `smtp.verify` | 注册是否强制邮箱验证（false = 注册零摩擦） |

注意：Hydro 仅在 `smtp.verify && smtp.user` 同时为真时发验证邮件。

## 6. 字体与图标

- 展示字体子集化：`python scripts/subset_fonts.py <zcool.ttf> <jbmono.ttf> <landing目录>`（需 fonttools + brotli），产出约 100KB 的 woff2
- 图标全套由 Pillow 渲染（4x 超采样）：favicon 96px、logo 192px、apple-touch 180px、android-chrome 192px

## 7. UI 重建后的重放清单

- [ ] 主题 overlay 重新追加（static + 源包两处，见 [theme/README.md](../theme/README.md)）
- [x] 门面/字体/图标 —— 在 `custom/` 目录，**无需重放**（本方案的结构性优势）
- [ ] favicon 除外：`favicon-16/32`、`apple-touch-icon` 若 Hydro 头部引用了 static 下的默认名，需确认 @custom 路径列表覆盖

## 8. 验证清单

- [ ] `https://<域名>/` 返回门面（200）
- [ ] `/p` `/login` `/training` 全部 200
- [ ] `curl -I` 检查字体/图标有 `Cache-Control`
- [ ] 注册流程走通（验证码邮件到达）
- [ ] 找回密码邮件里的链接是**绝对地址**（`server.url` 必须是完整 `https://域名`）
