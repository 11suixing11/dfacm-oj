# d&f算法网训练工作台与错题复习（内部 addon 标识：swpu-train）

Hydro **5.0.7** 的登录用户功能插件，包含两个页面：

- **训练工作台 `/workbench`**：给回来训练的老用户一个直接入口——当前已报名路线与进度、下一题（当前章节第一道未 AC 题）、本周进度（北京时间周一起算的日常训练提交/AC 题数/尝试题数/活跃天数）、最近未通过的题目。
- **错题本 `/mistakes`**：自动收集评测结束的未 AC 提交（WA/TLE/MLE/OLE/RE/CE），每题可记录错误原因与复盘笔记；之后 AC 时自动标记"已补题"。支持手动标记、移除和从近期记录回填。

## 工作方式

```
GET  /workbench            工作台页面（no-store）
GET  /workbench/data       工作台 JSON（每用户 30 次/分钟）
GET  /mistakes             错题本页面（no-store）
GET  /mistakes/data        错题列表 JSON（filter: open|done|all, page）
POST /mistakes/update      {pid, reason?, note?, resolved?}  保存原因/笔记/补题状态
POST /mistakes/remove      {pid}  移除条目（连同笔记）
POST /mistakes/sync        手动回填（每用户每分钟 1 次）
```

所有路由都要求 `PRIV_USER_PROFILE`，未登录访问会被 Hydro 重定向到登录页。页面与品牌登录页同风格，数据通过站内 JSON 接口渲染；导航栏注入"工作台 / 错题本"入口（中英双语）。

## 数据口径

- **收集**：只在 pm2 instance 0（或未设置实例号）注册 `record/change` 监听，且只处理判题结束（`body.key === 'end'`）的负载，避免重判广播造成误判。比赛提交同样收集（赛后补题场景），但排除自测/答案生成的保留 contest id。SE/Canceled/Hacked 等非用户过错状态不收集。
- **回填**：首次打开错题本（或手动同步）时，扫描该用户最近 300 条**日常训练**（非比赛）未通过提交补齐条目；已 AC 的题依据题目状态直接标记已补题。已有条目不被回填覆盖。
- **工作台统计**：本周进度与最近未通过只统计非比赛提交（`contest: null`，命中 `{domainId,contest,uid,_id}` 索引，避免全表扫描）；周界按 Asia/Shanghai 周一 00:00。
- **存储**：Mongo 集合 `swpu_train`，唯一索引 `{domainId, uid, pid}`；`attempts` 为观察到的失败次数。笔记最长 2000 字。
- **关闭收集**：设置环境变量 `SWPU_TRAIN_MISTAKES=0` 并重启后，不再监听判题事件（页面与已有数据仍可用）。

## 部署

```bash
mkdir -p /root/.hydro/addons/swpu-train
cp /root/swpu-oj/plugin-swpu-train/{index.ts,mistakes.cjs,workbench.cjs,workbench.html,mistakes.html,package.json} \
   /root/.hydro/addons/swpu-train/
mkdir -p /root/.hydro/addons/swpu-train/node_modules
ln -sfn /usr/local/share/.config/yarn/global/node_modules/hydrooj \
        /root/.hydro/addons/swpu-train/node_modules/hydrooj
# 在 /root/.hydro/addon.json 中加入 "/root/.hydro/addons/swpu-train"（参考 addon.json.example）
pm2 restart hydrooj
```

**不要**在 `/root/.hydro/addons/swpu-train/` 里运行 `npm install` 或 `npm ci`：它会重建 `node_modules`，覆盖指向 Hydro 的软链。开发测试在仓库检出目录中运行。

## 本地测试

```bash
cd plugin-swpu-train
npm ci
npm test
```

`npm ci` 按锁文件安装仅用于测试的 `esbuild`（把 `index.ts` 打包后以 hydrooj 替身加载）。测试覆盖错题收集/回填/更新、工作台装配（路线进度、下一题、周统计、最近未通过）和路由装配（权限、限流、首次回填、开关环境变量）。测试不连接线上数据库或判题机；真实训练数据仍需在同版本测试实例验收。

## 限制

- 回填只覆盖日常训练提交且上限 300 条；更早的历史错题不会自动出现，判题结束的新提交会持续收集。
- 已删除或不可见题目的条目保留在错题本中，但不提供题面链接。
- "下一题"按训练计划 dag 顺序给出当前章节第一道未 AC 题；不含题目难度排序。
