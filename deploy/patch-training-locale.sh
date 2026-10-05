#!/bin/bash
# SWPU ACM patch: 训练计划锁定章节文案「无效」→「未解锁」
#
# Hydro 顺序解锁训练计划中，未解锁章节在 training_detail.html 渲染
# {{ _('Invalid') }}，中文译文为「无效」，学生会误以为章节损坏。
# 该翻译键全站仅此一处使用（templates/partials/training_detail.html:27，
# hydrooj 核心源码与其他模板均未引用），直接把两份 zh.yaml 的键值改为
# 「未解锁」即可（框架 hydrooj 包 + @hydrooj/ui-default 包各有一份，
# 运行时框架级优先生效，两份都要改）。幂等；上游升级会替换 locale
# 文件，届时重跑本脚本恢复。
set -u
TS=$(date +%Y%m%d-%H%M%S)
changed=0
for L in \
  /usr/local/share/.config/yarn/global/node_modules/hydrooj/locales/zh.yaml \
  /usr/local/share/.config/yarn/global/node_modules/@hydrooj/ui-default/locales/zh.yaml; do
  if [ ! -f "$L" ]; then
    echo "[patch-training-locale] 缺少 locale 文件: $L" >&2
    exit 66
  fi
  if grep -q '^Invalid: 未解锁$' "$L"; then
    echo "[patch-training-locale] 已打过: $L"
  elif grep -q '^Invalid: 无效$' "$L"; then
    SAFE=$(echo "$L" | sed 's#.*/node_modules/##; s#/#-#g')
    cp "$L" "/root/backups/locale-$SAFE.bak-$TS"
    sed -i 's/^Invalid: 无效$/Invalid: 未解锁/' "$L"
    if ! grep -q '^Invalid: 未解锁$' "$L"; then
      echo "[patch-training-locale] 写入失败: $L" >&2
      exit 65
    fi
    echo "[patch-training-locale] 已修补: $L（备份 /root/backups/locale-$SAFE.bak-$TS）"
    changed=1
  else
    echo "[patch-training-locale] 锚点漂移（没有 Invalid: 无效 行）: $L" >&2
    exit 65
  fi
done
if [ "$changed" = "1" ]; then
  echo "[patch-training-locale] locale 在启动时加载，需 pm2 restart hydrooj 生效"
  echo "[patch-training-locale] 验证：匿名访问 /training/6ac38fb88b364d5443b9ee22 应出现 8 处「未解锁」、0 处「无效」"
fi
