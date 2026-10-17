# d&f算法网定制插件：XCPC 赛事日历

给队员一个"作战情报中心"：把 ICPC / CCPC / 省赛 / 邀请赛 / 校级比赛的赛程收进站内一个页面，按"进行中 / 即将到来 / 已结束"分组展示，带倒计时与报名截止提醒。全站对游客可见（赛事情报无登录门槛），导航栏落在「评测记录」旁。

- `GET /calendar` 日历页（`?type=icpc|ccpc|provincial|invitational|school|other` 按类型筛选）
- `GET /calendar/data` 只读 JSON 端点——QQ 播报机器人（swpu-broadcast）抓取同一份数据做每周播报与报名截止提醒

## 数据维护（站长操作手册）

数据就是本目录的 `calendar.json`，纯手工维护，没有任何后台界面——赛事信息以官方通知为准，站长从 ICPC 北京总部（icpc.pku.edu.cn）、ccpc.io 等官方渠道核对后录入。

```json
{
  "updated": "2026-10-17",
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
    }
  ]
}
```

| 字段 | 必填 | 说明 |
|---|---|---|
| `id` | ✅ | 全局唯一字符串，QQ 机器人防重发的键 |
| `name` | ✅ | 赛事名称 |
| `type` | ✅ | `icpc` / `ccpc` / `provincial`（省赛）/ `invitational`（邀请赛）/ `school`（校级）/ `other` |
| `form` | — | `onsite`（默认）/ `online` / `hybrid` |
| `location` | — | 城市 / 承办高校 |
| `start` | ✅ | ISO 8601（**带 +08:00 偏移**）；多日现场赛写首日 `T00:00:00+08:00` |
| `end` | — | 多日赛事写末日 `T23:59:59+08:00`；不写则按当天赛事处理 |
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
  "updated": "2026-10-17",
  "generatedAt": "2026-10-17T23:59:00.000Z",
  "events": [
    { "id": "...", "name": "...", "type": "icpc", "form": "onsite", "location": "成都",
      "start": "2026-10-24T00:00:00+08:00", "end": "2026-10-25T23:59:59+08:00",
      "regDeadline": null, "url": "...", "note": "" }
  ]
}
```

状态（进行中/即将到来/已结束）由消费方按 `generatedAt` 与 `start/end` 自行计算，端点不做判定——机器人重算成本为零，页面端由 handler 在服务端算好。

## 测试

```bash
npm ci --include=dev && npm test     # 本机注意全局 omit=dev 配置
```

- `tests/calendar.test.cjs`：数据校验、状态分桶、倒计时/日期文案、类型筛选，含对仓库内 `calendar.json` 本身的回归锁
- `tests/handlers.test.cjs`：路由/导航注入/i18n 注册、页面与数据端点的 handler 行为、坏数据回退
