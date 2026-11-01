# FastAPI 入口：/（首页）+ /api/* + 进程内定时抓取调度。
from __future__ import annotations

import asyncio
import logging
import time
from contextlib import asynccontextmanager
from datetime import datetime, timedelta
from pathlib import Path
from urllib.parse import urlencode
from zoneinfo import ZoneInfo

from fastapi import FastAPI, Query, Request
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates

from . import db
from .api.competitions import router as api_router
from .api.feed import router as feed_router
from .api.stats import router as stats_router
from .config import CATEGORY_NAMES, ENABLE_SCHEDULER, INTEREST_FILTERS, SOURCE_NAMES, hub_url

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
log = logging.getLogger(__name__)
APP_DIR = Path(__file__).resolve().parent
templates = Jinja2Templates(directory=APP_DIR / "web" / "templates")
templates.env.globals["hub_url"] = hub_url
CST = ZoneInfo("Asia/Shanghai")

_scheduler = None


def _crawl_job(name: str):
    """调度器工作线程里执行单源抓取。"""

    def run():
        conn = db.connect()
        try:
            count, err = asyncio.run(_safe_crawl(conn, name))
            if err:
                log.warning("[sched:%s] 失败: %s", name, err)
            else:
                log.info("[sched:%s] 入库 %d 条", name, count)
        finally:
            conn.close()

    return run


async def _safe_crawl(conn, name):
    from .crawlers.registry import crawl_source

    try:
        return await crawl_source(conn, name)
    except Exception as exc:  # 未注册等意外，兜底隔离
        return 0, f"{type(exc).__name__}: {exc}"


def _start_scheduler():
    from apscheduler.schedulers.background import BackgroundScheduler

    from .crawlers.registry import SCHEDULE_HOURS

    global _scheduler
    _scheduler = BackgroundScheduler(timezone="Asia/Shanghai")
    start = datetime.now(CST) + timedelta(minutes=5)
    for i, (name, hours) in enumerate(SCHEDULE_HOURS.items()):
        # 各源错开 10 分钟，首轮在启动 5 分钟后陆续开始
        _scheduler.add_job(
            _crawl_job(name),
            "interval",
            hours=hours,
            start_date=start + timedelta(minutes=10 * i),
            id=f"crawl-{name}",
            max_instances=1,
            coalesce=True,
        )
    _scheduler.start()
    log.info("调度器已启动：%s", ", ".join(f"{n}({h}h)" for n, h in SCHEDULE_HOURS.items()))


@asynccontextmanager
async def lifespan(_: FastAPI):
    db.connect().close()  # 首次连接即建表
    if ENABLE_SCHEDULER:
        _start_scheduler()
    yield
    if _scheduler is not None:
        _scheduler.shutdown(wait=False)


app = FastAPI(title="d&f算法网 · AI 赛讯", lifespan=lifespan)
app.include_router(api_router)
app.include_router(stats_router)
app.include_router(feed_router)
app.mount("/static", StaticFiles(directory=APP_DIR / "web" / "static"), name="static")


@app.get("/healthz", include_in_schema=False)
def health():
    conn = db.connect()
    try:
        return {"ok": True, "competitions": db.count_competitions(conn)}
    finally:
        conn.close()


