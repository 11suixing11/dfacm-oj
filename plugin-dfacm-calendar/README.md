# d&f算法网定制插件：赛事日历

赛事日历提供 FullCalendar 7.1.3 月视图、周视图和赛事列表，桌面默认月视图，手机默认列表，支持多类型筛选、关键词搜索、详情与 ICS 订阅。所有展示时间为北京时间。官方赛程按通知手工录入，平台赛事自动同步，游客也能使用。

## 页面与接口

| 地址 | 用途 |
|---|---|
| `/calendar` | 赛事日历，支持 `?types=icpc,cf&q=关键词`，兼容 `?type=icpc` |
| `/calendar/data` | 只读 JSON，保持 QQ 播报接口兼容，增加 `source` / `allDay` / `sources` |
| `/calendar/feed.ics` | ICS 订阅和下载，使用与页面相同的类型 / 关键词筛选 |
| `/calendar/assets/:file` | 固定白名单的版本化 JS / CSS；自行托管，无外部 CDN 依赖 |

类型标签可以多选，搜索覆盖名称、地点、备注及分类名称。选择的视图保存在浏览器中。脚本或资源不可用时仍可阅读服务端生成的列表、提交搜索和下载日历。

只公布月份的赛事放在「日期待公布」区域，不放进具体日期格子；已公布的报名截止会在日历中独立显示。

## 数据源与缓存

