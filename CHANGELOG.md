# Changelog

## v1.34.1 - 2026-10-18

### Added

- **赛事日历扩成全生态分类（站长拍板："不一定非要国A的，做好分类就行"）。** type 分类从 6 类扩到 11 类：新增 `lqb` 蓝桥杯 / `ladder` 天梯赛（CCCC-GPLT）/ `asta` 百度之星 / `industry` 企业赛 / `ccsp` CCF CCSP，徽章色沿用品牌色板，分类选型指南写进插件 README 与 calendar.cjs 头注释；页首筛选 chips 只出现有数据的类型，无数据不占位。
- **`approx` 字段：日期只精确到月的官方公告也能收录。** 蓝桥杯这类"省赛定于 2027年4月"（日期未公布）的条目，start/end 圈出月份窗口 + `approx: true`——页面与播报显示"2027年4月（日期待公布）"、不显示倒计时与具体星期，机器人不把它算进"下周开赛"（只进报名截止清单）；`end` 缺省时两侧自动补足月末窗口（站点 JS 与 bot Python 各自实现同一约定）；**报名截止等精确时间不受影响**。
- **种子新增两条已核实赛事**：**CCF CCSP 2026**（10月21-22日，成都·西华大学，与 CNCC2026 同期，报名已于 10月11日 截止——CCF 官方）与**第十八届蓝桥杯**（报名 2026年10月8日 ~ **12月18日 14:00 截止**，省赛 2027年4月，全国决赛 2027年6月中上旬——蓝桥杯官网 + 高校官方通知）。蓝桥杯条目带 `regDeadline`：**12月15/17日 bot 会自动在群里发报名截止提醒**。

### Changed

- swpu-broadcast 2.3.0→2.3.1：`CALENDAR_TYPE_LABELS` 同步 11 类（新类型不再误标"其他"）、`_sanitize_calendar` 透传 `approx` 并复刻月末窗口约定、`/赛程` 与周报对 approx 条目不显示倒计时；周报标题"下周 XCPC 赛程"→"下周赛程"（覆盖面扩大）。
- 日历页标题"XCPC 赛事日历"→"赛事日历"（导航项本来就是"赛事日历"）；测试 20 组（+4：新类型徽章/chips 顺序、approx 月精度与截止精确、approx 无 end 的月末窗口合成、种子数据 CCSP/蓝桥杯 回归锁）。

## v1.34.0 - 2026-10-18

### Added

- **XCPC 赛事日历：站内长出"作战情报中心"（站长创新点）。** 新插件 `plugin-dfacm-calendar`：`/calendar` 一个页面收拢 ICPC / CCPC / 省赛 / 邀请赛 / 校级比赛的赛程，按「进行中（金边高亮+倒计时）/ 即将到来（今天开赛·明天开赛·还有 N 天）/ 已结束（紧凑表格，方便回看补题）」三组展示，类型徽章 + `?type=` 服务端筛选（ICPC/CCPC/省赛/邀请赛/校级/其他），明暗双主题、移动端单列。**对游客可见**（赛事情报无登录门槛），导航栏落在「评测记录」旁（与工作台/错题本同款 `before: 'ranking'` 定位）。
- **QQ 播报机器人数据端点 `GET /calendar/data`**：无鉴权只读 JSON 镜像（限速 120/分钟）——swpu-broadcast v2.3.0 抓同一份数据：**每周日 20:30 播报下周赛程预告**（下周开赛条目 + 下周截止的报名清单，按 ISO 周防重）、**报名截止 D-3 / D-1 单独提醒**（按 事件×天数 防重）、新指令 **/赛程** 即时查看进行中与即将到来；数据 6 小时刷新一次、抓取失败 10 分钟退避并用 SQLite 缓存兜底（≤7 天），缓存过旧宁可沉默也不播过期信息；时区全部显式 Asia/Shanghai。
- **数据 = `calendar.json` 手工维护，站长改文件 `deploy --sync-only` 即时生效、无需重启**：页面每次请求现读磁盘；JSON 写坏不 500——服务端回退上一份好数据并在页面提示，坏行以「数据行被忽略：…」显示方便定位；坏时间/未知类型/重复 id/非 http 链接全部条目级跳过。所有时间计算显式走 Asia/Shanghai，与服务器时区无关。
- 种子数据为本赛季已核实条目（12 条，全部来自 ICPC 北京总部官方赛程表与承办高校官方通知）：第51届 ICPC Asia EC 网络预选赛两场（9月6日/9月12日，已结束）、区域赛西安 10.17-18 / 成都 10.24-25 / 武汉 10.31-11.1 / 南京 11.7-8 / 沈阳 11.14-15 / 上海 12.5-6 / 南昌 12.19-20、港澳站 2027.1.9-10、EC-Final（杭州）2027.1.26-28，以及 CCPC 女生专场 10.31-11.1（成都信息工程大学承办）。CCPC 分站赛与校赛等官方日期未公开的条目留站长补充。
- 测试 16 组：calendar.test.cjs 10（种子数据回归锁/坏行跳过/三组分桶/倒计时文案按日历日差/日期时间组合/报名截止三态/类型筛选/跨年日差）+ handlers.test.cjs 6（路由游客可见/导航注入名=路由名/i18n/页面分组/数据端点投影/坏数据回退与冷启动降级）。发货完整性锁进 deployment.test.mjs（cp 块必须含 calendar.json 数据文件），smoke 加 `/calendar` 与 `/calendar/data` 两检查。

## v1.33.1 - 2026-10-16

### Changed

- **导航「工作台 / 错题本」挪到「评测记录」旁边（站长需求：让用户更容易看到并用起来）。** 两个入口自上线起一直被 Hydro 默认追加在主导航最末尾——排在「排名」「Rating排行榜」之后，次序与可见性都最差。修法：`plugin-dfacm-train` 的 `ctx.injectUI('Nav', …)` 加 `args.before: 'ranking'`，走 hydrooj `src/lib/ui.ts` 的原生 splice 定位（`before` 命中节点名即前插，不碰 ui-default 源码、不靠 CSS hack、无需 Hydro 升级）。登录导航顺序变为：… 讨论 · **评测记录 · 工作台 · 错题本** · 排名 · Rating排行榜（移动端菜单同一份 SSR 导航，自动同步）。游客视角不变（两项本就要求 `PRIV_USER_PROFILE`）。handlers.test.cjs 的 injectUI 桩补记 `args` 并新增断言锁住 `before: 'ranking'`，防止后续改动把位置悄悄丢回队尾；README/deployment.md 的导航描述与验收清单同步。

## v1.33.0 - 2026-10-16

### Added

- **称号工坊：积分商店新增 DIY 称号特权（学生用户反馈直出）。** 学生花 **500 积分解锁（含首次铸造）、之后每次修改 50 积分**，在 `/shop/title` 自选 **≤4 字文案 + 六色预设色板**，铸造一枚只属于自己的徽章——走 badge-for-hydrooj 的 `badgeAdd`（max(_id)+1 分配编号并写入持有，只调用其模型不 fork），佩戴后称号 chip 与徽章一致出现在全站用户名旁（ranking / discuss / solution）；修改走 `badgeEdit`，它会给所有佩戴者重序列化 `user.badge` 串并失效用户缓存——**改名即时生效，展示端零开发**。工坊页实时预览只用 textContent（不碰 innerHTML），明暗双主题。
- **先显后管的防滥用三闸**：字符白名单（中文/字母/数字，码点计数，表情与标点天然拒绝）+ 色值只从预设色板出（杜绝任意 CSS 注入面）+ 保留词拦截（官方/系统/管理/站长/裁判/出题/客服/审核/admin 等，子串不区分大小写）。管理端 `/manage/shop` 新增称号表（成员/当前称号/状态/更新时间）：「停用」一键摘持有与佩戴（兜底闸，积分不退），「恢复」翻回资格，称号由成员在工坊重新保存铸造（照常计费）。
- **幂等与一致性**：解锁三重闸（`swpuTitles` uid 唯一索引 + ledger `title_unlock` 固定 ref 撞 {uid,ref} 唯一键 + 状态行存在即拒）；历史故障自愈——扣过分但状态行缺失时补建不再收费；修改失败自动冲正（先扣分后写徽章、失败 refund 退款入流水，同 redeem 教义）；badgeAdd 并发撞号重试一次 + 进程内铸造全局锁（单实例 pm2 教义）。流水新增 kind `title`。
- 商店货架第一张卡换装「DIY 称号工坊」特权入口（游客→登录、未解锁→解锁、已解锁→进工坊三态）。

### Changed

- 积分流水页补「称号」「退款」类型标签——退款流水（兑换失败冲正）此前误显示为「管理员调整」。
- 测试：titles.test.cjs 12 组（校验/解锁/自愈/首铸/计费/冲正/重铸/撞号重试/停用/管理端）+ handlers.test.cjs 新增 8 组（路由权限/工坊页态/特权卡/解锁/首铸免费/修改计费/无效拦截/CSRF/管理端停用恢复）；CI 的 CSRF 覆盖断言 shop 2→5（三个新 POST），发货清单 wiring 锁加 titles.ts / templates/title.html，smoke 加 `/shop/title` 302 门禁检查。

## v1.32.0 - 2026-10-13

### Added

