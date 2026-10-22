# d&f算法网：OJ 题目助手

在 Hydro 题目页或提交详情页，点击右下角“题目助手”展开窗口。题目页先选择“题目讲解”或“代码诊断”：讲解默认提示，可直接选思路、完整题解，然后点击“生成提示/思路/完整题解”；切换类型和层级不请求模型。诊断先明确选择“最近失败提交”或“粘贴代码”，再点击对应诊断按钮；提交详情页始终分析当前记录的原始代码。提示仅给关键观察，思路解释算法和正确性理由，完整题解给 C++、复杂度与点评。

桌面使用浮窗，手机宽度不超过 640px 时使用底部抽屉，标题和操作按钮固定，答案独立滚动。手机展开时显示遮罩并隐藏悬浮入口，点击遮罩、向下拖动顶部把手或按 Esc 收起；关闭后入口恢复。抽屉适配软键盘可视区域并限制键盘焦点。讲解各层级与两种诊断来源分别保留结果、阅读位置和原代码展开状态；切回已有结果立即复用，主按钮仅查看，另有“重新请求”使用当前配置（仍可能命中 OJ 缓存）。生成中允许浏览已有答案，完成后提供“查看结果”，不抢走正在阅读的视图；收起后入口显示就绪状态。

初始窗口宽 400px、高度随内容收缩，使用两个帮助类型标签和一个明确的主操作按钮；标题显示当前题目，配色沿用 OJ 品牌蓝，支持深色主题。结果阅读区最大 460×560px，实际尺寸受屏幕限制。标题和窗口控件分列，各按钮文字在所属区域换行，操作区固定。设置摘要有明确“返回题目助手”按钮，鉴权/模型配置错误旁可点击“检查 AI 设置”。

