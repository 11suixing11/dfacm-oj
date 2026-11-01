# REST API：GET /api/competitions
from fastapi import APIRouter, Query

from .. import db

router = APIRouter(prefix="/api")


@router.get("/competitions")
def list_competitions(
    category: str | None = Query(
        default=None,
        description="统一分类 datascience/aigc/oj/llm_agent/hackathon/other，"
                    "或兴趣筛选 vibe-coding/agent（按 tags 过滤）",
    ),
    source: str | None = Query(default=None, description="平台标识，如 datafountain"),
    status: str | None = Query(
        default=None,
        description="active=进行中+未开始（默认不过滤）；ongoing/upcoming/ended 单选；all 不过滤",
        pattern="^(active|ongoing|upcoming|ended|all)$",
    ),
    q: str | None = Query(default=None, description="关键词，匹配标题/主办方/标签"),
    sort: str = Query(default="deadline", description="deadline|prize|newest", pattern="^(deadline|prize|newest)$"),
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
):
    """比赛列表。状态由起止时间实时推导，非入库快照。"""
    status = None if status == "all" else status
    conn = db.connect()
    try:
        total = db.count_competitions(conn, category=category, source=source, status=status, q=q)
        rows = db.query_competitions(
            conn, category=category, source=source, status=status, q=q,
            sort=sort, limit=limit, offset=offset,
        )
        return {"total": total, "items": [db.row_to_dict(r) for r in rows]}
    finally:
        conn.close()
