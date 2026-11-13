# REST: GET /api/stats —— 各源库内统计 + 最近抓取状态。
from fastapi import APIRouter

from .. import db

router = APIRouter(prefix="/api")


@router.get("/stats")
def stats():
    conn = db.connect()
    try:
        comp_rows = conn.execute(
            """SELECT source,
                      COUNT(*) AS total,
                      SUM(CASE WHEN end_time IS NULL OR end_time >= strftime('%s','now') THEN 1 ELSE 0 END) AS active
               FROM competitions GROUP BY source"""
        ).fetchall()
        run_rows = conn.execute(
            """SELECT source, ok, count, error, duration, ts
               FROM crawl_runs
               WHERE id IN (SELECT MAX(id) FROM crawl_runs GROUP BY source)"""
        ).fetchall()
        last_runs = {r["source"]: r for r in run_rows}
        competitions = {r["source"]: r for r in comp_rows}

        sources = []
        for source in sorted(competitions.keys() | last_runs.keys()):
            r = competitions.get(source)
            last = last_runs.get(source)
            sources.append({
                "source": source,
                "total": r["total"] if r else 0,
                "active": (r["active"] or 0) if r else 0,
                "last_crawl": {
                    "ok": bool(last["ok"]) if last else None,
                    "count": last["count"] if last else None,
                    "error": last["error"] if last else None,
                    "ts": last["ts"] if last else None,
                },
            })
        return {
            "sources": sources,
            "total_competitions": sum(r["total"] for r in comp_rows),
        }
    finally:
        conn.close()
