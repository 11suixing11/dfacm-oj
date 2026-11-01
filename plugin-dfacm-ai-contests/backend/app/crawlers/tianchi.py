# 天池爬虫：GET /v3/proxy/competition/api/race/page（egg 框架，GET 免 CSRF）。
# 接口由官方低码模块 hmod-ace-2024-tianchi-competition-list 调用，每页 10 条。
from __future__ import annotations

import time
from datetime import datetime

from ..models import CST, Competition
from .base import BaseCrawler, CrawlError

API_URL = "https://tianchi.aliyun.com/v3/proxy/competition/api/race/page"
RACE_URL = "https://tianchi.aliyun.com/competition/entrance/"
# 已结束比赛只保留最近 30 天
_FINISHED_KEEP_WINDOW = 30 * 86400
_MAX_PAGES = 10


class TianchiCrawler(BaseCrawler):
    source = "tianchi"
    label = "天池"

    async def parse(self) -> list[Competition]:
        rows: list[Competition] = []
        now = int(time.time())

        # 进行中（isActive=1）
        total = None
        page = 1
        while page <= _MAX_PAGES:
            data = await self._fetch_page(page, active=1)
            total = data.get("total") or 0
            rows.extend(parse_list(data.get("list") or [], now))
            if page * 10 >= total:
                break
            page += 1

        # 已结束（isActive=0）：取前 3 页，过滤最近 30 天结束的
        for page in range(1, 4):
            data = await self._fetch_page(page, active=0)
            lst = data.get("list") or []
            if not lst:
                break
            rows.extend(parse_list(lst, now, finished_window=_FINISHED_KEEP_WINDOW))

        # 按 raceId 去重
        seen: set[str] = set()
        unique = []
        for r in rows:
            if r.external_id not in seen:
                seen.add(r.external_id)
                unique.append(r)
        return unique

    async def _fetch_page(self, page: int, *, active: int) -> dict:
        resp = await self.fetch(
            API_URL,
            params={
                "visualTab": "",
                "raceName": "",
                "pageNum": page,
                "isActive": active,
            },
            headers={"Referer": "https://tianchi.aliyun.com/competition"},
        )
        d = resp.json()
        if not isinstance(d.get("data"), dict):
            raise CrawlError(f"天池接口结构异常: {str(d)[:200]}")
        return d["data"]


def parse_list(lst: list[dict], now: int, finished_window: int | None = None) -> list[Competition]:
    """纯函数：接口 list → 统一模型。finished_window 只保留近期结束的比赛。"""
    rows: list[Competition] = []
    for item in lst:
        race_id = str(item.get("raceId") or "")
        name = item.get("name") or ""
        if not race_id or not name:
            continue
        end = _parse_dt(item.get("raceEndTime"))
        if finished_window is not None and end and end < now - finished_window:
            continue
        start = _parse_dt(item.get("raceStartTime")) or _parse_dt(item.get("signupStartTime"))

        bonus = item.get("bonus")
        prize_text = None
        prize_amount = None
        currency = "CNY"
        if bonus:
            try:
                bonus_val = float(bonus)
            except (TypeError, ValueError):
                bonus_val = 0.0
            if bonus_val > 0:
                cur_raw = str(item.get("currency") or "").upper()
                currency = "USD" if "USD" in cur_raw else "CNY"
                symbol = "$" if currency == "USD" else "¥"
                prize_text = f"{symbol}{bonus_val:,.0f}"
                prize_amount = round(bonus_val / 10000.0, 2)

        tags = []
        for t in item.get("tagsList") or []:
            tag = t.get("tagName") or t.get("name") or ""
            if tag:
                tags.append(tag)

        try:
            teams = int(item.get("teamCount") or 0) or None
        except (TypeError, ValueError):
            teams = None

        rows.append(
            Competition(
                source="tianchi",
                external_id=race_id,
                title=name,
                url=RACE_URL + race_id,
                category="datascience",
                organizer=None,
                prize_text=prize_text,
                prize_amount=prize_amount,
                currency=currency,
                start_time=start,
                end_time=end,
                teams_count=teams,
                tags=tags,
                description=item.get("highlight") or None,
            )
        )
    return rows


def _parse_dt(text) -> int | None:
    """'2026-10-29 00:00:00'（北京时间）→ epoch 秒。"""
    if not text:
        return None
    try:
        return int(datetime.strptime(str(text)[:19], "%Y-%m-%d %H:%M:%S").replace(tzinfo=CST).timestamp())
    except ValueError:
        return None