- **站点长出"眼睛"：健康监控与告警三件套。** 此前站点挂了/磁盘满/判题队列积压全靠"有人发现"。现在：① 137 服务器 `/root/swpu-heartbeat.sh`（cron 每 10 分钟）把磁盘 %、可用内存、load1、判题队列深度写入 Mongo `systatus` 集合心跳文档；② 167 机器人（swpu-broadcast v2.2.0）在轮询循环内每 10 分钟独立巡检——公网站点探测（/reg，浏览器 UA 三连试，5xx/超时=故障，403=CDN 拦截不误报）+ 心跳新鲜度（>15 分钟=失联）+ 磁盘>85%/内存<300MB/队列>20 阈值 + Mongo 自身连通——**只在状态转变时播报**（故障→告警、恢复→报恢复），持续故障每小时补发一次提醒，状态与冷却存插件 SQLite；③ 新指令 `/oj健康` 即时输出健康快照（站点延迟/心跳年龄/资源/队列/告警项），群成员可用。告警面与播报面同一个群（1128735782），服务器宕机时心跳失联由 bot 外部视角兜底可见。
- **邮件通道三级兜底（无密码登录的命脉保障）。** 学生 100% 邮箱码登录，Gmail 单点故障=全站没人能进。现在三级：① regcode 插件新增**备用发信通道自动切换**——`dfacm.regcode.smtp2_host/port/secure/user/pass/from` 六键（控制面板可配），主通道（系统 `smtp.*`）投递失败时验证码邮件自动改走备用 SMTP，`deliverCode` 统一双通道投递（品牌模板不变），留空停用；部署要求插件目录 `node_modules/nodemailer` 软链（安装块已更新）；② 全站级一键切换脚本 `/root/switch-smtp-qq.sh` / `/root/switch-smtp-gmail.sh`（服务器侧保存凭据，切换前自动备份原授权码），覆盖找回密码等全部邮件；③ **`swpuIssueCode` 人工发码脚本**（控制面板脚本管理或 CLI）——邮件整体故障时管理员直接出 6 位码经 QQ 转告，全程不经邮件。切换手册入库 [deploy/smtp-switch.md](deploy/smtp-switch.md)。
- **备份 RPO 24h→12h。** 日备加第二时间点（03:17 / 15:37），保留份数 7→14（磁盘余量充足）；deployment.md §15 同步。

### Changed

- regcode 插件版本 1.1.0→1.2.0；swpu-broadcast 2.1.0→2.2.0（健康监控模块）；/oj帮助、/指令 帮助文案补 /oj健康。

## v1.31.1 - 2026-10-13

### Fixed

- **登录用户不再看到注册向内容（站长实拍反馈）。** 首页底部「第一道题，永远是 A+B」行动召唤区（"注册一个账号…"文案 + `免费注册，开始训练 →` 按钮）是纯游客转化内容，登录后依旧原样展示——与顶部导航已换成用户名/工作台的状态自相矛盾。修法：登录态换装时把整个 `#go` 召唤区连同页脚「社区」列的登录/注册两个链接一并隐藏（`hidden` 属性 + 显式 CSS 保险），游客 / 无 JS / SEO 视角完全不变；bfcache 回落与缓存回滚路径同步还原。顺手检查：导航 / 移动菜单 / hero 欢迎行的登录注册元素此前已全部换装，入门指引节的「创建账号」步骤按 v1.30 的既定决策保留（通用教学内容）。

## v1.31.0 - 2026-10-13

### Fixed

- **工作台数据全空的老 bug（插件上线以来）+ 新接口同病，一并修复。** E2E 复验 `/workbench/recent` 恒为空时实锤根因：Hydro 框架（@hydrooj/framework decorators.ts）**只给带装饰器的方法安装按名注入的参数包装**；无装饰器的裸方法参数收到的是**整个 args 对象**而非声明的参数名——`async get(domainId: string)` 里 domainId 实为 `{"domainId":"system","__start":...}`，凡以它为键的 db 查询全部落空。受害者：WorkbenchDataHandler（周统计/最近未通过/路线进度自 PR#4 上线起一直为空，当时 E2E 只验了 JSON 结构没验数字，漏网两天）；今天新写的 RecentTrainingsHandler 同样中招。修法：两个无装饰器 GET handler 改为无参数方法，体内 `const domainId = this.args.domainId`（框架解析 route 参数的同款官方路径）。有装饰器的方法（@param/@post 声明过的方法首参按参数名注入字符串）不受影响——错题本的 update/remove/sync 与 regcode 的 POST 全程健康，无需改动。

### Added

- **首页 hero CTA 换装成「最近训练」卡片（登录用户专属）。** 此前落地页首屏的「开始登顶训练 →」是写死的一条链接，永远指向一本通入门路线——对回来训练的老用户毫无指向性。现在：
  1. **新接口 `GET /workbench/recent`**（swpu-train 插件，`PRIV_USER_PROFILE` 门控 + 每用户 30 次/分钟限流）：扫描该用户最近 600 条非比赛提交，凡是 pid 落在某条训练路线 dag 内的记录都把该路线标记为"使用中"（取记录时间戳最大值），按最近使用时间倒序返回前 3 条（tid/title/done/total/percent/lastActiveAt/source）；扫描窗口内没有任何记录命中路线时回退为已报名路线（`source: "enrolled"`，无时间戳）——"最近使用"的口径是真实提交活动而非报名标记。
  2. **落地页换装**：登录探测确认后 fetch 该接口，把 hero CTA 区渲染成最多 3 张卡片（标题 + `done / total 题 · N 天前` + 继续箭头，点击跳训练计划页）；欢迎行的「继续训练路线」链接同步跟随最近一条。游客 / 无 JS / 接口失败 / 空列表全部回退静态 CTA；接口数据落 DOM 前过形状校验（url 只收站内训练路径）；卡片随 `swpu-me` 缓存乐观绘制，bfcache 恢复按既有纪律回落基线重探测。
  3. 测试：handlers.test.cjs 新增 5 用例（按最近提交排序/共享 pid 多计划/enroll 回退/空列表/限流预算），landing.test.cjs 新增 5 用例（卡片换装/空列表回退/接口失败不断登录态/乐观卡片存活失效刷新/游客回滚），CI wiring 补 `/workbench/recent` 断言。

## v1.30.1 - 2026-10-13

### Fixed

- **导航菜单「积分商店」点了打不开（10-04 上线以来的老 bug）。** ui-default 渲染 UserDropdown/ControlPanel 注入项时用 `url(item.name)` 按**路由名**解析 href；本插件的注入名写的是 `shop`/`shop_manage`，而路由名是 `swpu_shop`/`swpu_shop_manage`——解析不到时 Hydro 把错误串当 href 返回，登录用户下拉菜单里的链接成了字面量 `Error: No route found for name: shop`（控制面板的「积分商店管理」同病）。修法（badge 插件同款惯例）：injectUI 注入名对齐路由名，i18n 键同步改 `swpu_shop`/`swpu_shop_manage`；deployment.test.mjs 加 wiring 回归锁——每个注入名必须能匹配到一条 `ctx.Route('<同名>', ...)`。
- **deploy.sh wait_ready 探针误报修复。** 无密码化改版（v1.29.0）把 /reg 页标记 `tab-reg` 换成了 `m-mail`，当时 smoke/ci/footer 四处 wiring 都改了，唯独 deploy.sh 的就绪探针漏改——10-12 起每次部署都在 wait_ready 误报"服务未就绪"（实际服务健康，本次 75s/180s 两次实锤）。修法：探针改 grep `m-mail`；deployment.test.mjs 加双向锁（探针必须 grep m-mail、死标记 tab-reg 必须不存在）。

## v1.30.0 - 2026-10-13

### Changed

- **积分商店开张：品牌化货架 + 「攀登者之路」徽章套系 + 计分数据治理。** 此前商店功能已部署但定价表为空——学生打开 `/shop` 全是「未上架」，等于空壳。三件事让它真正可用：
  1. **服务号计分排除（根因修复）**：`points.ts awardSolve` 现按 `SWPU_SERVICE_UIDS` 排除服务号 AC（默认 `3` = hydsvc-0074 判题服务号，留空关闭；解析口径照抄 rp-sweep）——判题链路测试曾给 uid 3 攒出 686 分污染。存量清理由 `deploy/shop/ledger-cleanup.js`（mongosh，幂等）完成，同时清掉已删测试号的孤儿流水行；守卫：uid 3 的 uname 必须以 `hydsvc` 开头才执行，防 uid 复用误删。
  2. **商店页品牌化重设计**（`shop.html` 重写）：卡片货架——徽章大色块预览 + 用户名旁真实 chip 效果（复用 badge 插件 DOM 契约）+ 价格牌 + 余额进度条 + 下一枚目标提示；`swpu-` 前缀 scoped 样式、明暗双主题、移动端单列自适应。progress/need/can/next 全部服务端算好（生产 Nunjucks 是裁剪版，模板只输出不运算）；未上架徽章（管理员直发的身份徽章）不再进学生货架，卡序=阶梯价升序。
  3. **「攀登者之路」徽章套系**：`deploy/shop/badges-seed.js`（mongosh，幂等，`$set` 不碰 users 直发名单）上架 5 级登山主题徽章——大本营 30 / 雪线 100 / 冰川 250 / 冲顶 500 / 登顶 1000 分，配品牌色渐变（石板灰蓝→品牌蓝→冰川蓝→金→午夜金），与站点「向山顶，提交你的答案」的山峰隐喻一致。
- 测试同步：points.test.cjs 新增服务号排除用例（含 env 解析矩阵）；handlers.test.cjs 商店页用例改为货架口径（只列上架/价格排序/进度数学/next 目标/游客空数据）；deployment.test.mjs shop wiring 断言卡片货架标记（swpu-shelf/swpu-card__art）替代 data-table（history/manage 仍断言表格），并锁定两个新 deploy 脚本存在。本地 66/66 测试全绿。

## v1.29.0 - 2026-10-12

### Changed

- **学生账号全面无密码化（passwordless-first）**。学生侧不再有密码登录——`/reg` 重做为单一验证码流：输入邮箱 → 收码 → 已注册直接登录 / 未注册补一个用户名即完成注册（**不再设密码**）。后端三个改动支撑：
  1. `/reg/code` 新增 `purpose=auto`（默认）：服务端按邮箱注册状态自动分流 reg/login，响应新增 `registered` 标志驱动前端状态机——前端不再需要预判用户走注册还是登录；显式 `reg`/`login` purpose 保留不变（向后兼容）。
  2. `/reg/complete` 的 `password` 参数改为**可选**：缺省或长度不足时生成 32 字节随机 hex 作为账号口令散列（用户不可知、密码登录不可达）——邮箱验证码就是学生的唯一登录凭证。
  3. `/reg` 页面的密码登录面板 (`?tab=pwd`) 由服务端 `PRIV_EDIT_SYSTEM` **权限门控**（boot 注入 `canPwd` 标志）：管理员可见 break-glass 密码面板（含 2FA/通行密钥入口与找回密码），学生静默降级到默认验证码流——原生 `POST /login` 引擎**保留不删**，仅 UI 层门控。
