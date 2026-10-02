# Hydro 主题方案

## 推荐方案：原生 Dark 主题 + 品牌薄层

Hydro 的 `ui-default` 自带完整、持续维护的 Dark 主题（编译进 `theme-<版本>.css` 的 `.theme--dark` 规则），覆盖导航、表格、代码工具条、表单、下拉菜单、页脚和移动端。不要再手写逐组件深色覆盖。

启用步骤：

1. 在系统设置中把默认主题设为 dark：

   ```js
   db.system.updateOne({ _id: 'preference.theme' }, { $set: { value: 'dark' } }, { upsert: true })
   ```

2. 把已有用户切换到 dark（或清空 `theme` 字段以继承系统默认）：

   ```js
   db.user.updateMany({ _id: { $gte: 2 } }, { $set: { theme: 'dark' } })
   ```

3. 重启 `hydrooj`，让用户缓存刷新：

   ```bash
   pm2 restart hydrooj
   ```

4. 用 `deploy/install-theme.sh` 追加品牌薄层 `00-native-dark-brand.css`。脚本会先剥掉旧 overlay，并安装 Service Worker kill-switch；不要再手动追加旧的 01-05 全量深色覆盖。

主题 CSS 存在于两处，必须同时维护：

1. `/root/.hydro/static/theme-<版本>.css`：Caddy 实际直出的文件
2. `/usr/local/share/.config/yarn/global/node_modules/@hydrooj/ui-default/public/theme-<版本>.css`：UI 重建时的来源

## 文件

| 文件 | 作用 |
|---|---|
| `00-native-dark-brand.css` | 原生 Dark 之上的 SWPU 品牌薄层：字体、导航金边、品牌蓝按钮、当前页高亮、沉浸式认证页 |
| `01-dark-band.css` 至 `04-immersive-buttons.css` | 旧版浅色主题时代的 overlay，已停用，仅留作回退参考 |
| `05-full-dark.css` | 旧版手写全站深色 overlay，已停用；原生 Dark 主题已覆盖其全部功能 |

## 验证

```bash
grep -c "native-dark brand overlay" /root/.hydro/static/theme-4.58.5.css
grep -c "theme--dark" /root/.hydro/static/theme-4.58.5.css
```

- 页面根节点应输出 `class="... theme--dark ..."`
- 用真实浏览器分别检查 `/p`、`/p/2`、`/training`、`/reg`、`/login` 的桌面与移动端
- 重点看表格斑马纹、题面 Copy 工具条、页脚分类链接和当前分页

## 部署脚本

推荐直接用仓库脚本追加品牌薄层，脚本会同时处理 static 和源包两处，并在修改前备份：

```bash
bash deploy/install-theme.sh
```

- 默认只追加 `00-native-dark-brand.css`，通过 `native-dark brand overlay` 标记做幂等。
- 每次执行会先删掉 CSS 中第一处 `==== SWPU ACM` 之后的内容，再追加当前品牌层，保证重复执行和旧主题残留不会叠加。
- 同时把 static 和源包的 `service-worker.js` 换成 kill-switch：清空旧 CacheStorage 后注销自身，避免 webpack 注入的旧主题 CSS 覆盖品牌层。
- 主题版本不是 4.58.5 时，先设 `THEME_VERSION=<版本>`。
- 旧浅色 Hydro 需要完整回退时，显式运行 `SWPU_THEME_LEGACY=1 bash deploy/install-theme.sh`，才会追加 01-05。
- 脚本不会替你修改系统主题偏好；仍需按本文开头的 `preference.theme` / `user.theme` 步骤切到 dark。
