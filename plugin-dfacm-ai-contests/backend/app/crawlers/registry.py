# 源注册表：新增爬虫在此登记即可被 CLI/调度器发现。
from __future__ import annotations

from .base import BaseCrawler
from .codeforces import CodeforcesCrawler
from .datafountain import DataFountainCrawler
from .devpost import DevpostCrawler
from .drivendata import DrivenDataCrawler
from .kaggle import KaggleCrawler
from .lablab import LabLabCrawler
from .leetcode import LeetCodeCrawler
from .tianchi import TianchiCrawler
from .xfyun import XfyunCrawler

CRAWLERS: dict[str, type[BaseCrawler]] = {
    "datafountain": DataFountainCrawler,
    "tianchi": TianchiCrawler,
    "xfyun": XfyunCrawler,
    "kaggle": KaggleCrawler,
    "codeforces": CodeforcesCrawler,
    "leetcode": LeetCodeCrawler,
    "lablab": LabLabCrawler,
    "devpost": DevpostCrawler,
    "drivendata": DrivenDataCrawler,
}

# 调度配置：源 → 小时数（OJ 类赛程变化快，抓勤一点）
SCHEDULE_HOURS: dict[str, int] = {
    "codeforces": 2,
    "leetcode": 2,
    "datafountain": 6,
    "tianchi": 6,
    "xfyun": 6,
    "kaggle": 6,
    "lablab": 6,
    "devpost": 6,
    "drivendata": 12,
}


async def crawl_source(conn, name: str) -> tuple[int, str]:
    """抓取单个源，返回 (入库条数, 错误信息)。"""
    cls = CRAWLERS.get(name)
    if cls is None:
        raise KeyError(f"未注册的数据源: {name}（可用: {', '.join(CRAWLERS)}）")
    return await cls(conn).crawl()


async def crawl_all(conn) -> dict[str, tuple[int, str]]:
    """逐源串行抓取全部源，单源失败不影响后续。"""
    summary: dict[str, tuple[int, str]] = {}
    for name in CRAWLERS:
        summary[name] = await crawl_source(conn, name)
    return summary