- E2E 实弹验证全链路：auto 发码（未注册→registered:false）→ hash 换入已知码 → 无密码 complete（ok, redirect=/training）→ 账号 uid=20 + 双域 join + 64-hex 随机散列 → 60s 限速冷却 → auto 再发码（registered:true）→ 验证码登录（ok）→ 会话生效（302 偏好页）→ 全套清理。本地 63/63 测试全绿（25 handlers + 14 frontend + 24 logic/codes/config），CI 绿。

### Added

- **linux.do OAuth 第三方登录**（provider 插件已入库 `plugin-linuxdo-oauth/`）：走原生 OAuth 通道（`ctx.oauth.provide`），零引擎改动；配置 `linuxdo.client_id` / `linuxdo.client_secret` 两个系统设置键即可启用（站长在 linux.do 申请 Connect 应用后填入）。无需备案（区别于 QQ/微信）。

## v1.28.0 - 2026-10-12

### Fixed

- **帮助页管理员内容对游客暴露——权限门控修复。** /wiki/help 模板的管理员册七节与 API 册「管理 / 后台」速查表现渲染在 `{% if handler.user.hasPriv(PRIV.PRIV_EDIT_SYSTEM) %}` 内（上游模板同款写法），游客只见占位节。双视角实测：游客五个管理敏感标记（题库维护/judge.yaml/hydsvc-0074/部署备份安全/管理速查）全 0 命中，管理员会话全可见。
- 文档与现实的六处冲突修正：内存默认 256MB（原误写 512MB——Hydro 无 config 时默认 256，本站题目 config 多为 512）；status 22 不再括注"远程题"（本地判题同样经过）；日志噪音"CF 探测"改"互联网扫描器探测"（vjudge CF 账号已删）；删号全套补 swpuPointsLedger / swpuBadgePrice；删除"稀有徽章限时开放"推测文案；随机一题入口改为 /problem/random 直达。
- **帮助页入口落地**：footer_extra_html 追加「使用文档」(/wiki/help) 与「随机一题」(/problem/random)——此前帮助页在常规页面无任何入口（文档声称的页脚入口并不存在）。经 /manage/setting API（sudo 会话）提交，零重启。

### Removed

- **hydrooj-countdown 死插件卸载**（架构剪枝）：零路由，唯一功能（原生首页倒计时）被落地页 rewrite 遮蔽为不可见=纯冗余。tar 备份 /root/backups/hydrooj-countdown-removed-20261012.tgz；addon.json 17→16；仓库无该插件引用。realboard 保留（校内选拔赛现场投屏预留）。架构结论：150 条 HTTP 路由属 Hydro 框架本体，不作为剪枝对象（删了破坏框架完整性与升级链）。

## v1.27.0 - 2026-10-12

### Added

- **站内 /wiki/help 替换为三册使用文档**（已部署上线；23 章节，渲染 85KB）。上游帮助页是硬编码模板，故整文件替换为仓库版 `deploy/wiki-help/wiki_help.html`：**学生册**（注册登录、判题 status 枚举表、训练路线、比赛、工作台/错题本、积分商店、RP 规则、QQ 机器人指令、讨论区、Markdown 速查）；**管理员册**（账号与角色、题库三条导题通道与 spj/查重/编码坑、训练计划、比赛管理、判题排障、配置双轨、部署备份安全）；**API 册**（鉴权模型、常用速查、**全量 150 条路由表**（按已部署源码静态扫描生成）、WebSocket 与 Caddy 网关层、集成示例）。`install-wiki-help.sh` 幂等安装（标记跳过 + 自动备份 + pm2 restart）；上游 stock 原版存档 `wiki_help.stock.html` 可随时回滚。

## v1.26.1 - 2026-10-12

### Security

- **Closed Dependabot alert #1** (medium, dev scope): `tsx` 4.19.2 pulled in a nested
  `esbuild ~0.23.0` (vulnerable ≤0.24.2) inside `plugin-dfacm-regcode/package-lock.json`.
  Bumped the test runner to `tsx` 4.20.3, whose `esbuild ~0.25.0` dedupes with the
  existing direct `esbuild 0.25.12` — the lock now carries exactly one esbuild, 0.25.12.
  Test-runner usage (`tsx --test` on the TS suites) is unchanged; CI's fresh
  `npm ci` + full test matrix is the verifier.

## v1.26.0 - 2026-10-12

### Fixed

- **`#4142` 乘法运算 was unjudgeable since the day it was imported.** All four expected
  outputs contained `U+FFFD` where the original GBK statement had the full-width `×` and
  rule lines, so no program could ever match (the only such problem in the library;
  flagged in the 2026-10-08 audit §7.4b). Rebuilt as an ASCII column multiplication —
  `*` for the multiplication sign, `---` separators — with every other byte of the
  original layout preserved (widths, the one-column shift between partial products, the
  zero-padded first partial). The `输出格式` section now spells out the exact rules, the
  sample block shows the real judge bytes, and the original figure is kept with a note
  that judging follows the ASCII sample. Verified end-to-end: the reference solution
  compiled and run on the server reproduced the four expected outputs byte-for-byte,
  then AC'd through the real judge (100/100, 12.45 ms); the test record was removed and
  `nSubmit`/`nAccept` rolled back (a pre-existing stale `nAccept: 1` with zero AC
  records was also zeroed). Backups: `/root/backups/p4142-pre-rebuild-*.json`,
  `/root/backups/p4142-old-outs/`, rebuild artifacts in `/root/backups/p4142-rebuild/`.

### Documented

- **Belated record of the 2026-10-10 testdata additions** for `#4134` `#4225` `#4243`
  `#4306` (1→4, 1→3, 1→3, 1→4 test points): applied on the server with backup
  `/root/backups/testdata-add-2026-10-10T21-39-27-825Z.json` but never written into the
  CHANGELOG — the same "applied but unrecorded" class that previously made the XCPC-16
  repair look undeployed.
- **The FPS `<spj>` sweep is closed.** The five remaining source packages (`ybt-entry`,
  `ybt-bas`, `cf-2833`, `csp-2024-junior`, `csp-2024-senior`, plus `loj-small`) contain
  **zero** `<spj>` blocks; `ybt-11.xml` had exactly one (#10003, fixed 2026-10-06 with a
  testlib checker). No further silent-SPJ-loss problems are lurking in the FPS imports.
- **`docs/server-root-inventory-2026-10-12.md`** — every working directory on the OJ
  server and every folder in the local workspace classified as safe-to-delete or
  must-keep, with sizes and reasons. Also records the verified fact that the repo
  `landing/index.html` is byte-identical with production while the standalone
  `Desktop/swpuoj/landing/index.html` is a three-weeks-stale pre-repo copy that must
  not be mistaken for the source of truth.
- **Archived into the repo**: the #10003 testlib checker source
  (`deploy/checkers/10003-spj.cc` + its `config.yaml`) and the swpu-shop implementation
  spec (`plugin-dfacm-shop/SPEC.md`, facts current as of 2026-10-04) — both previously
  existed only on the server / loose in the workspace.

## v1.25.0 - 2026-10-11

### Fixed

- **Ten 一本通 problems shipped an unusable sample.** `#3692` `#3693` `#3694` `#3699`
  `#3829` `#3830` `#3831` `#3832` `#3833` `#3916` had `（无）` in their sample **output**
  block while the judge has a real expected answer, so a student had nothing to test
  against and no way to tell a compile error from a wrong algorithm. Each sample output
  now carries the judge's own bytes (`4 2`, `4 8`, `1 1`, `14`, the nine absolute primes,
  `220 284`, the fifteen palindromic three-digit numbers, `3.1415905109`, the 哥德巴赫
  list, `1.849016`).  **Statement-only change**: no `data[]` byte, no `html` flag and no
  judge configuration was touched, so no restart was needed. Every one of the ten pages
  was re-fetched from the live site afterwards and the rendered block checked.
  Backup: `/root/backups/sample-fix-2026-10-10T21-08-45-219Z.json`.

### Documented

- **The XCPC 16-problem statement repair was never written down here**, and that gap
  produced a false alarm on 2026-10-08: the audit saw the already-repaired pages, judged
  the class harmless, and the next reader concluded the repair payload sitting outside
  the repository had never been deployed. It had — `apply16.js` ran on 2026-10-05/06 and
  left three backups (`xcpc-fix-backup-2026-10-05T16-48/16-58/17-03*.json`). The affected
  docs are `2 3 5 631 632 642 645 646 681 688 696 753 776 798 805 827`; the payload is
  `Desktop/swpuoj/xcpc-fix/fixed/*.txt` + `*.review.json` (`display:0 fails:0`), the apply
  script backs up all 16 documents before writing, and `verify16.js` asserts the served
  page (KaTeX rendered, no `&lt;span class=&quot;katex&quot;` remainder, no `<span class>`,
  sample block present, no literal `$`, no `katex-error`, plus per-problem checks on
  `#5` and `#696`). All 16 were re-verified live on 2026-10-11.
- **`docs/plan-2026-10-11-A.md`** — the corrected construction order for the
  judging-data direction, with three measurements in the 2026-10-08 audit revised:
  the 「0-byte input」 class is 23 output-only problems (no input dimension exists, so
  “add test points” is not available for them), `#917`/`#918`/`#986` have *empty*
  sample blocks inside training tracks, and the single-testpoint class splits into 23
  unfixable output-only problems and 18 that a new case would actually help.

## v1.24.0 - 2026-10-08

Thirty verified 蓝桥杯 editorials added across two batches, and the pipeline
that proves them was rebuilt so that batches stop costing judge round trips.

### Added

