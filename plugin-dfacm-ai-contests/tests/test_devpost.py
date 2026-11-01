# DevPost 爬虫 + 统一打标冒烟测试（用本地 fixture，不联网）：
#   python tests/test_devpost.py
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
BACKEND = Path(__file__).resolve().parent.parent / "backend"
sys.path.insert(0, str(BACKEND))

import json  # noqa: E402
from datetime import datetime  # noqa: E402

from app.crawlers.devpost import parse_dates, parse_hackathons  # noqa: E402
from app.models import CST, Competition, augment_tags  # noqa: E402

FIX = Path(__file__).parent / "fixtures"
data = json.loads((FIX / "devpost_p1.json").read_text(encoding="utf-8"))

# ---- 1. parse_hackathons：过滤 + 字段 ----
items = parse_hackathons(data["open"]["hackathons"], "open")
assert items, "open 解析为空"
ai_titles = [i.title for i in items]
print(f"open: 保留 {len(items)}/9 场 AI 相关")
assert "PayPal AI Hackathon" in ai_titles
first = next(i for i in items if i.prize_amount)
assert first.currency == "USD" and first.prize_amount > 0, (first.prize_amount, first.currency)
assert first.url.startswith("http")
print("样例:", first.title, "| 奖金", first.prize_text, "|", first.start_time, "→", first.end_time)

up = parse_hackathons(data["upcoming"]["hackathons"], "upcoming")
assert up and any("未开始" in i.tags for i in up)
print(f"upcoming: 保留 {len(up)}/9 场 AI 相关")

# 非AI主题+无关键词的应被滤掉（人工核对列表里至少有一场纯教育/非AI的）
print("被过滤的标题:", [h["title"] for h in data["open"]["hackathons"]
                        if h["title"] not in ai_titles and not h.get("invite_only")])

# ---- 2. 日期解析单元用例 ----
s, e = parse_dates("Oct 01 - Nov 12, 2026")
assert s == int(datetime(2026, 10, 1, tzinfo=CST).timestamp())
assert e == int(datetime(2026, 11, 12, tzinfo=CST).timestamp())
s, e = parse_dates("Dec 19, 2026 - Jan 18, 2027")
assert s == int(datetime(2026, 12, 19, tzinfo=CST).timestamp())
assert e == int(datetime(2027, 1, 18, tzinfo=CST).timestamp())
s, e = parse_dates("Nov 01 - 05, 2026")
assert s == int(datetime(2026, 11, 1, tzinfo=CST).timestamp())
assert e == int(datetime(2026, 11, 5, tzinfo=CST).timestamp())
s, e = parse_dates("Dec 05, 2026")
assert s == e and s is not None
print("日期解析单元用例全过")

# ---- 3. 统一打标 ----
c1 = Competition(source="x", external_id="1", title="讯飞 Skill 开发挑战赛", url="http://t.cn")
c1 = augment_tags(c1)
assert "vibe-coding" in c1.tags, c1.tags
c2 = Competition(source="x", external_id="2", title="多模态客服智能体设计", url="http://t.cn")
c2 = augment_tags(c2)
assert "agent" in c2.tags
c3 = Competition(source="x", external_id="3", title="普通文本分类比赛", url="http://t.cn")
c3 = augment_tags(c3)
assert c3.tags == [], c3.tags
print("统一打标单元用例全过")

print("ALL PASS")
