# 命令行入口：
#   抓取全部源:  python -m app.cli crawl
#   抓单个源:    python -m app.cli crawl --source datafountain
#   查看库况:    python -m app.cli stats
import argparse
import asyncio
import sys

from . import db
from .crawlers.registry import CRAWLERS, crawl_all, crawl_source


def _utf8_stdout() -> None:
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass


def main() -> None:
    _utf8_stdout()
    parser = argparse.ArgumentParser(prog="app.cli", description="AI Contest Hub 命令行工具")
    sub = parser.add_subparsers(dest="cmd", required=True)

    p_crawl = sub.add_parser("crawl", help="抓取比赛数据")
    p_crawl.add_argument("--source", choices=sorted(CRAWLERS), help="只抓指定源，缺省抓全部")

    sub.add_parser("stats", help="查看库内各源统计与最近抓取结果")

    args = parser.parse_args()
    conn = db.connect()
    try:
        if args.cmd == "crawl":
            if args.source:
                count, err = asyncio.run(crawl_source(conn, args.source))
                if err:
                    print(f"[{args.source}] 失败: {err}")
                else:
                    print(f"[{args.source}] 入库 {count} 条")
            else:
                summary = asyncio.run(crawl_all(conn))
                ok = sum(1 for _, e in summary.values() if not e)
                for name, (count, err) in summary.items():
                    mark = "OK " if not err else "FAIL"
                    print(f"[{mark}] {name}: {count} 条 {err}")
                print(f"完成：{ok}/{len(summary)} 源成功")
        elif args.cmd == "stats":
            rows = conn.execute(
                "SELECT source, COUNT(*) AS n, SUM(end_time >= strftime('%s','now') OR end_time IS NULL) AS active_n "
                "FROM competitions GROUP BY source"
            ).fetchall()
            print("== 库内统计 ==")
            for r in rows:
                print(f"  {r['source']}: 共 {r['n']} 条，进行中/未截止 {r['active_n'] or 0} 条")
            runs = conn.execute(
                "SELECT source, ok, count, error, ts FROM crawl_runs ORDER BY id DESC LIMIT 10"
            ).fetchall()
            print("== 最近抓取 ==")
            for r in runs:
                print(f"  {r['ts']}  {r['source']}  {'OK' if r['ok'] else 'FAIL'}  {r['count']} 条  {r['error'] or ''}")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
