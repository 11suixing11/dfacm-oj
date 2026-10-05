#!/bin/bash
# SWPU ACM patch: 服务端 KaTeX 公式长度限制 50 → 1000
#
# Hydro 自带的 ui-default/backendlib/markdown-it-katex.ts（waylonflinn/
# markdown-it-katex 的魔改版）在 Node 环境把公式长度限制为 50 字符
# （浏览器分支为 1000）：超过 50 字符的 $...$ / $$...$$ 公式不渲染，
# 直接按字面文本输出。竞赛题里常见的长约束行（如
# "1 \leq n \leq 10^9, 0 \leq r < k \leq 50, 2 \leq p \leq 2^{30}-1"）
# 会整体显示成原始 TeX。改为 1000，与浏览器分支一致。
# 幂等；上游升级覆盖该文件后重跑本脚本恢复。
set -u
F=/usr/local/share/.config/yarn/global/node_modules/@hydrooj/ui-default/backendlib/markdown-it-katex.ts
if [ ! -f "$F" ]; then
  echo "[patch-katex-limit] 缺少文件: $F" >&2
  exit 66
fi
if grep -q '? 1000 : 1000;' "$F"; then
  echo "[patch-katex-limit] 已打过"
elif grep -q '? 50 : 1000;' "$F"; then
  cp "$F" "/root/backups/markdown-it-katex.ts.bak-$(date +%Y%m%d-%H%M%S)"
  sed -i 's/? 50 : 1000;/? 1000 : 1000;/' "$F"
  if ! grep -q '? 1000 : 1000;' "$F"; then
    echo "[patch-katex-limit] 写入失败" >&2
    exit 65
  fi
  echo "[patch-katex-limit] 已修补，需 pm2 restart hydrooj 生效"
  echo "[patch-katex-limit] 验证：任一带 >50 字符公式的题面（如 /p/642）应出现 class=\"katex-html\" 而非字面 \$\$"
else
  echo "[patch-katex-limit] 锚点漂移（没有 '? 50 : 1000;' 行）" >&2
  exit 65
fi
