# Hydro AI Watch

Hydro OJ 的提交线索审核插件。后台读取提交，分析站内 AI 输出来源、代码相似度和历史风格变化；管理员查看证据并记录人工复核。

**复核分用于排序，不是 AI 作答概率。** 代码文本不能可靠判断作者是否使用 AI；所有自动报告的结论均为 `undetermined`，插件不自动处罚或改变判题、排名。

## 本地演示

需要 Node.js 22.13 或更新版本，无需安装依赖或连接数据库：

```bash
git clone https://github.com/11suixing11/hydro-ai-watch.git
cd hydro-ai-watch
node preview.cjs
```

打开 <http://127.0.0.1:4177/manage/ai-watch>。演示仅监听本机，包含 6 份人工构造的模拟提交；可查看来源对照、筛选提交、保存复核、模拟新提交及切换主题。重启后数据重置，按 `Ctrl+C` 停止。生产环境只开放给具有 `PRIV_MANAGE_ALL_DOMAIN` 权限的管理员。

## 分析范围

| 线索 | 条件与用途 |
| --- | --- |
| 本人的站内 AI 输出来源匹配 | 同域、同选手、同题，完整解答先于提交且在前 24 小时内；词法相似度至少 0.92，用于优先复核 |
| 其他选手的相似代码 | 同域、同题、同一比赛的先前提交；两份代码至少 140 个词法单元，相似度至少 0.90；无法区分公共模板、复制或 AI |
| AI 生成声明 | 代码注释内的声明，属于弱线索 |
| 历史风格变化 | 至少 5 份同语言、不同题目的历史代码，至少 3 项风格变化，属于弱线索 |

支持 C/C++、Python、JavaScript、TypeScript、Java、Go、Rust。少于 80 个词法单元、源码不可读、语言不支持或源码超过 64 KiB 时标记为“线索不足”。词法指纹忽略空白、注释，并比较变量重命名后的结构；公共模板可能相似，站外 AI 使用无法追溯。

来源匹配兼容 `dfacm_assistant_jobs` 集合中已完成的完整 `solve` 输出，当前按 C++ 建立指纹。使用其他题目助手需适配来源格式；其余审核功能不需要第三方检测 API。

## 接入 Hydro

当前兼容基线为 **Hydro 5.0.7 / ui-default 4.58.5**，复用已安装的 Hydro 和 Node 内置库。随包脚本针对 Linux、root 服务用户、`/root/.hydro` 与 pm2 编写；不同服务用户或安装目录需要先调整脚本。脚本不会自动升级依赖。

生成安装包：

```bash
node scripts/package.cjs
```

包与 SHA-256 校验文件默认写入忽略目录 `dist/`，只包含明确的公开文件清单。上传两份文件到服务器专用目录后执行：

```bash
sha256sum -c dfacm-ai-watch-0.1.0.tar.gz.sha256
tar -xzf dfacm-ai-watch-0.1.0.tar.gz
cd dfacm-ai-watch
bash scripts/install.sh check
bash scripts/install.sh install
```

`check` 验证文件哈希、依赖版本、构建、测试和独立 Mongo 测试集合。原生验收需准备 `system` 域的测试题 `P1000` 与管理员 UID `2`；其他设置可通过 `AI_WATCH_CHECK_DOMAIN`、`AI_WATCH_CHECK_PROBLEM`、`AI_WATCH_CHECK_ADMIN_UID` 指定。这些参数仅用于安装验收。

`install` 备份插件与 addon 注册清单，复制运行文件并重启 `hydrooj`，检查权限、索引与采集心跳，保持判题服务不变。默认回环地址为 `http://127.0.0.1:8888`，可通过 `HYDRO_HTTP_ORIGIN` 指定其他回环端口。不要把本地演示服务作为生产服务。

安装后从管理菜单进入“AI 作答线索审核”，或访问 `/manage/ai-watch`。其他域使用 `/d/<域 ID>/manage/ai-watch`，并明确配置该域。

安装脚本输出备份路径。恢复插件文件与注册清单时执行：

```bash
bash scripts/rollback.sh /root/backups/ai-watch-before.XXXXXXXX
```

替换示例中的备份目录。回滚保留审核数据和当前插件文件；如果其他 addon 注册项已变化，脚本停止，需人工核对。

## 配置

`.env.example` 仅为公开示例。插件读取 `process.env`，不会自动加载 `.env`；实际配置应写入私有服务环境。

| 环境变量 | 默认值 | 说明 |
| --- | --- | --- |
| `DFACM_AI_WATCH_ENABLED` | `1` | `0` 停止采集，保留审核入口 |
| `DFACM_AI_WATCH_DOMAINS` | `system` | 明确的域 ID，逗号分隔，最多 20 个 |
| `DFACM_AI_WATCH_SCOPE` | `contests` | 仅比赛；`all` 同时包含普通练习 |
| `DFACM_AI_WATCH_CONTESTS` | 空 | 可选比赛白名单；有值时 `all` 也仅包含这些比赛 |
| `DFACM_AI_WATCH_RETENTION_DAYS` | `30` | 新报告与来源保留 1–90 天 |
| `DFACM_AI_WATCH_INTERVAL_MS` | `2000` | 扫描间隔 500–10000 毫秒 |
| `DFACM_AI_WATCH_BATCH_SIZE` | `100` | 每轮补扫 10–500 条 |

比赛与普通练习都需要监测时，在服务器配置：

```bash
DFACM_AI_WATCH_SCOPE=all pm2 restart hydrooj --update-env
pm2 save
```

预测试、hack、数据生成和输入测试提交被排除。页面暂停只暂停浏览器刷新，后台继续工作。

`record/change` 事件仅入队提交 ID，后台每轮补扫数据库，首次启用或变更范围从最近 10 分钟开始。重启从检查点恢复；没有任意历史比赛的全量回填。重评保留既有分析与人工复核。原子租约避免重复处理，失败最多重试 3 次。

每份报告最多比较 20 份本人 AI 来源、100 份先前同场代码及 20 份本人不同题目的历史代码。来源必须在助手原任务过期前归档，停机期间已删除的来源无法恢复。

## 数据与验证

报告、来源与扫描状态分别存入 `dfacm_ai_watch_reports`、`dfacm_ai_watch_sources`、`dfacm_ai_watch_state`。提交源码读取 Hydro 原记录，来源归档保存完整 AI 输出。默认保留 30 天，接口排除过期记录，Mongo TTL 异步删除。源码证据、复核及资源接口均检查管理员权限，复核写入检查 CSRF 和版本号。

```bash
node --test tests/*.test.cjs
node scripts/check-build.cjs
node scripts/check-public.cjs
```

测试覆盖来源上下文、相似度与弱线索边界、提交范围、补扫、租约、重评、复核冲突、权限、CSRF 和演示 HTTP。原生测试使用独立 Mongo 集合并清理测试数据。本地测试不替代目标站点的真实比赛全流程、TTL 到期和故障恢复验证。

公开仓库与发布包不包含生产数据、部署记录或个人路径；详见 [PRIVACY.md](PRIVACY.md)。发布前还可运行 `node scripts/check-public.cjs --git` 检查暂存文件、历史和提交邮箱。新增公开文件需要更新明确清单。

## 许可证

[MIT](LICENSE)。安全问题请通过 GitHub 的私密漏洞报告渠道联系维护者，见 [SECURITY.md](SECURITY.md)。
