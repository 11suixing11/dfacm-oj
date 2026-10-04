# 字体许可说明

本目录使用的两款字体均为 SIL Open Font License 1.1 许可：

- **ZCOOL QingKe HuangYou**（站酷庆科黄油体）— 展示字体，Google Fonts 收录
- **JetBrains Mono** — 等宽字体，JetBrains 开源

OFL 允许自由使用、分发与子集化（本仓库中的 woff2 即按页面用字子集化后的产物），但不允许单独出售字体文件本身。原始完整版可从 Google Fonts 获取。

子集化脚本见 `../scripts/subset_fonts.py`。

## 重新生成 woff2

原始 TTF **不在仓库里**（体积大且可随时获取），需要自行下载后运行脚本：

```bash
pip install fonttools brotli

# ZCOOL QingKe HuangYou（展示字体，展示用字约 440 字 → 107KB）
curl -L -o /tmp/zcool.ttf "https://github.com/google/fonts/raw/main/ofl/zcoolqingkehuangyou/ZCOOLQingKeHuangYou-Regular.ttf"
# JetBrains Mono（等宽字体）
curl -L -o /tmp/jbmono.ttf "https://github.com/JetBrains/JetBrainsMono/raw/master/fonts/ttf/JetBrainsMono-Regular.ttf"

python scripts/subset_fonts.py /tmp/zcool.ttf /tmp/jbmono.ttf landing
```

脚本会扫描 `landing/index.html` 与 `plugin-swpu-regcode/reg.html` 里实际出现的字符，额外补齐全部可打印 ASCII 与常用中英文标点，然后输出 `landing/swpu-display.woff2`、`landing/swpu-mono.woff2`，并把用字清单写进 `glyphs.txt`（已 gitignore）。

**注意**：字形集合是从 HTML 源码静态扫描出来的。若页面文案改动后忘记重跑脚本，新增的汉字会以 fallback 字体渲染；反之删掉的字会留在子集里。改动落地页或注册页文案后应重跑并一并提交新的 woff2。
