# 统一比赛数据模型与归一化工具。
from __future__ import annotations

import re
from datetime import datetime, timedelta, timezone

from pydantic import BaseModel, Field

# 北京时间（无夏令时，UTC+8 固定）
CST = timezone(timedelta(hours=8))

CATEGORIES = ("datascience", "aigc", "oj", "llm_agent", "hackathon", "other")


class Competition(BaseModel):
    """跨平台统一后的单场比赛。"""

    source: str
    external_id: str
    title: str
    url: str
    category: str = "other"
    organizer: str | None = None
    prize_text: str | None = None      # 原始奖金文本，如 "￥90,000"
    prize_amount: float | None = None  # 归一化数值，单位：万元
    currency: str = "CNY"
    start_time: int | None = None      # epoch 秒
    end_time: int | None = None
    teams_count: int | None = None
    tags: list[str] = Field(default_factory=list)
    description: str | None = None


_DATE_FORMATS = ("%Y.%m.%d", "%Y-%m-%d", "%Y/%m/%d", "%Y.%m.%d %H:%M", "%Y-%m-%d %H:%M")


def parse_date(text: str | None) -> int | None:
    """把 '2026.04.07' 等北京时间日期串解析为 epoch 秒，失败返回 None。"""
    if not text:
        return None
    text = text.strip()
    for fmt in _DATE_FORMATS:
        try:
            return int(datetime.strptime(text, fmt).replace(tzinfo=CST).timestamp())
        except ValueError:
            continue
    return None


def derive_status(start_time: int | None, end_time: int | None, now: int | None = None) -> str:
    """由起止时间推导状态：upcoming / ongoing / ended。"""
    now = now if now is not None else int(datetime.now(tz=timezone.utc).timestamp())
    if end_time is not None and end_time < now:
        return "ended"
    if start_time is not None and start_time > now:
        return "upcoming"
    return "ongoing"


# 币种识别顺序重要：美元/欧元/港元在前，"元" 兜底放最后
_CURRENCY_PATTERNS: tuple[tuple[re.Pattern[str], str], ...] = (
    (re.compile(r"\$|USD|美元|美金"), "USD"),
    (re.compile(r"€|EUR|欧元"), "EUR"),
    (re.compile(r"港元|港币|HKD"), "HKD"),
    (re.compile(r"¥|￥|RMB|人民币|元"), "CNY"),
)
_NUM_RE = re.compile(r"(\d[\d,]*(?:\.\d+)?)\s*(万)?")


def parse_prize(text: str | None) -> tuple[float | None, str]:
    """解析奖金文本 → (万元数值, 币种)。

    '￥300,000'→(30.0,'CNY')；'15.5万港元'→(15.5,'HKD')；'$75,000'→(7.5,'USD')。
    无数字（如 '其他'）返回 (None, 'CNY')。
    """
    if not text:
        return None, "CNY"
    currency = "CNY"  # 中文语境缺省人民币；带外币符号时按符号覆盖
    for pat, cur in _CURRENCY_PATTERNS:
        if pat.search(text):
            currency = cur
            break
    m = _NUM_RE.search(text)
    if not m:
        return None, currency
    value = float(m.group(1).replace(",", ""))
    if m.group(2):  # 已带"万"
        return value, currency
    return value / 10000.0, currency


# ---- 全源统一的兴趣标签（在 BaseCrawler 入库前统一追加）----
_VIBE_TAG_RE = re.compile(
    r"vibe\s*coding|氛围编程|AI\s*编程|智能编程|代码补全|代码助手|AI\s*Code|Claude\s*Code|"
    r"Cursor|Copilot|Windsurf|Cline|Aider|bolt\.new|Lovable|Replit|OpenClaw|"
    r"Skill\s*(?:开发|挑战|大赛|开发挑战)|Low/?\s*No.?Code|No.?Code|低代码|无代码|Buildathon", re.I)
_AGENT_TAG_RE = re.compile(r"Agent|智能体|大模型|LLM|GPT[-\s]|RAG|提示词|Prompt", re.I)


def augment_tags(c: Competition) -> Competition:
    """按标题+描述+原始标签关键词统一追加 vibe-coding / agent 兴趣标签（全源生效）。"""
    blob = " ".join(x for x in (c.title, c.description, " ".join(c.tags)) if x)
    if _VIBE_TAG_RE.search(blob) and "vibe-coding" not in c.tags:
        c.tags.append("vibe-coding")
    if _AGENT_TAG_RE.search(blob) and "agent" not in c.tags:
        c.tags.append("agent")
    return c