| 数据源 | 赛事 | 鉴权 |
|---|---|---|
| `calendar.json` | ICPC、CCPC、省赛、邀请赛、校赛、蓝桥杯、天梯赛、百度之星、企业赛、CCSP 等官方公告 | 手工维护 |
| Codeforces 官方 `contest.list` | CF Round 等 | 无 |
| AtCoder 社区 `kenkoooo` 数据 | ABC、ARC 等 | 无 |
| [CLIST](https://clist.by) v4 API | 牛客、洛谷、LeetCode、CodeChef | 用户名 + API Key |

平台赛查询未来 **60 天**和最近 **12 小时**，进行中的长赛按结束时间判断。CF、AtCoder、CLIST 独立缓存，正常每小时刷新；失败保留各自最近成功数据最多 24 小时，10 分钟后重试。页面只等待本地磁盘读取，外网请求在后台进行，单一数据源故障不抹去其他来源的赛程。页面显示各源同步状态。

运行时缓存 `auto-cache-cf.json`、`auto-cache-atcoder.json`、`clist-cache.json` 不进 Git，也不发货。旧 `auto-cache.json` 可在升级后用于首次读取。手工赛程优先，按 ID 和规范赛事链接去重。

环境变量用于排障：

| 变量 | 作用 |
|---|---|
| `SWPU_CALENDAR_FILE` | 手工数据文件路径 |
| `SWPU_CALENDAR_AUTO_OFF=1` | 关闭 CF / AtCoder 抓取 |
| `SWPU_CALENDAR_AUTO_CACHE` | CF / AtCoder 缓存文件基名（自动附加来源后缀） |
| `SWPU_CALENDAR_CLIST_CACHE` | CLIST 缓存文件路径 |
| `DFACM_CLIST_USERNAME` / `DFACM_CLIST_API_KEY` | 覆盖后台 CLIST 配置 |

## 配置 CLIST

管理员进入 **控制面板 → 系统设置 → 赛事日历**（`/manage/setting#setting_swpu_calendar`），填写：

- `dfacm_calendar.clist_username`：CLIST 账号用户名。
- `dfacm_calendar.clist_api_key`：CLIST API Key。

保存后访问日历即可触发后台同步，稍后刷新能看到牛客等新增平台。Key 使用密码输入框，保存后不回显；编辑设置时留空保留原 Key，清空用户名可关闭同步。只在服务器向 `https://clist.by/api/v4/contest/` 请求时的 `Authorization: ApiKey 用户名:Key` 头内使用，不放进公开页面、订阅 URL、错误文案或缓存。未配置成对凭据时不请求 CLIST；更换配置触发立即刷新。环境变量优先于后台设置。

API 不可用时显示上次赛程及状态；暂未配置时显示「CLIST · 尚未启用」。页面和订阅说明保留 CLIST 数据来源标注。

## 日历订阅

「订阅赛程」会生成当前类型与关键词的订阅 URL，可复制进 Apple 日历、Google 日历、Outlook 等应用，也可以下载 `.ics` 手工导入。

- 定时赛事输出 UTC 时间，包含赛前 **30 分钟**显示提醒。
- 报名截止独立成事件，包含提前 **3 天、1 天**显示提醒。
- 全天现场赛事输出 `VALUE=DATE`，结束日期为次日的排他边界，确保多日赛事包含最后一天。
- 仅确定月份的比赛不导出猜测的日期，其精确报名截止仍能订阅。
- UID 根据赛事 ID 稳定生成，刷新不会重复建事件；中文 / 特殊字符按 RFC 5545 转义和 UTF-8 75 字节折行。

URL 订阅才会随赛程更新；单次下载导入不会自动刷新。是否发出通知、同步频率取决于日历应用设置。

## 手工赛程维护

修改 `calendar.json` 后执行 `bash deploy/deploy.sh --sync-only`，每次请求现读文件，**无需重启**。JSON 文件解析失败时回退上一份好数据并提示；坏行只跳过自身。

```json
{
  "updated": "2026-10-21",
  "events": [
    {
      "id": "icpc51-chengdu",
      "name": "第51届 ICPC 亚洲区域赛（成都站）",
      "type": "icpc",
      "form": "onsite",
      "location": "成都",
      "start": "2026-10-24T00:00:00+08:00",
      "end": "2026-10-25T23:59:59+08:00",
      "url": "https://icpc.pku.edu.cn/",
      "note": "以最终通知为准"
    },
    {
      "id": "lqb-18",
      "name": "第十八届蓝桥杯",
      "type": "lqb",
      "approx": true,
      "start": "2027-04-01T00:00:00+08:00",
      "regDeadline": "2026-12-18T14:00:00+08:00",
      "url": "https://dasai.lanqiao.cn/"
    }
  ]
}
```

| 字段 | 必填 | 说明 |
|---|---|---|
| `id` | 是 | 稳定、全局唯一，QQ 防重发和 ICS UID 的依据 |
| `name` | 是 | 赛事名称 |
| `type` | 是 | 下方分类键 |
| `start` | 是 | ISO 8601，显式带时区；北京时间建议 `+08:00` |
| `end` | 否 | 多日全天赛填最后一天 `23:59:59+08:00` |
| `form` | 否 | `onsite` 默认 / `online` / `hybrid` |
| `allDay` | 否 | 显式指定全天；现场赛午夜开始并在末日 23:59 结束也会识别为全天 |
| `approx` | 否 | `true` 表示只精确到月，`start/end` 圈出月份；不写 end 时自动补月末 |
| `regDeadline` | 否 | 精确报名截止，日历和 QQ 可提醒 |
| `location` / `note` | 否 | 地点 / 备注 |
| `url` | 否 | 合法 `http(s)` 官方或报名链接 |

分类键：

| 类型 | 覆盖 |
|---|---|
| `icpc` / `ccpc` | ICPC / CCPC 全体系 |
| `provincial` / `invitational` / `school` | 省赛 / 邀请赛 / 校级赛 |
| `lqb` / `ladder` / `asta` | 蓝桥杯 / 天梯赛 / 百度之星 |
| `industry` / `ccsp` | 企业赛 / CCF CCSP |
| `cf` / `atcoder` | Codeforces / AtCoder |
| `nowcoder` / `luogu` / `leetcode` / `codechef` | 牛客 / 洛谷 / LeetCode / CodeChef |
| `other` | 其余算法赛事 |

JSON 端点保留 `ok`、`updated`、`generatedAt`、`events`；事件保留原始 ISO 字段，内部 Date 字段不输出。消费方对 `approx` 仅显示年月，不制造具体比赛日期。

## 开发与部署

```bash
npm ci --include=dev
npm test
npm run preview          # 本地模板预览，默认 127.0.0.1:4174
npm run build:vendor     # 从校验通过的 npm 归档重建 FullCalendar 资源
```

依赖都是开发 / 测试依赖，生产 addon 不执行 npm 安装。`vendor/manifest.json` 记录固定 npm 归档的 SHA-512 和资源 SHA-256，`vendor/FULLCALENDAR-LICENSE.txt` 保留 FullCalendar、Preact、temporal-polyfill 的 MIT 声明。构建使用锁定的 esbuild 0.25.12；部署直接使用提交的资源。

测试覆盖数据校验、单源故障和缓存回退、固定时钟、CLIST 密钥轮换、ICS 独立解析，以及生产模板搭配真实 FullCalendar 浏览器包的离线 DOM 交互。安装清单见 [deploy/deployment.md](../deploy/deployment.md)，修改代码后用标准 `deploy.sh` 完成校验、发货和重启。

本次上线与验收范围见 [v1.36.0 部署记录](../docs/calendar-release-2026-10-21.md)。
