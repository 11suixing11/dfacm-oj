# DevPost 爬虫：官方 API（免鉴权），全球最大的黑客松平台——Cursor/Bolt/Claude 等
# vibe coding 大赛大多托管在这里。只保留 AI 相关主题的黑客松。
from __future__ import annotations

import re
import time
from datetime import datetime, timedelta, timezone

from ..models import Competition
from .base import BaseCrawler, CrawlError

API_URL = "https://www.devpost.com/api/hackathons"

# 视为 AI 相关的主题（DevPost theme name 精确匹配）
_AI_THEMES = {
    "Machine Learning/AI", "Large Language Models", "Generative AI",
    "Open AI", "Copilot", "Low/No Code",
}
# 主题不匹配时的标题关键词兜底
_TITLE_RE = re.compile(r"\b(ai|agent|llm|gpt|copilot|cursor|vibe|bolt|replit|lovable|bot|rag|prompt)", re.I)
_PRIZE_NUM_RE = re.compile(r"([\d,]+)")

# "Dec 19, 2026 - Jan 18, 2027" / "Oct 01 - Nov 12, 2026" / "Nov 01 - 05, 2026"
_DP_RANGE_RE = re.compile(
    r"([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:\s*,?\s*(\d{4}))?\s*[-–—]\s*"
    r"(?:([A-Za-z]{3,9})\.?\s+)?(\d{1,2})(?:\s*,?\s*(\d{4}))?"
)
_DP_SINGLE_RE = re.compile(r"([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:\s*,?\s*(\d{4}))?")
_MONTHS = {m.lower()[:3]: i for i, m in enumerate(
    ["january", "february", "march", "april", "may", "june",
     "july", "august", "september", "october", "november", "december"], 1)}

# 状态页数上限：open 6 页、upcoming 15 页，避免抓太深
_STATUS_MAX_PAGES = {"open": 6, "upcoming": 6}


class DevpostCrawler(BaseCrawler):
    source = "devpost"
    label = "DevPost"

    async def parse(self) -> list[Competition]:
        rows: list[Competition] = []
        for status in ("open", "upcoming"):
            for page in range(1, _STATUS_MAX_PAGES[status] + 1):
                data = await self.fetch_json(API_URL, params={"page": page, "status": status})
                batch = data.get("hackathons")
                meta = data.get("meta")
                if not isinstance(batch, list) or any(not isinstance(h, dict) for h in batch):
                    raise CrawlError("DevPost hackathons 必须是对象列表")
                if not isinstance(meta, dict):
                    raise CrawlError("DevPost 缺少分页对象 meta")
                total = meta.get("total_count")
                per_page = meta.get("per_page")
                if type(total) is not int or total < 0 or type(per_page) is not int or per_page <= 0:
                    raise CrawlError("DevPost meta.total_count/per_page 必须是非负/正整数")
                rows.extend(parse_hackathons(batch, status))
                if page * per_page >= total:
                    break
        # 去重（可能重复出现）
        seen: set[str] = set()
        out = []
        for r in rows:
            if r.external_id not in seen:
                seen.add(r.external_id)
                out.append(r)
        return out


def parse_hackathons(items: list[dict], status: str, now: int | None = None) -> list[Competition]:
    """纯函数：API 单页 hackathons → AI 相关的黑客松。"""
    cst = timezone(timedelta(hours=8))
    rows: list[Competition] = []
    for h in items:
        hid = str(h.get("id") or "")
        title = h.get("title") or ""
        url = h.get("url") or ""
        if not hid or not title or not url:
            continue
        if h.get("invite_only"):
            continue

        themes = [t.get("name") for t in (h.get("themes") or []) if t.get("name")]
        is_ai = bool(_AI_THEMES.intersection(themes)) or _TITLE_RE.search(title)
        if not is_ai:
            continue

        start, end = parse_dates(h.get("submission_period_dates"))

        prize_amount = None
        prize_text = None
        m = _PRIZE_NUM_RE.search(h.get("prize_amount") or "")
        if m:
            val = float(m.group(1).replace(",", ""))
            if val > 0:
                prize_amount = round(val / 10000.0, 2)  # $67,500 → 6.75 万
                prize_text = f"${val:,.0f}"

        tags = themes
        if status == "open":
            tags = tags + ["进行中"]
        elif status == "upcoming":
            tags = tags + ["未开始"]

        try:
            teams = int(h.get("registrations_count") or 0) or None
        except (TypeError, ValueError):
            teams = None

        rows.append(
            Competition(
                source="devpost",
                external_id=hid,
                title=title,
                url=url,
                category="hackathon",
                organizer=h.get("organization_name") or None,
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


def parse_dates(text: str | None, default_year: int | None = None) -> tuple[int | None, int | None]:
    """解析 DevPost 的 'Oct 01 - Nov 12, 2026' 等英文日期串 → epoch 秒（北京时间）。"""
    if not text:
        return None, None
    default_year = default_year or datetime.now(tz=timezone(timedelta(hours=8))).year
    text = text.replace(",", " ")
    m = _DP_RANGE_RE.search(text)
    if m:
        mon1, d1, y1, mon2, d2, y2 = m.groups()
        m1 = _MONTHS.get(mon1.lower()[:3])
        m2 = _MONTHS.get(mon2.lower()[:3]) if mon2 else m1
        if not (m1 and m2):
            return None, None
        try:
            sy = int(y1) if y1 else (int(y2) if y2 else default_year)
            ey = int(y2) if y2 else (sy if y1 else default_year)
            start = datetime(sy, m1, int(d1))
            end = datetime(ey, m2, int(d2))
        except ValueError:
            return None, None
    else:
        s = _DP_SINGLE_RE.search(text)
        if not s:
            return None, None
        mon, d, y = s.groups()
        mm = _MONTHS.get(mon.lower()[:3])
        if not mm:
            return None, None
        try:
            dt = datetime(int(y) if y else default_year, mm, int(d))
        except ValueError:
            return None, None
        start = end = dt
    if end < start:
        end = end.replace(year=end.year + 1)
    cst = timezone(timedelta(hours=8))
    return int(start.replace(tzinfo=cst).timestamp()), int(end.replace(tzinfo=cst).timestamp())
