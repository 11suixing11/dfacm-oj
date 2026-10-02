# Hydro 主题方案

## 推荐方案：Hydro 原生双主题（默认 light）+ 品牌薄层

Hydro 的 `ui-default` 自带完整、持续维护的 Light / Dark 两套主题（编译进 `theme-<版本>.css` 的 `.theme--light` / `.theme--dark` 规则）。站点默认 light，用户可随时切换 dark；品牌薄层 `00-brand.css` 同时覆盖两种模式。

默认 light 的三步设置（曾强制全员 dark 的反向操作）：

1. 删掉系统级强制主题键，让代码默认值（`ui-default/index.ts` 中 `Setting('setting_display', 'theme', 'light', ...)`）生效：

   ```js
   db.system.deleteOne({ _id: 'preference.theme' })
   ```

   若 `index.ts` 中的默认值仍是 `'dark'`，先改回 `'light'`（约 182 行）。

2. 清空用户级强制主题，让每人跟随默认并自行选择：

   ```js
   db.user.updateMany({}, { $unset: { theme: '' } })
   ```

3. 重启 `hydrooj`，让用户缓存刷新：

   ```bash
   pm2 restart hydrooj
   ```

4. 用 `deploy/install-theme.sh` 追加品牌薄层 `00-brand.css`。脚本会先剥掉旧 overlay，并安装 Service Worker kill-switch；不要再手动追加旧的 01-05 全量深色覆盖。

用户切换主题的两条路：

- 偏好设置页（`/home/settings/preference`）的 Theme 下拉。
- 页脚「白天 / 夜间」一键切换链接（`ui-default.footer_extra_html` 注入，登录用户直达 `GET /set_theme/:theme`，切完自动跳回原页；`SetThemeHandler` 有 `checkPriv(PRIV_USER_PROFILE)`，未登录访客不会误写共享的 Guest 文档）。

主题 CSS 存在于两处，必须同时维护：

1. `/root/.hydro/static/theme-<版本>.css`：Caddy 实际直出的文件
2. `/usr/local/share/.config/yarn/global/node_modules/@hydrooj/ui-default/public/theme-<版本>.css`：UI 重建时的来源

## 文件

| 文件 | 作用 |
|---|---|
| `00-brand.css` | 双主题品牌薄层：共享段（字体、按钮、菜单、表格/阅读性、可访问性）+ dark 段（深色顶栏、正文对比度、沉浸页深色渐变）+ light 段（白底金边顶栏、深金高亮、浅色表头、沉浸页浅色渐变） |
| `01-dark-band.css` 至 `04-immersive-buttons.css` | 旧版浅色主题时代的 overlay，已停用，仅留作回退参考 |
| `05-full-dark.css` | 旧版手写全站深色 overlay，已停用；原生 Dark 主题已覆盖其全部功能 |
| `00-native-dark-brand.css` | 已由 `00-brand.css` 取代（原 dark-only 品牌层），已删除 |

## 验证

```bash
grep -c "SWPU ACM brand overlay" /root/.hydro/static/theme-4.58.5.css
grep -c "theme--light" /root/.hydro/static/theme-4.58.5.css
grep -c "theme--dark" /root/.hydro/static/theme-4.58.5.css
```

- 未登录首页根节点应输出 `class="... theme--light ..."` 且 `data-mantine-color-scheme="light"`
- 用真实浏览器分别检查 `/p`、`/p/2`、`/training`、`/reg`、`/login` 的桌面与移动端，light 与 dark 各过一遍
- 重点看表格斑马纹、题面 Copy 工具条、页脚分类链接、当前分页和沉浸式认证页

## 部署脚本

推荐直接用仓库脚本追加品牌薄层，脚本会同时处理 static 和源包两处，并在修改前备份：

```bash
bash deploy/install-theme.sh
```

- 默认只追加 `00-brand.css`，通过 `==== SWPU ACM` 标记做幂等。
- 每次执行会先删掉 CSS 中第一处 `==== SWPU ACM` 之后的内容，再追加当前品牌层，保证重复执行和旧主题残留不会叠加。
- 同时把 static 和源包的 `service-worker.js` 换成 kill-switch：清空旧 CacheStorage 后注销自身，避免 webpack 注入的旧主题 CSS 覆盖品牌层。
- 主题版本不是 4.58.5 时，先设 `THEME_VERSION=<版本>`。
- 旧浅色 Hydro 需要完整回退时，显式运行 `SWPU_THEME_LEGACY=1 bash deploy/install-theme.sh`，才会追加 01-05。
- 脚本不会替你修改系统主题偏好；仍需按本文开头的 `preference.theme` / `user.theme` 步骤恢复 light 默认。
