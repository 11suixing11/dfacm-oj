# swpu-ops — 管理员训练周报、判题健康摘要与 RP 自动重算

这是 Hydro **5.0.7** 的小型后台 addon。注册两个只读管理员报表脚本、一个立即全域重算 RP 的管理脚本，以及一组可关闭的 RP 自动重算机制（事件驱动的准实时重算 + 每小时清扫 + 服务号状态自洁）；不添加前端页面、公共 HTTP 接口或迁移逻辑。

## 能做什么

- `swpuWeeklyReport`：按域、提交时间和可选小组生成 UTF-8 BOM 的 CSV 及 Markdown。包含每个 UID 的提交数、本期不同 AC 题数、新增 AC 题数、活跃天数、WA/TLE/MLE/OLE/RE/CE/SE、未结束提交及其他状态。
- `swpuHealthSummary`：读取原生 `task` / `record` 集合，生成 Markdown 及 JSON，区分尚未领取的任务队列、当前未结束提交、近期结果分布和较长时间未结束的原提交。
- **RP 准实时重算**（`live-rp.cjs`）：监听 `record/change` 的最终结果，排除评测过程、自测和数据生成，30 秒后重算对应域。插件内始终串行执行，慢计算期间的新事件合并为下一轮，每域只补算一次；卸载后停止排队。只在 pm2 instance 0（或未设置实例号）注册，会通过 Hydro RP 脚本更新排名。设置环境变量 `SWPU_LIVE_RP=0` 并重启可关闭。
- **RP 每小时清扫**（`rp-sweep.cjs`）：删比赛、管理页编辑、直接改库等绕过判题流程的变动不触发任何事件，原生 `task.daily` 又只在 03:00 重算——清扫在启动 3 分钟后（避开 75 秒就绪窗口）及此后每小时执行一次"服务号自洁 + 全域 RP 重算"，把这类漂移的自愈时间压缩到 1 小时内。与准实时重算共享同一把锁，两个 RP 计算永不并发。设置 `SWPU_RP_SWEEP=0` 可单独关闭。
- **服务号自洁（幽灵 RP 免疫）**：RP 脚本的打分依据是 `document.status` 而非 `record`，且 calcLevel 写入的存储排名不过滤 `join`——评测机服务号（hydsvc-0074，uid 3）只要在 `document.status` 留下一条解题状态，下次重算就会复活幽灵 RP 并把真人排名整体挤后一位（v1.12.0 事故）。现在每次 RP 重算前都会 `deleteMany` 掉服务号的全部状态行，实时钩子还会在服务号终态记录出现的瞬间删除对应状态行；这条 v1.12.0 的手工运维铁律由此变成系统自动执行。服务号列表用 `SWPU_SERVICE_UIDS` 配置（逗号分隔 uid，默认 `3`，留空关闭自洁）。
- `swpuRpSweep`：立即执行一次"服务号自洁 + 全域重算"，用于绕过应用的数据库修补之后马上纠正排名，不必等清扫周期。

RP 的本地成功/失败记录各保留最近 100 条，成功记录包含耗时。串行保证仅覆盖本插件的调用，原生每日 RP 任务及管理员手动调用仍独立运行；大站应结合实际耗时决定是否开启事件重算。

默认只展示 UID，不读取或导出姓名、用户名、邮箱、学号、IP、提交源码或测试数据。报表仍包含训练统计，应由管理员保管。

## 在已有 Hydro 上安装

本仓库不会自动连接或修改线上实例。以下是后续在测试环境验证、再由管理员部署时使用的操作说明。

1. 将整个目录放到 `/root/.hydro/addons/swpu-ops`（其他服务器账户请调整路径）。运行文件必须包含 `index.ts`、`operations.cjs`、`report.cjs`、`live-rp.cjs`、`rp-sweep.cjs`、`package.json`。
2. 让 addon 复用服务器已经安装的 `hydrooj` 包，不要为此安装一整套新 Hydro。例如：

   ```bash
   mkdir -p /root/.hydro/addons/swpu-ops/node_modules
   ln -s /实际已安装的/hydrooj /root/.hydro/addons/swpu-ops/node_modules/hydrooj
   ```

