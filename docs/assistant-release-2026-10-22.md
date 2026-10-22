# 题目助手浮窗上线记录

最新版本为 2026-10-23 的交互逻辑优化，已上线；题目页资源 `/resource/6b18c13d/entry.js`。下面保留各次发布的历史证据，当前使用步骤见 [插件说明](../plugin-dfacm-assistant/README.md)，最新证据见 [交互记录](#交互逻辑优化2026-10-23)。

2026-10-22，用户要求集成到 OJ 查看效果，已将 `plugin-dfacm-assistant` 独立安装到线上 Hydro，开启题目与提交详情页入口。[登录后打开 A+B 题目](https://dfacm.website/p/P1000)，点击右下角“题目助手”展开，再次点击收起；窗内可选择题解、诊断或粘贴代码。

本次上传 47 份插件、前端、模板及 Skill 文件。暂存目录和安装目录均完成 SHA-256 对账，服务器 esbuild 0.25.2 验证后端和 Hydro 原生前端构建，完整 Skill 资源成功加载。注册 `/root/.hydro/addons/dfacm-assistant`，保留原 addon 清单，通过 Mongo 设置 `dfacm_assistant.enabled=true`，随后执行一次 `pm2 restart hydrooj`。

验证结果：

- Hydro 5.0.7、ui-default 4.58.5、Node.js 24.21.0 成功加载插件，原生构建包含浮窗 JS/CSS，模板初始化成功。
- 真实 Hydro 用户与题目模型验证登录用户的题目页入口注入；页面配置只含模式、同源 endpoint 和 CSRF。
- 公网 `/p/P1000` 及 `/resource/434867ee/entry.js` 均返回 200，新版资源包含浮窗前端。
- 三次连续就绪检查和站点 46 项发布检查通过；助手接口访客请求跳转登录，Mongo 任务 TTL 索引与启用设置正确。
- hydrooj（本次重启 PID 164112）与 hydrojudge（PID 115832）均为 online。此次未重启评测服务。

本地插件测试此前为 45/45、原生构建和仓库文档测试通过。本轮未用浏览器绕过此前的访问拒绝，未完成浏览器视觉验收。模型 Key 未配置，未发送真实 AgentRouter 请求；当前上线目的为查看浮窗样式和交互。

安装前备份目录为 `/root/backups/assistant-before.UrtOpBeK`，权限 700，保存原 addon 清单与原启用设置。回退可通过 `hydrooj addon remove /root/.hydro/addons/dfacm-assistant` 后重启 Hydro，或关闭系统设置中的“开启题目助手”。当前通用 `deploy.sh` 未包含此插件，后续需单独更新。

## 同日浮窗样式更新

根据用户“感觉丑丑的”反馈，改为简洁工具窗。初始宽 400px，高度随内容收缩，题解和诊断分为两项卡片入口；标题显示当前题目，底部显示状态及 Esc 提示。粘贴代码或生成时入口缩成紧凑按钮，结果就绪后扩大阅读区至最大 460×560px。配色与 OJ 品牌蓝一致，收起、关闭、保留代码、阅读位置及后台任务的行为保持可用。

本轮仅安装 `frontend/panel.js` 和 `frontend/assistant.css`。安装前核对原 47 份文件的哈希，暂存及安装后核对两份新版文件，服务器原生前端构建通过，再执行一次 `pm2 restart hydrooj`。旧前端备份到 `/root/backups/assistant-ui-before.W1meixr1`，权限 700。

本地 45/45 插件测试和原生构建通过，覆盖初始、输入、生成、结果四种窗口状态与原有展开收起行为；本地预览已提供新版 JS/CSS。线上连续三次就绪检查、站点 46 项发布检查通过，题目页实际加载 `/resource/3a153d89/entry.js`，包含新版结构和 CSS。hydrooj PID 165057、hydrojudge PID 115832 均在线，评测服务未重启。服务器验证目录为 `/tmp/dfacm-assistant-ui-verify.kqzkOBLH`，部署证据保存在本地忽略目录 `qa/assistant-deploy/`。

本机 HTTP 请求公网题目页返回 403，本轮新版资源的验证来自服务器回环地址；此前的公网 200 记录属于首次上线。浏览器访问拒绝仍遵守，未进行视觉验收。模型 Key 未配置，未发送实际模型请求。登录后打开 [A+B 题目](https://dfacm.website/p/P1000)，按 Ctrl+F5 刷新查看新版浮窗。

## 个人供应商与 API Key

按用户要求增加个人供应商。标题栏“模型设置”支持站点默认、AgentRouter 和自定义供应商，个人配置填写 API 地址、模型与 Key；应用设置不调用模型，题解和诊断使用选定供应商的个人额度。默认只在页面内存保存，用户可选择在当前账号的标签页 `sessionStorage` 记住配置，或清除个人配置。自定义供应商需兼容 Chat Completions、JSON 输出和工具调用。

个人 Key 通过同源请求头交给 OJ 后端，在生成期间用于供应商鉴权，不写入数据库、任务输入或页面配置；轮询不携带 Key，个人请求不回退到站点 Key。结果缓存区分供应商、模型和 Key，页面任务恢复及个人配置按账号和域隔离。自定义连接限制为公网 HTTPS，在连接时核对 DNS 地址，不跟随重定向。站点启用、权限、比赛限制和并发设置继续生效，站点 Key 未改动。

本轮上传八份后端及前端文件，安装前核对上一版 47 份文件基线，暂存及安装后核对修改文件 SHA-256，服务器后端和 Hydro 原生前端构建通过。完整旧插件备份到 `/root/backups/assistant-provider-before.Oh7kvxH4`，权限 700。首次重启后 SSH 断开，重新通过短命令核实文件和服务；最终同步账号隔离与配置清除修正并再次重启，本轮总计重启 hydrooj 两次，hydrojudge 未重启。

验证结果：本地 58/58 插件测试和原生构建、仓库文档测试通过；覆盖个人 Key 在题目页及提交页调用、站点无 Key 的情况、账号隔离、错误提示、缓存区分、DNS 检查和重定向处理。线上三次连续就绪及 46 项站点检查通过。题目页实际加载 `/resource/9e91c1e9/entry.js`，含供应商设置和 Key 请求头逻辑。真实 Hydro 用户/题目模型及原生参数校验通过，缺少个人 Key 和过期 CSRF 均在生成前拒绝。hydrooj PID 166331、hydrojudge PID 115832 在线。

服务器验证目录 `/tmp/dfacm-assistant-ui-verify.CLdkGiwx`；本地证据仍位于忽略目录 `qa/assistant-deploy/`。本轮使用模拟供应商响应，没有真实个人 Key，未发送实际模型请求；浏览器视觉验收仍未完成。具体使用步骤见 [插件说明](../plugin-dfacm-assistant/README.md#使用自己的供应商)。

## 按钮分区布局修复

根据用户“按钮分区互相侵占”反馈，调整浮窗按钮区的宽度约束。标题栏改为标题与窗口控件两列，窗口控件保留独立列宽；紧凑模式的题解、诊断改为两列等宽网格，文字在各自按钮内换行。设置页的清除、应用按钮分列并增加上方分隔线；屏幕不超过 360px 时，紧凑入口与设置操作上下排列。此次修改仅涉及插件 CSS，保留原窗口与供应商配置逻辑。

本地 59/59 插件测试、前后端构建及 8 项仓库检查通过。新增回归覆盖设置页在最小化、关闭、悬浮入口收起、重新展开、应用个人配置及切回站点默认时与结果页保持分离，保留草稿代码、供应商字段、结果和阅读位置，操作不新增生成请求。本地预览的题目页、提交页与新版 JS/CSS 均可访问，样式哈希与源码一致。

安装前核对 50 份线上文件基线，服务器暂存样式与后端、原生前端构建通过；旧样式备份到 `/root/backups/assistant-layout-before.BEMtQn59`，权限 700。只同步 `frontend/assistant.css` 后重启 Hydro 一次，题目页加载 `/resource/4d03e56b/entry.js`，新版网格和窄屏规则已包含在资源中。三次连续就绪检查、原生供应商参数验证及 46 项站点检查通过，最终 50 份文件哈希核对通过；hydrooj PID 201192、hydrojudge PID 115832 在线。

验证目录为 `/tmp/dfacm-assistant-ui-verify.OhrrTMub`，部署证据位于本地忽略目录 `qa/assistant-deploy/layout-deployment.json`。未发送实际模型请求，未进行浏览器视觉验收。登录后在 [题目页](https://dfacm.website/p/P1000) 按 Ctrl+F5 刷新查看。

## 两种个人供应商与邀请注册

按用户要求，浮窗供应商选项仅保留 AgentRouter 和自定义供应商。默认选中 AgentRouter，预填 API 地址与 `deepseek-v4-flash`；AgentRouter 选项下方提供 [注册 AgentRouter（邀请链接）](https://agentrouter.org/register?aff=SeEq)，在新标签页打开。未配置个人 Key 时点击题解或诊断会打开设置，不创建任务；清除配置恢复 AgentRouter 默认地址和模型，需要重新填写 Key 并应用。已有个人配置的保存、恢复、账号隔离与窗口内容保留继续生效。

本地 61/61 插件测试及原生构建、8 项仓库检查通过，包含两种供应商、邀请链接地址及新标签页属性、缺少 Key 时打开设置、清除未应用 Key，以及 AgentRouter/自定义配置切换。服务器核对 50 份文件基线、三份新版前端文件与前后端构建通过。发布连接首次中断后，核实尚未安装且服务在线，随后完成备份和安装，重启 Hydro 一次。备份目录 `/root/backups/assistant-invite-before.ktig5I8M`，权限 700。

题目页已加载 `/resource/5f30dbea/entry.js`，包含邀请链接及保留的按钮网格样式；最终 50 份文件哈希核对通过。三次连续就绪、原生供应商参数校验及 46 项站点检查通过，hydrooj PID 212743、hydrojudge PID 115832 在线。验证目录 `/tmp/dfacm-assistant-ui-verify.bAsOsUPq`，本地证据 `qa/assistant-deploy/invite-deployment.json` 根据成功的远程验证输出保存；随后读取服务器证据文件的 SSH 连接超时，不影响已完成的验证。没有发送真实模型请求或访问注册页面，浏览器视觉验收仍待完成。

## AgentRouter 官方 Codex 接入

根据用户“需要套一层 Codex 或 Claude”的说明，个人 AgentRouter 调用由 Chat Completions 改为官方 Codex CLI 0.163.0 的 Responses 通道，模型继续使用 `deepseek-v4-flash`。自定义供应商保持原公网 HTTPS Chat Completions 方式。此次实现使用真实官方客户端；没有伪造客户端请求头。此前无 Key 的 `/v1/models` 探测返回 `unauthorized client detected`，只能证明该请求被客户端规则拒绝，不能据此断言用户 Key 有效。

AgentRouter 的 [Codex 接入指南](https://agentrouter.org/docs/codex.html) 指定 `wire_api="responses"` 和 `env_key="CODEX_GATEWAY_API_KEY"`。OpenAI Docs 技能用于核对接入方向；本环境访问 OpenAI 开发者文档返回 403，未将其称为已验证。具体配置依据固定版本的官方源代码配置 schema、工具注册逻辑与实际 CLI 验证。运行环境从 npm 官方包 `@openai/codex@0.163.0` 安装到独立目录 `/root/.hydro/assistant-runtime/codex-0.163.0`，未在 addon 目录安装依赖。

每次调用使用权限 700 的临时目录，Key 只交给子进程环境，不进入参数、配置文件、模型输入或数据库。CLI 跳过已有用户配置和登录，使用临时认证，关闭会话历史、日志导出与遥测。模型的命令执行、文件编辑、浏览器和多智能体工具关闭；独立只读 MCP 只允许读取最多两个白名单算法模板。完成、错误或超时均清理临时目录。错误分别报告客户端接入拒绝、Key 鉴权、额度不足、限流和客户端缺失，不返回原始错误正文；失败不自动重试。缓存增加传输方式标识，设置页增加 Codex Key 权限说明，浮窗布局与邀请链接保持可用。

验证结果：本地 71/71 插件测试、前后端原生构建和 8 项仓库检查通过。Windows 和服务器 Debian 均以真实 CLI 连接本地模拟 Responses 网关，题解、原行号诊断、模板工具、客户端限制、Key 错误、限流、超时和中断八种场景通过；核对凭据未进入参数、模型输入和运行文件，工作目录无模型产物、无认证文件或会话历史。两条 Hydro 原生路由验证 Key 仅进入客户端环境且不落库。上述测试未调用真实模型、未使用真实 API Key。

安装前核对上一版 50 份线上文件及五份修改文件 SHA-256，服务器暂存插件构建和真实 Linux 客户端模拟验证通过。安装官方运行环境的连接超时后，先确认固定版本已完成安装且旧网站仍在线，再继续插件发布。完整旧插件备份到 `/root/backups/assistant-codex-before.iElQQnHh`，权限 700；同步三份已有文件并新增 `codex-client.cjs`、`template-mcp.cjs`，重启 Hydro 一次。

题目页现在加载 `/resource/da5da5a7/entry.js`，三次连续就绪、原生个人配置参数验证及 46 项站点检查通过；最终 52 份 addon 文件哈希通过。已安装插件再次通过真实客户端的八种模拟场景。hydrooj PID 236253、hydrojudge PID 115832 在线。服务器验证目录 `/tmp/dfacm-assistant-ui-verify.4PvVA0mE`，本地部署证据 `qa/assistant-deploy/codex-deployment.json` 已读取并保存。

登录后在 [题目页](https://dfacm.website/p/P1000) 按 Ctrl+F5，进入模型设置，选择 AgentRouter、填写自己的 Codex 可用 Key、应用设置，再点击查看题解。没有用户真实 Key，最终供应商鉴权与模型生成仍需实际重试；本次也未进行浏览器视觉验收。

## 模型可用渠道与连接错误修复

用户继续反馈“连接失败，请稍后重试”。生产任务聚合中观察到一次 `UPSTREAM_ERROR`，旧实现未保留原始上游正文，因此无法还原该次失败的确切原因。通过线上官方 Codex 客户端、无效的诊断 Key 和不含用户数据的测试请求，真实 `/v1/responses` 返回 HTTP 401“无效的令牌”，适配器返回 `UPSTREAM_AUTH`，确认客户端可以连接到供应商并得到鉴权响应；这不代表用户真实 Key 有效。

2026-10-22 查询 AgentRouter 与其备用站的公开 `/api/pricing`，两者均 HTTP 200、`success: true`，模型列表包含 `gpt-5.6-sol`、`gpt-6-astra`、`gpt-6.1-sol` 和 `claude-opus-5-5`，未见 `deepseek-v4-flash`。供应商 [Codex 指南](https://agentrouter.org/docs/codex.html) 说明未知或下线模型可能返回 503“无可用渠道”。这是旧默认模型不可用的线索，不独立证明用户此次失败的原因，也不证明个人 Key 的模型分组权限。

用户明确选择“改用 gpt-5.6-sol”后，将共享默认模型更新为 `gpt-5.6-sol`，同步管理员默认值说明。设置页提示以个人账户可用模型为准；已保存 `deepseek-v4-flash` 时提供“使用 gpt-5.6-sol”按钮，点击只改变设置草稿，仍需应用设置，保留 Key。其他已保存个人模型与自定义供应商不自动覆盖，供应商选项、邀请链接和原按钮分区继续生效。

Codex 错误解析改为识别明确 HTTP 状态，避免把 URL、请求编号或 Key 中的数字判为鉴权错误；区分模型暂无渠道、503 服务不可用、502 网关异常、504 响应超时、连接中断，以及原有鉴权/额度/限流/客户端拒绝。终止事件中的 message、error、状态和附加信息在内存中提取，必要时由后续终止事件、错误项或 stderr 补充明确分类；非致命 CLI 警告不会丢弃完整答案。只返回并暂存固定安全错误码与提示，不返回原始正文，不自动重试。

本地 77/77 插件测试、前后端原生构建和 8 项仓库检查通过。真实 Windows 客户端与服务器 Linux 客户端均通过十二种本地模拟 Responses 场景：题解、原行号诊断、模板调用、客户端拒绝、Key 错误、限流、503 无渠道、503 服务不可用、502 网关错误、504 网关超时、生成超时和中断。检查失败请求各只调用一次，以及凭据不进入参数、文件或模型输入，临时目录均清理。新增页面回归验证旧配置显式切换、应用前不改变保存值、Key 保留、自定义模型不覆盖和具体失败提示。

发布前核对上一版 52 份文件基线，暂存新版五份文件并完成服务器构建、默认模型/错误分类校验与真实客户端模拟测试。完整旧插件备份到 `/root/backups/assistant-model-before.AxeFRxmI`（权限 700）。安装 `codex-client.cjs`、`provider-config.cjs`、`index.ts`、`frontend/provider.js` 和 `frontend/assistant.css`，仅重启 Hydro 一次，评测进程未重启。

题目页加载新版 `/resource/e4fd93e8/entry.js`，包含推荐模型、旧模型切换提示、邀请链接与保留的按钮网格。三次连续就绪、原生个人供应商参数校验与 46 项站点检查通过；最终 52 份 addon 文件 SHA-256 核对通过。安装后的客户端再次通过十二种模拟场景。Hydro PID 249392、评测 PID 115832 在线。服务器验证目录 `/tmp/dfacm-assistant-ui-verify.0XuClf4E`，本地 `qa/assistant-deploy/model-deployment.json` 状态为 `verified`，已取得服务器证据。

重试步骤：在 [题目页](https://dfacm.website/p/P1000) Ctrl+F5，展开题目助手并打开模型设置，选择 AgentRouter，确认模型为 `gpt-5.6-sol`；如保留旧模型，点击“使用 gpt-5.6-sol”。保留或填写个人 Key，点击“应用设置”后再点“查看题解”。当前无用户真实 Key，实际鉴权和模型生成仍需用户主动重试；未进行浏览器视觉验收。

## 账户 AI 设置上线（2026-10-23）

按用户要求，供应商配置已集成到 Hydro 原生[账户设置 → AI 设置](https://dfacm.website/home/settings/account#ai)，保留头像和基础资料表单。用户菜单提供“AI 设置”入口，题目助手浮窗显示账户配置摘要、设置链接和刷新按钮。供应商只保留 AgentRouter 与自定义，继续使用 `gpt-5.6-sol` 默认模型和原邀请链接。保存一次后，刷新、换题、重新登录或换设备均读取同一 OJ 账户的设置；题解和诊断由后端读取最新配置。原标签页配置可明确点击导入后再保存，成功后清除旧条目。

配置按全局用户 UID 存入独立 Mongo 集合 `dfacm_ai_accounts`，整份配置使用 AES-256-GCM 加密，认证绑定 UID 和 revision。Key 仅在保存时通过同源请求头传给后端，页面不回显，生成及轮询不携带 Key。修改模型可留空保留已保存 Key，更换供应商或地址需填写新 Key；CSRF 绑定账号，revision 防止多页面覆盖，管理员代登录不能读取或使用其他用户配置。后续插件可通过 `ctx.get('dfacmAi').getModelConfig(handler)` 复用当前认证账户的供应商。

本地 113/113 插件测试、前后端原生构建和 60 项仓库/部署/页面检查通过。服务器暂存验证核对原 52 份文件基线与 13 份更新，Linux 加密存储和设置接口 19 项测试通过；真实 Mongo 验证加密保存、跨 worker 读取、UID 隔离、原子版本冲突和原生设置 handler。完整安装版 TemplateService/Nunjucks 渲染头像、基础账户表单及新增 AI 区域通过，临时测试集合和密钥均已清理。

完整旧插件备份到 `/root/backups/assistant-account-before.7usGUCnb`（权限 700）。安装五份已有文件并新增八份文件，实际仅重启 Hydro 一次，评测进程未重启。首次脚本启动因 CRLF 换行失败，恢复前重新核对 52 份线上基线、八份新文件尚不存在及原进程 PID，确认未安装和未重启后修正脚本继续。

上线后题目页实际加载 `/resource/b47091e4/entry.js`，包含原生账户设置页面、浮窗摘要、邀请链接及原有按钮网格。三次连续就绪、账户路由登录限制、真实 Mongo/模板和原生页面 hook、站点 46 项检查及安装后官方 Codex 客户端十二种模拟场景全部通过；最终 60 份 addon 文件 SHA-256 核对通过。Hydro PID 268866、评测 PID 115832 均在线。服务器验证目录 `/tmp/dfacm-assistant-ui-verify.j8Tpd0VW`，本地证据 `qa/assistant-deploy/account-deployment.json` 为 `verified`，已取得服务器原始验证结果。

生产加密主密钥已安全初始化于 `/root/.hydro/secrets/dfacm-ai.key`（文件 600、目录 700），同时备份至本次私密备份目录的 `secrets/dfacm-ai.key`，未修改真实用户配置。后续数据库备份必须同时保存原主密钥；恢复时使用同一密钥，不能在已有账户记录时生成替代密钥。

使用步骤：登录[账户 AI 设置](https://dfacm.website/home/settings/account#ai)，选择供应商、填写模型和个人 Key，点击“保存 AI 设置”；返回[题目页](https://dfacm.website/p/P1000)按 Ctrl+F5，展开浮窗使用题解或代码诊断。当前没有有效的用户 Key，尚未验证真实供应商鉴权与生成；浏览器视觉验收也未完成，上述资源、模板和模拟检查不替代这两项验证。

## 浮窗、分层、诊断与生成状态优化（2026-10-23）

按用户选择的 2、3、4、5 完成并发布四项优化：桌面点击展开浮窗，手机使用底部抽屉，操作区固定、答案独立滚动；提示、思路、完整题解可直接选择，默认先给提示；诊断按 WA/CE/TLE/RE 使用对应分析路径，CE 支持实际编译日志，点击引用行号可展开、聚焦并高亮原代码；生成中显示实际阶段和耗时，完成后显示供应商返回的 tokens 和明确的缓存复用说明。账户供应商设置继续共用，切回本页已有答案、收起和重新打开不重复请求。

自定义 Chat Completions 优先使用 SSE 并兼容普通 JSON 响应，完整返回且经过筛选的题意、思路或诊断结论可提前显示，代码和问题行号等待最终校验。当前官方 Codex 0.163.0 的 `exec --json` 正文事件只在消息完成后出现；AgentRouter 保持这条实际客户端通道，显示真实阶段和耗时，未实现逐字正文输出。固定版官方源码与真实 CLI 模拟验证均确认此限制；未使用会改变客户端接入身份的其他通道。供应商没有返回可靠用量时显示未返回，CLI 默认全零统计视为未知，不估算费用。

本地完整插件测试 133/133 与前后端构建通过；之后 Codex 全零用量处理的小修正通过对应 12 项回归。最新服务器文件通过 48 项 Linux 后端测试、真实 Mongo 跨 worker 进度/任务/账户验证以及实际 Hydro TemplateService 渲染。新增 DOM 回归覆盖层级切换与本页复用、生成中收起、CE 日志和原行导航、手机遮罩/焦点/Esc/键盘可视区域；流式测试覆盖 UTF-8 分片、工具参数、真实多轮用量、响应中断、背压与取消，以及终态不被进度写入覆盖。

官方 Linux Codex CLI 连接回环模拟 Responses 网关通过 16 种场景：题解、代码诊断、模板工具、提示、思路、CE、流式输入、客户端拒绝、Key 错误、限流、模型无渠道、服务不可用、网关错误、网关超时、生成超时和中断。核对凭据隔离、实际 tokens、没有自动重试和临时目录清理；这些测试不使用真实用户 Key，也不请求实际供应商模型。

发布前核对全部 60 份线上基线文件及 15 份更新，服务器暂存构建和验证通过后，完整旧插件及原加密主密钥备份到 `/root/backups/assistant-optimizations-before.N1L5Ul`（权限 700）。保留 `/root/.hydro/secrets/dfacm-ai.key` 原值、文件 600 和目录 700；未修改真实账户配置。安装更新并新增 `progress.cjs`、`stream.cjs`，本轮仅重启 Hydro 一次（PID 271394 → 287778，重启计数 20 → 21），评测进程 PID 115832 未变。初次暂存上传超时后核实暂存不存在、线上基线正常，再继续传输，没有重复安装或重启。

上线后题目页加载 `/resource/2e8a1382/entry.js`，三次连续就绪、46 项站点检查、受保护路由、原生模板/账户/诊断验证和安装后 16 种官方客户端模拟场景通过；最终 62 份 addon 文件 SHA-256 对账通过。服务器验证目录 `/tmp/dfacm-assistant-ui-verify.N32zvZfd`；本地证据 `qa/assistant-deploy/optimizations-deployment.json` 为 `verified`，已取得远程原始结果。源技能与 OJ 副本的 36 份资源一致；历史导入 zip 和 `acm-demo` 未更新，不能作为本轮源码的逐字节副本。

登录[题目页](https://dfacm.website/p/P1000)按 Ctrl+F5，点击右下角“题目助手”，选帮助层级后点击生成；代码诊断可使用自己的失败提交或粘贴代码，CE 可补充实际编译日志。没有配置时先到[账户 AI 设置](https://dfacm.website/home/settings/account#ai)保存个人供应商。未进行浏览器视觉验收，也没有有效的用户 Key 验证实际鉴权和模型生成，以上部署、DOM、模板和模拟证据不替代这两项实测。

## 交互逻辑优化（2026-10-23）

按用户要求优化交互：题目讲解、代码诊断改为选择类型的标签，显示一个明确的主操作按钮。层级选择仅切换内容，不自动生成；已有结果主按钮只查看，另有“重新请求”。诊断来源明确选择最近失败提交或粘贴代码，输入框展开状态不再决定来源。手动代码默认还没评测，CE 可补充日志；空代码在本地提示，诊断完成收起输入，编辑代码/评测结果后旧诊断不作为新结果。提交详情页继续只分析当前原始记录。

讲解各层级和诊断来源分别保留答案 DOM、阅读位置及原码 details 展开状态。生成中可以切回旧结果，完成后提供查看结果入口，不抢走正在阅读的视图；窗口收起后悬浮按钮显示已就绪，重新展开可查看结果。重新请求失败保留原答案。轮询断网/临时服务错误保存原任务 ID，点击恢复原任务只查询 GET；过期后清理旧 ID并允许重新生成。设置摘要添加明确返回按钮，鉴权/模型配置错误可直接检查 AI 设置，手动诊断支持 Ctrl/Cmd+Enter。供应商、Key、缓存与生成接口保持原有实现。

本地 146/146 测试及前后端构建通过，新增 13 条交互回归。服务器独立临时目录安装固定版 DOM/渲染测试依赖后，54/54 前端测试通过；临时依赖未安装到生产 addon。实际 Hydro TemplateService、Mongo跨 worker 任务及账户加密兼容检查通过。安装后以真实线上合并脚本及模板、离线响应验证明确生成、旧 DOM/阅读位置、GET 恢复与粘贴来源；Hydro 的 `_hydroLoad` 包装及其他插件注册所需环境在验证工具中适配，没有浏览器访问或真实模型调用。

发布前线上 62 份基线一致，暂存构建通过。首次启动时旧发布记录的评测 PID 导致保护检查在备份/安装前退出；随后只读核实 Hydro PID 295634（计数23）、评测 PID 295662（计数4）、两服务在线、全部文件基线一致且 activation 不存在。更新保护检查为该次实际快照后继续，没有重复安装或重启，也未归因此前的外部进程变化。

完整旧插件与原账户加密主密钥备份 `/root/backups/assistant-interaction-before.85JJe6`（权限700）；只更新 `frontend/panel.js` 和 `frontend/assistant.css`。本轮 Hydro 重启一次，PID 295634 → 300695、计数23 → 24，评测 PID295662 未变。账户主密钥原值与600/700权限保留，未修改真实用户配置。线上资源 `/resource/6b18c13d/entry.js`，三次连续就绪、受保护入口、实际合并脚本/原生模板交互、46项站点检查及最终62份 addon SHA-256对账通过。

证据 `qa/assistant-deploy/interaction-deployment.json` 为 verified，已保存远程原始结果；服务器验证目录 `/tmp/dfacm-assistant-ui-verify.BtfQ0aj3`。本轮不改技能资源、模型协议或历史导入包。没有有效用户Key验证真实供应商生成，未进行浏览器视觉验收。登录[题目页](https://dfacm.website/p/P1000) Ctrl+F5，选帮助类型及层级/来源，再点击生成即可体验。
