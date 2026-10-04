# plugin-swpu-broadcast (swpu_acm_broadcast v2.0.0)

AstrBot 插件：QQ 群自动播报 [SWPU OJ](https://swpuacm.xyz)（Hydro v5）的 AC 提交，附带每日榜单、账号绑定、签到、账号合并等群功能。

## 架构（v2.0.0 起为数据库直连版）

```
OJ 服务器 (swpuacm.xyz)
  └─ MongoDB (hydro 库)  ← 只读账号 bot_ro（UFW 仅放行 bot 服务器 IP）
        ↑ 每 15 秒一次 _id 水位增量查询 + 非终态记录复查
Bot 服务器 (AstrBot + NapCat)
  └─ swpu_acm_broadcast 插件
       ├─ 本地 SQLite 记录库（去重/榜单/历史口径，与旧版一致）
       └─ 渲染 AC 卡片 → 发送到 QQ 群
```

要点：

- **不抓网页**：直接查 `db.record`（按 `_id` 水位增量），提交/判题状态变化全程跟踪，远程判题（POJ/一本通镜像）多分钟出结果的也能正确播报。
- **零权限侵入**：不需要给游客放开提交记录页（站点保持登录墙），不维护机器人登录会话。
- **隐藏题与比赛提交**：沿用旧站口径——隐藏题不播报不计数；带 `tid` 的比赛提交不进统计（比赛直播走 `CONTEST_RANKINGS` 记分板通道，默认未配置）。
- 服务号（Hydro 系统号 uid 1、评测号 uid 3）的提交永不播报。

## 配置

凭据从 `mongo_uri.txt`（本文件旁）或环境变量 `SWPU_MONGO_URI` 读取，模板见 `mongo_uri.txt.example`。
账号在 OJ 服务器上创建（只读）：

```js
// mongosh，hydro 管理凭据
db.getSiblingDB("hydro").createUser({user: "bot_ro", pwd: "<随机>", roles: [{role: "read", db: "hydro"}]})
```

OJ 侧配套（一次性）：

1. mongod 以 `--auth --bind_ip 127.0.0.1,<内网IP>` 运行（公网 NAT 机填网卡实际 IP）。
2. `ufw allow from <bot服务器IP> to any port 27017 proto tcp`。

## 部署（AstrBot 服务器）

```bash
# 1. 归档旧站数据（如是从老站迁移）
mv /opt/swpu-acm/data/plugin_data/swpu_acm_broadcast \
   /opt/swpu-acm/data/plugin_data/swpu_acm_broadcast.oldsite-$(date +%Y%m%d)

# 2. 安装依赖（容器重建后需重放；requirements.txt 供 AstrBot 自动安装兜底）
docker exec astrbot pip install pymongo

# 3. 上传插件目录到 data/plugins/swpu_acm_broadcast/，写入 mongo_uri.txt
# 4. 重启（napcat 不动，QQ 登录态不受影响）
docker restart astrbot
```

群成员用 `/绑定 OJ用户名`（或 `/绑定 数字UID`）重新绑定新站账号；验证码写入 OJ 个人简介后 `/绑定确认`。

## 命令

`/oj帮助` `/指令` `/oj排名` `/今日榜单` `/比赛排名` `/oj题目 题号` `/oj状态` `/绑定` `/绑定确认` `/解绑` `/我的排名` `/最近提交` `/我的做题统计` `/签到` `/合并账号` `/解除合并` `/合并列表`

## 回滚

旧站历史数据归档在 `plugin_data/swpu_acm_broadcast.oldsite-*`；插件目录删除即完全下线，SQLite/状态全部留在 plugin_data 下可整体恢复。
