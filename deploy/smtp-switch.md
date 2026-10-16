# 邮件通道切换手册（主备 SMTP / 自动兜底 / 人工发码）

> 适用场景：Gmail（主通道）抽风、配额触顶、被墙，导致验证码 / 找回密码邮件发不出去。
> 学生是无密码登录，**邮件通道 = 登录命脉**，三级兜底按下述顺序启用。

## 兜底层级总览

| 层级 | 覆盖范围 | 生效方式 | 前置条件 |
|---|---|---|---|
| ① 自动备用通道 | regcode 验证码邮件（注册+登录） | 主通道失败时插件自动切换，无需人工 | 配置 `dfacm.regcode.smtp2_*` 六键（一次性） |
| ② 全站一键切换 | 全部邮件（含找回密码） | `/root/switch-smtp-qq.sh`，需 pm2 restart | 137 服务器上已部署切换脚本 |
| ③ 人工发码 | 单个用户登录/注册 | `swpuIssueCode` 脚本出码，管理员转告 | 无（不依赖任何邮件服务） |

## ① regcode 备用通道（推荐常备）

系统设置六键（控制面板「系统设置」→ setting_swpu_regcode 分组，或 per-key 文档 + `pm2 restart hydrooj`）：

| 键 | 示例值 |
|---|---|
| `dfacm.regcode.smtp2_host` | `smtp.qq.com` |
| `dfacm.regcode.smtp2_port` | `465` |
| `dfacm.regcode.smtp2_secure` | `true`（465 必须） |
| `dfacm.regcode.smtp2_user` | 完整邮箱地址 |
| `dfacm.regcode.smtp2_pass` | 授权码（QQ 邮箱=授权码，非登录密码） |
| `dfacm.regcode.smtp2_from` | `"d&f算法网" <邮箱>`（留空=用账号地址） |

- `smtp2_host` 留空 = 备用通道停用（默认）。
- 主通道（系统 `smtp.*`）投递失败时自动改走备用通道，成功后日志出现 `code delivered via backup smtp channel`。
- 部署要求：插件目录 `node_modules/nodemailer` 软链指向 yarn global 树（见 deployment.md §4 安装块）。

## ② 全站切换（含找回密码）

服务器侧脚本（凭据只存服务器，勿入库/勿提交）：

```bash
/root/switch-smtp-qq.sh      # 切到备用邮箱：改 smtp.* 六键 + 自动备份原授权码 + pm2 restart hydrooj
/root/switch-smtp-gmail.sh   # 切回 Gmail：从 /root/.hydro/smtp-gmail-pass.bak 还原授权码 + pm2 restart
```

注意：QQ 邮箱对**境外机房 IP** 有风控可能（535 Login fail: account abnormal）。切换脚本首次执行前，先用一次性测试脚本（nodemailer `transport.verify()`）从 137 服务器实测备用通道可用，再启用。

## ③ 人工发码（邮件整体故障）

控制面板「脚本管理」→ `swpuIssueCode`，参数 `mail`（可选 `purpose=reg|login|auto`）：

```bash
hydrooj cli script swpuIssueCode '{"mail":"student@example.com"}'
```

输出形如 `已发码（purpose=login）：123456，5 分钟内有效`，管理员经 QQ/口头转告用户，勿在群内公开。全程不经邮件。注意：CLI 的脚本表查找有上游时序缺陷（可能误报 `Script not found`），**可靠通道是控制面板网页**。

## 排障速查

| 症状 | 处置 |
|---|---|
| 验证码发不出、日志 `primary mail channel failed` | ① 层已自动尝试；若仍失败看 `backup mail channel failed` 日志，确认 smtp2_* 配置与授权码 |
| 找回密码邮件发不出 | 走 ② 全站切换 |
| 全部邮件+备用通道都不可用 | 走 ③ 人工发码；事后排查 Gmail 授权码/配额 |
| QQ SMTP 535 | 检查 SMTP 服务开关（网页版邮箱→设置→账号）、授权码是否最新、是否境外 IP 风控 |
