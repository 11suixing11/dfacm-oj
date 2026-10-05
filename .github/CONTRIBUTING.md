# 参与 d&f算法网

感谢你愿意改进 d&f算法网。这个仓库维护的是独立的在线评测与算法训练平台，欢迎提交修复、测试、文档和训练体验改进。

## 提交前

- 先阅读 `README.md` 与 `deploy/deployment.md`，了解插件边界和部署约束。
- 不要提交 SMTP、MongoDB、服务器、QQ 机器人或 OAuth 凭据。
- 不要为了改公开品牌而重命名 `plugin-swpu-*`、`SWPU_*` 环境变量、Mongo 集合或服务器部署路径；这些是现网兼容标识。
- 面向用户的文字、页面标题和截图请使用 **d&f算法网**，主域名使用 `dfacm.website`；`swpuacm.xyz` 只作为兼容入口。

## 验证

按改动范围运行最小测试集；涉及部署或主题时，至少运行：

```bash
node --test scripts/deployment.test.mjs scripts/landing.test.cjs
node --test plugin-swpu-ops/tests/*.test.cjs
node --test plugin-swpu-shop/tests/*.test.cjs
node --test plugin-swpu-train/tests/*.test.cjs
```

认证插件的完整测试需要在 `plugin-swpu-regcode/` 中执行 `npm ci` 后运行 `npm test`。

## Pull Request

PR 描述请说明：

1. 改动解决了什么问题；
2. 影响了哪些用户流程或服务器文件；
3. 运行了哪些测试；
4. 是否需要重启 Hydro、重放补丁或迁移数据。

请保持改动聚焦，避免把内部兼容标识改名和功能修复混在同一个 PR 中。
