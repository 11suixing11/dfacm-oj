# M2 爬虫冒烟测试（用本地 fixture，不联网）：
#   python tests/test_m2_crawlers.py
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8", errors="replace")  # GBK 控制台兼容

BACKEND = Path(__file__).resolve().parent.parent / "backend"
sys.path.insert(0, str(BACKEND))

import json  # noqa: E402
from datetime import datetime  # noqa: E402

from app.crawlers.kaggle import parse_items as kaggle_parse  # noqa: E402
from app.crawlers.lablab import parse_html as lablab_parse, parse_date_range  # noqa: E402
from app.crawlers.leetcode import parse_contests as leetcode_parse  # noqa: E402
from app.crawlers.tianchi import parse_list as tianchi_parse  # noqa: E402
from app.crawlers.xfyun import parse_topics as xfyun_parse  # noqa: E402
from app.models import CST  # noqa: E402

FIX = Path(__file__).parent / "fixtures"
NOW = int(datetime(2026, 10, 30, tzinfo=CST).timestamp())


def load(name):
    return json.loads((FIX / name).read_text(encoding="utf-8"))


# ---- 1. LeetCode ----
items = leetcode_parse(load("leetcode_list.json")["contests"], NOW)
assert items, "leetcode 解析为空"
for it in items:
    assert it.source == "leetcode" and it.category == "oj"
    assert it.url.startswith("https://leetcode.cn/contest/")
    assert it.start_time and it.end_time
print(f"leetcode: {len(items)} 条 OK")

# ---- 2. 天池 ----
data = load("tianchi_active_p1.json")["data"]
items = tianchi_parse(data["list"], NOW)
assert items, "tianchi 解析为空"
first = items[0]
assert first.url == "https://tianchi.aliyun.com/competition/entrance/" + first.external_id
assert first.start_time and first.end_time
print(f"tianchi: {len(items)} 条 OK | 样例: {first.title[:30]} 奖金 {first.prize_text}")

# ---- 3. 讯飞 ----
topics = load("xfyun_topics.json")["data"]
items = xfyun_parse(topics, NOW)
assert items, "xfyun 解析为空"
for it in items:
    assert it.source == "xfyun"
    assert it.category in ("datascience", "llm_agent")
    assert it.title and it.url
print(f"xfyun: {len(items)} 条 OK | 样例: {items[0].title[:30]}")

# ---- 4. lablab ----
html = (FIX / "lablab_home.html").read_text(encoding="utf-8", errors="replace")
items = lablab_parse(html, default_year=2026)
assert items, "lablab 解析为空"
titled = [i for i in items if i.title]
print(f"lablab: {len(items)} 条 OK | 样例: {titled[0].title[:40] if titled else None}")
# 至少有一条解析出日期或奖金
assert any(i.start_time for i in items), "lablab 日期全部解析失败"
assert any(i.prize_amount for i in items), "lablab 奖金全部解析失败"

# 日期区间解析单元用例
from datetime import timedelta  # noqa: E402

s, e = parse_date_range("Dates: 28 August–4 September 2026", 2026)
assert s == int(datetime(2026, 8, 28, tzinfo=CST).timestamp()), s
assert e == int(datetime(2026, 9, 4, tzinfo=CST).timestamp()), e
s, e = parse_date_range("Month-long challenge | Dates: Sep 1–30, 2026", 2026)
assert s == int(datetime(2026, 9, 1, tzinfo=CST).timestamp())
assert e == int(datetime(2026, 9, 30, tzinfo=CST).timestamp())
s, e = parse_date_range("Dates: TBA\\n• Online Build: Dates TBA", 2026)
assert s is None and e is None
# 跨年
s, e = parse_date_range("Dates: 15 December–5 January 2027", 2026)
assert s is not None and e is not None and e > s
print("lablab 日期区间单元用例全过")

# ---- 5. Kaggle ----
items = kaggle_parse(load("kaggle_list.json"), NOW)
assert len(items) == 1, f"kaggle 应过滤 Getting Started，剩 {len(items)}"
assert items[0].prize_amount == 0.1 and items[0].currency == "USD"
from datetime import timezone  # noqa: E402

assert items[0].end_time == int(datetime(2027, 1, 15, 23, 59, tzinfo=timezone.utc).timestamp())
print("kaggle: 过滤+字段解析 OK")

print("ALL PASS")
