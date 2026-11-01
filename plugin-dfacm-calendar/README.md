# d&f算法网定制插件：赛事日历

算法赛事日历与 AI 赛讯合并为一个插件入口 `/calendar`。清单按「进行中、即将到来、日期待公布、已结束」分组，每场比赛一行，显示日期、名称、类型、地点、状态、报名截止、奖金、主办方与兴趣标签。支持算法赛 / AI 与黑客松方向、多类型、Vibe Coding / Agent、平台、状态、关键词搜索和排序；ICS、RSS 使用相同筛选。所有展示时间为北京时间，游客也能使用。

## 页面与接口

| 地址 | 用途 |
|---|---|
| `/calendar` | 统一赛事清单，兼容 `?type=icpc` / `?types=icpc,cf&q=关键词` |
| `/calendar/data` | 只读 JSON，保持 QQ 原字段，增加 AI 元数据 |
| `/calendar/feed.ics` | ICS 订阅和下载，使用与页面相同的筛选 |
| `/calendar/feed.xml` | RSS 订阅，包含日期未公布的赛事 |
| `/calendar/assets/:file` | 固定白名单的版本化 JS / CSS；自行托管，无外部 CDN 依赖 |
| `/ai-contests` / `/ai-contests/calendar` | 旧入口兼容跳转到 `/calendar`，保留原分类 / 兴趣 / 搜索 |
| `/ai-contests/feed.ics` / `/ai-contests/feed.xml` | 旧订阅兼容跳转到合并订阅，保留筛选 |

类型和兴趣标签各自多选取并集，其他条件取交集。搜索覆盖名称、地点、备注、分类、主办方、奖金、平台与标签。默认按开始时间排序，可改为截止时间、最新收录、同币种奖金排序；不同币种先分组，不换算汇率。已结束赛事最近的在前并默认折叠，筛选时展开匹配结果，清空后恢复原来的展开选择。脚本或资源不可用时仍可阅读服务端清单、提交搜索和下载订阅。

参数：`scope=algorithm|ai`、`types=cf,hackathon`、`interests=vibe-coding,agent`、`source=lablab`、`status=active|ongoing|upcoming|uncertain|ended`、`sort=schedule|deadline|newest|prize`、`q=关键词`。

沿用原日历的清单布局，页面不加载 FullCalendar。左侧日期、中央赛事信息、右侧状态与赛事链接在桌面分栏展示，手机自动换行；保留蓝灰配色、分类色点、深色主题与报名截止提示。当前资源 URL 为 `calendar-1.37.1.js` / `calendar-1.37.1.css`；依赖版本保持原样。

只公布月份的赛事仅显示年月；完全没有时间显示「待定」，只有结束时间则明确显示「开始日期待公布 · 截至…」。这些信息不会被伪造成开赛日期。已公布的报名或赛事截止可以独立订阅，RSS 包含所有符合筛选的条目。

## 数据源与缓存

