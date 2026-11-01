# 订阅输出：GET /feed.ics（日历订阅）、GET /feed.xml（RSS）。
from __future__ import annotations

import time
from datetime import datetime, timedelta, timezone
from xml.sax.saxutils import escape

from fastapi import APIRouter, Query
from fastapi.responses import Response

from .. import db
from ..config import PUBLIC_URL, SOURCE_NAMES

router = APIRouter()

_SITE = "d&f算法网 · AI 赛讯"


def _feed_rows(status: str = "active", category: str | None = None, q: str | None = None):
    conn = db.connect()
    try:
        count = db.count_competitions(conn, category=category, status=status, q=q)
        return db.query_competitions(conn, category=category, status=status, q=q, sort="deadline", limit=max(1, count))
    finally:
        conn.close()


def _dt_date(epoch: int) -> str:
    """epoch → iCalendar 全天日期 YYYYMMDD（UTC+8 视角）。"""
    cst = timezone(timedelta(hours=8))
    return datetime.fromtimestamp(epoch, tz=cst).strftime("%Y%m%d")


def _ics_text(value: str) -> str:
    return str(value).replace("\\", "\\\\").replace("\r\n", "\n").replace("\r", "\n").replace("\n", "\\n").replace(";", "\\;").replace(",", "\\,")


def _fold_line(line: str) -> str:
    parts = []
    current = ""
    size = 0
    for char in line:
        width = len(char.encode("utf-8"))
        if size + width > 75:
            parts.append(current)
            current = " "
            size = 1
        current += char
        size += width
    parts.append(current)
    return "\r\n".join(parts)


@router.get("/feed.ics")
def ics(
    category: str | None = Query(default=None),
    q: str | None = Query(default=None),
    status: str = Query(default="active", pattern="^(active|ongoing|upcoming|ended|all)$"),
):
    """iCalendar 订阅：进行中/未开始的比赛为全天日程（可导入手机日历）。"""
    rows = _feed_rows(status, category, q)
    now_utc = datetime.now(tz=timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//ai-contest-hub//AI Competitions//CN",
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
        "X-WR-CALNAME:" + _ics_text(_SITE),
    ]
    for r in rows:
        if not r["start_time"] or not r["end_time"]:
            continue
        if r["end_time"] < r["start_time"]:
            continue
        src = SOURCE_NAMES.get(r["source"], r["source"])
        desc = " / ".join(filter(None, [
            src, r["organizer"], r["prize_text"],
        ]))
        end_next = int(r["end_time"]) + 86400  # iCal DTEND 对全天事件是排他的，多算一天
        lines += [
            "BEGIN:VEVENT",
            f"UID:{_ics_text(r['source'] + '-' + r['external_id'])}@ai-contest-hub",
            f"DTSTAMP:{now_utc}",
            f"DTSTART;VALUE=DATE:{_dt_date(r['start_time'])}",
            f"DTEND;VALUE=DATE:{_dt_date(end_next)}",
            f"SUMMARY:{_ics_text(r['title'])}",
            f"DESCRIPTION:{_ics_text(desc)}",
            f"URL:{r['url'].replace(chr(13), '').replace(chr(10), '')}",
            "END:VEVENT",
        ]
    lines.append("END:VCALENDAR")
    body = "\r\n".join(_fold_line(line) for line in lines) + "\r\n"
    return Response(content=body, media_type="text/calendar; charset=utf-8", headers={
        "Cache-Control": "public, max-age=300",
        "Content-Disposition": 'inline; filename="dfacm-ai-contests.ics"',
    })


@router.get("/feed.xml")
def rss(
    category: str | None = Query(default=None),
    q: str | None = Query(default=None),
    status: str = Query(default="active", pattern="^(active|ongoing|upcoming|ended|all)$"),
):
    """RSS 2.0：最近收录的比赛。"""
    rows = _feed_rows(status, category, q)
    now = time.strftime("%a, %d %b %Y %H:%M:%S GMT", time.gmtime())
    items = []
    for r in rows:
        src = SOURCE_NAMES.get(r["source"], r["source"])
        desc = " / ".join(filter(None, [src, r["organizer"], r["prize_text"]]))
        pub = time.strftime("%a, %d %b %Y %H:%M:%S GMT", time.gmtime(r["first_seen_at"]))
        items.append(
            "<item>"
            f"<title>{escape(r['title'])}</title>"
            f"<link>{escape(r['url'])}</link>"
            f"<guid isPermaLink=\"false\">{escape(r['source'] + '-' + r['external_id'])}@ai-contest-hub</guid>"
            f"<description>{escape(desc)}</description>"
            f"<pubDate>{pub}</pubDate>"
            "</item>"
        )
    xml = (
        '<?xml version="1.0" encoding="UTF-8"?>'
        '<rss version="2.0"><channel>'
        f"<title>{escape(_SITE)}</title>"
        f"<link>{escape(PUBLIC_URL)}</link>"
        f"<description>AI 比赛聚合 · 进行中/未开始</description>"
        f"<lastBuildDate>{now}</lastBuildDate>"
        + "".join(items) +
        "</channel></rss>"
    )
    return Response(content=xml, media_type="application/rss+xml; charset=utf-8", headers={"Cache-Control": "public, max-age=300"})
