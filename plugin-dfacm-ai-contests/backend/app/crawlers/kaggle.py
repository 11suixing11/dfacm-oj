# Kaggle 爬虫：官方 API（需免费 token）。
# 申请：kaggle.com → Settings → API → Create New Token，把下载的 kaggle.json 放到 data/ 下。
# 注：kaggle.com 网页有 reCAPTCHA 拦截，HTML 直爬不可行，只能走官方 API。
from __future__ import annotations

import json
import time
from datetime import datetime, timezone

from ..config import KAGGLE_TOKEN_PATH
from ..models import Competition, parse_prize
from .base import BaseCrawler, CrawlError

API_URL = "https://www.kaggle.com/api/v1/competitions/list"
TOKEN_PATH = KAGGLE_TOKEN_PATH
# 已结束比赛只保留最近 30 天；Getting Started 是永久练习赛，排除
_FINISHED_KEEP_WINDOW = 30 * 86400
_EXCLUDED_CATEGORIES = {"Getting Started"}
_MAX_PAGES = 10


class KaggleCrawler(BaseCrawler):
    source = "kaggle"
    label = "Kaggle"

    async def parse(self) -> list[Competition]:
        if not TOKEN_PATH.exists():
            raise CrawlError(
                f"缺少 Kaggle API token：请到 kaggle.com 个人设置页 Create New API Token，"
                f"把下载的 kaggle.json 放到 {TOKEN_PATH}"
            )
        try:
            token = json.loads(TOKEN_PATH.read_text(encoding="utf-8"))
            username, key = token["username"], token["key"]
        except (json.JSONDecodeError, KeyError) as exc:
            raise CrawlError(f"kaggle.json 格式不对（需要 username/key 字段）: {exc}") from exc

        items: list[dict] = []
        for page in range(1, _MAX_PAGES + 1):
            resp = await self.fetch(
                API_URL,
                params={"page": page},
                auth=(username, key),
            )
            batch = resp.json()
            if not isinstance(batch, list) or not batch:
                break
            items.extend(batch)
            if len(batch) < 20:  # 官方每页 20 条，不足即尾页
                break
        now = int(time.time())
        return parse_items(items, now)


def parse_items(items: list[dict], now: int | None = None) -> list[Competition]:
    """纯函数：官方 API 竞赛列表 → 统一模型。"""
    now = now if now is not None else int(time.time())
    rows: list[Competition] = []
    for it in items:
        cid = str(it.get("id") or "")
        title = it.get("title") or ""
        url = it.get("url") or ""
        if not cid or not title or not url:
            continue
        if it.get("category") in _EXCLUDED_CATEGORIES:
            continue
        end = _parse_iso(it.get("deadline"))
        if end and end < now - _FINISHED_KEEP_WINDOW:
            continue

        reward = it.get("reward") or None
        prize_amount, currency = parse_prize(reward)

        rows.append(
            Competition(
                source="kaggle",
                external_id=cid,
                title=title,
                url=url,
                category="datascience",
                organizer=it.get("organizationName") or None,
                prize_text=reward,
                prize_amount=prize_amount,
                currency=currency,
                end_time=end,
                teams_count=None,
                tags=[it.get("category")] if it.get("category") else [],
            )
        )
    return rows


def _parse_iso(text) -> int | None:
    """'2026-01-31T23:59:00Z' / '2026-01-31T23:59:00' → epoch 秒（UTC）。"""
    if not text:
        return None
    s = str(text).strip().replace("Z", "+00:00")
    try:
        dt = datetime.fromisoformat(s)
    except ValueError:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return int(dt.timestamp())
