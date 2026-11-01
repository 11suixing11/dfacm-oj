# SQLite 存取：建表、幂等 upsert、抓取日志、查询。
from __future__ import annotations

import json
import sqlite3
import time

from .config import DB_PATH
from .models import Competition, derive_status

_SCHEMA = """
CREATE TABLE IF NOT EXISTS competitions (
  id INTEGER PRIMARY KEY,
  source TEXT NOT NULL,
  external_id TEXT NOT NULL,
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  category TEXT NOT NULL,
  organizer TEXT,
  prize_text TEXT,
  prize_amount REAL,
  currency TEXT DEFAULT 'CNY',
  start_time INTEGER,
  end_time INTEGER,
  status TEXT,
  teams_count INTEGER,
  tags TEXT,
  description TEXT,
  first_seen_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL,
  UNIQUE(source, external_id)
);
CREATE INDEX IF NOT EXISTS idx_comp_category ON competitions(category);
CREATE INDEX IF NOT EXISTS idx_comp_end ON competitions(end_time);
CREATE INDEX IF NOT EXISTS idx_comp_source ON competitions(source);

CREATE TABLE IF NOT EXISTS crawl_runs (
  id INTEGER PRIMARY KEY,
  source TEXT NOT NULL,
  ok INTEGER NOT NULL,
  count INTEGER NOT NULL,
  error TEXT,
  duration REAL,
  ts INTEGER NOT NULL
);
"""


def connect() -> sqlite3.Connection:
    """打开（并确保建好）数据库连接。调用方负责 close。"""
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA busy_timeout=5000")
    conn.executescript(_SCHEMA)
    return conn


def upsert_competitions(conn: sqlite3.Connection, rows: list[Competition]) -> int:
    """按 (source, external_id) 幂等入库，已有记录更新内容并推进 last_seen_at。"""
    now = int(time.time())
    n = 0
    with conn:
        for r in rows:
            status = derive_status(r.start_time, r.end_time, now)
            cur = conn.execute(
                """INSERT INTO competitions
                     (source, external_id, title, url, category, organizer, prize_text,
                      prize_amount, currency, start_time, end_time, status, teams_count,
                      tags, description, first_seen_at, last_seen_at)
                   VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
                   ON CONFLICT(source, external_id) DO UPDATE SET
                     title=excluded.title, url=excluded.url, category=excluded.category,
                     organizer=excluded.organizer, prize_text=excluded.prize_text,
                     prize_amount=excluded.prize_amount, currency=excluded.currency,
                     start_time=excluded.start_time, end_time=excluded.end_time,
                     status=excluded.status, teams_count=excluded.teams_count,
                     tags=excluded.tags, description=excluded.description,
                     last_seen_at=excluded.last_seen_at""",
                (
                    r.source, r.external_id, r.title, r.url, r.category, r.organizer,
                    r.prize_text, r.prize_amount, r.currency, r.start_time, r.end_time,
                    status, r.teams_count, json.dumps(r.tags, ensure_ascii=False),
                    r.description, now, now,
                ),
            )
            n += cur.rowcount
    return n


def log_crawl_run(conn: sqlite3.Connection, source: str, *, ok: bool, count: int, error: str, duration: float) -> None:
    with conn:
        conn.execute(
            "INSERT INTO crawl_runs (source, ok, count, error, duration, ts) VALUES (?,?,?,?,?,?)",
            (source, int(ok), count, error, duration, int(time.time())),
        )


# 由起止时间实时推导的状态 SQL 片段（需绑定 :now 参数）
_STATUS_SQL = (
    "CASE WHEN end_time IS NOT NULL AND end_time < :now THEN 'ended' "
    "WHEN start_time IS NOT NULL AND start_time > :now THEN 'upcoming' "
    "ELSE 'ongoing' END"
)

_SORT_SQL = {
    "deadline": "COALESCE(end_time, 4102444800) ASC",   # 无截止日期的排最后
    "prize": "prize_amount IS NULL, prize_amount DESC",
    "newest": "first_seen_at DESC, id DESC",
}


def _build_filters(category, source, status, q, now, params):
    where = []
    from .config import INTEREST_FILTERS  # 兴趣伪分类按 tags 过滤
    if category:
        if category in INTEREST_FILTERS:
            where.append("tags LIKE :tag_filter")
            params["tag_filter"] = f'%"{category}"%'
        else:
            where.append("category = :category")
            params["category"] = category
    if source:
        where.append("source = :source")
        params["source"] = source
    if q:
        where.append("(title LIKE :q OR organizer LIKE :q OR tags LIKE :q)")
        params["q"] = f"%{q}%"
    if status == "active":
        where.append("(end_time IS NULL OR end_time >= :now)")
    elif status in ("ongoing", "upcoming", "ended"):
        where.append(f"{_STATUS_SQL} = :status")
        params["status"] = status
    # status 为 None 或 "all" 时不过滤
    return where


def count_competitions(conn, *, category=None, source=None, status=None, q=None) -> int:
    now = int(time.time())
    params: dict = {"now": now}
    where = _build_filters(category, source, status, q, now, params)
    sql = "SELECT COUNT(*) FROM competitions" + (" WHERE " + " AND ".join(where) if where else "")
    return conn.execute(sql, params).fetchone()[0]


def query_competitions(conn, *, category=None, source=None, status=None, q=None,
                       sort="deadline", limit=100, offset=0) -> list[sqlite3.Row]:
    now = int(time.time())
    params: dict = {"now": now, "limit": limit, "offset": offset}
    where = _build_filters(category, source, status, q, now, params)
    order = _SORT_SQL.get(sort, _SORT_SQL["deadline"])
    sql = f"SELECT *, {_STATUS_SQL} AS live_status FROM competitions"
    if where:
        sql += " WHERE " + " AND ".join(where)
    sql += f" ORDER BY {order} LIMIT :limit OFFSET :offset"
    return conn.execute(sql, params).fetchall()


def row_to_dict(row: sqlite3.Row) -> dict:
    d = dict(row)
    try:
        d["tags"] = json.loads(d.get("tags") or "[]")
    except (TypeError, ValueError):
        d["tags"] = []
    return d
