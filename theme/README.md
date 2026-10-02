# Hydro 主题 Overlay 系统

Hydro 没有运行时主题设置，视觉定制通过在编译产物 CSS 尾部**追加 overlay** 实现——升级重装后重新追加一次即可，永不动原始内容。

## 文件

| 文件 | 作用 |
|---|---|
| `01-dark-band.css` | 导航/表头/按钮深色条带 + 品牌金强调（基础皮肤） |
| `02-polish.css` | 全站排版精修：自托管字体接入（pre/code 用等宽字体）、金色选区、滚动条、键盘焦点环、表格行悬停、圆角 |
| `03-immersive.css` | 登录/注册/找回密码等沉浸式页面品牌深色化（精确作用域 `body:has(.immersive--content)`，不影响 OJ 普通页） |
| `04-immersive-buttons.css` | 沉浸式页面提交按钮品牌胶囊样式 |

## 应用方法

Hydro 的主题 CSS 存在于**两处**，必须同时追加：

1. `/root/.hydro/static/theme-<版本>.css` —— Caddy 静态直出，**实际生效的这份**
2. Hydro 源包内的 `public/theme-<版本>.css`（如 `/usr/local/share/.config/yarn/global/node_modules/@hydrooj/ui-default/public/`）—— **UI 重建时的来源**，不同步则重建后丢样式

```bash
cat 01-dark-band.css 02-polish.css 03-immersive.css 04-immersive-buttons.css \
    >> /root/.hydro/static/theme-4.58.5.css
cat 01-dark-band.css 02-polish.css 03-immersive.css 04-immersive-buttons.css \
    >> <ui-default源包>/public/theme-4.58.5.css
```

## 关键经验

- **Caddy 的 encode 中间件会剥离 ETag**，导致浏览器无法协商缓存 → 给主题 CSS 配 `Cache-Control: max-age=600`（10 分钟内全网拿到新样式，同时避免每次全量重下 1MB CSS）
- 沉浸式页面的默认蓝色大背景是 `.slideout-panel` 上的一张 jpg，仅在 auth 页出现——用 `:has()` 作用域覆盖，OJ 普通页面零影响（老浏览器优雅回退原样式）
- 追加块务必带起止标记注释（本目录所有文件已带），便于升级后重新追加时去重