- **`scripts/taxonomy/preflight.cjs`** compiles every solution in a batch and
  runs it against that problem's real test files before anything reaches the
  judge, printing got vs expected per case. A judge round trip is a compile plus
  a poll cycle and reports only "too high" or "too low"; this hands over the
  exact expected bytes. Batch 07 (8 problems) and batch 08 (12 problems) both
  passed on the first submission with zero rework, against roughly 60% before.
- **20 editorials** in `scripts/taxonomy/solutions/lq-batch-07.json` and
  `lq-batch-08.json`. 蓝桥杯 goes 106/253 to **126/253 (49.8%)**; the site total
  goes 527 to **547**.
- Documented in `scripts/taxonomy/README.md`: the pre-flight workflow, and the
  five mismatches it caught that the statement did not describe —
  `#4226` 九九乘法表 wants a fixed ASCII table with a title and bare products;
  `#4188` wants `3 9 20` rather than `3天9小时20分`; `#4096` reads both
  packaging sizes from the input and answers the Frobenius number; `#4184`
  requires the coin-change loop order *and* counts the trivial single-part
  split; `#4220` ends its first line with a trailing space.

### Fixed

- **The pre-flight reported failures that did not exist.** Node caps captured
  stdout at 1MB, so `#4224`'s 1.9MB output died with `ENOBUFS` and surfaced as a
  `RUNFAIL` indistinguishable from a wrong answer. `maxBuffer` is now 64MB and
  the message separates `ENOBUFS` from a genuine timeout.
- `#4224` timed out on its two large cases because the comparator called
  `substr`, allocating once per comparison over 100000 rows; the birth-date key
  is now extracted once at read time (about 100ms).
- `#4184` counted ordered compositions because the DP loops were nested the
  wrong way round — n=77 produced 7.7e22 instead of 10619863.
- `#4185` prints 1-based indices and the absolute value; `#4220` repeats factors
  and emits a trailing space.

### Notes

- `record.status` is a **numeric** enum. Checking for the strings
  `"judged"`/`"ignored"` matches nothing and makes an idle queue look dirty; the
  real test is that no status `0` (queued), `20` (compiling) or `21` (judging)
  exists. All 179 records on the site are terminal.

## v1.23.0 - 2026-10-08

Math rendering repaired across 241 problems, and the audit's own measurement
fixed after it produced three wrong numbers in a row.

### Fixed

- **The `html:"true"` math bypass is fixed on 241 problems.** `pdoc.html === "true"`
  made Hydro emit content as raw HTML and skip the markdown-it + KaTeX pipeline,
  so `$..$` printed literally. These statements are already stored in the target
  shape, so the repair is the flag alone and `content` is untouched. Formulas
  now render on 174 problems, up from 1.
- **6 problems rolled back rather than left broken** (`#3839` 阿克曼函数,
  `#3841` Hermite多项式, `#3893` 棋盘问题, `#3955` 滑雪, `#4048` 鱼塘钓鱼,
  `#4065` 食物链). Flipping the flag fixed most formulas but turned these six
  from *harmless literal text* into *visible `katex-error`*, which is worse.
  `rollback-kerr.cjs` now re-measures and restores `html:"true"` for anything
  that regressed; `katex-error` is back to 0.
- Escaped commas inside `$..$` un-escaped on 3 CSP problems (20 expressions) —
  markdown-it passes `&#44;` straight into KaTeX, which cannot parse it.
- Stray trailing commas removed from 5 formulas (`$r _ { i } ,$` →
  `$r _ { i } $`); a full-width Chinese comma had been folded into the span.
  `#749` was deliberately excluded: its commas separate real constraints.

### Corrected

- **The math-bypass scope was 292 problems, not 722.** 3547 problems carry
  `html:"true"`, but 3255 of them contain no math at all and are simply
  unaffected. Of the 292, 290 need nothing but the flag and 2 are scraped raw
  HTML needing a rewrite.
- **Every "N literal `$` still visible" number in the previous report was
  untrustworthy.** The measurement had three defects, each of which had to be
  found separately: the container pattern was `<div class="typo richmedia">`
  which never matches (the real one is `section__body typo richmedia`), so it
  silently fell back to measuring the whole page; the corrected pattern still
  failed because Hydro appends `data-fragment-id` after the class attribute; and
  `<script>` was never dropped, so `window.UiContext` — which embeds the
  statement as JSON — contributed 298 phantom `\uXXXX` escapes and a second copy
  of the prose that no reader ever sees. The auditor now returns
  `NO_STATEMENT_CONTAINER` instead of degrading silently, and counts rendered
  formulas as well as broken ones. The Mongo-side figure counts (820 problems /
  1,625 dead references) never depended on this path and are unaffected.

### Added

- **`scripts/taxonomy/htmltrue-*.cjs`, `fix-entities.cjs`,
  `fix-trailing-comma.cjs`, `rollback-kerr.cjs`, `render-measure.cjs`** — the
  repair pipeline, replayable end to end, documented in
  `scripts/taxonomy/README.md`.
- Backups on the server: `htmltrue-flag-20261008T082014.json` (247 entries),
  `htmltrue-rollback-20261008T083303.json` (6),
  `math-entities-20261008T082302.json`, `trailing-comma-20261008T082806.json`.

### Investigated, not fixable here

The dead figures from the hustoj import (1,625 references across 820 problems)
cannot be recovered from this server: every hustoj host returns 500, the
Codeforces statement pages return 403, `m1.codeforces.com` serves a JS
anti-bot challenge, luogu 404s, the local import archives hold only site icons,
none of the 76 in-plan problems has a same-titled twin with usable images, and
the one endpoint still open — the Codeforces API — exposes seven metadata fields
and no statement text. 64 of the 77 in-plan problems can still be mapped to
their original contest id by title, so this is recoverable later given egress to
Codeforces. Note that 32 of them lost *equations* rather than illustrations
(hustoj rasterised LaTeX into `class="tex-formula"` PNGs), so they are
incomplete rather than merely ugly.

## v1.22.0 - 2026-10-08

Library health report plus the 深基 sample batch that the 10-07 relay outage
left parked.

### Fixed

- **The 15 深基 sample blocks are live.** The 2026-10-07 batch submitted its
  verification programs while the `ws.hydrooj.com` relay was down and then
  installed a cron that only *polled* those records - they park at a
  non-final status forever, so `applyonly` aborted on every tick for ten hours
  even after the relay recovered (it is healthy again; verified end to end).
  The cron is removed and `taxonomy/srq15.cjs` re-submits instead.
- **4818【定期存款】 sample corrected** to `11876.9 12000`. The 10-07 answer
  assumed compound interest for both savers; the remote judge rejects it with
  `Read 12166.5, expect 12000` because 五年定存 is *simple* interest
  (`10000*(1+0.04*5)`). Only 小A's yearly rollover compounds.
- **Submission counters de-inflated** on the 15 targets - they had been
  counting the service account's verification runs (4818 read 9/2 against
  zero real submissions).
- `cleanup` no longer deletes `document.status` rows by `docId` alone; that
  filter also matched real users' AC markers and silently dropped their RP.
  Also replaced `db.getCollection()` (a mongosh helper that throws in the Node
  driver) and moved the backup write ahead of the database write.

### Added

- **`docs/audit-2026-10-08.md`** — full-library health report. All 4,249
  problem pages fetched (4,205 successfully; the site answers 403 under burst)
  plus a Mongo pass. Headline: the 蓝桥杯 and 一本通 rebuilds are clean
  (633 problems, zero dead figures, zero math leaks), and the remaining defects
  are concentrated in the not-yet-localised Codeforces batch. Top items are
  1,625 dead figure references left over from the hustoj import and 722
  problems whose `html:"true"` flag bypasses the KaTeX pipeline. Editorial
  coverage is 496/1013.
- **`scripts/taxonomy/audit/`** — 15 replayable audit scripts with a README
  covering how to run them and two rules the audit paid for: prefer Mongo over
  HTTP (a page-fetch scan silently misses pages behind the 403 guard), and
  enumerate every variant of a structure before calling it missing.
- The report's own numbers were corrected after a Mongo-side recount: dead
  figures 1,658 → **1,625** (the extra 33 were third-party image hosts, a
  different problem with a different fix), and missing samples 18 → **5**
  (the check missed the 样例说明 style, where a sample is a prose derivation
  rather than an input/output pair). All 5 remaining are outside the training
  plans.

## v1.21.0 - 2026-10-07

Full-library taxonomy pass: dedup, statement rebuild, samples, math repair,
eight topic training routes, and an editorial pipeline with verified
solutions.

### Removed

- **46 duplicate problem copies** (45 Codeforces problems that were imported
  once per contest round with 95-100% identical statements + data, plus
  蓝桥杯「矩阵乘方」 which existed twice). Keeper choice: the copy with the most
  test data; every deleted copy had zero submissions and zero references.
  System domain: 4,295 → 4,249 problems. Backup:
  `taxonomy-dedup-backup-20261007.json` (server) + `del46.js` (repo).

### Fixed

- **All 253 蓝桥杯 statements rebuilt** from the original Word sources:
  183 corrupted sample blocks, 29 missing samples and 4 lost-image problems
  repaired in one pass; 237 body figures extracted from the docx media and
  re-attached via `ProblemModel.addAdditionalFile` (including formula images
  and the 夺宝奇兵 map that lived in a junk header paragraph).
- **152 of 196 LOJ statements** freed of the KaTeX disease (raw MathML trees
  scraped into content); TeX recovered from the `katex-mathml` annotation,
  with a suffix rule for fraction/limit reordering. 43 remain (MathJax CHTML,
  need hand-written TeX maps) plus 1 structural edge case.
- **15 深基 remote problems** (4806-4909): computed sample outputs, each
  proven by an AC submission through the srqc relay before publishing; the
  site A+B (docId 1) restated with real judge data. The hydroac relay was down
  at the time, so this half shipped incomplete and was finished in v1.22.0.
- The 蓝桥杯 plan lost one duplicate chapter entry (254 → 253) and all public
  counts were refreshed (4,249).

