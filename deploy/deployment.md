# 部署清单

从一台全新服务器到完整上线的步骤记录（CentOS/Debian 均可，以下以 Debian 12 为例）。**本文件不含任何密钥**——密码/授权码请存放在私有渠道。

## 1. Hydro 安装

```bash
LANG=zh . <(curl https://hydro.ac/setup.sh)
```

- 默认装 hydrooj + ui-default + hydrojudge + mongodb，Web 端口 127.0.0.1:8888，Caddy 对外 80/443
- 4G 内存机器记得调小 MongoDB WiredTiger cache（安装器会自动处理）
- 判题机配置 `~/.hydro/judge.yaml`，`pm2 start hydrojudge`
- 本仓库适配 Hydro `5.0.7`；安装脚本会随上游变化，不能将重新安装等同于重现当前版本。记录实际 Hydro / ui-default / hydrojudge / sandbox / Node / MongoDB / Caddy 版本，升级先在备用实例验证。

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

使用 [Caddyfile.example](Caddyfile.example) 中完整的处理分支，不要把缓存头放在全站范围：

- `handle @custom` 内给 `/home.html` 设置 `no-cache`。这个分支在首页 rewrite 后执行，因此 `/` 和 `/home.html` 都生效。
- 固定名字的自定义字体、图标缓存 1 小时；主题 CSS 缓存 10 分钟；Hydro 静态目录中匹配的资源缓存 7 天。
- 缓存头只对成功的 `2xx` 静态响应设置；动态请求走 Hydro 的原有策略，不覆盖 `/resource/*`、题目文件或用户下载的响应。
- Caddy 默认将 `header` 排在 `rewrite` 前面，顶层 `header /home.html` 不会匹配原始 `/` 请求。[官方指令顺序](https://caddyserver.com/docs/caddyfile/directives#directive-order)

不要假定 `encode` 总会删除 ETag：不同 Caddy 版本对压缩响应的 ETag 处理有差异，按实际响应验证。`no-cache` 允许缓存但要求重新验证；固定文件名覆盖更新后，仍应等待对应的缓存窗口。

## 4. 跨境/弱网优化

```bash
# 可选 BBR 拥塞控制：先确认内核支持，并对比校园网/运营商实际表现
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
- [ ] `/` 与 `/home.html` 都返回 `Cache-Control: no-cache`
- [ ] 不存在的静态文件、动态资源和受权限控制的下载没有被 Caddy 添加 7 天 public 缓存
- [ ] 注册流程走通（验证码邮件到达）
- [ ] 找回密码邮件里的链接是**绝对地址**（`server.url` 必须是完整 `https://域名`）
- [ ] 按第 11 节人工验收 AC / WA / TLE，确认重启后判题恢复

默认检查只适配 Caddyfile 语法。正式上线前，由管理员在确认的配置路径人工执行 `caddy validate --config /root/.hydro/Caddyfile --adapter caddyfile` 检查模块配置，成功后再安排 reload。`validate` 会预配置模块，可能打开日志或创建目录，因此不放进默认只读脚本。

## 9. 备份、异机副本与恢复演练

`scripts/backup-hydro.sh` 是显式执行的 Linux 包装器，不安装定时任务、不停止服务、不自动删除任何文件。需要 `hydrooj`、MongoDB Database Tools 的 `mongodump`、`zip`、`unzip`、`tar`、`flock`、`sha256sum`、`realpath`。以运行 Hydro 的同一用户执行，不能随意换一个 HOME；如使用 `HYDRO_PROFILE`，应使用与该实例相同的值。

将仓库放在服务器的 `/opt/swpu-oj` 后，可以手动运行：

```bash
bash /opt/swpu-oj/scripts/backup-hydro.sh \
  --output-dir /data/backups/swpu-oj \
  --caddy-config /root/.hydro/Caddyfile
```

如果实际 Caddyfile 位于 `/etc/caddy/Caddyfile`，修改上面的绝对路径。输出目录必须在 `~/.hydro` 和 `~/.config/hydro` 之外。脚本按输出目录加锁，重复运行返回 `75`；所有备份任务应使用同一个输出目录，以免彼此绕过锁。

每次成功生成一个独立目录，包含：

- `backup-*.zip`：执行官方 `hydrooj backup --withAddons` 生成，包含数据库、默认 `/data/file` 文件存储与 addons；执行后验证 ZIP 完整性及数据库、文件目录成员。
- `hydro-state.tar.gz`：`~/.hydro` 的配置、`addon.json`、判题配置、addons、自定义资源等，排除可重建的 `static/`；使用 profile 时也保留全局自定义资源。
- `runtime-config.tar.gz`：存在时额外保存 `~/.config/hydro`。
- `Caddyfile`、`manifest.txt`、`SHA256SUMS` 及私有诊断日志。Caddyfile 引用的外部 `import` 文件、目录外 addon / 软链目标、另设的文件服务或对象存储需要另行备份；本脚本不能声称覆盖这些外部数据。

备份输出使用 `umask 077`。**Hydro 5.0.7 的备份日志可能含 MongoDB 连接凭据**，完整输出仅写入私有 `hydro-backup.log`；不要把日志或备份包提交到公开仓库。备份不退出 `0`、ZIP 缺失、损坏或配置打包失败时，脚本返回非零，保留 `.pending-*` 目录供本地排查，不把它标为完整备份。

建议策略：每天 1 次完整备份，保留最近 **7 个每日、4 个每周、3 个每月** 完整副本；训练赛/重要配置变更前另做一份。脚本只记录政策，**不自动删除旧备份**。清理前人工核对异机副本、校验结果与恢复演练，并确认待删除路径；同时监控备份盘余量。

备份完成后，将**整个成功目录**传到另一台机器或学校存储，再在目标目录运行校验。以下仅为人工执行示例，账号和路径按实验室实际情况替换：

```bash
scp -pr /data/backups/swpu-oj/backup-20261002T120000Z-EXAMPLE \
  backup-user@backup.example.edu:/srv/oj-backups/
# 登录备份机后：
cd /srv/oj-backups/backup-20261002T120000Z-EXAMPLE
sha256sum -c SHA256SUMS
```

首次上线前、重要升级后，在**隔离的备用实例**做一次恢复演练：

1. 安装记录的兼容组件版本，检查校验和，查看 ZIP 与 tar 清单，确认用户、提交、题目数据和配置齐全。
2. 按 [Hydro 官方数据库文档](https://docs.hydro.ac/zh/docs/Hydro/system/database) 和 [FAQ](https://docs.hydro.ac/zh/docs/Hydro/FAQ) 恢复 ZIP；恢复会覆盖目标数据库及文件，只能指向明确选定的备用实例。
3. 从 sidecar 归档核对并恢复 addon 配置、自定义资源、判题配置与 Caddy 配置；备用实例的数据库地址、域名、邮件设置应独立配置。**Hydro 5.0.7 恢复代码对 `addon.json` 的处理与备份不同，不能仅凭 `--withAddons` 就认定插件清单恢复成功**，需单独核对 `~/.hydro/addon.json`。
4. 登录测试账号、读取题目与旧提交，执行第 11 节判题验收，再记录恢复用时和结果。

这是在线备份，数据库与文件不是跨存储的原子快照；重要比赛的恢复点应选择上传/改题较少的时段，必要时人工安排维护窗口。不要直接复制正在使用的 MongoDB `/data/db` 文件代替官方备份。

## 10. 默认只读的部署检查

```bash
bash /opt/swpu-oj/scripts/check-deployment.sh \
  --role all --data-dir /data \
  --caddy-config /root/.hydro/Caddyfile
```

脚本读取 Hydro / hydrojudge 包版本，显示 Node / Caddy 版本，检查 Web、MongoDB、Caddy、判题机与沙箱进程是否存在，检查数据盘与 Hydro 所在盘的使用率，调用 `caddy adapt` 做**语法/配置适配检查**，并丢弃可能含配置秘密的 JSON 输出。它不做模块预配置，不能代替人工上线时的 `caddy validate`。磁盘使用率达到 `90%`、组件缺失、进程未发现、配置适配错误会返回 `1`；参数错误返回 `64`。它不执行 `hydrooj --version`（5.0.7 会进入启动流程），不调用可能拉起 daemon 的 PM2 命令，不安装、备份、重启或提交。

组件分开部署时，Web 机使用 `--role web`，判题机使用 `--role judge`。当前检查假设 Web 机运行本地 MongoDB，远程数据库拓扑需另行核对。MongoDB 与 sandbox 的具体版本可在已知安装路径使用各自的版本命令人工记录；不要从进程命令行导出可能包含凭据的完整参数。

只有显式添加 `--url` 才执行 HTTP GET，检查 `/` 与 `/home.html` 为 `200` 且带 `no-cache`；不会发验证码或提交代码：

```bash
bash /opt/swpu-oj/scripts/check-deployment.sh \
  --role web --caddy-config /root/.hydro/Caddyfile \
  --url https://swpuacm.xyz
```

将其作为一次性验收工具即可，仓库不自动创建定时任务。进程存在不代表判题正确，也不代表没有排队；运行中应观察 Hydro 已有的判题机状态、最老提交等待时间、系统错误比例，以及磁盘/内存。日志保留时间与告警方式由实验室根据训练赛规模确定。

## 11. 人工判题验收与升级回退

在独立测试域准备一题明确的 A+B，使用支持的 C++ 和 Python 各提交一份正确程序确认 AC；提交固定错误输出确认 WA、死循环确认 TLE、非法语法确认 CE。对照题目限时检查结果，确认有判题机执行、测试数据可读、沙箱限制生效。不要在正式比赛排名里运行这些测试。

升级流程：记录当前组件与自研插件版本 → 保存并核验完整备份和异机副本 → 备用实例升级 → 注册/登录与人工判题验收 → 在人工确认的维护窗口应用到正式机。升级失败时，优先切换到验证过的备用实例，或按相匹配的程序版本和数据备份恢复；数据库迁移后不要直接降级 npm 包当作回退。参考 [Hydro 官方升级指南](https://docs.hydro.ac/zh/docs/Hydro/FAQ/upgrade)。本仓库没有自动发布、重启或回滚脚本。
