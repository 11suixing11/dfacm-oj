# plugin-swpu-broadcast (swpu_acm_broadcast v2.1.0)

AstrBot 插件：QQ 群自动播报 [d&f算法网](https://dfacm.website)（Hydro v5）的 AC 提交，附带每日榜单、比赛实时播报、账号绑定、签到、账号合并等群功能。

品牌寓意：每个人都能在算法竞赛这条路上找到属于自己的 final。

## 架构（v2.1.0：MongoDB 为唯一真相）

```
OJ 服务器 (dfacm.website)
  └─ MongoDB (hydro 库)  ← 只读账号 bot_ro（UFW 仅放行 bot 服务器 IP）
        ↑ 每 15 秒两条查询：
        │   ① _id > 水位 的增量（新提交）
        │   ② 近 30 分钟全量复查（慢判题收敛 + 重判感知）
Bot 服务器 (AstrBot + NapCat)
  └─ swpu_acm_broadcast 插件
       ├─ SQLite = 纯状态队列（待发卡片/未决记录/48h 复查窗，自动清理）
       ├─ 去重 / 统计 / 榜单 / 排名 → 全部直查 MongoDB
       └─ 渲染卡片 → 发送到 QQ 群
```

v2.1.0 五项升级（相对 v2.0.0）：

1. **比赛零配置直播**：任何比赛（`tid` 记录）自动播报——赛中也实时发卡（含“赛内第 N 个解出”），比赛结束自动发最终战报；`/比赛排名` 直读数据库。旧 `CONTEST_RANKINGS` 记分板爬取机制已删除。
2. **去重权威在源头**：某题“以前过没过”直查 `db.record`（比赛 AC 只与同比赛内更早 AC 比较），测试数据清理永远只动 OJ 一边。
3. **近窗复查**：每轮同步近 30 分钟记录状态（重判、慢远程判题都能收敛），另有每小时兜底扫一遍卡在非终态的记录。
4. **卡片增强**：耗时 ms、题目算法标签、“全站第 N 人通过”。
5. **统计切库**：口径B（全历史首 AC 归窗口）改为 MongoDB 聚合，榜单随库实时——删了测试记录，榜单立即干净。

语义要点：

- **隐藏题**（无 tid）：不播不计，与旧站一致；**比赛隐藏题**：播比赛卡（字母代号，不泄题面）。
- **服务号**（uid 1 系统 / uid 3 评测）永不播报。
- 首次部署：水位为空 → 全量拉取，历史按“提交时间 ≥ 进程启动”门静默，不补发。
- SQLite schema 升级自动重建（元数据 `records_schema`），水位重置后自动重新收敛。

## 配置

凭据从 `mongo_uri.txt`（本文件旁）或环境变量 `SWPU_MONGO_URI` 读取，模板见 `mongo_uri.txt.example`。账号在 OJ 服务器上创建（只读）：

```js
// mongosh，hydro 管理凭据
db.getSiblingDB("hydro").createUser({user: "bot_ro", pwd: "<随机>", roles: [{role: "read", db: "hydro"}]})
```

OJ 侧配套（一次性）：

1. mongod 以 `--auth --bind_ip 127.0.0.1,<内网IP>` 运行（公网 NAT 机填网卡实际 IP）。
2. `ufw allow from <bot服务器IP> to any port 27017 proto tcp`。

## 部署（AstrBot 服务器）

```bash
# 1. 依赖（容器重建后需重放；requirements.txt 供 AstrBot 自动安装兜底）
docker exec astrbot pip install pymongo

# 2. 上传插件目录到 data/plugins/swpu_acm_broadcast/，写入 mongo_uri.txt
# 3. 重启（napcat 不动，QQ 登录态不受影响）
docker restart astrbot
```

群成员用 `/绑定 OJ用户名`（或 `/绑定 数字UID`）绑定账号；验证码写入 OJ 个人简介后 `/绑定确认`。

## 命令

`/oj帮助` `/指令` `/oj排名` `/今日榜单` `/比赛排名` `/oj题目 题号` `/oj状态` `/绑定` `/绑定确认` `/解绑` `/我的排名` `/最近提交` `/我的做题统计` `/签到` `/合并账号` `/解除合并` `/合并列表`

## 回滚

- 插件目录删除即完全下线；旧站历史数据归档在 `plugin_data/swpu_acm_broadcast.oldsite-*`。
- v2.0.0 备份：服务器 `data/plugins/swpu_acm_broadcast/main.py.bak-v200`。
