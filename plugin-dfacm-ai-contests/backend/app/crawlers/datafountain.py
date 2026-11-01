# DataFountain 爬虫：服务端渲染（Nuxt SSR），?page=N 分页，每页约 30 条。
from __future__ import annotations

import re
from urllib.parse import urljoin

from bs4 import BeautifulSoup

from ..models import Competition, parse_date, parse_prize
from .base import BaseCrawler

BASE_URL = "https://www.datafountain.cn"
LIST_URL = f"{BASE_URL}/competitions"

_DATE_RE = re.compile(r"^\d{4}[.\-/]\d{1,2}[.\-/]\d{1,2}$")
_USERS_RE = re.compile(r"([\d,]+)\s*users")


class DataFountainCrawler(BaseCrawler):
    source = "datafountain"
    label = "DataFountain"
    max_pages = 15  # 防御性上限；遇到空页/整页重复提前终止

    async def parse(self) -> list[Competition]:
        rows: list[Competition] = []
        seen: set[str] = set()
        for page in range(1, self.max_pages + 1):
            url = LIST_URL if page == 1 else f"{LIST_URL}?page={page}"
            resp = await self.fetch(url)
            items = parse_html(resp.text)
            if not items:
                break
            fresh = [r for r in items if r.external_id not in seen]
            if not fresh:
                break  # 整页都是旧数据，认为翻完了
            seen.update(r.external_id for r in fresh)
            rows.extend(fresh)
        return rows


def parse_html(html: str) -> list[Competition]:
    """解析列表页 HTML → 统一模型列表（纯函数，便于用 fixture 测试）。"""
    soup = BeautifulSoup(html, "lxml")
    out: list[Competition] = []
    for card in soup.select("div.compt-item"):
        title_a = card.select_one("a.compt__title")
        if title_a is None:
            continue
        title = title_a.get_text(strip=True)
        href = title_a.get("href") or ""
        if not title or not href:
            continue
        external_id = href.rstrip("/").split("/")[-1]

        organizer = None
        sponsor = card.select_one(".compt__sponsor-name")
        if sponsor is not None:
            texts = [s.get_text(strip=True) for s in sponsor.find_all("span")]
            parts = [t for t in texts if t and not t.startswith("organizer")]
            organizer = " ".join(parts) or None

        date_texts = [
            s.get_text(strip=True)
            for s in card.select(".cmp-date span")
            if _DATE_RE.match(s.get_text(strip=True) or "")
        ]
        start_time = parse_date(date_texts[0]) if len(date_texts) >= 1 else None
        end_time = parse_date(date_texts[1]) if len(date_texts) >= 2 else None

        prize_el = card.select_one(".oview__content")
        prize_text = prize_el.get_text(strip=True) or None if prize_el is not None else None
        prize_amount, currency = parse_prize(prize_text)

        tags = [
            t for t in (s.get_text(strip=True) for s in card.select(".cmp-tags span")) if t
        ]

        m = _USERS_RE.search(card.get_text(" ", strip=True))
        teams_count = int(m.group(1).replace(",", "")) if m else None

        out.append(
            Competition(
                source="datafountain",
                external_id=external_id,
                title=title,
                url=urljoin(BASE_URL + "/", href),
                category="datascience",
                organizer=organizer,
                prize_text=prize_text,
                prize_amount=prize_amount,
                currency=currency,
                start_time=start_time,
                end_time=end_time,
                teams_count=teams_count,
                tags=tags,
            )
        )
    return out
