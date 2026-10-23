# d&f算法网训练工作台与错题复习（内部 addon 标识：swpu-train）

Hydro **5.0.7** 的训练与复习插件，包含以下页面：

- **训练目录 `/training`**：沿用 Hydro 的搜索、分页、报名和权限，增加来自训练名称前缀的方向筛选，以及“我加入的 / 已完成”。新路线与新方向自动出现，筛选覆盖全部分页。
- **训练工作台 `/workbench`**：突出最近练过的未完成路线、当前章节与下一题名称；同时显示全部已加入/已完成数量和完整目录入口。最多展示 3 条近期路线，已完成路线不会挤掉其他未完成路线。显示本周进度（北京时间周一起算的日常训练提交/AC 题数/尝试题数/活跃天数）、最近待补题与折叠的已通过历史。
- **错题本 `/mistakes`**：自动收集评测结束的未 AC 提交（WA/TLE/MLE/OLE/RE/CE），每题可记录错误原因与复盘笔记；之后 AC 时自动标记"已补题"。支持手动标记、移除和从近期记录回填。

## 工作方式

```
GET  /workbench            工作台页面（no-store）
GET  /workbench/data       工作台 JSON（每用户 30 次/分钟）
GET  /workbench/recent     最近使用的训练集 JSON（落地页首页卡片，每用户 30 次/分钟）
GET  /workbench/context    本人评测对应的训练进度（rid, training, trainingNode；每用户 30 次/分钟）
GET  /mistakes             错题本页面（no-store）
GET  /mistakes/data        错题列表 JSON（filter: open|done|all, page）
POST /mistakes/update      {pid, reason?, note?, resolved?}  保存原因/笔记/补题状态
POST /mistakes/remove      {pid}  移除条目（连同笔记）
POST /mistakes/sync        手动回填（每用户每分钟 1 次）
```

上述自定义路由都要求 `PRIV_USER_PROFILE`，未登录访问会被 Hydro 重定向到登录页；原生 `/training` 目录仍遵循站点原有访问权限。页面与品牌登录页同风格，数据通过站内 JSON 接口渲染；导航栏注入"工作台 / 错题本"入口（中英双语），经 `before: 'ranking'` 插在内置「评测记录」项之后、「排名」之前（默认追加会落到导航最末尾，排在 Rating排行榜 之后）。

## 数据口径

- **收集**：只在 pm2 instance 0（或未设置实例号）注册 `record/change` 监听，且只处理判题结束（`body.key === 'end'`）的负载，避免重判广播造成误判。比赛提交同样收集（赛后补题场景），但排除自测/答案生成的保留 contest id。SE/Canceled/Hacked 等非用户过错状态不收集。
- **回填**：首次打开错题本（或手动同步）时，扫描该用户最近 300 条**日常训练**（非比赛）未通过提交补齐条目；已 AC 的题依据题目状态直接标记已补题。已有条目不被回填覆盖。
- **工作台统计**：本周进度与最近待补题只统计非比赛提交（`contest: null`，命中 `{domainId,contest,uid,_id}` 索引）；周界按 Asia/Shanghai 周一 00:00。待补题取最近 60 条失败提交去重，再核对当前题目 AC 状态，最后取最多 8 题；已通过的历史失败单独折叠展示。统计并非完整历史。
- **最近训练**：`/workbench/recent` 扫描该用户最近 600 条非比赛提交，凡是 pid 落在某条训练路线 dag 内的记录都把该路线标记为"使用中"（取记录时间戳的最大值），按最近使用时间倒序返回前 3 条（含 done/total/percent 进度）；扫描窗口内没有任何记录命中路线时，回退为已报名路线（无时间戳，`source: "enrolled"`）。
- **存储**：Mongo 集合 `swpu_train`，唯一索引 `{domainId, uid, pid}`；`attempts` 为观察到的失败次数。笔记最长 2000 字。
- **关闭收集**：设置环境变量 `SWPU_TRAIN_MISTAKES=0` 并重启后，不再监听判题事件（页面与已有数据仍可用）。

## 部署