3. 在现有 `~/.hydro/addon.json` 数组末尾添加该目录，保留其他插件。应用配置后重启 Hydro 主进程。
4. 在“控制面板 → 脚本管理”中确认两个脚本出现；首次使用应在测试环境核对结果。

后台脚本管理继承 Hydro 的 **`PRIV_EDIT_SYSTEM` + sudo 身份验证**。CLI 依赖能够读取 Hydro 配置和数据库凭据的服务器账户权限，请只允许管理员使用该账户。插件没有额外的用户可调用接口。

## 使用

两个脚本都可以在后台脚本管理填写 JSON 运行，也可以用服务器管理员 CLI。**CLI 无 `run` 子命令**：

```bash
hydrooj cli script swpuWeeklyReport '{}'

hydrooj cli script swpuWeeklyReport '{"domainId":"system","since":"2026-09-21","until":"2026-09-28","group":"2026级新生"}'

hydrooj cli script swpuHealthSummary '{"domainId":"system","staleMinutes":10}'

hydrooj cli script swpuRpSweep '{}'
```

`swpuRpSweep` 无参数。先清服务号在 `document.status` 的全部残留，再对每个域重算 RP（含等级与排名分配）；返回 `{recalculated, failures}`，`recalculated:false` 表示本进程内已有另一个 RP 计算在执行（排队的清扫/实时重算）或脚本注册缺失，稍后重跑即可。注意 CLI 是独立进程，与主进程内的清扫互不感知，若恰好同时执行也只是重复计算一遍（幂等）。绕过应用修改数据（删比赛、清理状态行）之后运行一次，可立即恢复排名一致。

周报参数：

| 参数 | 默认值 | 说明 |
| --- | --- | --- |
| `domainId` | `system` | 单个域，必须存在 |
| `since` | `until` 前 7 天 | 包含此提交时间 |
| `until` | 今天零点 | 不包含此提交时间；默认统计最近 7 个完整自然日 |
| `timeZone` | `Asia/Shanghai` | 支持 `Asia/Shanghai` 或 `UTC`，影响日期和活跃天数 |
| `group` | 空 | 精确小组名；提供后包含该小组当前成员，即使零提交 |

健康摘要的 `domainId`、`since`、`until`、`timeZone` 含义一致，默认窗口为当前时间之前的 **24 小时**。健康摘要不接受 `group`；额外的 `staleMinutes` 默认 10，可设为 1–10080 的整数。当前队列和未结束提交是运行时的全域状态，不受近期提交窗口限制。

日期可以写 `YYYY-MM-DD`，会按所选时区的零点解释；也可以写带显式时区、精确到秒的 ISO 时间，例如 `2026-09-21T08:00:00+08:00`。不接受缺时区的时间、毫秒、无效日期、未来的结束时间及超过 31 天的窗口。

脚本返回摘要和完整文件路径。输出在运行账户的 `~/.hydro/reports/swpu-ops/export-随机值/`，每次创建独立目录、**不覆盖旧报表**；目录权限为 0700，新文件权限为 0600（POSIX）。使用 `scp` 等管理员通道取走文件，不要把该目录配置为网站静态资源。

- 周报：`weekly.csv`、`weekly.md`。
- 健康摘要：`health.md`、`health.json`。

不要把 CLI 日志重定向为 `.csv`：Hydro 会先打印参数，后台也会格式化脚本消息。真正的完整 CSV 是报表文件，避免终端展示长度或对象格式影响导出。

## 统计口径和边界