### Added

- **8 topic training routes** (搜索与剪枝 / 动态规划 / 图论 / 数据结构 /
  数学 / 字符串 / 贪心与构造 / 二分与枚举优化), 256 problems total, 5
  difficulty-banded chapters each, chained unlock; drawn exclusively from
  verified-healthy CF problems outside every existing plan. Landing page
  gained a topic grid (8 cards + wide XCPC entry), the stats cell now counts
  11 training routes, display font re-subset (640 CJK).
- **Editorial pipeline** (`scripts/taxonomy/`): batch JSON → judge-verified AC
  → `SolutionModel.add` → verification records deleted and problem counters
  restored. 45 editorials published in this pass (蓝桥杯 batches 01-03c,
  including four deep-dive fixes: the 2n-queen same-cell rule, the
  tortoise-and-hare timing check, the C*++ join tokenization, Hankson
  32-bit divisor enumeration, cubic-root dedup and subset-order bits); the
  remaining plan problems continue through the same pipeline.

## v1.20.0 - 2026-10-05

The public identity is now **d&f算法网**, an independent algorithm-training
community. The brand meaning is simple: everyone can find their own final on
the road of algorithm competition.

### Changed

- The primary site is `dfacm.website`; `swpuacm.xyz` and both `www` hosts stay
  as compatible entry points, while public canonical and Open Graph metadata
  use the primary domain.
- Public about, onboarding, training and contest copy no longer describes a
  university-owned or school-selection platform. The site now presents open
  training routes, weekly/monthly events and topic challenges.
- The GitHub repository is published as `dfacm-oj`, with an independent
  description and homepage.

### Compatibility

- Runtime addon directories, Mongo collection prefixes, environment variables
  and deployment paths that begin with `dfacm` remain internal compatibility
  identifiers. Renaming those would break existing installations and data;
  they do not define the public brand.

## v1.19.1 - 2026-10-05

The training group QR lived only inside QQ. It now ships with the landing
page, so any visitor can join straight from the homepage.

### Added

- **`oj 训练群` join card on the landing page's call-to-action section**: a
  cropped, palette-quantised QR tile (`landing/assets/qq-training-group.png`,
  640px, ~55KB, decodes to `https://qm.qq.com/q/8mG7ByDyCc`) beside the group
  name, a one-line feature blurb (AC 播报 / 每日榜单 / 比赛战报 / 答疑互助)
  and the group number 1128735782. The QR itself is a link, so on phones a
  tap opens the qm.qq.com join page directly; on desktops it scans normally.
  Display font re-subsetted (624 → 634 CJK glyphs) for the new blurb text.

## v1.19.0 - 2026-10-05

The site's role is settled: an independent teaching/training tool, with public
weekly/monthly events and topic challenges alongside an untimed, self-paced
ICPC track in the
Luogu/Nowcoder "不限时训练" tradition.

### Added

- **`【进阶】XCPC 专题训练 108 题` training plan** (tid
  6ac38fb88b364d5443b9ee22). Nine chapters with a rising difficulty arc
  (d2 → d8): a mandatory four-chapter spine (warm-up → search → basic data
  structures → graphs), four parallel topic tracks (advanced data structures /
  DP / math / strings) unlocking after the spine, and a final "冲顶突击"
  graduation chapter gated on all four tracks. Within every chapter problems
  ramp from its floor to its ceiling (stratified sampling), the warm-up
  chapters reserve slots for Chinese remote-judged problems as an on-ramp, and
  no problem already in the ybtbas/lanqiao plans is reused. Selection
  pipeline and review list: `scripts/xcpc_select.cjs` +
  `deploy/culture/selection.md`; replay and API notes: deployment.md §21.

### Notes

- Training create API confirmed: `POST /training/create` takes
  title/content/dag(JSON string)/pin(**UnsignedInt**)/description; the dag node
  unlock is all-or-nothing (`requireNids` chapters must be fully AC'd), so
  mandatory-chain chapters must not contain mis-difficulty'd outliers - the
  selection script carries a manual BLACKLIST (network-flow and ZJOI-level
  problems the heuristics had misplaced).
- The problem `data` array entries are objects (`{name, etag, size}`), not
  strings - counting test pairs requires `e.name`; a naive String() count
  reports zero pairs for everything.

## v1.18.0 - 2026-10-05

The site had polish but no pulse: every problem was imported, the discussion
area was empty, and /wiki/about was stock legal boilerplate. This release
seeds the independent community's guides, discussion structure and training
culture, plus landing links that make that material reachable from the front
page.

### Added

- **Culture seed runbook (`deploy/culture/`)**. One-time seeding through the
  service-account session: a `d&f算法网` discussion-node category (公告 / 云剪切板 /
  闲聊), four pinned posts authored as the site owner (the algorithm
  onboarding guide, the problem-authoring tutorial with the config.yaml / SPJ / interactive examples, a weekly-race walkthrough
  covering post-contest solution culture, and a how-to-ask guide), an
  /wiki/about rewrite keeping the stock privacy/tos sections,
  mountain-flavored training chapter titles (大本营 → 登顶眺望) with
  senior-tone plan descriptions, the site's first contest (海拔周赛 R0, ACM
  rule, five warm-up problems, allowViewCode for post-contest learning), and
  footer links to the guide and the paste node. Replay, gotchas and the
  executed ids: deployment.md §20.

- **Landing community links and route-map identity**. The footer community
  column now leads with the freshman guide and the paste node; the 山外 column
  gains the bilibili usage tutorial and the LaTeX cheat sheet; the brand blurb
  carries the QQ group and the closing CTA a kaomoji. The training route map's
  waypoints are renamed to the mountain identities (大本营 … 登顶眺望) to match
  the training-plan chapters, keeping the topic name in the mobile list and
  aria labels. Display font re-subset (624 CJK).

### Notes

- Hydro's sudo flow requires touching a `@requireSudo` page before POSTing
  the password (the session must first receive sudoArgs); a 302 from
  `POST /manage/setting` is not evidence of success - verify the stored value.
  All three settings updates go through the manage API and take effect
  without a restart.
- `operation=init_discussion_node` flushes every discussion node before
  re-adding them; never re-run it once posts exist (post parentId would
  dangle). Future node additions must insert node documents directly.

## v1.17.0 - 2026-10-05

Ranking fixes: members who had solved exactly one easy problem were invisible
on the leaderboard, and one's own row was hard to find as the board grows.

### Fixed

- **First-AC members got RP 0 and vanished from the leaderboard.** The
  upstream problem component compresses raw scores with
  `max(0, min(raw, log(raw) / log(1.03)))`, and the log branch is exactly 0 at
  raw == 1 - which is precisely what a single difficulty-1 AC contributes.
  The ranking page filters `rp > 0` and calcLevel only assigns ranks to
  rp > 0, so those members appeared nowhere on the board while their profile
  read "RP: 0 (No. ?)". `deploy/patch-rating-floor.sh` floors any positive
  raw score at 1 RP, mirroring the contest component's own `max(1, ...)`
  floor. Replay and verification notes: deployment.md §19.

- **One's own position was hard to find on a long leaderboard.** The ranking
  template patch now also brands the signed-in viewer's own row (the pinned
  row and the in-list row) with `.swpu-row--self`; the brand layer paints a
  highlight, a left accent bar and a "你" badge. New marker `SWPU ACM patch:
  ranking self-row highlight`; the template script applies both ranking
  patches in order, so a fresh upstream template is fully patched by a single
  run. Replay and verification notes: deployment.md §18.

## v1.16.0 - 2026-10-04

A hardening pass over the boundaries of the customisation layer: the seams
between Hydro and the plugins, and between the deploy scripts and the live
server. Test count went from 136 to 200; every fix below has a regression test
or a CI lock, and the behavioural tests added for the boot-payload,
Cloudflare-range and CSRF-wiring fixes were each confirmed to fail against the
old code.

### Security

