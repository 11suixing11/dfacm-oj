# 科大讯飞 AI 开发者大赛爬虫：h5 站公开接口 /2020/ai-contest/api/contests/contests-list。
# PC 端 algorithm/contest-list 需登录，h5 接口匿名可用（Referer 需带 h5 路径）。
from __future__ import annotations

import time
from datetime import datetime

from ..models import CST, Competition
from .base import BaseCrawler, CrawlError

API_URL = "https://challenge.xfyun.cn/2020/ai-contest/api/contests/contests-list"
TOPIC_URL = "https://challenge.xfyun.cn/topic/info?competitionCode="
# 近期历史赛保留窗口
_KEEP_WINDOW = 60 * 86400
# 只要算法赛/应用赛/星火赛，滤掉训练赛(train)/少儿赛(children)/校园赛(school)等
_KEEP_TYPES = {"algorithem", "application", "xinghuo"}


class XfyunCrawler(BaseCrawler):
    source = "xfyun"
    label = "讯飞开发者大赛"

    async def parse(self) -> list[Competition]:
        # 接口对 UA 不敏感但对 Referer 有校验
        resp = await self.fetch(
            API_URL,
            headers={"Referer": "https://challenge.xfyun.cn/h5/tiaozhanbei"},
        )
        d = resp.json()
        if d.get("flag") is not True or not isinstance(d.get("data"), list):
            raise CrawlError(f"讯飞接口返回异常: {str(d)[:200]}")
        return parse_topics(d["data"], int(time.time()))


def parse_topics(topics: list[dict], now: int | None = None) -> list[Competition]:
    """纯函数：全量赛题列表 → 近期相关赛题。"""
    now = now if now is not None else int(time.time())
    rows: list[Competition] = []
    for it in topics:
        if it.get("type_basic_problem") not in _KEEP_TYPES:
            continue
        name = (it.get("name_basic_problem") or "").strip()
        code = str(it.get("contest_name") or "")
        if not name or not code:
            continue

        register_end = _parse_date(it.get("registerEnd_basic_problem"))
        final_end = _parse_date(it.get("finalEnd_basic_problem"))
        # 比赛真正结束时间优先决赛结束，否则用报名截止
        end = final_end or register_end
        start = _parse_date(it.get("registerBegin_basic_problem"))
        if end and end < now - _KEEP_WINDOW:
            continue  # 太久远的历史赛不入库

        prize_amount = None
        prize_text = None
        try:
            bonus = float(it.get("bonus_basic_problem") or 0)
            if bonus > 0:
                prize_amount = bonus  # 接口单位就是万元
                prize_text = f"¥{bonus:g}万"
        except (TypeError, ValueError):
            pass

        try:
            teams = int(it.get("team_count") or 0) or None
        except (TypeError, ValueError):
            teams = None

        tags = [t for t in (it.get("industry") or "").split() if t]
        kind = it.get("type_basic_problem")
        if kind == "application":
            category = "llm_agent"   # 应用赛以智能体/应用落地为核心
        elif kind == "xinghuo":
            category = "llm_agent"
        else:
            category = "datascience"

        rows.append(
            Competition(
                source="xfyun",
                external_id=code,
                title=name,
                url=it.get("external_link") or (TOPIC_URL + code),
                category=category,
                organizer=(it.get("sponsorName_basic_problem") or "").strip() or None,
                prize_text=prize_text,
                prize_amount=prize_amount,
                currency="CNY",
                start_time=start,
                end_time=end,
                teams_count=teams,
                tags=tags,
                description=(it.get("desc_basic_problem") or "")[:500] or None,
            )
        )
    return rows


def _parse_date(text) -> int | None:
    """'2026-09-24'（北京时间）→ epoch 秒。"""
    if not text or str(text).startswith("1999"):
        return None
    try:
        return int(datetime.strptime(str(text)[:10], "%Y-%m-%d").replace(tzinfo=CST).timestamp())
    except ValueError:
        return None