1. 按原始 `record._id` 中的创建时间筛选 `[since, until)`，不是按 `judgeAt`。Hydro 原生重判保留 `_id`，结果变化写入当前记录，旧结果放在 `record.history`；本插件只读 `record`，因此同一提交不会因为重判被重复计数。**保留被重判过的真实提交**，不是一律过滤 `rejudged: true`。
2. 本期 AC 按 `(域, UID, 题目)` 去重。新增 AC 排除窗口开始之前、当前结果仍为 AC 的同域同题提交。本期重复通过旧题不会增加新增 AC。**这是当前裁定快照，不是重建历史首次通过事件**；如果旧 AC 后来被改判，重新导出可能得到不同结果。
3. 排除 `uid ≤ 0`、`pid ≤ 0`，以及原生自测和数据生成保留的两个 `contest` ID。管理员脚本记录也被排除。普通比赛、作业的实际提交会计入训练统计。
4. 只指定域时，只列出窗口内有提交的用户；指定小组时，小组成员按**当前名单**筛选并补齐零提交成员，无法恢复过去某天的名单。
5. 查询在 MongoDB 端按用户、题目、状态和自然日聚合，不将提交源码或全量历史记录载入内存。历史 AC 仅针对本期通过的用户题目组合，每批最多 100 组查询，并在数据库端去重。每次数据库查询限时 60 秒，最多 50000 用户、100000 个 AC 组合；超限会报错，不输出“看起来完整”的部分周报。
6. 不修改数据库索引；历史查询的耗时取决于站点数据量和已有索引，建议比赛结束后运行。一次报表的多个查询不是数据库事务快照；导出期间新提交或重判可能导致统计变化。
7. `task` 中的任务被 worker 领取后会立即删除，所以它只能反映**未领取任务**。编译中、评测中的数量来自 `record`。原提交年龄异常计数排除了已重判记录；它并不等于任务等待时间或程序执行时间。
8. 健康摘要不是沙箱/编译器/SMTP/判题机心跳的端到端探针；不自动重判、重启、删除任务或给服务健康做肯定判断。
9. 两个报表脚本读数据库、写报表文件；RP 钩子另行更新排名。通过 Hydro 后台运行时，**Hydro 自身**会产生脚本执行记录；CLI 运行也由 Hydro 负责加载服务。

## 本地测试

纯 Node 测试，不安装完整 Hydro，不连接 MongoDB 或线上服务：

```bash
node --test plugin-swpu-ops/tests/*.test.cjs
```

覆盖时间边界、北京时间默认窗口、无效参数、同题去重、历史 AC 排除、小组零提交、状态分类、文件导出及模拟原生模型的只读查询。

## 已核实的 Hydro API

以下均固定到 Hydro 5.0.7 的 npm `gitHead`：`18257e71da6a13e2c85ce0c03e2ac32553599dfd`，不是跟随更新的 master。

- [`Context.addScript`](https://github.com/hydro-dev/Hydro/blob/18257e71da6a13e2c85ce0c03e2ac32553599dfd/packages/hydrooj/src/context.ts)：注册 schema + `run(args, report)`，返回 `boolean` / `Promise<boolean>`。
- [CLI 脚本入口](https://github.com/hydro-dev/Hydro/blob/18257e71da6a13e2c85ce0c03e2ac32553599dfd/packages/hydrooj/src/entry/cli.ts)：`hydrooj cli script <name> '<JSON>'`。
- [管理员脚本权限](https://github.com/hydro-dev/Hydro/blob/18257e71da6a13e2c85ce0c03e2ac32553599dfd/packages/hydrooj/src/handler/manage.ts)：系统权限检查及 sudo 验证。
- [`RecordModel.coll` / 重判](https://github.com/hydro-dev/Hydro/blob/18257e71da6a13e2c85ce0c03e2ac32553599dfd/packages/hydrooj/src/model/record.ts)、[`postRejudge`](https://github.com/hydro-dev/Hydro/blob/18257e71da6a13e2c85ce0c03e2ac32553599dfd/packages/hydrooj/src/handler/record.ts)、[状态枚举](https://github.com/hydro-dev/Hydro/blob/18257e71da6a13e2c85ce0c03e2ac32553599dfd/packages/common/status.ts)。
- [`UserModel.listGroup`](https://github.com/hydro-dev/Hydro/blob/18257e71da6a13e2c85ce0c03e2ac32553599dfd/packages/hydrooj/src/model/user.ts)、[`TaskModel.coll` / 领取删除](https://github.com/hydro-dev/Hydro/blob/18257e71da6a13e2c85ce0c03e2ac32553599dfd/packages/hydrooj/src/model/task.ts)、[插件 API 导出](https://github.com/hydro-dev/Hydro/blob/18257e71da6a13e2c85ce0c03e2ac32553599dfd/packages/hydrooj/src/plugin-api.ts)。

本地测试验证聚合、参数和模型适配逻辑。由于仓库不包含运行中的 Hydro 或 MongoDB，真实管理员权限、MongoDB 聚合执行及 CLI 服务加载仍需在同版本测试实例验收。
