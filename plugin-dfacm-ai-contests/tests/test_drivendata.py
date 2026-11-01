# DrivenData 解析冒烟测试（本地 fixture，不联网）：
#   python tests/test_drivendata.py
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
BACKEND = Path(__file__).resolve().parent.parent / "backend"
sys.path.insert(0, str(BACKEND))

from datetime import datetime  # noqa: E402

from app.crawlers.drivendata import parse_html, _parse_yyyymmdd, _parse_en_date  # noqa: E402
from app.models import CST  # noqa: E402

html = (Path(__file__).parent / "fixtures" / "drivendata_list.html").read_text(encoding="utf-8", errors="replace")
items = parse_html(html)
print("解析条数:", len(items))
assert items, "DrivenData 解析为空"

first = items[0]
assert first.source == "drivendata"
assert first.url.startswith("https://www.drivendata.org/competitions/")
assert first.title
print("首条:", first.title, "| 奖金:", first.prize_text, "| teams:", first.teams_count)

# 至少一场进行中的（DrivenData 常年有 active 比赛）
active = [i for i in items if "进行中" in i.tags]
print("进行中:", len(active))
assert active, "没有解析出进行中的比赛"
a = active[0]
assert a.start_time or a.end_time, "进行中比赛缺时间"

# 日期解析单元用例
assert _parse_yyyymmdd("20260910") == int(datetime(2026, 9, 10, tzinfo=CST).timestamp())
assert _parse_en_date("Sept.", "9", "2026") == int(datetime(2026, 9, 9, tzinfo=CST).timestamp())
assert _parse_en_date("Jan", "15", "2027") is not None
assert _parse_yyyymmdd("bad") is None
print("日期解析单元用例全过")

# external_id 唯一
ids = [i.external_id for i in items]
assert len(ids) == len(set(ids)), "external_id 重复"

print("ALL PASS")