```bash
mkdir -p /root/.hydro/addons/swpu-train
cp /root/swpu-oj/plugin-dfacm-train/{index.ts,mistakes.cjs,workbench.cjs,training-context.cjs,training-hooks.ts,catalog.cjs,catalog-hooks.ts,workbench.html,mistakes.html,package.json} \
   /root/.hydro/addons/swpu-train/
mkdir -p /root/.hydro/addons/swpu-train/frontend
cp /root/swpu-oj/plugin-dfacm-train/{frontend/training.page.ts,frontend/training.js,frontend/training.css,frontend/catalog.js,frontend/catalog.css} \
   /root/.hydro/addons/swpu-train/frontend/
mkdir -p /root/.hydro/addons/swpu-train/node_modules
ln -sfn /usr/local/share/.config/yarn/global/node_modules/hydrooj \
        /root/.hydro/addons/swpu-train/node_modules/hydrooj
# 在 /root/.hydro/addon.json 中加入 "/root/.hydro/addons/swpu-train"（参考 addon.json.example）
pm2 restart hydrooj
```

**不要**在 `/root/.hydro/addons/swpu-train/` 里运行 `npm install` 或 `npm ci`：它会重建 `node_modules`，覆盖指向 Hydro 的软链。开发测试在仓库检出目录中运行。

## 本地测试

```bash
cd plugin-dfacm-train
npm ci
npm test
npm run check:build
```

`npm ci` 按锁文件安装仅用于开发的 `esbuild` 与 `linkedom`。测试覆盖工作台统计、错题收集、训练来源与解锁、权限/限流、AC 实时刷新及原编辑器内容保留；构建检查模拟 ui-default 的原生入口打包方式。测试不连接线上数据库或判题机；真实训练提交仍需在同版本测试实例验收。

## 训练返回流程

已报名用户从已解锁章节或工作台进入题目时，链接携带 `training=<路线 ID>&trainingNode=<章节 ID>`；`tid` 仍保留给 Hydro 比赛。题目、独立提交页和本人普通评测页显示“返回本章”。返回时自动展开对应的已解锁章节并定位标题。未通过可返回题目修改，AC 后更新下一题；没有下一题时返回训练路线。实时结果使用原 `#status[data-status]`，重判结束也刷新进度；请求中途发生的结果变化会排队更新，旧响应不能覆盖新状态。进度刷新失败时保留返回入口与重试按钮。

后端每次核对同域路线、报名、章节解锁、题目可见性和评测归属，并调用已有 `training/get` 权限钩子；评测页和刷新接口还调用 `problem/get` 以遵循扩展插件的访问规则。查看其他用户进度、比赛/自测、历史重判版本均不挂载个人训练导航。路线与章节只通过链接传递，不写全局“最近路线”缓存，因此并行打开不同训练不会相互覆盖。新导航不替换原模板，也不接管代码、评测连接或题目助手。

本轮实现、预览方式与验收边界见 [UI 与训练流程交接](../docs/ui-training-update.md)。

## 多路线目录

`catalog-hooks.ts` 在原生 `training/list` 查询上追加 `category` 和 `view=enrolled|completed` 条件，保留其他插件的查询约束；目录计数仅额外读取标题和 ID，增强列表只输出当前页的 DAG 统计与简介。Hydro 自带的“已加入”侧栏仍会加载其他已加入路线，这是原生行为。`frontend/catalog.js` 在 `training_main` 中增强原搜索表单与列表，原分页和创建训练入口继续可用。筛选切换保留搜索词并回到第 1 页，搜索保留当前方向与状态，游客不显示个人筛选。服务端为原生分页补齐 `qs`，翻页保留搜索词、方向、状态和其他插件已有参数；目录增强失败时也保留这些条件。目录进度沿用 Hydro 训练状态；工作台继续按当前题目 AC 状态计算进度。

分类默认取名称开头的 `【入门】`、`【进阶】`、`【蓝桥杯】`、`【专题】` 等前缀；新增前缀自动成为新方向，无前缀归为“其他训练”。无需修改训练 ID 清单、报名、章节或题目配置。未加载前端或目录增强失败时，原生列表仍可阅读和进入。

## 限制

- 回填只覆盖日常训练提交且上限 300 条；更早的历史错题不会自动出现，判题结束的新提交会持续收集。
- 已删除或不可见题目的条目保留在错题本中，但不提供题面链接。
- "下一题"按训练计划 dag 顺序给出当前章节第一道未 AC 题；不含题目难度排序。
