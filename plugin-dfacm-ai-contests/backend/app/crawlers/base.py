# 爬虫基类：统一抓取/重试/限流/入库，单源失败只影响自己。
from __future__ import annotations

import asyncio
import logging
import time
from abc import ABC, abstractmethod

import httpx

from ..config import FETCH_RETRIES, PAGE_INTERVAL, REQUEST_TIMEOUT, USER_AGENT
from ..db import log_crawl_run, upsert_competitions
from ..models import Competition, augment_tags

log = logging.getLogger(__name__)


class CrawlError(Exception):
    """抓取失败（重试耗尽等）。"""


class BaseCrawler(ABC):
    """单平台爬虫。子类实现 parse()，内部通过 self.fetch() 取页面/接口。"""

    source: str = ""    # 平台标识（入库用）
    label: str = ""     # 展示名

    def __init__(self, conn):
        self.conn = conn
        self.client: httpx.AsyncClient | None = None
        self._last_request = 0.0

    async def crawl(self) -> tuple[int, str]:
        """执行一轮抓取并入库，返回 (入库条数, 错误信息)。异常不外抛（单源隔离）。"""
        started = time.monotonic()
        try:
            async with httpx.AsyncClient(
                headers={"User-Agent": USER_AGENT, "Accept-Language": "zh-CN,zh;q=0.9"},
                follow_redirects=True,
                timeout=REQUEST_TIMEOUT,
            ) as client:
                self.client = client
                rows = await self.parse()
            valid = [augment_tags(r) for r in rows if r.title and r.url]
            upsert_competitions(self.conn, valid)
            elapsed = time.monotonic() - started
            log_crawl_run(self.conn, self.source, ok=True, count=len(valid), error="", duration=elapsed)
            log.info("[%s] 抓取成功 %d 条 (%.1fs)", self.source, len(valid), elapsed)
            return len(valid), ""
        except Exception as exc:  # 单源失败只记日志，不影响其他源
            elapsed = time.monotonic() - started
            err = f"{type(exc).__name__}: {exc}"
            log.warning("[%s] 抓取失败: %s", self.source, err)
            log_crawl_run(self.conn, self.source, ok=False, count=0, error=err, duration=elapsed)
            return 0, err

    async def fetch(self, url: str, **kwargs) -> httpx.Response:
        """带礼貌间隔、超时和重试退避的 GET。只在 parse() 内调用。"""
        if self.client is None:
            raise CrawlError("fetch 只能在 crawl/parse 流程内调用")
        last_exc: Exception | None = None
        for attempt in range(FETCH_RETRIES + 1):
            gap = PAGE_INTERVAL - (time.monotonic() - self._last_request)
            if gap > 0:
                await asyncio.sleep(gap)
            self._last_request = time.monotonic()
            try:
                resp = await self.client.get(url, **kwargs)
                resp.raise_for_status()
                return resp
            except httpx.HTTPError as exc:
                last_exc = exc
                if attempt < FETCH_RETRIES:
                    await asyncio.sleep(2.0 * (attempt + 1))
        raise CrawlError(f"GET {url} 失败: {last_exc!r}")

    async def fetch_json(self, url: str, **kwargs) -> dict:
        """读取 JSON 对象；HTTP 200 的错误页/错误载荷同样算源失败。"""
        resp = await self.fetch(url, **kwargs)
        try:
            data = resp.json()
        except ValueError as exc:
            raise CrawlError(f"GET {url} 未返回有效 JSON") from exc
        if not isinstance(data, dict):
            raise CrawlError(f"GET {url} JSON 必须是对象")
        if data.get("error") or data.get("errors"):
            raise CrawlError(f"GET {url} 返回错误: {data.get('error') or data.get('errors')}")
        return data

    @abstractmethod
    async def parse(self) -> list[Competition]:
        """抓取并解析本源全部比赛，返回统一模型列表。"""
