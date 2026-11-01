# d&f算法网 · AI 赛事采集组件

AI Contest Hub 与原赛事日历已合并，统一入口为 [`/calendar`](https://dfacm.website/calendar)。算法赛、AI 赛与黑客松共用清单、筛选、去重与订阅；`Vibe Coding` 与 `Agent/大模型` 兴趣覆盖各来源。此目录保留 Python 后台采集、只读 API 和历史界面代码，站点界面由 [赛事日历插件](../plugin-dfacm-calendar/README.md) 提供。

| 地址 | 功能 |
| --- | --- |
| `/calendar` | 合并比赛清单与筛选 |
| `/calendar/feed.ics` / `/calendar/feed.xml` | 共用筛选的 ICS / RSS 订阅 |
| `/ai-contests/` / `/ai-contests/calendar` | 永久跳转到统一日历，兼容原筛选参数 |
| `/ai-contests/feed.ics` / `/ai-contests/feed.xml` | 永久跳转到合并订阅，兼容原分类与兴趣 |
| `/ai-contests/api/competitions` | 只读比赛查询，兼容原程序参数 |
| `/ai-contests/api/stats` | 来源数量和最近抓取状态 |
| `/ai-contests/healthz` | 数据库与服务健康检查 |

首页桌面、手机菜单和 Hydro 导航统一为「赛事日历」。页面和订阅显示北京时间，并沿用站点白天/夜间主题。

数据源继承原程序：DataFountain、天池、讯飞、Codeforces、LeetCode、lablab.ai、DevPost、DrivenData，以及需要用户自配 token 的 Kaggle。Codeforces/LeetCode 每 2 小时更新，数据科学和黑客松来源每 6 小时，DrivenData 每 12 小时；单源失败保留已入库内容。

## 运行与验证

后端使用独立 Python 环境，不安装或升级 Hydro/npm 依赖。`requirements.lock` 固定原程序已经验证的所有依赖版本，`requirements.txt` 保留上游最低版本说明。

```bash
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.lock
ACH_ENABLE_SCHEDULER=0 .venv/bin/python -m unittest discover -s tests -p 'test_*.py'
cd backend
../.venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port 8765
```

生产服务由 `deploy/dfacm-ai-contests.service` 管理：代码在 `/opt/dfacm-ai-contests/current`，数据库在 `/var/lib/dfacm-ai-contests/competitions.db`，只监听 `127.0.0.1:8765`。Caddy 按 `deploy/caddy.inc` 仅转发 `/ai-contests/api/*` 与 `/ai-contests/healthz`，去掉前缀；页面和订阅交给 Hydro 日历插件处理。`index.ts` 保留为兼容空插件，不注册重复导航，并从 addon 列表移除。运行时数据库和凭据不进入 Git。

初次安装导入原数据库的一致性备份，更新代码时保留服务器上的数据库。服务以 `dfacm-ai` 系统账户运行并随系统启动，数据抓取不依赖桌面电脑。

```bash
systemctl status dfacm-ai-contests
journalctl -u dfacm-ai-contests -n 80 --no-pager
curl -f http://127.0.0.1:8765/healthz
```

Kaggle 可选凭据应保存到 `/var/lib/dfacm-ai-contests/kaggle.json` 并确保 `dfacm-ai` 可读；无需凭据的来源会正常定时更新。

## 2026-10-31 线上安装记录

首次安装时入口为 `/ai-contests/`；本次合并后正式入口为 [赛事日历](https://dfacm.website/calendar)，旧入口兼容跳转。以下保留初装采集服务的记录。

导入原桌面数据库的 636 条比赛，共 8 个有数据的来源。已以服务账户实际抓取 lablab.ai，成功更新 9 条；首轮自动 Codeforces 抓取于北京时间 2026-10-31 04:31:22 成功更新 17 条。两次更新均匹配已有比赛，验收时总量仍为 636。调度器随服务启动，首轮从启动后 5 分钟开始，各来源间隔 10 分钟。

| 项目 | 线上位置或版本 |
| --- | --- |
| 当前版本 | 具体发布目录记录在私有部署回执 |
| 当前代码软链接 | `/opt/dfacm-ai-contests/current` |
| 安装前配置备份 | 具体备份目录记录在私有部署回执 |
| 数据库 | `/var/lib/dfacm-ai-contests/competitions.db` |
| 独立虚拟环境 | `/opt/dfacm-ai-contests/.venv`，Python 3.14.7 |
| Python 本体 | Python 3.14.7，实际安装路径由部署环境决定 |
| 旧导航 addon | `/root/.hydro/addons/dfacm-ai-contests`，合并后不再注册 |
| 固定依赖 | `requirements.lock`，30 个包 |
| 原站环境 | Hydro 5.0.7、ui-default 4.58.5，安装时保持版本 |

首次上线包 SHA256：`d79a052443d56eecb7e51c465480aaeb0ca452c7c16c5be2bf65720989bd6f6b`。该包和初始数据库快照保存在本地 `qa/ai-contests-install-2026-10-31/`（Git 忽略）。代码文件已设为 Linux `0644`，目录 `0755`；Windows 打包程序也已固定归档文件权限。

维护时可重启独立服务或抓取单个来源：

```bash
systemctl restart dfacm-ai-contests
cd /opt/dfacm-ai-contests/current/backend
runuser -u dfacm-ai -- env \
  ACH_DB_PATH=/var/lib/dfacm-ai-contests/competitions.db \
  ACH_ENABLE_SCHEDULER=0 PYTHONDONTWRITEBYTECODE=1 \
  /opt/dfacm-ai-contests/.venv/bin/python -m app.cli crawl --source lablab
```

`--source` 可替换为 `codeforces`、`leetcode`、`datafountain`、`tianchi`、`xfyun`、`devpost` 或 `drivendata`。Kaggle 凭据尚未配置，需要启用时将个人凭据写入前述 `kaggle.json`，所有者设为 `dfacm-ai`、权限 `0600`。可通过公开 `/ai-contests/api/stats` 查看各来源最近抓取结果。原站 Caddy 由 PM2 管理，可用 `pm2 ls` 检查状态。

升级插件时先用 `deploy/package.py --seed-from 原数据库 --output 新目录` 打包，再通过 `bash deploy/install.sh stage 归档包 SHA256` 检查依赖、测试、Caddy 与 systemd 配置，最后 `bash deploy/install.sh activate 暂存版本目录` 激活。更新会保留服务器数据库；安装前配置备份包含 `Caddyfile`、`addon.json`、`home.html`，对应路径保存在版本根目录 `state.json`。当前站点另有已启用插件，恢复配置时应核对版本后的其他变更。

验收通过服务器后端测试、原爬虫 fixtures、仓库检查，以及线上浏览器 6 组检查（搜索和筛选、分页、主题、月历、手机布局、主页与 Hydro 入口）。公开订阅也已验证：全量 RSS 636 条、ICS 520 场有完整起止时间的比赛；Vibe Coding 活跃筛选下两种订阅均为 10 场。ICS 正确使用北京时间日期与排他结束日期。JSON 验收结果和桌面/手机截图保存在同一 QA 目录。
