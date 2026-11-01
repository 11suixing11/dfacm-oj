# LeetCode 中国站爬虫：公开 JSON 接口 /contest/api/list/（约 700+ 场全量历史）。
from __future__ import annotations

import time

from ..models import Competition
from .base import BaseCrawler, CrawlError

API_URL = "https://leetcode.cn/contest/api/list/"
BASE_URL = "https://leetcode.cn/contest/"
# 已结束比赛只保留最近 30 天
_FINISHED_KEEP_WINDOW = 30 * 86400


class LeetCodeCrawler(BaseCrawler):
    source = "leetcode"
    label = "LeetCode"

    async def parse(self) -> list[Competition]:
        resp = await self.fetch(API_URL)
        data = resp.json()
        contests = data.get("contests")
        if not isinstance(contests, list):
            raise CrawlError(f"LeetCode 接口结构异常: {list(data)[:5]}")
        now = int(time.time())
        return parse_contests(contests, now)


def parse_contests(contests: list[dict], now: int | None = None) -> list[Competition]:
    """纯函数：全量 contest 列表 → 过滤近期相关的比赛。"""
    now = now if now is not None else int(time.time())
    rows: list[Competition] = []
    for c in contests:
        if c.get("is_private") or c.get("is_virtual") or c.get("is_ee_exam_contest"):
            continue
        slug = c.get("title_slug") or ""
        title = c.get("title") or ""
        start = c.get("start_time")
        duration = c.get("duration") or 0
        if not slug or not title or not start:
            continue
        end = start + duration
        if end < now - _FINISHED_KEEP_WINDOW:
            continue  # 太久远的历史周赛不入库
        tags = []
        for kw in ("周赛", "双周赛", "个人赛", "团队赛"):
            if kw in title:
                tags.append(kw)
                break
        rows.append(
            Competition(
                source="leetcode",
                external_id=str(c.get("id") or slug),
                title=title,
                url=BASE_URL + slug + "/",
                category="oj",
                start_time=start,
                end_time=end,
                tags=tags,
            )
        )
    return rows