- **The `/reg` boot payload was assembled with `String.replace` and a string
  replacement (`plugin-dfacm-regcode`).** The replacement is JSON containing an
  OAuth provider's `text`, and a string replacement expands `$&`, `` $` ``,
  `$'` and `$$` — so a provider whose text contained `` $` `` spliced the
  remaining ~400 lines of `reg.html` into the inline `<script>`. Now uses a
  function replacer.
- **Registered email addresses could be enumerated at request rate.** `/reg/code`
  and `/reg/login` answer differently for a known vs unknown address, and
  `UserModel.getByEmail` ran *before* any rate limit. Both now pass a probe
  budget keyed on the submitted address and the real client IP first. The key
  uses Hydro's `_handleMailLower` rather than a bare lowercase, because a
  per-address budget keyed on the raw string is trivially evaded with `+tag`
  variants.
- **Theme backups were written inside the directory Caddy publishes.**
  `install-theme.sh` used `mktemp "<target>.bak-…"`, which for the static theme
  and service-worker targets means `/root/.hydro/static` — served by
  `root *` + `try_files {path}` + `file_server`. Every `*.bak-*` file was a
  public download and nothing pruned them. Backups now live in `BACKUP_DIR`
  (default `/root/swpu-theme-backups`), and the script refuses to run if that
  directory is inside the served tree.
- **The service-account purge deleted far more than the RP calculation reads.**
  `createSanitize` issued `deleteMany({uid:{$in:[3]}})` with no `docType`, so
  every hour it removed every `document.status` row for the judge account
  across all domains and all document types — problem statuses, but also
  training enrolments. Now scoped to `docType: 10`. Two further guards: the
  target uids are verified against the user collection at boot and the purge is
  refused if one does not look like a service account, and
  `SWPU_SERVICE_UIDS_DRYRUN=1` turns it into a `countDocuments` report.
- **Two `innerHTML` sinks fed by data the page did not fully control.**
  `reg.html` concatenated an OAuth provider's icon *and* text into one
  assignment; the icon is now parsed as XML with scripts, event handlers, style
  and external references stripped, and the label uses `textContent`. The
  landing page's welcome line concatenated the scraped username; it is built
  from nodes now, with entities decoded once so the text is neither raw nor
  double-escaped.
- **Five state-changing POSTs had no CSRF token** (`/reg/complete`,
  `/reg/login`, `/mistakes/update`, `/mistakes/remove`, `/shop/redeem`,
  `/manage/shop`, and `/mistakes/sync`). Each now mints a token into the
  session — a plain mutable object, the same one `loginAs` writes — and echoes
  it through that page's existing data channel: the `/reg` boot payload, a
  `window.__SWPU_CSRF__` marker in `mistakes.html`, and a hidden field in the
  two shop forms. Comparison is `timingSafeEqual` with a length pre-check.
  Sending a code (`/reg/code`) deliberately still works without a token: a
  first-time visitor has no account to protect, and requiring one would make
  registration impossible.

### Data integrity

- **A failed badge grant destroyed the member's points.** `redeem()` debited
  the ledger and *then* called `userBadgeAdd`; if the badge plugin threw, the
  error surfaced while the debit was already irrecoverable. A failure now
  writes a `refund` ledger row and reports that the points came back.
- **Two different badges could be bought with the same balance.** The
  `{uid, ref}` unique key only prevents buying the same badge twice; balance was
  read, compared and then inserted with nothing in between. Redemptions are now
  serialised per uid, which is correct for the single-instance pm2 deployment
  the plugin already assumes — the comment says so, since several app instances
  would need a multi-node lock or a transaction.
- **Shop business errors never reached the member.** `ShopError` messages such
  as "积分不足：当前 12 分，兑换需 50 分。" were never caught, so every failure
  was a generic 500. Both clients are plain form POSTs, where a JSON body is
  not rendered either — Koa's redirect wins. A failed POST now redirects back
  with the reason in the query string and the templates render it.
- **The mistake book reported deletions that never happened, and its
  "unclassified" option always errored.** `MistakesRemoveHandler` discarded
  `remove()`'s return value; `/mistakes/sync` had no try/catch while its
  siblings did; and the page's `未分类` option (value `""`) was rejected by the
  store's reason list.
- **The mistake book's "open" filter could not use its index.** It matched
  `resolved: {$ne: true}`, and `$ne` is not a usable range bound, so the
  `{domainId, uid, resolved, lastAt}` index could not serve the query and every
  page sorted in memory. Every write path already stores an explicit boolean, so
  `false` is equivalent and indexable.
- **The shop backfill scanned without a limit**, awaiting a problem lookup plus
  an insert per unique record. Bounded now, and truncation is reported rather
  than silent — the idempotency key makes a re-run resume the work.

### Deployment

- **`deploy.sh` installed before it verified.** On a hash mismatch it correctly
  refused to restart, but the server had already been modified: new brand CSS,
  new service-worker killswitch and new plugin sources on disk while the old
  process kept serving, with no way back. The run is now staged — upload into a
  `mktemp -d` directory, hash both ends, and only then install. A staging
  mismatch leaves the live site untouched. New `--stage-only` rehearses the
  upload without touching anything.
- **The manifest shipped `landing/index.html` and nothing else**, so the two
  subsetted woff2 fonts and the seven icons were never delivered by the
  orchestrator: changing one required a manual `install-landing.sh` that
  `deploy.sh` would never run. The whole `landing/` tree is now enumerated,
  `install-landing.sh` runs as part of activation, and `smoke.sh` asserts the
  fonts and icons are actually reachable rather than merely uploaded.
- **`install-theme.sh` had forward-only backups and non-atomic writes.** A run
  failing post-write verification left four rewritten targets with no way back,
  and `cat >>` interrupted mid-write left truncated CSS. Content is now staged
  in the target's own directory and swapped with one rename, and an `EXIT` trap
  restores everything already touched. Retention is bounded by
  `SWPU_THEME_BACKUP_KEEP` (default 10).
- The staging path was the fixed `/tmp/swpu-deploy-stage`, which a local
  unprivileged user can pre-create or symlink before extraction on a root box.
  SSH now defaults to `StrictHostKeyChecking=accept-new`; this session runs as
  root over both Tailscale and a public address. `install-landing.sh` gained
  `nullglob`.

### Correctness and honesty

- **The 蓝桥杯 card's four differently-named stages were anchors that all
  pointed at one training.** Hydro exposes no per-stage URL for a DAG node, so
  each promised a destination and then opened the route entry page. They are now
  plain labels with the route link as the sole affordance.
- **The landing session probe used a fixed 48-character lookback** to find
  `href="/user/"`. An upstream template adding one attribute between `href` and
  `class` would silently degrade every page to the guest view. It now walks back
  to the enclosing anchor tag.
- **The README advertised BBR congestion control**, which no file in the
  repository configures, and DNS-layer HTTPS records, which `deployment.md`
  states Cloudflare publishes automatically. Both claims corrected; CI now
  rejects their reintroduction, because a tuning claim nobody can verify rots
  silently.
- `deployment.md` sections were numbered `0..10, 15, 16, 11, 17, 12, 13, 14,
  18` — §15/§16 were appended later and §11 got pushed down. Renumbered by
  document order, and an orphaned checklist item moved out of 角色分组 back to
  the verification list it belongs to.
- Removed a byte-identical duplicate block in `theme/00-brand.css` and the dead
  `data-count` attributes on the landing stats — nothing read them, and
  `data-count="4298"` had drifted from the visible `4,295` while a test
  protected the stale value.

### CI

Each new check covers something the production run does but CI did not, or a
regression class CI had no lock for: `shellcheck -S warning` (`bash -n` only
parses), `caddy adapt --validate` on `Caddyfile.example` (`check-deployment.sh`
already runs this on the live config, and the file had uncommitted changes),
byte-identical Cloudflare range lists between the global `trusted_proxies`
block and the `@fromcf` matcher, the `@hidejudge` 404, reintroduction locks for
both injection classes above, and a wiring check that every state-changing POST
declares *and* verifies the CSRF token while every client sends it.

That last check earned its place immediately: it found that
`ShopManageSaveHandler` read a `csrf` argument it had never declared with
`@post`, so Hydro would not have populated it and admin pricing would have
failed on every submission. The handler tests stub the decorators as no-ops, so
only a check comparing declarations against call sites could see it.

### Known gaps

`scripts/subset_fonts.py` needs font TTFs that are not committed. The download
and regeneration steps are now documented in `landing/FONTS-LICENSE.md`,
including the caveat that the glyph set is a static scan of the HTML, so new
copy needs a re-run.

## v1.15.0 - 2026-10-04

### Fixed

- **The ranking board showed the signed-in user twice (`deploy/patch-ranking-template.sh`).** Upstream `ranking.html` renders the viewer's own rank row above the list unconditionally, so the #1-ranked member saw themself duplicated and the numbering read 1, 1, 2, 3... The pinned row is now skipped while the viewer's stored rank already falls inside the current page's window — it still pins on later pages and for members without a rank, keeping the upstream "show my position" intent. The patch is idempotent and marker-based so a ui-default upgrade can be repaired by re-running the script, which fails loudly if the upstream anchor moves. The condition is deliberately pure arithmetic: the bundled nunjucks build has no `namespace` global, no `map` filter, and crashes on attribute assignment in `{% set %}`.

## v1.14.0 - 2026-10-04

### Added

- **Self-enforcing service-account hygiene (`plugin-dfacm-ops`).** The v1.12.0 incident root cause — the RP script scores `document.status`, not `record`, and `calcLevel` writes the stored rank without filtering `join`, so one leftover solved-status row for the judge service account (hydsvc-0074) resurrected phantom RP and displaced every real member — is now guarded by the system instead of a human memory item: every RP recalculation purges service-account rows from `document.status` before computing (aborting the run, not computing on a dirty source), the live hook deletes a service account's just-written status row on sight, and the purge list is configurable via `SWPU_SERVICE_UIDS` (default `3`, empty disables). The judge account's `record` rows are deliberately left alone — they are debugging evidence and do not feed RP.
- **Every member reaches the ranking boards, whatever created the account (`plugin-dfacm-ops`).** The v1.12.0 auto-join covered only `/reg/complete`; a GitHub (or any OAuth) first login funnels into Hydro core's `UserRegisterWithCodeHandler`, which sets no join flag, and admin-created accounts don't either — such members stayed invisible on `/ranking` even after solving (surfaced by the owner's own GitHub-registered account missing its poj membership). Two layers close the gap: the plugin now hooks Hydro's serial `auth/login` event — the chokepoint every login and registration path ends in (`SWPU_AUTO_JOIN=0` to disable) — and joins the member to `system` + `poj` on sight with existing roles preserved, and the hourly sweep reconciles every member's join flags (missing domain docs inserted with the default role, service accounts excluded).
- **Hourly RP sweep (`rp-sweep.cjs`).** Mutations that bypass the record flow — contest deletion, admin edits, manual database fixes — fire no events, and Hydro's own `task.daily` only recomputes at 03:00. The sweep reruns the RP script for all domains every hour (3-minute startup delay past the 75-second readiness window, pm2 instance 0 only, `SWPU_RP_SWEEP=0` to disable, serialized with the live path through a shared lock so two RP computations never overlap), bounding out-of-band staleness to one hour.
- **`swpuRpSweep` admin script** — `hydrooj cli script swpuRpSweep '{}'` performs an immediate purge + full-domain recalculation after out-of-band data fixes, replacing the hand-typed `rp` CLI invocation.

### Fixed

- The shop plugin asked MongoDB to create an explicit `_id` index on `swpuBadgePrice` at every boot; Hydro's `ensureIndexes` injects `background: true`, which MongoDB rejects for `_id` specifications, so each restart (and every CLI invocation) logged an index error. The call was dead weight — the `_id` index is implicit — and is removed; the ledger's idempotency indexes are untouched.

### Removed

- The landing page's “最快一次评测 2.5ms” stat. The 2.5ms came from a judge test submission whose records were removed in the v1.12.0 cleanup, leaving the headline number unattributable to any real member; the stats row now shows three cells. `scripts/landing.test.cjs` locks the removal.

## v1.13.0 - 2026-10-04

### Added

- **Points shop (`plugin-dfacm-shop`)** — badges become something you earn and spend. Every problem's first AC credits 1–10 points by difficulty (the same algorithm Hydro's RP script uses, ported verbatim from `lib/difficulty.ts`), and admins put badges on sale at `/manage/shop` for members to redeem with their balance at `/shop` (guest-browsable). Redemption reuses the installed badge-for-hydrooj model for ownership (`userBadgeAdd`) — no fork, no modification; wearing still happens on `/mybadge`.
  - Idempotency is index-backed: `swpuPointsLedger` has a unique `{uid, ref}` key (`solve:{domainId}:{docId}` per solve, `redeem:{badgeId}` per redemption), so resubmissions, event replays and double-spend races can never double-credit; inserts that hit the key are silently absorbed.
  - `/shop/history` shows the full ledger with a running balance (prefix sums across pages, 20/page); balance is a live `$sum` aggregation — the site is small, no cache yet.
  - `swpuShopBackfill` script replays historical AC records (`kind: 'backfill'`, same idempotency key, safe to rerun); the `record/change` hook awards live, pm2 instance 0 only, error-isolated from judging.
  - New collection prefix `dfacm` (`swpuPointsLedger`, `swpuBadgePrice`); no new npm runtime dependencies; covered by 21 unit tests plus deployment wiring assertions; smoke battery gains `/shop` 200, badge-table render and the `/shop/history`, `/manage/shop` guest gates.

## v1.12.0 - 2026-10-04

### Fixed

- **New students were invisible on the ranking board.** Hydro lists only domain users with `join=true`, and neither native registration nor `UserModel.create` sets that flag — it normally only comes from an explicit domain join or an admin role assignment, so members could solve problems and still never appear on `/ranking` (or `/d/poj/ranking`). `/reg/complete` now auto-joins the system domain and the POJ mirror via `DomainModel.setUserRole(..., 'default', true)` right after account creation, so the boards pick members up as soon as they solve something. Existing members were joined on the server during the fix.
- Server ops (not in-repo): the hidden judge account still carried solved-problem statuses in `document.status` — the earlier cleanup removed its `record` rows, but Hydro's RP script (`src/script/rating.ts`) scores `document.status`, not `record`, so every recalculation resurrected phantom RP=40 and rank 1 for it, pushing each real member's stored rank down by one (the only human on the board showed rank 2 while topping the visible list). All residue (problem statuses in both domains, a training-plan enrollment, mistake-book rows) was deleted with backup and ranks recomputed; operating rule: never let the judge account AC a problem, or clean its `document.status` afterwards.

## v1.11.0 - 2026-10-04

### Added

- **Session-aware landing page.** The static homepage no longer greets signed-in members with “登录 / 注册账号”: since `sid` is HttpOnly and `home.html` is served straight from Caddy, the page now probes an SSR route (`fetch('/p')`, same-origin) for the nav markers Hydro renders — `nav_login` for guests, `nav_logout` plus the `<a href="/user/<uid>" class="nav__item">` link for members (verified against the live template). Members see their username linked to their profile, a 工作台 pill in place of 注册账号, a “欢迎回来” hero line, and matching mobile-menu entries; a 1-hour `sessionStorage` cache paints returning visitors without waiting for the probe and rolls back if the probe reports guest. Covered by `scripts/landing.test.cjs` (vm sandbox over the shipped script: wiring lock, member, guest, stale-cache rollback, expired cache, displayName variant and fail-safe paths).

### Fixed

- Landing stats had drifted from reality: “4 判题语言” (29 languages are selectable on local problems, verified on A+B) and “8.1ms 最快一次评测” (a 2026-10-04 AC on problem 4326 judged in 2.5ms, verified in `db.record`). Both refreshed; the display font subset was regenerated (440 → 545 CJK), which also restores display-font glyphs for onboarding copy added by the frontend merge.

## v1.10.0 - 2026-10-04

### Added

- **One-command deployment orchestrator (`deploy/deploy.sh`)**, run from the local checkout: ships every file (plugins, landing, theme assets, smoke script) before the single `pm2 restart hydrooj`, verifies sha256 on both ends and refuses to restart on mismatch, waits until the new process serves the branded page, then runs the smoke battery. `--sync-only` skips the restart for static-only changes. Exit codes: 64 usage, 65 hash mismatch (never restarts), 66 missing source/unreachable server, 67 not ready within 75s, 68 smoke failed. Plugin file lists are parsed from `deployment.md`'s documented `cp` blocks so the docs and what ships can never drift.
- **Anonymous smoke battery (`deploy/smoke.sh`)**, executed on the server after every deploy via loopback `--resolve`: server-side boot injection markers (tab/embed/oauth), bare `/login` and `/register` convergence, guest gates, regcode bad-purpose rejection, framing/HSTS/cache headers, the 404-without-cache regression, HTTP→308 and the Service Worker killswitch. Count-agnostic — no hardcoded problem totals.

### Fixed

- Root cause of the 2026-10-04 audit finding: the live process had been serving pre-merge plugin code because files landed after the previous restart. The orchestrator's sync→verify→restart order makes that structurally impossible, and the smoke battery would have caught the missing OAuth injection within seconds.
- Server ops (not in-repo): daily backup cron restored (root crontab was empty since Oct 2), pm2 log rotation installed, orphan `custom/reg.html` removed, stale `swpu-regcode/package.json` synced.
- **Judge account profile page returned 500 for every visitor since account creation**: the 2026-10-01 Mongo-clone that created the judge user stored `regat` as a plain `{$date: ...}` object instead of a BSON Date, crashing the `user_detail.html` template's `dt.getTime()`. Fixed in the database; the smoke battery now locks a user profile page render so this class cannot regress silently again.
- **`hydrooj-rating-system` had silently dropped out of `addon.json`** (lost when the list was rewritten to register `swpu-train`), making `/rating` 404. Re-registered and verified. Note for contest organizers: the plugin's `contest/finish` auto-hook is an upstream stub — ratings are managed via its `/manage/rating*` CSV workflow.

### Added (ops runbook)

- `docs/upstream-issue-regcode-content-type.md`: ready-to-file upstream draft for the framework `@post` decorator crashing with a 500 TypeError on unparseable request bodies instead of a 400.

## v1.9.0 - 2026-10-04

### Added

- **Personal training workbench at `/workbench`** (plugin `swpu-train`, from PR #4): enrolled plans with progress, the next unfinished problem in the current chapter, this week's training stats (Asia/Shanghai week, non-contest submissions) and recently failed problems, so returning users can resume training directly.
- **Mistake book at `/mistakes`**: judged failures (WA/TLE/MLE/OLE/RE/CE) are collected automatically per problem, with editable error reason, review notes and re-solve status; a later AC marks the entry resolved. First visit backfills from recent submissions; contest finals are included, pretest/generate excluded. `SWPU_TRAIN_MISTAKES=0` disables live collection.

### Fixed

- Reject external, backslash and control-character auth return paths on the branded page; password login now submits an explicit safe redirect instead of returning to its Referer.
- Add a visible native two-factor/passkey login entry and top-level OAuth/password-recovery links; retain inputs and restore controls on login failure or timeout.
- Serialize live RP recalculations and coalesce changes arriving during a slow run. Ignore progress, pretest and generation events, bound diagnostic history, and stop queued work when the addon unloads. `SWPU_LIVE_RP=0` disables live recalculation.
- Include `live-rp.cjs` in the documented addon installation. Theme deployment now validates all targets before writing, creates unique backups even on first install, preserves minified CSS without a trailing newline on reinstall, and verifies installed assets.
- Set the light system default without resetting users' choices; initialize missing footer configuration safely and idempotently.

### Tests and documentation

- Add page-script regression tests and slow-RP, disposal, fresh-install and theme-reinstall scenarios; pin development dependencies with an npm lockfile and use `npm ci` in CI.
- Cover mistake-book collection/backfill, workbench assembly and route wiring with unit tests.
- Synchronize theme filenames, default behavior, addon write effects and development/deployment instructions.

## v1.8.0 - 2026-10-04

### Fixed

- **Auth overlay escape routes are usable from the first frame** (`deploy/clean-auth-entries.js`): while the embedded `/reg` iframe loads, the shell now shows a close ✕ and a 「直接打开登录页」 link immediately instead of a blank dark box; a failed/stalled load (10 s) falls into an error state that keeps both. The direct link now opens the **top-level `/reg` without `embed=1`** — it previously carried the embed flag, so the top-level page booted in iframe mode where the in-card ✕ and the `swpu-auth-success` postMessage had no host to receive them (close and login relay both dead). The iframe success check now requires a `/reg`-specific DOM marker (`#tab-reg`) instead of "URL contains /reg and has a body", so a Caddy/Hydro error page served at the same URL can no longer be revealed as the login card. Closing the overlay also cancels the pending load timer. Verified the OAuth root cause on the way: `@hydrooj/login-with-github` concatenates `` `${server.url}oauth/github/callback` `` for the token-exchange `redirect_uri`, so the missing trailing slash on `server.url` (not the GitHub App callback, which is correctly registered without one) was what broke the exchange — the live config already carries `https://swpuacm.xyz/`.

