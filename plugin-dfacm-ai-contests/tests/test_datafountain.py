# DataFountain 解析冒烟测试（用本地 fixture，不联网）：
#   python tests/test_datafountain.py
import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parent.parent / "backend"
sys.path.insert(0, str(BACKEND))

from datetime import datetime  # noqa: E402
from app.crawlers.datafountain import parse_html  # noqa: E402
from app.models import CST, parse_prize  # noqa: E402

html = (Path(__file__).parent / "fixtures" / "df_p1.html").read_text(encoding="utf-8")
items = parse_html(html)

# 1. 数量：页面约 30 张卡片
assert len(items) >= 20, f"解析出的条数过少: {len(items)}"
print(f"解析 {len(items)} 条")

# 2. 首张卡片字段完整性
first = items[0]
assert first.source == "datafountain"
assert first.title, "标题为空"
assert first.url.startswith("https://www.datafountain.cn/competitions/"), first.url
assert first.category == "datascience"
assert first.external_id.isdigit(), first.external_id
print("首条:", first.title, "|", first.url)

# 3. 日期：fixture 首卡是 2026.04.07 - 2026.08.31
assert first.start_time == int(datetime(2026, 4, 7, tzinfo=CST).timestamp()), first.start_time
assert first.end_time == int(datetime(2026, 8, 31, tzinfo=CST).timestamp()), first.end_time

# 4. 主办方 / 参赛人数 / 标签
assert first.organizer and "睿创微纳" in first.organizer, first.organizer
assert first.teams_count is not None and first.teams_count > 0, first.teams_count
assert first.tags, "标签为空"

# 5. 奖金解析：'￥90,000' → 9.0 万 CNY
assert first.prize_amount == 9.0, first.prize_amount
assert first.currency == "CNY"

# 6. parse_prize 单元用例
cases = [
    ("￥300,000", 30.0, "CNY"),
    ("15.5万港元", 15.5, "HKD"),
    ("$75,000", 7.5, "USD"),
    ("220万元税前奖金", 220.0, "CNY"),
    ("其他", None, "CNY"),
    (None, None, "CNY"),
]
for text, want_amount, want_cur in cases:
    got_amount, got_cur = parse_prize(text)
    assert got_amount == want_amount, f"parse_prize({text!r}) 金额 {got_amount} != {want_amount}"
    assert got_cur == want_cur, f"parse_prize({text!r}) 币种 {got_cur} != {want_cur}"
print("parse_prize 单元用例全过")

# 7. external_id 唯一（同页无重复）
ids = [i.external_id for i in items]
assert len(ids) == len(set(ids)), "external_id 有重复"

print("ALL PASS")