2026-10-22 已独立安装并开启线上入口：[登录后打开 A+B 题目](https://dfacm.website/p/P1000)，点击右下角“题目助手”查看浮窗。新版将 AgentRouter 和自定义供应商集成在原生账户设置的 AI 区域，配置按 OJ 账户保存，题解、诊断及后续 AI 功能共用。浮窗标题栏显示账户配置摘要和设置入口；生成时由后端读取当前账户配置。发布验证见 [上线记录](../docs/assistant-release-2026-10-22.md)。

2026-10-23 交互逻辑优化已上线，题目页资源为 `/resource/6b18c13d/entry.js`。最新本地 146 项测试与构建、服务器 54 项前端测试、实际线上合并脚本与 Hydro 模板、Mongo/账户兼容检查、46 项站点检查及 62 份 addon 文件哈希核对通过，详情见 [交互上线记录](../docs/assistant-release-2026-10-22.md#交互逻辑优化2026-10-23)。上一轮 2、3、4、5 的后端与官方客户端验证证据保留。真实个人 Key 的模型生成及浏览器视觉验收仍待验证。

服务端加载内置 `acm-trainer/SKILL.md`、当前模式流程与 `references/oj.md`，模型按需读取最多两个算法模板。CE 对照实际编译日志区分报错行和根因行；粘贴代码选择 CE 后可补充日志。WA 检查逻辑、边界和小反例，TLE/RE 按评测结果检查复杂度或运行时异常。引用须逐字对应原代码才高亮，点击行号展开原代码、聚焦并滚动至相应行；支持复制完整原代码。没有可证缺陷时会说明分析局限。

生成中显示实际连接、生成、模板读取和结构校验阶段及等待时长。自定义供应商使用 SSE 时，已完整返回的题意、思路或诊断结论可提前显示；未验证的代码和行号要等完整答案校验。非流式兼容接口和 AgentRouter 官方 `codex exec` 在消息完成后显示正文，保留真实阶段与耗时，不模拟逐字输出。底部显示供应商实际返回的输入/输出 tokens 和缓存输入；缺失或不完整用量显示未返回用量，不估算费用。OJ 缓存和本页复用明确标记，附带的耗时与 tokens 标为原生成用量。

## 使用自己的供应商

1. 登录后打开 [账户设置 → AI 设置](https://dfacm.website/home/settings/account#ai)，或从用户菜单点击“AI 设置”。浮窗标题栏的设置图标也有“前往账户 AI 设置”入口。
2. 选择“AgentRouter”或“自定义供应商”。AgentRouter 固定使用 `https://agentrouter.org/v1`，默认模型 `gpt-5.6-sol`；填写自己的 API Key。已保存旧默认模型 `deepseek-v4-flash` 时，可点击“使用 gpt-5.6-sol”。没有账号可使用 [注册 AgentRouter（邀请链接）](https://agentrouter.org/register?aff=SeEq)。自定义项填写公开 HTTPS 地址、模型名称与 Key；基础地址或完整 `/chat/completions` 地址均可。
3. 点击“保存 AI 设置”，回到题目浮窗选择讲解层级或诊断来源，点击“生成…”或“诊断…”。保存和读取配置不调用模型；换题、刷新、退出再登录及换设备时自动使用同一个账户配置。浮窗的“刷新配置状态”只更新摘要，生成每次都会读取最新设置。

AgentRouter 通过服务器上的官方 Codex CLI 0.163.0 使用 `/v1/responses`，Key 需有 Codex 接入与所选模型权限；自定义供应商使用 Chat Completions，需支持 JSON 输出和工具调用。Key 保存后不回显，修改模型可留空以保留原 Key；填写新 Key 会替换。更换供应商或 API 地址时必须填写对应的新 Key。点击“删除 AI 配置”可移除当前账户设置。

若原来的标签页记住了个人配置，在同一标签页通过用户菜单进入账户设置，可点击“导入旧配置”，再点击“保存 AI 设置”；导入本身不会写入账户。保存成功后移除该账号的旧标签页配置。新标签页或新设备直接读取账户保存的设置。

2026-10-22 查询 AgentRouter 公开模型列表时，`gpt-5.6-sol` 在列，`deepseek-v4-flash` 不在列，因此经用户确认更新默认模型。公开列表不代表每个 Key 都有权限，也不保证即时渠道可用；以个人账户的模型列表与分组为准。推荐值不会自动覆盖账户已保存的其他模型，修改后需要保存。

首次保存或替换 Key 通过同源设置接口的 `x-dfacm-ai-key` 请求头发送，后端立即清理该头；生成与轮询请求都不带 Key。整份供应商配置使用 AES-256-GCM 加密后保存在 MongoDB 的 `dfacm_ai_accounts`，按全局用户 UID 隔离，加密认证绑定 UID 和配置版本。页面和 JSON 只获得供应商、地址、模型、版本及是否已设置 Key，不获得密文或 Key 片段。CSRF 与 UID 绑定，版本冲突提示重新加载，管理员代登录不能读取或使用他人的 AI 配置。个人调用不回退到站点 Key；任务缓存区分供应商、传输方式、模型和 Key。自定义调用限制为公网 HTTPS，连接时校验 DNS 返回地址，不跟随重定向。现有登录、题解权限、比赛限制与并发限制继续生效。

AgentRouter 每次调用创建独立的临时客户端目录，Key 仅放入子进程环境，不放入命令行参数、配置文件或模型输入。CLI 跳过已有用户配置、会话和登录凭据，使用临时认证、关闭历史与遥测。模型只可通过只读 MCP 读取最多两个白名单算法模板；命令执行、文件编辑、浏览器和多智能体功能关闭，临时目录结束后清理。生成失败不自动重试，已有答案保留；任务查询中断时保留 ID，点击“恢复原任务”仅 GET 查询，不重新生成。任务过期后才提示重试生成。

## 本地预览

Windows PowerShell：

```powershell
Set-Location 'C:\Users\yuki\Desktop\dfacmoj\dfacm-oj\plugin-dfacm-assistant'
npm ci --no-audit --no-fund
npm run preview
```

打开 <http://127.0.0.1:4175/home/settings/account#ai>，使用演示 Key 保存配置，再打开 <http://127.0.0.1:4175/p/P1001>，点击右下角“题目助手”展开小窗查看题解或诊断。页首可切换账户设置和评测记录，支持浅色/深色与手机宽度。预览使用固定求和案例和内存中的加密配置，不连接个人 API；重启预览会清除账户数据，请使用演示 Key。

## 安装到 Hydro

按 Hydro 5.0.7、ui-default 4.58.5 的 addon 接口实现，要求 Node.js 22 或更新版本。以下是首次安装说明；当前站点已经完成独立安装。`deploy/deploy.sh` 尚不包含此插件，后续更新需单独同步。

先把本目录上传至服务器仓库目录 `/root/swpu-oj/plugin-dfacm-assistant`，再执行：

```bash
cd /root/swpu-oj
mkdir -p /root/.hydro/addons/dfacm-assistant
cp plugin-dfacm-assistant/{index.ts,account-store.cjs,account-http.cjs,context.cjs,protocol.cjs,client.cjs,codex-client.cjs,template-mcp.cjs,provider-config.cjs,provider-network.cjs,mongo-jobs.cjs,progress.cjs,stream.cjs,package.json} /root/.hydro/addons/dfacm-assistant/
cp -R plugin-dfacm-assistant/{frontend,templates,skill} /root/.hydro/addons/dfacm-assistant/
mkdir -p /root/.hydro/addons/dfacm-assistant/node_modules
ln -sfn /usr/local/share/.config/yarn/global/node_modules/hydrooj /root/.hydro/addons/dfacm-assistant/node_modules/hydrooj
hydrooj addon add /root/.hydro/addons/dfacm-assistant
pm2 restart hydrooj
```

若 Hydro 安装位置不同，把软链目标改为本机 `hydrooj` 包目录。`hydrooj addon add` 会保留已有插件。生产插件仅使用 Node 内置库和 Hydro，**不要在服务器 addon 目录执行 `npm install`**；本地 `devDependencies` 用于测试和预览。前端由 Hydro 原生 UI 构建器加载，不需要改上游页面模板。

AgentRouter 还需在独立目录安装固定版本的官方客户端，当前线上已安装：

```bash
mkdir -p /root/.hydro/assistant-runtime/codex-0.163.0
chmod 700 /root/.hydro/assistant-runtime /root/.hydro/assistant-runtime/codex-0.163.0
npm install --prefix /root/.hydro/assistant-runtime/codex-0.163.0 --registry=https://registry.npmjs.org --ignore-scripts --no-audit --no-fund --save-exact @openai/codex@0.163.0
node /root/.hydro/assistant-runtime/codex-0.163.0/node_modules/@openai/codex/bin/codex.js --version
```

其他部署账号默认从该账号的 `~/.hydro/assistant-runtime/codex-0.163.0/` 加载，可用 `DFACM_ASSISTANT_CODEX_JS` 指定客户端 `bin/codex.js` 的绝对路径。插件核对包名与版本；不要运行 `codex login` 或把用户 Key 写进此目录。升级 CLI 时须同步适配器并重新验证隔离配置、Responses 和模板工具。

管理员登录 OJ，打开“系统设置” `/manage/setting`，找到“题目助手”，开启入口。后端兼容显式指定 `provider=site` 的原站点调用，以下字段仍可保留；当前浮窗自动使用账户配置：

| 设置 | 值 |
|---|---|
| 模型 API 地址 | `https://agentrouter.org/v1` |
| 模型名称 | `gpt-5.6-sol` |
| 模型 API Key | 你自己的 AgentRouter Key，在此页填写 |
| 开启题目助手 | 开启 |

后端站点配置的调用接口为 `/v1/chat/completions`，请求使用 JSON 输出与函数调用读取模板。站点 Key 在服务器保存，保存后不回显，留空保留已有值。可用 `DFACM_ASSISTANT_ENABLED`、`DFACM_ASSISTANT_BASE_URL`、`DFACM_ASSISTANT_MODEL`、`DFACM_ASSISTANT_API_KEY` 环境变量覆盖系统设置；未保存账户配置时浮窗会引导进入账户设置。

使用有题目与题解权限的账号打开普通题目页即可看到按钮。若角色只有“通过后看题解”权限，则通过前不展示助手；要用于“不会做时查看”，给相应训练角色配置通常的题解查看权限。比赛题目页不显示入口，进行中比赛的提交不支持诊断，赛后自己的失败提交可用。

## 首次真实验证

1. 普通题目页点击“题目助手”，切换类型和层级，确认没有生成请求；选好后点击“生成提示/思路/完整题解”。切回已有提示直接复用，完整题解无需逐层解锁。
2. 自己的 WA 提交页点击“诊断当前提交”，确认引用、空行和高亮均对应原代码。题目页诊断时先选最近失败提交或粘贴代码。
3. 粘贴代码默认“还没评测”，选择 CE 可以填编译日志；收起输入或切回讲解不会改变代码来源。诊断完成自动收起输入，可点击“编辑代码”，改动后旧诊断不再当作当前结果。Ctrl/Cmd+Enter 可提交诊断。CE 原行引用保留，不提供运行反例。
4. 手机展开底部抽屉，滚动答案时控制区固定；遮罩、顶部拖动与 Esc 可收起，输入时窗口适配软键盘。生成中收起、重新展开不创建第二条任务。
5. 检查阶段、耗时和供应商 tokens；缓存命中注明本次未调用模型，原生成用量不计为本次消耗。供应商未返回用量时明确显示。

生成任务后台运行，页面每 1.5 秒查询，刷新可恢复。模型调用默认最多 180 秒，最多两条同时进行、每用户一条任务；同一账号的相同请求及帮助层级短时复用结果，三个层级分别缓存。原代码行、经过筛选的完整预览字段、用量与答案暂存 Hydro MongoDB 的 `dfacm_assistant_jobs`，完成后十分钟过期；Mongo TTL 清理可能略有延迟，接口不会返回已过期结果。任务不保存 Key、原始流式片段、内部推理或隐藏测试数据。

若提示“AgentRouter 拒绝了客户端接入”，检查 Key 的 Codex 使用权限；“API 鉴权失败”则检查 Key 及模型权限；“当前模型暂无可用渠道”检查模型名称、Key 分组，或等待供应商恢复。“网关暂时异常”“响应超时”“服务暂时不可用”“连接中断”分别提示对应原因；其他未知错误引导检查配置。“客户端暂时不可用”需管理员检查固定版本的运行环境。额度不足、请求频繁分别提示。自定义供应商检查地址、模型与 Key；答案不完整或引用不一致可重试。页面如实标注静态分析与手工推演，不承诺已编译、已提交或 OJ AC。

最新本地 146 项测试与构建通过，新增 13 条交互回归覆盖明确生成、代码来源、旧答案/阅读位置、失败保留、GET 恢复、结果通知、设置返回、快捷键与手动代码任务恢复。服务器 54 项前端测试及实际线上合并脚本/原生模板交互通过，Mongo/账户兼容、46 项站点检查和 62 份哈希对账完成。此前的 SSE/用量/原行号、48 项后端测试及官方 CLI 16 种模拟场景证据保留；本轮只改两份前端文件。模拟通过不代表供应商已经接受用户的 Key，浏览器视觉验收与真实模型调用仍待完成。

## 账户加密存储与其他 AI 功能

加密主密钥默认在运行 Hydro 的账号目录 `~/.hydro/secrets/dfacm-ai.key`，可通过 `DFACM_AI_KEY_FILE` 指定绝对路径。首次保存时创建 32 字节随机密钥，Linux 文件权限 600、目录权限 700；密钥不在 addon、网站资源或数据库里。已有加密账户记录而密钥缺失时会停止读取，不会生成新密钥覆盖。

当前线上站点已在发布检查中提前初始化主密钥并完成私密备份，后续保存复用该密钥。

备份必须同时包含 MongoDB 的 `dfacm_ai_accounts` 和这个主密钥，存放在站外私密备份中；恢复时先恢复原密钥及权限，再启动 Hydro。丢失原密钥将无法恢复已有配置，需要用户重新填写 Key。不要在有账户配置时删除、替换主密钥，或者把它提交到 Git；当前版本未实现密钥轮换。

后续 addon 可通过 `ctx.get('dfacmAi')` 获取共享服务，并在认证后的 Handler 中调用 `getModelConfig(handler)`。身份来自当前 Handler 的全局 UID，不接受前端传入其他用户 ID；未配置或管理员代登录时明确拒绝。返回值只用于后端模型客户端，不放入响应、日志或任务输入。

```ts
const ai = ctx.get('dfacmAi');
const modelConfig = await ai.getModelConfig(this); // this 是已登录的 Hydro Handler
const result = await modelClient.generate(request, modelConfig);
```

设置接口为 `GET/POST /home/ai/config`，设置入口 `/home/ai` 跳转至原生 `/home/settings/account#ai`。未来 AI 场景应共用账户配置、各自检查功能权限和计费前操作，读取配置本身不请求供应商。

## 维护

```powershell
npm test
npm run check-build
npm run sync-skill -- 'C:\Users\yuki\Desktop\acm-trainer\.codeartsdoer\skills\acm-trainer'
```

改技能后先同步资源，再运行相关测试、更新服务器插件目录并重启 Hydro。`skill/manifest.json` 记录实际文件哈希。关闭系统设置中的“开启题目助手”即可停用；卸载用 `hydrooj addon remove /root/.hydro/addons/dfacm-assistant` 后重启。