@app.get("/calendar")
def calendar(
    request: Request,
    month: str | None = Query(default=None, description="YYYY-MM，默认当月"),
    category: str | None = Query(default=None),
):
    """月历视图：比赛起止日期画横条（跨周事件在每周续条，贪心泳道避让）。"""
    from datetime import date, timedelta as _td

    # 解析目标月份
    today = datetime.now(CST).date()
    if month and len(month) == 7:
        try:
            first = date(int(month[:4]), int(month[5:7]), 1)
        except ValueError:
            first = today.replace(day=1)
    else:
        first = today.replace(day=1)

    # 周一开头的网格
    grid_start = first - _td(days=first.weekday())
    days_in_month = (first.replace(day=28) + _td(days=4)).replace(day=1) - _td(days=1)
    grid_end = first.replace(day=days_in_month.day)
    if grid_end.weekday() != 6:
        grid_end += _td(days=6 - grid_end.weekday())

    conn = db.connect()
    try:
        count = db.count_competitions(conn, category=category)
        rows = db.query_competitions(conn, category=category, sort="deadline", limit=max(1, count))
    finally:
        conn.close()

    events = []
    for row in rows:
        c = db.row_to_dict(row)
        if not c.get("start_time") or not c.get("end_time"):
            continue
        e_start = datetime.fromtimestamp(c["start_time"], CST).date()
        e_end = datetime.fromtimestamp(c["end_time"], CST).date()
        if e_end < e_start:
            continue
        if e_end < grid_start or e_start > grid_end:
            continue
        c["end_date"] = e_end.strftime("%Y-%m-%d")
        events.append({**c, "e_start": e_start, "e_end": e_end})
    events.sort(key=lambda e: (e["e_start"], -(e["e_end"] - e["e_start"]).days))

    # 事件 → 每周分段 + 贪心泳道
    lanes: list[list[tuple[int, int, int]]] = []  # lane -> [(week, col_start, col_end_exclusive), ...]

    def lane_free(lane, segs) -> bool:
        return not any(
            w == w2 and cs < ce2 and cs2 < ce
            for w, cs, ce in lane for w2, cs2, ce2 in segs
        )

    for ev in events:
        segs = []
        d = max(ev["e_start"], grid_start)
        end = min(ev["e_end"], grid_end)
        while d <= end:
            week_idx = (d - grid_start).days // 7
            week_first = grid_start + _td(days=week_idx * 7)
            col_start = (d - week_first).days
            col_end = min((end - week_first).days + 1, 7)
            segs.append((week_idx, col_start, col_end))
            d = week_first + _td(days=7)
        for li, lane in enumerate(lanes):
            if lane_free(lane, segs):
                lane.extend(segs)
                ev["lane"] = li
                break
        else:
            lanes.append(list(segs))
            ev["lane"] = len(lanes) - 1
        ev["segs"] = segs

    # 组装渲染数据
    total_days = (grid_end - grid_start).days + 1
    weeks = []
    for w in range(total_days // 7):
        week_days = []
        for i in range(7):
            d = grid_start + _td(days=w * 7 + i)
            week_days.append({"num": d.day, "in_month": d.month == first.month, "is_today": d == today})
        week_bars = []
        for ev in events:
            for wi, cs, ce in ev["segs"]:
                if wi == w:
                    week_bars.append({
                        "c": ev, "col_start": cs, "span": ce - cs,
                        "cont_left": ev["e_start"] < grid_start + _td(days=w * 7),
                        "cont_right": ev["e_end"] > grid_start + _td(days=w * 7 + 6),
                    })
        week_bars.sort(key=lambda b: (b["c"]["lane"], b["col_start"]))
        week_lanes = max((bar["c"]["lane"] + 1 for bar in week_bars), default=1)
        weeks.append({"days": week_days, "bars": week_bars, "lanes": week_lanes})

    prev_m = (first.replace(day=1) - _td(days=1)).strftime("%Y-%m")
    next_m = (first.replace(day=28) + _td(days=5)).replace(day=1).strftime("%Y-%m")

    def calendar_qs(**over):
        params = {"month": first.strftime("%Y-%m"), "category": category}
        params.update(over)
        return urlencode({key: value for key, value in params.items() if value})

    return templates.TemplateResponse(
        request,
        "calendar.html",
        {
            "weeks": weeks,
            "month_label": f"{first.year} 年 {first.month} 月",
            "prev_month": prev_m,
            "next_month": next_m,
            "this_month": today.strftime("%Y-%m"),
            "category": category,
            "category_names": CATEGORY_NAMES,
            "source_names": SOURCE_NAMES,
            "interest_filters": INTEREST_FILTERS,
            "calendar_qs": calendar_qs,
            "page_kind": "calendar",
            "event_count": len(events),
        },
    )


@app.get("/")
def index(
    request: Request,
    category: str | None = Query(default=None),
    status: str = Query(default="active"),
    q: str | None = Query(default=None),
    sort: str = Query(default="deadline"),
    page: int = Query(default=1, ge=1),
):
    """首页：服务端渲染比赛卡片列表（默认展示进行中+未开始）。"""
    conn = db.connect()
    try:
        total = db.count_competitions(conn, category=category, status=status, q=q)
        pages = max(1, (total + 59) // 60)
        page = min(page, pages)
        rows = db.query_competitions(
            conn, category=category, status=status, q=q, sort=sort, limit=60, offset=(page - 1) * 60,
        )
    finally:
        conn.close()

    now = int(time.time())
    items = []
    for row in rows:
        c = db.row_to_dict(row)
        c["end_date"] = (
            datetime.fromtimestamp(c["end_time"], CST).strftime("%Y-%m-%d")
            if c.get("end_time") else None
        )
        c["start_date"] = (
            datetime.fromtimestamp(c["start_time"], CST).strftime("%Y-%m-%d")
            if c.get("start_time") else None
        )
        c["days_left"] = (
            max(0, (c["end_time"] - now) // 86400)
            if c.get("end_time") else None
        )
        items.append(c)

    def _qs(**over) -> str:
        params = {"category": category, "status": status, "q": q, "sort": sort}
        params.update({k: v for k, v in over.items()})
        return urlencode({k: v for k, v in params.items() if v})

    return templates.TemplateResponse(
        request,
        "index.html",
        {
            "items": items,
            "total": total,
            "category": category,
            "status": status,
            "q": q or "",
            "sort": sort,
            "category_names": CATEGORY_NAMES,
            "source_names": SOURCE_NAMES,
            "interest_filters": INTEREST_FILTERS,
            "qs": _qs,
            "page": page,
            "pages": pages,
            "page_kind": "list",
        },
    )
