#!/bin/bash
# d&f 算法网 · 站内帮助页 /wiki/help 定制模板安装器（2026-10-12）
# 上游 ui-default 的 templates/wiki_help.html 是硬编码模板（没有 ui-default.help 设置键），
# 本脚本把仓库 deploy/wiki-help/wiki_help.html 整文件替换上去。
# 内容：三册使用文档（学生册 / 管理员册 / API 册，含全量 150 条路由表）。
# 幂等：目标已含标记即跳过；源/目标缺失 exit 66；装后校验失败 exit 65。
# 模板只在启动时读盘进 registry——装完必须 pm2 restart hydrooj，等 ≥75s 再验收。
set -e
MARKER="完整使用文档，共三册"
HERE="$(cd "$(dirname "$0")" && pwd)"
SRC="$HERE/wiki_help.html"
[ -f "$SRC" ] || { echo "[E] missing source file $SRC" >&2; exit 66; }
TGT="$(find /usr/local/share/.config/yarn/global/node_modules/@hydrooj -path '*/templates/wiki_help.html' 2>/dev/null | head -1)"
if [ -z "$TGT" ] || [ ! -f "$TGT" ]; then echo "[E] upstream template not found" >&2; exit 66; fi
if grep -q "$MARKER" "$TGT"; then
  echo "already patched, skip: $TGT"
else
  cp "$TGT" "$TGT.bak-$(date +%Y%m%d-%H%M%S)"
  cp "$SRC" "$TGT"
  if ! grep -q "$MARKER" "$TGT"; then echo "[E] post-install verification failed" >&2; exit 65; fi
  echo "installed $(wc -c < "$TGT") bytes -> $TGT"
  pm2 restart hydrooj
fi
echo "done. verify (after >=75s): curl /wiki/help should contain: $MARKER"
