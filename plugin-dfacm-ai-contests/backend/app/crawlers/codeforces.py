# Codeforces 爬虫：官方公开 API，无需鉴权。
# 文档: https://codeforces.com/apiHelp/methods#contest.list
from __future__ import annotations

import time

from ..models import Competition
from .base import BaseCrawler, CrawlError

API_URL = "https://codeforces.com/api/contest.list"
CONTEST_URL = "https://codeforces.com/contest/"
# 已结束比赛只保留最近 30 天，避免全量历史刷库
_FINISHED_KEEP_WINDOW = 30 * 86400


class CodeforcesCrawler(BaseCrawler):
    source = "codeforces"
    label = "Codeforces"
    category = "oj"

    async def parse(self) -> list[Competition]:
        resp = await self.fetch(API_URL, params={"gym": "false"})
        data = resp.json()
        if data.get("status") != "OK":
            raise CrawlError(f"CF API 返回异常: {str(data)[:200]}")

        now = int(time.time())
        rows: list[Competition] = []
        for c in data.get("result", []):
            cid = str(c.get("id", ""))
            if not cid or c.get("isGym"):
                continue
            start = c.get("startTimeSeconds")
            duration = c.get("durationSeconds")
            end = start + duration if start and duration else None
            phase = c.get("phase", "")
            if phase == "FINISHED" and end and end < now - _FINISHED_KEEP_WINDOW:
                continue  # 太久远的历史赛不入库
            rows.append(
                Competition(
                    source="codeforces",
                    external_id=cid,
                    title=c.get("name") or f"Codeforces Contest {cid}",
                    url=CONTEST_URL + cid,
                    category="oj",
                    start_time=start,
                    end_time=end,
                    tags=[phase],
                )
            )
        return rows
