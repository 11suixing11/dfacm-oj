# d&f算法网定制插件：赛事日历

给队员一个"作战情报中心"：把 ICPC / CCPC / 省赛 / 邀请赛 / 校级比赛，以及蓝桥杯、天梯赛（CCCC-GPLT）、百度之星、企业赛、CCF CCSP 等全生态算法赛事的赛程收进站内一个页面，按"进行中 / 即将到来 / 已结束"分组展示，带倒计时与报名截止提醒。全站对游客可见（赛事情报无登录门槛），导航栏落在「评测记录」旁。

- `GET /calendar` 日历页（`?type=` 按类型筛选，页首 chips 只出现有数据的类型）
- `GET /calendar/data` 只读 JSON 端点——QQ 播报机器人（swpu-broadcast）抓取同一份数据做每周播报与报名截止提醒

## 分类体系（type 选型指南）

| type | 徽章 | 覆盖范围 |
|---|---|---|
| `icpc` | ICPC | ICPC 全体系：网络预选赛 / 区域赛 / EC-Final / 世界总决赛 |
| `ccpc` | CCPC | CCPC 全体系：网络赛 / 分站赛 / 女生专场 / 高职专场 / 总决赛 |
| `provincial` | 省赛 | 各省程序设计竞赛（四川省赛、广东省赛 GDCPC 等） |
| `invitational` | 邀请赛 | 全国邀请赛（西安 / 湘潭 / 深圳 / 南昌邀请赛等） |
| `school` | 校级赛 | 本校比赛（校内选拔等） |
| `lqb` | 蓝桥杯 | 蓝桥杯省赛 / 全国决赛 |
| `ladder` | 天梯赛 | 中国高校计算机大赛-团体程序设计天梯赛（CCCC-GPLT） |
| `asta` | 百度之星 | Astar 程序设计大赛 |
| `industry` | 企业赛 | 厂商主办公开赛（华为软件精英挑战赛、字节青训营赛等） |
| `ccsp` | CCSP | CCF 大学生计算机系统与程序设计竞赛 |
| `other` | 其他 | 其余算法类赛事（睿抗 RAICOM 程序设计赛道等） |

## 数据维护（站长操作手册）

数据就是本目录的 `calendar.json`，纯手工维护，没有任何后台界面——赛事信息以官方通知为准，站长从 ICPC 北京总部（icpc.pku.edu.cn）、ccpc.io、蓝桥杯官网（dasai.lanqiao.cn）、CCF（ccf.org.cn）等官方渠道核对后录入。

```json
{
  "updated": "2026-10-18",
  "events": [
    {
      "id": "icpc51-chengdu",
      "name": "第51届 ICPC 亚洲区域赛（成都站）",
      "type": "icpc",
      "form": "onsite",
      "location": "成都",
      "start": "2026-10-24T00:00:00+08:00",
      "end": "2026-10-25T23:59:59+08:00",
      "regDeadline": "2026-10-08T23:59:59+08:00",
      "url": "https://icpc.pku.edu.cn/tzgg/....htm",
      "note": "可选的一行备注"
    },
    {
      "id": "lqb-18",
      "name": "第十八届蓝桥杯（软件赛 / 电子赛 / 人工智能赛）",
      "type": "lqb",
      "approx": true,
      "start": "2027-04-01T00:00:00+08:00",
      "end": "2027-04-30T23:59:59+08:00",
      "regDeadline": "2026-12-18T14:00:00+08:00",
      "location": "各省赛点",
      "url": "https://dasai.lanqiao.cn/",
      "note": "省赛定于 2027年4月（具体日期待官方公布）"
    }
  ]
}
```

| 字段 | 必填 | 说明 |
|---|---|---|
| `id` | ✅ | 全局唯一字符串，QQ 机器人防重发的键 |
| `name` | ✅ | 赛事名称 |
| `type` | ✅ | 见上方分类表（11 类） |
| `form` | — | `onsite`（默认）/ `online` / `hybrid` |
| `location` | — | 城市 / 承办高校 |
| `start` | ✅ | ISO 8601（**带 +08:00 偏移**）；多日现场赛写首日 `T00:00:00+08:00` |
| `end` | — | 多日赛事写末日 `T23:59:59+08:00`；不写则按当天赛事处理 |
| `approx` | — | `true` = 日期只精确到月（官方只公布"2027年4月"这类窗口时用）：`start`/`end` 圈出月份窗口，页面与播报显示"2027年4月（日期待公布）"、不显示倒计时，机器人不把它算进"下周开赛"；`end` 可省略（自动补足月末）。**报名截止等精确时间不受影响** |
| `regDeadline` | — | 报名截止时间；机器人会在 D-3 / D-1 播报提醒 |
| `url` | — | 官方/报名链接，必须 `http(s)://` 开头 |
| `note` | — | 一行备注（页面与播报都会带出） |

**时间约定**：所有时间字符串显式带 `+08:00`，服务端全部按北京时间换算，不依赖服务器时区。

**更新流程**：改 `calendar.json` → `bash deploy/deploy.sh --sync-only`。页面每次请求现读磁盘，**无需重启进程**。JSON 写坏不会 500——服务端回退上一份好数据并在页面提示，坏行会以 `数据行被忽略：…` 显示出来方便定位。

**已结束条目**：长期保留有价值（补题/复盘线索），也可以定期裁剪，页面无数量上限。

## 接口约定（/calendar/data）

```json
{
  "ok": true,
  "updated": "2026-10-18",
  "generatedAt": "2026-10-18T00:00:00.000Z",
  "events": [
    { "id": "...", "name": "...", "type": "icpc", "form": "onsite", "approx": false, "location": "成都",
      "start": "2026-10-24T00:00:00+08:00", "end": "2026-10-25T23:59:59+08:00",
      "regDeadline": null, "url": "...", "note": "" }
  ]
}
```

状态（进行中/即将到来/已结束）由消费方按 `generatedAt` 与 `start/end` 自行计算，端点不做判定——机器人重算成本为零，页面端由 handler 在服务端算好。`approx: true` 的条目消费方只应展示"年月（日期待公布）"，不要渲染具体日期或倒计时。

## 测试

```bash
npm ci --include=dev && npm test     # 本机注意全局 omit=dev 配置
```

- `tests/calendar.test.cjs`：数据校验、状态分桶、倒计时/日期文案、类型筛选、approx 月份窗口，含对仓库内 `calendar.json` 本身的回归锁
- `tests/handlers.test.cjs`：路由/导航注入/i18n 注册、页面与数据端点的 handler 行为、坏数据回退