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
- 首次部署：水位为空时，在第一次轮询前持久化 `bootstrap_floor_ts`；早于此时间的历史记录静默。后续分页和中途重启继续使用同一个门槛，首次启动之后的记录仍可播报。
- 已有水位的实例继续摄入停机期间的新记录，不再按本次进程启动时间抑制它们；未决记录后续变为 AC 时使用持久资格。
- 本次投递状态升级采用独立 `delivery_schema=1`，保留 `records_schema=2`，不触发旧记录表的重建逻辑，也不重置 `mongo_last_id` 或挂起队列。

## 投递状态兼容与恢复

启动时通过 SQLite 事务增量添加两个可空字段，字段添加、回填、首次历史门槛和版本标记一起提交。已存在的字段会跳过，只回填资格未知且 `card_sent=0` 的行；重复启动、缺列的中断迁移和迁移失败重试都不会清空记录或重置已有值。此迁移针对已有 `records_schema=2` 的队列；更早记录布局仍属于旧版迁移路径，应先核对和备份。

| 字段/旧状态 | 含义与升级处理 |
| --- | --- |
| `notify_eligible=1` | 属于通知范围，独立于当前判题状态和 Mongo 去重结果；旧 `card_sent=0` 的确定待发记录回填为 1。 |
| `notify_eligible=0` | 确定不在通知范围，例如首次历史、已删除比赛的静默抑制。 |
| `notify_eligible=NULL` | 旧 `card_sent=1` 无法区分“已经发送”和“历史抑制”，保留未知，不猜测性重播。新摄入的正常记录显式写 0 或 1。 |
| `delivered_at` | 仅实际发送成功后写入 Unix 秒；有投递证据的同一 RID 在重启和重判后不再次入队。未发送或旧记录没有可验证投递证据时保留 NULL。 |
| `card_sent` | 保留原兼容字段，0 仍表示排队中；1 仍可能表示已发或已抑制，不能独立作为实际发送证明。 |

比赛卡发送返回值区分 `True`（已发送）、`False`（待重试）和 `None`（比赛已删除，静默抑制）。抑制时仅关闭队列并置 `notify_eligible=0`，不填写 `delivered_at`；Mongo 查询异常仍保留队列。普通卡和比赛卡都只在实际发送成功分支返回 `True`。NapCat/官方 QQ 选择、被动窗口及冷却策略保持原规则。

该状态迁移不修改已有 `state.json`，账号绑定、合并和显示名沿用原逻辑。SQLite 的入库先于水位推进，入库后若崩溃，重启重读同一批时由原有 `INSERT OR IGNORE` 保留队列状态。远端发送成功与本地落盘不能组成同一个事务，二者之间崩溃仍可能重发，不能据此声称端到端恰好一次投递。

离线回归（本轮验证使用 Python 3.14）：

```bash
python3.14 -B -W always::ResourceWarning -m unittest discover -s plugin-dfacm-broadcast/tests -p 'test_*.py'
```

测试加载完整生产模块并使用临时真实 SQLite；AstrBot、Mongo、渲染和消息边界使用本地替身，不安装或启动 AstrBot，不访问外部服务。测试替身的 Mongo 查询结果为独立快照。

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

本次升级前应停播并备份 `records.db` 和 `state.json`。使用 SQLite `Connection.backup` 创建包含 WAL 已提交内容的一致性数据库副本，不能只复制主文件而遗漏未合并的 WAL；`state.json` 另行备份。下面的脚本仅为人工迁移准备示例，应将路径替换为实际数据目录和一个新的备份目录，停播期间执行：

```python
from contextlib import closing
from pathlib import Path
import shutil
import sqlite3

data = Path("/path/to/plugin_data/swpu_acm_broadcast")
backup = Path("/path/to/new-backup-directory")
assert (data / "records.db").is_file()
assert (data / "state.json").is_file()
backup.mkdir(parents=True, exist_ok=False)
with closing(sqlite3.connect(data / "records.db")) as source, \
        closing(sqlite3.connect(backup / "records.db")) as target:
    source.backup(target)
shutil.copy2(data / "state.json", backup / "state.json")
```

- 这里只描述本地迁移兼容和备份方法，尚未执行线上备份或发布。启动迁移失败会回滚本次投递状态事务并关闭连接；排除错误后可使用原数据库重试。
- 回退代码时保留升级后的 SQLite，新增列和元数据可由旧 `records_schema=2` 代码忽略，待发队列及原水位仍可读取；不要删除新增列、清表或重置水位来回退。旧代码运行会恢复原重启问题，且不能维护 `delivered_at`。如回退后曾实际播报，再升级前需核对这段期间的投递记录，不能自动推断新字段。
- 恢复升级前的数据库快照会丢失快照后的摄入/投递状态，可能导致重播；仅在停播并核对差异后进行。正常重启恢复无需回退数据库。
- 插件目录删除即完全下线；旧站历史数据归档在 `plugin_data/swpu_acm_broadcast.oldsite-*`。
- v2.0.0 备份：服务器 `data/plugins/swpu_acm_broadcast/main.py.bak-v200`。
