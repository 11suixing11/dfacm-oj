# DrivenData 爬虫：服务端渲染，比赛卡片自带 data-* 属性（奖金/人数/状态/日期）。
from __future__ import annotations

import re
import time
from datetime import datetime, timedelta, timezone

from bs4 import BeautifulSoup

from ..models import CST, Competition
from .base import BaseCrawler

BASE_URL = "https://www.drivendata.org"
LIST_URL = f"{BASE_URL}/competitions/"
# 已结束比赛保留窗口：DrivenData 总量小，历史多留 90 天
_KEEP_WINDOW = 90 * 86400
_DATE_RANGE_RE = re.compile(
    r"([A-Z][a-z]{2,9}\.?)\s+(\d{1,2})(?:,?\s+(\d{4}))?\s*[–—-]\s*"
    r"([A-Z][a-z]{2,9}\.?)\s+(\d{1,2}),?\s+(\d{4})")
_MONTHS = {m.lower()[:3]: i for i, m in enumerate(
    ["january", "february", "march", "april", "may", "june",
     "july", "august", "september", "october", "november", "december"], 1)}


class DrivenDataCrawler(BaseCrawler):
    source = "drivendata"
    label = "DrivenData"

    async def parse(self) -> list[Competition]:
        resp = await self.fetch(LIST_URL)
        return parse_html(resp.text, int(time.time()))


def parse_html(html: str, now: int | None = None) -> list[Competition]:
    """纯函数：列表页 HTML → 比赛列表。"""
    now = now if now is not None else int(time.time())
    soup = BeautifulSoup(html, "lxml")
    rows: list[Competition] = []
    for card in soup.select("[data-start_date]"):
        link = card.select_one('a[href^="/competitions/"]')
        if link is None:
            continue
        title = link.get("title") or link.get_text(strip=True)
        href = link.get("href") or ""
        if not title or not href:
            continue

        attrs = card.attrs
        start = _parse_yyyymmdd(attrs.get("data-start_date"))
        end = None
        m = _DATE_RANGE_RE.search(card.get_text(" ", strip=True))
        if m:
            end = _parse_en_date(m.group(4), m.group(5), m.group(6))
        is_active = attrs.get("data-status_active") == "1"
        if not is_active and end and end < now - _KEEP_WINDOW:
            continue
        if not start and not end and not is_active:
            continue

        prize_amount = None
        prize_text = None
        purse = attrs.get("data-total_prize_purse")
        if purse:
            try:
                val = float(purse)
                if val > 0:
                    prize_amount = round(val / 10000.0, 2)
                    prize_text = f"${val:,.0f}"
            except (TypeError, ValueError):
                pass

        try:
            teams = int(attrs.get("data-joined") or 0) or None
        except (TypeError, ValueError):
            teams = None

        tags = []
        if is_active:
            tags.append("进行中")
        for key, name in (
            ("data-category_energy", "能源"), ("data-category_science", "科学"),
            ("data-category_health", "健康"), ("data-category_climate", "气候"),
            ("data-category_biology", "生物"), ("data-category_social", "社会"),
        ):
            if attrs.get(key) == "1":
                tags.append(name)

        rows.append(
            Competition(
                source="drivendata",
                external_id=href.rstrip("/").split("/")[-1] or href,
                title=title,
                url=BASE_URL + href,
                category="datascience",
                prize_text=prize_text,
                prize_amount=prize_amount,
                currency="USD",
                start_time=start,
                end_time=end,
                teams_count=teams,
                tags=tags,
            )
        )
    return rows


def _parse_yyyymmdd(text) -> int | None:
    if not text or not re.fullmatch(r"\d{8}", str(text)):
        return None
    try:
        dt = datetime.strptime(str(text), "%Y%m%d")
    except ValueError:
        return None
    return int(dt.replace(tzinfo=CST).timestamp())


def _parse_en_date(mon: str, day: str, year: str) -> int | None:
    mm = _MONTHS.get(mon.lower().rstrip(".")[:3])
    if not mm:
        return None
    try:
        dt = datetime(int(year), mm, int(day))
    except ValueError:
        return None
    return int(dt.replace(tzinfo=CST).timestamp())
