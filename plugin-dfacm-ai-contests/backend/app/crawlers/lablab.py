# lablab.ai 爬虫：服务端渲染的 Next.js 页面，首页含进行中+即将开始的 AI 黑客松卡片。
from __future__ import annotations

import re
from urllib.parse import urljoin

from bs4 import BeautifulSoup

from ..models import Competition, parse_prize
from .base import BaseCrawler

BASE_URL = "https://lablab.ai/"

_MONTHS = {m.lower()[:3]: i for i, m in enumerate(
    ["january", "february", "march", "april", "may", "june",
     "july", "august", "september", "october", "november", "december"], 1)}

# 每类比赛的默认分类关键词（title+description 命中则追加 tag）
_AGENT_RE = re.compile(r"\bagent", re.I)
_VIBE_RE = re.compile(r"vibe\s*coding|cursor|copilot|code\s*challenge|coding\s*challenge", re.I)
_PRIZE_RE = re.compile(r"\$\s*([\d,]+)")
_PRIZE_STRONG_RE = re.compile(r"\$\s*([\d,]+)\s*(?:Prize|USD|US)", re.I)
_DATE_SEG_RE = re.compile(r"Dates?:\s*([^|\\\n]+)")
# "28 August–4 September 2026"
_RANGE_AB = re.compile(
    r"(\d{1,2})\s+([A-Za-z]{3,9})\.?\s*[–—-]\s*(\d{1,2})\s+([A-Za-z]{3,9})\.?(?:\s*,?\s*(\d{4}))?")
# "Sep 1–30, 2026"
_RANGE_BA = re.compile(
    r"([A-Za-z]{3,9})\.?\s*(\d{1,2})\s*[–—-]\s*(\d{1,2})(?:\s*,?\s*(\d{4}))?")
_BADGES = {"Finished", "Online", "Hybrid", "Ongoing", "Upcoming", "Live", "In Progress"}


class LabLabCrawler(BaseCrawler):
    source = "lablab"
    label = "lablab.ai"

    async def parse(self) -> list[Competition]:
        resp = await self.fetch(BASE_URL)
        return parse_html(resp.text)


def parse_html(html: str, default_year: int | None = None) -> list[Competition]:
    """纯函数：首页 HTML → 黑客松列表。"""
    from datetime import datetime, timedelta, timezone
    default_year = default_year or datetime.now(tz=timezone(timedelta(hours=8))).year

    soup = BeautifulSoup(html, "lxml")
    rows: list[Competition] = []
    seen: set[str] = set()
    for card in soup.select('a[href^="/ai-hackathons/"]'):
        href = card.get("href") or ""
        slug = href.rstrip("/").split("/")[-1]
        if not slug or slug in seen:
            continue
        title_el = card.select_one("h2") or card.select_one("h3")
        if title_el is None:
            continue
        title = title_el.get_text(strip=True)
        if not title:
            continue
        seen.add(slug)

        text = card.get_text(" ", strip=True)
        start, end = parse_date_range(text, default_year)

        m = _PRIZE_STRONG_RE.search(text) or _PRIZE_RE.search(text)
        prize_text = f"${m.group(1)}" if m else None
        prize_amount, currency = parse_prize(prize_text)

        teams = None
        p_el = card.select_one("p.text-xs")
        if p_el is not None and p_el.get_text(strip=True).replace(",", "").isdigit():
            teams = int(p_el.get_text(strip=True).replace(",", ""))

        tags = [s.get_text(strip=True) for s in card.select("span")
                if s.get_text(strip=True) in _BADGES]
        blob = title + " " + text
        if _AGENT_RE.search(blob):
            tags.append("agent")
        if _VIBE_RE.search(blob):
            tags.append("vibe-coding")

        rows.append(
            Competition(
                source="lablab",
                external_id=slug,
                title=title,
                url=urljoin(BASE_URL, href),
                category="hackathon",
                prize_text=prize_text,
                prize_amount=prize_amount,
                currency=currency,
                start_time=start,
                end_time=end,
                teams_count=teams,
                tags=tags,
            )
        )
    return rows


def parse_date_range(text: str, default_year: int) -> tuple[int | None, int | None]:
    """解析 'Dates: 28 August–4 September 2026' / 'Dates: Sep 1–30, 2026'。

    返回 epoch 秒（北京时间）；TBA 等无法解析返回 (None, None)。
    """
    from datetime import datetime, timedelta, timezone

    m = _DATE_SEG_RE.search(text)
    if not m:
        return None, None
    seg = m.group(1).strip()
    if not seg or "TBA" in seg.upper():
        return None, None

    ab = _RANGE_AB.match(seg)
    if ab:
        d1, mon1, d2, mon2, year = ab.group(1), ab.group(2), ab.group(3), ab.group(4), ab.group(5)
        m1, m2 = _MONTHS.get(mon1.lower()[:3]), _MONTHS.get(mon2.lower()[:3])
        if not (m1 and m2):
            return None, None
        y = int(year) if year else default_year
        try:
            start = datetime(y, m1, int(d1))
            end = datetime(y, m2, int(d2))
        except ValueError:
            return None, None
    else:
        ba = _RANGE_BA.match(seg)
        if not ba:
            return None, None
        mon, d1, d2, year = ba.group(1), ba.group(2), ba.group(3), ba.group(4)
        mm = _MONTHS.get(mon.lower()[:3])
        if not mm:
            return None, None
        y = int(year) if year else default_year
        try:
            start = datetime(y, mm, int(d1))
            end = datetime(y, mm, int(d2))
        except ValueError:
            return None, None

    if end < start:  # 跨年：如 12 月起次年 1 月止
        end = end.replace(year=end.year + 1)

    cst = timezone(timedelta(hours=8))
    return int(start.replace(tzinfo=cst).timestamp()), int(end.replace(tzinfo=cst).timestamp())
