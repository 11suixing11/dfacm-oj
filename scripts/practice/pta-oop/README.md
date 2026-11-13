# PTA 面向对象练习页面

维护 <https://dfacm.website/practice/pta-oop/> 的 204 道题。源码从 2026-11-08 的公开页面提取，完整题面、原题 ID、参考代码和站内评测映射均保留在 `source/`。发布状态和本次验证范围见 [修复记录](REPORT.md)。

## 构建与预览

不需要安装运行依赖，使用 Node.js 22 或更新版本：

```powershell
node scripts/practice/pta-oop/build.cjs
node scripts/practice/pta-oop/preview.cjs 4176
```

预览地址为 <http://127.0.0.1:4176/practice/pta-oop/>。本地预览支持客观题、草稿、讲解和错题本；Java 评测请求必须由网站的已登录账号发起。

发布文件为 `dist/index.html`，题库与脚本全部内嵌，无需上传开发依赖。拿到当前服务器连接后，先确认 Caddy 对应的实际文件路径、核对旧文件并备份，再原子替换该文件；核对源站、公网页面及站内 Java 提交。此次不需要升级 Hydro 或改动账号数据库。

`bank.version` 保持 `pta-oop-v1`，已有草稿和错题记录可以恢复。客观题参考版本更新为 `2026-11-08.1`，恢复时重新计算判定，并保留独立的手动复习标记。函数题的拼接版本也更新为 `2026-11-08.1`，旧拼接产生的评测记录不再复用。

## 文件

- `source/bank.json`：204 道题与参考解答；明确作答前提的题目使用 `context`，存在多个合理答案的原单选题使用 `reference.answerIds`。
- `source/core.cjs`：答案核对、会话恢复、Java 拼接、判定与复习状态。
- `source/app.js`：浏览器交互、站内提交和结果读取。
- `source/template.html`：页面模板与样式。
- `repair-bank.cjs`：从原始题库重放此次答案与说明修复。
- `extract.cjs`：从公开单文件页面提取可维护源码。

## 验证

```powershell
node --test scripts/practice/pta-oop/core.test.cjs
```

浏览器验收使用 Playwright，依赖安装在被忽略的 QA 目录中：

```powershell
npm install --prefix qa/pta-oop-2026-11-08/tools --no-audit --no-fund --ignore-scripts playwright-core
$env:PLAYWRIGHT_BROWSERS_PATH = "$PWD/qa/pta-oop-2026-11-08/tools/browsers"
node qa/pta-oop-2026-11-08/tools/node_modules/playwright-core/cli.js install chromium --only-shell
node scripts/practice/pta-oop/browser-check.cjs
```

`audit-java.cjs` 使用独立 JDK 17 编译全部拼接结果，并运行题面样例、等价提交变体和 Java 语言反例。第三个参数为 JDK 目录：

```powershell
node scripts/practice/pta-oop/audit-java.cjs qa/pta-oop-2026-11-08/java-after C:/path/to/jdk17
node scripts/practice/pta-oop/audit-metadata.cjs
```

浏览器评测接口使用模拟响应；元数据审计只读取公开题目。线上测试文件、编译契约与真实提交需要服务器或账号权限，不能用本地验证替代。