## v1.7.0 - 2026-10-03

### Added

- **GitHub third-party login is live** (official `@hydrooj/login-with-github` addon; OAuth App credentials configured in the server system config on 2026-10-03 — secrets stay server-side only). Verified end to end: the branded `/reg` page and the in-place auth modal render the button via the server-injected `loginMethods`, and `/oauth/github/login` redirects to GitHub's authorize page. First sign-in auto-creates the account (GitHub name/email, avatar as `github:<login>`).
- **Roles `acmer` and `teamleader`** on the system domain (permission equals builtin `default`, value `1370624076369558733505`); new users keep the builtin default role. Previous roles state backed up at `system.roles.backup-20261003`.
- System config `server.url` fixed from the retired `.bot.cd` domain to `https://swpuacm.xyz/` (the trailing slash is required by Hydro's OAuth callback concatenation; it feeds lost-password mail links and share links; the old value is backed up at `config.backup-20261003`). GitHub's registered callback remains `https://swpuacm.xyz/oauth/github/callback` without a trailing slash.

## v1.6.0 - 2026-10-03

### Added

- **Live RP ranking** (`plugin-dfacm-ops/live-rp.cjs`): Hydro only recalculates RP in `task.daily` (03:00), so a freshly solved problem took until the next night to show on the ranking page. The ops plugin now listens on `record/change` and reruns the domain `rp` script ~30s after a judged submission (debounced — a contest burst yields at most one run per window; registered on pm2 instance 0 only; idempotent with the daily task). The `swpu-ops` addon is now actually deployed to the server (it previously existed only in the repo) and keeps a replay copy in `/root/swpu-theme-deploy/plugin-dfacm-ops/`.

### Fixed

- `hydrooj-rating-system` disabled and removed from `addon.json` (data and directory retained for re-enable); the stale `unify-login-entries.js` hijack installer was removed from the server replay dir so it cannot resurrect the old modal-redirect; merged branches `pr-1`/`pr-3` and the stale `oj-frontend-preview` worktree deleted; dead `dialog--signin` theme rules removed.

## v1.5.0 - 2026-10-03

### Changed

- **Login is now clean — no forced redirects, no native auth UI anywhere.** Caddy serves the branded `/reg` page *in place* at the native auth URLs (`rewrite` instead of `302`): bare `GET /login` renders the branded page with the password tab active at the same URL, bare `GET /register` renders it with the register tab. `POST /login`, `GET /login?...` (two-step flows) and `POST /register` / `/register/<token>` still pass through untouched. The rewritten `?tab=pwd` reaches the regcode plugin through Hydro's merged handler args, which boots the right tab via an injected `window.__SWPU_BOOT` script (the browser URL keeps no query after a rewrite).
- **Every login-required trigger now opens the branded page itself, in place.** `deploy/clean-auth-entries.js` replaces Hydro's global `showSignInDialog()` with an overlay that embeds `/reg?embed=1` (same-origin iframe, compact card layout); the native `dialog--signin` is never shown (and hidden + replaced if it ever slips through before the hook applies). The header 登录 button — whose jQuery handler bypasses the global function — is intercepted at capture phase on `[name="nav_login"]`. On mobile Hydro navigates to the nav href, which now points at the branded page anyway. The embedded page posts `swpu-auth-success` / `swpu-auth-close` to the host: success navigates the host to the `return` path (site-relative only, validated), so users land back where they started, logged in. Close via the in-card ✕, Esc, or clicking the backdrop. `/reg` alone is downgraded to `X-Frame-Options: SAMEORIGIN` / `frame-ancestors 'self'` (two disjoint header matchers — a later `header` line cannot override the catch-all block); every other route keeps `DENY` / `frame-ancestors 'none'`.
- `/reg` noscript fallback links now point at `/login?fallback=1` / `/register?fallback=1` so they still reach the native pages after the rewrite.
- Password login on `/reg` now distinguishes outcomes by response status: 403/401 (and a bare `/login` render) mean wrong credentials; any other non-2xx reports the status instead of mislabeling, and two-step-verification redirects navigate to the native 2FA step as before. Hydro renders `footer_extra_html` line-by-line inside `<ol>` items, so multi-line scripts are shredded into inert text — every installed script stays on one line (the historical multi-line `/login` banner script never executed; its remains are removed and the feature reinstalled as a single line).

## v1.4.0 - 2026-10-03

### Changed

- The site now has exactly one login interface. Bare `GET /login` is redirected (302) to `/reg?tab=pwd` by Caddy — `POST /login` and `GET /login?...` (two-step verification flows) pass through untouched. Hydro's in-page login modal (`dialog--signin`, shown on restricted pages when signed out) is intercepted by a footer script (`deploy/unify-login-entries.js`) and replaced with a redirect to `/reg?tab=pwd&return=<current path>`; `/reg` honors the `return` parameter (site-relative paths only) on both the code-login and password-login success paths, so users land back where they started.

## v1.3.0 - 2026-10-03

### Added

- `/reg` is now a one-stop auth page with a third `密码登录` tab: the form posts natively to Hydro's `/login` (uname/password/rememberme plus the tfa/authnChallenge hidden fields), enhanced with a seamless fetch submit that detects success by the final URL (wrong credentials return 403 on `/login`; success redirects away, including two-step-verification flows). The footer links switch to the password tab in-page and point lost-password to `/lostpass`; landing page login links now target `/reg?tab=pwd`. Verified end to end with a temporary user (created, logged in via POST /login with session cookie, preference page 200, deleted).

## v1.2.0 - 2026-10-03

### Changed

- Default theme switched from forced dark back to Hydro's native light; every user can pick Light/Dark in preferences again (`preference.theme` system key removed, per-user `theme` fields cleared, `ui-default` default restored to `light`).
- Brand overlay rebuilt as `theme/00-brand.css` covering both modes: shared base (brand fonts, buttons, active menu, table/markdown readability, focus rings), dark specifics (dark nav, body contrast, immersive auth pages) and new light specifics (white nav with gold edge, deep-gold highlights for AA contrast, light table headers, light immersive auth gradient). Replaces the dark-only `00-native-dark-brand.css`.

### Added

- Footer theme toggle injected via `ui-default.footer_extra_html`: signed-in users get a one-click `白天 / 夜间` switch hitting `GET /set_theme/:theme` (redirects back, guarded by `PRIV_USER_PROFILE`); guests are pointed at the login flow instead.
- Landing page dual-theme: default light with the full CSS variable set re-based for day (deep-gold accents, light ridges/mountains, white cards), `html.dark` carries the original night look; day/night toggle button in the nav (and mobile menu) persisted in `localStorage 'swpu-theme'` with a head-level anti-FOUC script; the OJ footer toggle now writes the same key so the landing page follows the OJ choice (`deploy/update-footer-toggle-sync.js`). The judge terminal card intentionally stays dark in both modes; `meta theme-color` follows the active mode.
- Fixed the immersive auth pages (login/register/lostpass): the native full-page backdrop lives on `.layout--immersive #panel` (an ID selector that outranks any class combination), so the brand overlay now targets `#panel` for both modes — light gets the soft gradient panel with all native inverse white text re-based for day (labels, inputs, checkboxes, supplementary links, footer), dark keeps the brand gradient and now actually clears the leftover native wallpaper image.

## v1.1.0 - 2026-10-03

### Security

- `swpu-regcode` stores verification codes as salted SHA-256 digests instead of plaintext, binds each code to its salt/generation/UID/purpose, and consumes it with an atomic `findOneAndDelete` so concurrent requests cannot reuse one code.
- Login codes are only sent to the account's bound mailbox; registration codes are bound to the exact delivery address that received them.
- `swpu-regcode` now runs Hydro's login policy checks (disabled account, `server.login`, two-factor/passkey accounts, contest-mode IP binding) before issuing and before consuming a code, and emits `auth/before-login`, `user.loginSuccess` and `auth/login` with codes/passwords stripped from the audit record.
- Real client IP resolution (direct peer wins, loopback falls back to the proxy-written XFF) is used for rate limits, login records and contest IP binding.
- Caddy cache headers now apply only to successful static responses; `/home.html` keeps `no-cache` after the `/` rewrite and `/resource/*` keeps Hydro's own policy. Requires Caddy 2.9.1+ for `header ... { match status 2xx }`.

### Added

- `plugin-dfacm-ops`: read-only admin scripts for weekly training reports (CSV/Markdown) and judge health summaries (Markdown/JSON), registered with Hydro's `PRIV_EDIT_SYSTEM` + sudo script permissions and no HTTP routes.
- `scripts/backup-hydro.sh`: locked, non-destructive backup wrapper around `hydrooj backup --withAddons` with ZIP validation, sidecar state archives, checksums and offsite/restore guidance.
- `scripts/check-deployment.sh`: read-only deployment checks with `--role web|judge` and opt-in HTTP cache verification.
- Handler-level regression tests for `swpu-regcode` and `deploy/deployment.md` sections on backup/restore, deployment checks and manual judge acceptance.

### Repository

- CI now installs the regcode test dependency, runs the regcode handler tests, the ops plugin tests and the deployment script tests.

## v1.0.0 - 2026-10-03

### Security

- `swpu-regcode` now uses `crypto.randomInt` for six-digit codes.
- Verification codes are bound to their `purpose` (`reg` or `login`).
- Failed attempts are counted with an atomic MongoDB update, so concurrent guesses cannot bypass the five-attempt limit.
- Code verification checks `expireAt` explicitly instead of relying only on delayed TTL cleanup.
- Client IP extraction uses `request.ip` for direct connections and only trusts the first `X-Forwarded-For` entry when the direct peer is loopback.
- Caddy adds HSTS, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, `X-Frame-Options` and a minimal `Content-Security-Policy`, and overwrites client-supplied XFF.

### Changed

- Landing page finishes the `swpuacm.xyz` migration and adds canonical, Open Graph, Twitter card and icon metadata.
- Registration front end handles fetch/network failures without leaving buttons stuck in a loading state.
- Theme direction is now Hydro native Dark plus `theme/00-native-dark-brand.css`; 01-05 remain as legacy fallback.
- `deploy/install-landing.sh` installs `index.html` as `home.html` and flattens `landing/assets/*`.
- `deploy/install-theme.sh` applies the brand overlay idempotently and supports the legacy overlay set via `SWPU_THEME_LEGACY=1`.
- Deployment docs cover reverse-proxy IP handling, security headers, plugin symlink caveats and reproducible installs.

### Repository

- Added plugin unit tests for code format, expiry, purpose binding and verification filters.
- Added GitHub Actions CI for secret scanning, plugin tests, retired-domain checks, shell syntax and Python compilation.
- Added `.gitattributes` and ignored local secret/QA files.