| 数据源 | 赛事 | 鉴权 |
|---|---|---|
| `calendar.json` | ICPC、CCPC、省赛、邀请赛、校赛、蓝桥杯、天梯赛、百度之星、企业赛、CCSP 等官方公告 | 手工维护 |
| Codeforces 官方 `contest.list` | CF Round 等 | 无 |
| AtCoder 社区 `kenkoooo` 数据 | ABC、ARC 等 | 无 |
| [CLIST](https://clist.by) v4 API | 牛客、洛谷、LeetCode、CodeChef | 用户名 + API Key |
| [AI 采集后台](../plugin-dfacm-ai-contests/README.md) | DataFountain、天池、讯飞、Kaggle、DrivenData、Devpost、lablab.ai，以及 CF / LeetCode 补充 | 本机只读 API；Kaggle token 可选 |

平台赛查询未来 **60 天**和最近 **12 小时**，进行中的长赛按结束时间判断。CF、AtCoder、CLIST 独立缓存，正常每小时刷新；失败保留各自最近成功数据最多 24 小时，10 分钟后重试。页面只等待本地磁盘读取，外网请求在后台进行，单一数据源故障不抹去其他来源的赛程。页面显示各源同步状态。

`ai.cjs` 每 **5 分钟**读取服务器上的采集服务，按 500 条分页完整读取，异常时使用上次缓存，1 分钟后重试，最多保留 24 小时。采集服务自己的定时抓取频率不变。先合并手工公告，再合并 CF / AtCoder / CLIST 和 AI 采集，按稳定 ID 与规范官方 URL 去重；手工内容优先，重复行的兴趣、奖金、主办方和来源信息合并保留。LeetCode `.com` 与 `.cn` 的同场赛事归为一条。

运行时缓存 `auto-cache-cf.json`、`auto-cache-atcoder.json`、`clist-cache.json` 不进 Git，也不发货。旧 `auto-cache.json` 可在升级后用于首次读取。手工赛程优先，按 ID 和规范赛事链接去重。

环境变量用于排障：

| 变量 | 作用 |
|---|---|
| `SWPU_CALENDAR_FILE` | 手工数据文件路径 |
| `SWPU_CALENDAR_AUTO_OFF=1` | 关闭 CF / AtCoder 抓取 |
| `SWPU_CALENDAR_AUTO_CACHE` | CF / AtCoder 缓存文件基名（自动附加来源后缀） |
| `SWPU_CALENDAR_CLIST_CACHE` | CLIST 缓存文件路径 |
| `DFACM_CLIST_USERNAME` / `DFACM_CLIST_API_KEY` | 覆盖后台 CLIST 配置 |
| `DFACM_CALENDAR_AI_OFF=1` | 关闭 AI 采集桥接 |
| `DFACM_CALENDAR_AI_URL` | 采集源 HTTP origin，默认 `http://127.0.0.1:8765`，只允许本机回环地址 |
| `DFACM_CALENDAR_AI_CACHE` | AI 赛事缓存路径，默认 addon 内 `ai-cache.json` |

## 配置 CLIST

管理员进入 **控制面板 → 系统设置 → 赛事日历**（`/manage/setting#setting_swpu_calendar`），填写：

- `dfacm_calendar.clist_username`：CLIST 账号用户名。
- `dfacm_calendar.clist_api_key`：CLIST API Key。

保存后访问日历即可触发后台同步，稍后刷新能看到牛客等新增平台。Key 使用密码输入框，保存后不回显；编辑设置时留空保留原 Key，清空用户名可关闭同步。只在服务器向 `https://clist.by/api/v4/contest/` 请求时的 `Authorization: ApiKey 用户名:Key` 头内使用，不放进公开页面、订阅 URL、错误文案或缓存。未配置成对凭据时不请求 CLIST；更换配置触发立即刷新。环境变量优先于后台设置。

API 不可用时显示上次赛程及状态；暂未配置时显示「CLIST · 尚未启用」。页面和订阅说明保留 CLIST 数据来源标注。

## 日历订阅

「订阅赛程」会生成当前全部筛选条件的订阅 URL，可复制进 Apple 日历、Google 日历、Outlook 等应用，也可以下载 `.ics` 手工导入。页脚提供相同筛选的 RSS。

- 定时赛事输出 UTC 时间，包含赛前 **30 分钟**显示提醒。
- 报名截止独立成事件，包含提前 **3 天、1 天**显示提醒。
- 全天现场赛事输出 `VALUE=DATE`，结束日期为次日的排他边界，确保多日赛事包含最后一天。
- 仅确定月份的比赛不导出猜测的日期，其精确报名截止仍能订阅。
- 未知开始日期但已知结束日期时只导出「赛事截止」提醒；没有任何日期的赛事仅进入 RSS。
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
| `start` | 通常 | ISO 8601，显式带时区；北京时间建议 `+08:00`；完全未知时显式用 `dateUnknown: true` |
| `end` | 否 | 多日全天赛填最后一天 `23:59:59+08:00` |
| `form` | 否 | `onsite` 默认 / `online` / `hybrid` |
| `allDay` | 否 | 显式指定全天；现场赛午夜开始并在末日 23:59 结束也会识别为全天 |
| `approx` | 否 | `true` 表示只精确到月，`start/end` 圈出月份；不写 end 时自动补月末 |
| `dateUnknown` | 否 | `true` 允许没有开始时间，不虚构日期 |
| `openEnded` | 否 | 已公布开始但没有截止的长期赛事仍视为进行中 |
| `regDeadline` | 否 | 精确报名截止，日历和 QQ 可提醒 |
| `location` / `note` | 否 | 地点 / 备注 |
| `url` | 否 | 合法 `http(s)` 官方或报名链接 |
| `tags` / `organizer` / `prizeText` | 否 | 兴趣标签 / 主办方 / 原始奖金文字 |

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
| `datascience` / `aigc` / `llm_agent` / `hackathon` / `ai_other` | 数据科学 / AIGC / 大模型与 Agent / 黑客松 / 其他 AI 赛 |

JSON 端点保留 `ok`、`updated`、`generatedAt`、`events` 与原始 ISO 字段，内部 Date 字段不输出。新字段为 `dateUnknown`、`tags`、`organizer`、`prizeText`、`prizeAmount`（万元单位，币种见 `currency`）、`teamsCount`、`firstSeenAt` 与事件 `sources`。原 QQ 机器人会跳过没有 start 的赛事，原有播报无需改动。

## 开发与部署

```bash
npm ci --include=dev
npm test
npm run preview          # 本地模板预览，默认 127.0.0.1:4174
```

依赖都是开发 / 测试依赖，生产 addon 不执行 npm 安装。部署直接使用提交的模板和浏览器 JS / CSS；旧 FullCalendar 资源与重建脚本保留在仓库中作为历史文件，清单页面不加载，发货清单和资源路由也不包含它们。

测试覆盖数据校验、单源故障和缓存回退、固定时钟、CLIST 密钥轮换、ICS 独立解析，以及生产模板的离线 DOM 交互：组合筛选、搜索、数量与空结果、往期折叠、日期待公布、脚本缺失回退和订阅。安装清单见 [deploy/deployment.md](../deploy/deployment.md)，修改代码后用标准 `deploy.sh` 完成校验、发货和重启。

已有站点合并时在本插件目录运行 `node scripts/package-merge.cjs`，上传生成的专用包和 SHA256 文件，解包后执行 `bash scripts/install-merge.sh check` 校验，再执行 `bash scripts/install-merge.sh`。该流程使用现有 Hydro 工具链，备份并更新日历运行文件、首页两处导航、Caddy 的 AI 路由及 addon 注册，保留服务器手工数据、缓存、CLIST 配置、AI 数据库和其他插件。失败会恢复此次备份。维护记录保存在包旁的 `*-qa` 目录和 `/root/backups/calendar-ai-merge.*`。

本次合并、手机适配与验收范围见 [赛事日历与 AI 赛讯合并发布记录](../docs/calendar-ai-merge-2026-10-31.md)；旧版历史见 [赛事日历与清单发布记录](../docs/calendar-release-2026-10-21.md)。
