# 服务器补丁清单（ui-default / locale 原地补丁）

以下补丁直接修改服务器上 `yarn global` 安装的 Hydro 包文件，`npm/yarn` 升级或 UI 重建会覆盖，重跑对应脚本即可恢复（全部幂等、带备份）。两个早期补丁（排名页模板、单题 RP 保底）见 `deployment.md` §18/§19。

## patch-training-locale.sh — 训练计划锁定章节文案「无效」→「未解锁」

- **症状**：顺序解锁训练计划里，未解锁章节显示「无效」，学生会误以为章节损坏。
- **根因**：`ui-default/templates/partials/training_detail.html:27` 渲染 `{{ _('Invalid') }}`，中文译文为「无效」。该翻译键全站仅此一处使用（hydrooj 核心源码与其他模板均未引用）。
- **修法**：把 **两份** zh.yaml 的键值改为「未解锁」——`hydrooj/locales/zh.yaml`（框架级，运行时优先生效）与 `@hydrooj/ui-default/locales/zh.yaml`（两份都改防未来读取路径变化）。
- **应用**：`bash deploy/patch-training-locale.sh` → `pm2 restart hydrooj`（locale 启动时加载）。
- **验证**：匿名访问任一带顺序解锁的训练计划（如 `/training/6ac38fb88b364d5443b9ee22`），锁定章节应显示「未解锁」且不出现「无效」。
- **备份**：`/root/backups/locale-*.bak-*`。注意：备份不要留在 `locales/` 目录里，避免被加载器扫到。

## patch-katex-limit.sh — 服务端 KaTeX 公式长度限制 50 → 1000

- **症状**：较长的 `$...$` / `$$...$$` 公式（如 "1 \leq n \leq 10^9, 0 \leq r < k \leq 50, ..." 这类约束行）不渲染，直接显示原始 TeX。
- **根因**：Hydro 自带的 `ui-default/backendlib/markdown-it-katex.ts`（waylonflinn/markdown-it-katex 魔改版）在 Node 环境把公式长度限制为 **50 字符**（浏览器分支为 1000），超长公式按字面文本输出。
- **修法**：`? 50 : 1000;` → `? 1000 : 1000;`，与浏览器分支一致。
- **应用**：`bash deploy/patch-katex-limit.sh` → `pm2 restart hydrooj`。
- **验证**：任一带长公式的题面（如 XCPC 计划内的 `/p/642`）应出现 `class="katex-html"` 且正文中无字面 `$`。
- **备份**：`/root/backups/markdown-it-katex.ts.bak-*`。

## 相关背景：题面 markdown 模式与 `html` 标志

FPS/导入题的 `document.html` 字段决定渲染模式：`"true"` 为原始 HTML 直出（不走 markdown+KaTeX），`""` 为 markdown 模式（`$..$` 渲染、`language-*` 样例块生效）。带公式的新题面务必保持 markdown 模式（`html` 为空），否则公式不会被渲染。原始 HTML 模式下 class 属性会被 `markdown-it-xss` 清洗（仅白名单 `language-*` 等保留）。
