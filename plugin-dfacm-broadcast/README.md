# d&f算法网 QQ 播报插件（内部标识：swpu_acm_broadcast v2.4.3）

AstrBot 插件：QQ 群自动播报 [d&f算法网](https://dfacm.website)（Hydro v5）的 AC 提交，附带每日榜单、比赛实时播报、XCPC 赛事周播报（每周日 20:30 下周赛程预告 + 报名截止 D-3/D-1 提醒，数据源为站内 `/calendar/data`）、账号绑定、签到、账号合并等群功能。

品牌寓意：每个人都能在算法竞赛这条路上找到属于自己的 final。

v2.4.1 补齐站内赛事日历的牛客、洛谷、LeetCode、CodeChef 类型标签，沿用 `/calendar/data` 接口；CLIST 凭据在 OJ 后台配置，机器人无需保存该 Key。

## QQ 官方通道发送约束（v2.4.2，2026-10-21）

官方 QQ 机器人（qq_official 平台）对**未上架**的机器人只开放**被动回复**：群成员 @ 机器人一条消息后 5 分钟内、每条消息最多 5 条回复；群**主动消息**要等机器人过审上架、平台授予主动消息权限后才可用（未开通时 QQ API 直接拒绝，err 40034105「主动消息失败, 无权限」）。

v2.4.1 及之前存在**静默丢失**：AstrBot 适配器在无缓存 msg_id 时静默跳过发送，而 `Context.send_message` 只要平台匹配就恒返回 True——AC 卡片/榜单被标记"已发"但群里什么都没收到（2026-10-21 实锤：3 张过题卡全丢，且上游群场景硬编码走主动发送、被动回复通道被旁路）。v2.4.2 三层修复：

1. **适配器补丁**：`patches/patch-qqofficial-adapter.py` 在 167 上生成 compose 卷挂载的覆盖文件（三处 SWPU patch 锚点）——有缓存 msg_id 就走被动回复；无 msg_id 时抛异常而非静默跳过；群会话不把 bot 自己的消息 id 写进 msg_id 缓存（防止缓存污染）。
2. **插件层诚实投递**：全部群播报（AC 卡/比赛卡/累计榜/每日榜/周报/健康告警/报名提醒/终榜战报/`/比赛排名`）统一走 `_group_send`——只在真实发出后才落"已发"标记；被动窗口关闭时挂起不丢（卡片留队列、榜单标记不落），群里有人 @ 机器人后 ≤15 秒自动补发；发送失败进入 120 秒冷却防打爆 QQ API；`_maybe_send_ranking` 异常隔离，不再掐死轮询（10-20 06:38 至 10-21 15:07 曾冻结摄入 32 小时）。
3. **上架前后的行为**：上架前，积压播报在群成员 @ 机器人后的下一个轮询自动补发，无人 @ 时安全挂起；上架获得主动权限后无需改动即恢复完全实时推送（无 msg_id 时仍尝试主动接口，陈旧 msg_id 也会自动回退主动接口）。

**运维**：astrbot 镜像升级后必须在 167 重跑 `python3 /opt/swpu-acm/patches/patch-qqofficial-adapter.py`（锚点漂移会响亮失败），compose 卷挂载行见 `/opt/swpu-acm/compose.yml` 的 `PATCH(swpu-acm 2026-10-21)` 注释。

## 双通道架构（v2.4.3，2026-10-22）

站长确认 q.qq.com 的**群主动消息能力仅对企业主体灰度开放**（个人认证开发者"敬请期待"），官方通道短期内拿不到真正的主动推送。v2.4.3 起：

- **播报通道 = NapCat（qq-onebot / aiocqhttp）**：AC 卡、每日榜单、累计榜、周报、健康告警、报名提醒等一切主动播报走小号所在的 OneBot 通道——协议层无被动回复限制，真·主动推送。挂起队列继续兜底：NapCat 掉线不丢卡，恢复后自动补发。
- **官方 bot（qqbot）继续值守**：群内 @ 指令、站长 C2C、以及**通道掉线看门狗**——播报投递失败/适配器不可用时，每小时最多一条私信提醒站长"通道异常 + 恢复步骤"（`OWNER_C2C_SESSION`）。
- **回切开关**：将来个人开发者灰度开放后，把 `GROUP_SESSION` 改回 `qqbot:GroupMessage:E028A2787EEBB8D03234AB3E0C0D763C` 即可恢复单官方通道（`_passive_window_open` 按平台自动切换判定逻辑），届时可退役 NapCat。
- NapCat 运维铁律（沿用）：镜像钉死 `mlikiowa/napcat-docker:v4.18.37`、`o3HookMode=0`、机器人小号禁止在任何电脑登录 PC 版 QQ、容器重启后须重新扫码（WebUI token 见 167 备忘，`docker exec napcat base64 /app/napcat/cache/qrcode.png` 可拉二维码，约 2 分钟过期）。

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

`/oj帮助` `/指令` `/oj排名` `/今日榜单` `/比赛排名` `/赛程` `/oj题目 题号` `/oj状态` `/oj健康` `/绑定` `/绑定确认` `/解绑` `/我的排名` `/最近提交` `/我的做题统计` `/签到` `/合并账号` `/解除合并` `/合并列表`

## 回滚

- 插件目录删除即完全下线；旧站历史数据归档在 `plugin_data/swpu_acm_broadcast.oldsite-*`。
- v2.0.0 备份：服务器 `data/plugins/swpu_acm_broadcast/main.py.bak-v200`。
