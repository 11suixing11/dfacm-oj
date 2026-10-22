# 内置题单的人工核验与检索

用于维护题单、复盘推荐与训练计划选题。`topic-map.json` 中的预填与 `source_audit` 仅为开发辅助；只有开发者实际人工核对官方题面后才能填写 `verification` 并设置 `verified: true`。工具不能证明人工审阅确实发生，也不提供自动批准入口。

## 核验记录

每条题目有 `source`、`id`、`title`、`url`、`难度`、`推荐理由`、严格布尔 `verified`。目前来源只支持洛谷 P 题，官方 URL 必须精确为 `https://www.luogu.com.cn/problem/<id>`。

核验时逐题确认题号、官方完整题名、题面与所在考点、推荐理由；难度是本项目对学生的估计，“模板”等平台标签不能直接折算做题时间。开发者记录格式为：

```json
{
  "method": "developer-manual",
  "reviewer": "实际核实人",
  "checked_at": "YYYY-MM-DD",
  "url": "对应官方 HTTPS 题目 URL",
  "id": "与当前条目一致的题号",
  "official_title": "与 title 一致的官方完整题名",
  "topic": "当前所在考点的完整名称",
  "topic_match": true,
  "notes": "人工阅读题面后确认该考点和推荐理由的依据"
}
```

日期必须真实且不晚于校验基准日；字符串不能为空，可选 `evidence` 指向人工核验材料。同题放在多个考点时，每个条目的考点关系分别核实。不要复制其他题或其他考点的记录；更新题号、题名、考点后需重新核对。以上示意占位值不是可用核验记录。

## 工具

从技能根目录执行（仅依赖 Python 标准库）：

```powershell
python -X utf8 scripts/topic_catalog.py audit
python -X utf8 scripts/topic_catalog.py checklist --output topic-checklist.md
python -X utf8 scripts/topic_catalog.py recommend --topics 背包 最短路 --limit 3 --exclude 洛谷/P1048
```

`--map` 可指定自定义只读题单；`--as-of YYYY-MM-DD` 指定日期校验基准，默认本机今天，不代表核验日期。`audit` 分别统计预填覆盖、有效声明、待核验和考点缺额；结构无错不代表推荐可用或 PRD 达标。`checklist` 输出带官方链接的人工核验清单，不能写回题单。`recommend` 逐条校验并筛选已核验声明，跨标签去重，排除当前题及用户提供的已做题；空结果如实兜底，数量不足不补造题号。

无运行工具时按相同条件检索 JSON：`verified` 必须是布尔 `true`，核验记录字段齐全且与本条题号、官方 URL、题名和考点匹配；仅有非空 `verification` 对象不足以启用推荐。
