"""Offline response contracts exercise the real crawlers, HTTP and SQLite path."""
import asyncio
import copy
import json
import os
import sys
import tempfile
import unittest
from contextlib import contextmanager
from pathlib import Path
from unittest.mock import patch

import httpx
from bs4 import BeautifulSoup

os.environ["ACH_ENABLE_SCHEDULER"] = "0"
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))

from app import db
from app.crawlers import base, registry
from app.crawlers.base import CrawlError
from app.crawlers.datafountain import DataFountainCrawler, parse_html
from app.crawlers.devpost import DevpostCrawler
from app.models import Competition

FIXTURES = Path(__file__).parent / "fixtures"
DEVPOST = json.loads((FIXTURES / "devpost_p1.json").read_text(encoding="utf-8"))
DATAFOUNTAIN = (FIXTURES / "df_p1.html").read_text(encoding="utf-8")
ASYNC_CLIENT = httpx.AsyncClient


@contextmanager
def offline_http(handler):
    """Replace only external HTTP; parse, crawl, upsert and logging stay real."""
    def client(**kwargs):
        return ASYNC_CLIENT(transport=httpx.MockTransport(handler), **kwargs)

    with patch.object(base.httpx, "AsyncClient", side_effect=client), patch.object(base, "PAGE_INTERVAL", 0):
        yield


def json_response(payload):
    return httpx.Response(200, json=payload)


def empty_datafountain_html():
    # The legitimate list marker comes from the committed SSR fixture. Only the
    # cards are removed: no guessed selector or invented empty-page text.
    soup = BeautifulSoup(DATAFOUNTAIN, "lxml")
    soup.select_one(".df-page-competitions .compt-list").clear()
    return str(soup)


class CrawlResponseValidationTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="collector-responses-")
        self.path_patch = patch.object(db, "DB_PATH", Path(self.temp.name) / "competitions.db")
        self.path_patch.start()
        self.conn = db.connect()

    def tearDown(self):
        self.conn.close()
        self.path_patch.stop()
        self.temp.cleanup()

    def assert_bad_parse(self, crawler_type, handler):
        async def parse():
            crawler = crawler_type(self.conn)
            async with httpx.AsyncClient() as client:
                crawler.client = client
                return await crawler.parse()

        with offline_http(handler), self.assertRaises(CrawlError):
            asyncio.run(parse())

    def test_devpost_rejects_missing_error_and_wrong_typed_structures(self):
        # Replacing these validations with falsy defaults makes bad sources look
        # like successful empty lists, or leaks a non-CrawlError parser exception.
        valid = {"hackathons": [], "meta": {"total_count": 0, "per_page": 9}}
        bad = [
            {}, {"error": "maintenance"}, {"errors": ["login required"]},
            {**valid, "error": "maintenance"}, {**valid, "errors": ["unavailable"]},
            [], None,
            {"meta": valid["meta"]}, {**valid, "hackathons": None},
            {**valid, "hackathons": {}}, {**valid, "hackathons": ["bad card"]},
            {"hackathons": []}, {**valid, "meta": None}, {**valid, "meta": []},
            {**valid, "meta": {"per_page": 9}}, {**valid, "meta": {"total_count": 0}},
        ]
        for field in ("total_count", "per_page"):
            for value in (None, "9", True, 1.5, -1):
                payload = copy.deepcopy(valid)
                payload["meta"][field] = value
                bad.append(payload)
        payload = copy.deepcopy(valid)
        payload["meta"]["per_page"] = 0
        bad.append(payload)
        for payload in bad:
            with self.subTest(payload=payload):
                self.assert_bad_parse(DevpostCrawler, lambda request: json_response(payload))

    def test_devpost_rejects_http_200_non_json(self):
        self.assert_bad_parse(DevpostCrawler, lambda request: httpx.Response(200, text="<h1>Maintenance</h1>"))

    def test_committed_devpost_fixture_preserves_filtering_and_deduplication(self):
        def handler(request):
            self.assertEqual(request.url.host, "www.devpost.com")
            return json_response(DEVPOST[request.url.params["status"]])

        with offline_http(handler):
            self.assertEqual(asyncio.run(DevpostCrawler(self.conn).crawl()), (14, ""))
        first = self.conn.execute("SELECT * FROM competitions WHERE external_id='31302'").fetchone()
        self.assertEqual((first["title"], first["url"], first["prize_amount"], first["currency"]),
                         ("PayPal AI Hackathon", "https://paypalaihackathon.devpost.com/", 6.75, "USD"))
        self.assertEqual(self.conn.execute("SELECT count(*) FROM competitions").fetchone()[0], 14)

    def test_valid_empty_json_and_fixture_list_are_successful_zero_runs(self):
        for crawler, response in (
            (DevpostCrawler, json_response({"hackathons": [], "meta": {"total_count": 0, "per_page": 9}})),
            (DataFountainCrawler, httpx.Response(200, text=empty_datafountain_html())),
        ):
            with self.subTest(source=crawler.source), offline_http(lambda request: response):
                self.assertEqual(asyncio.run(crawler(self.conn).crawl()), (0, ""))
                run = self.conn.execute("SELECT * FROM crawl_runs ORDER BY id DESC LIMIT 1").fetchone()
                self.assertEqual((run["source"], run["ok"], run["count"], run["error"]),
                                 (crawler.source, 1, 0, ""))

    def test_datafountain_rejects_maintenance_login_error_and_missing_list(self):
        pages = ["", "<html><h1>Under maintenance</h1></html>",
                 '<html><form action="/login"><input type="password"></form></html>',
                 "<html><title>500 Server Error</title></html>",
                 '<div class="compt-list"></div>',
                 '<div class="df-page-competitions"><div class="compt-list"><div class="compt-item"></div></div></div>']
        empty = BeautifulSoup(empty_datafountain_html(), "lxml")
        empty.title.string = "Maintenance"
        pages.append(str(empty))
        empty = BeautifulSoup(empty_datafountain_html(), "lxml")
        heading = empty.new_tag("h1")
        heading.string = "Under maintenance"
        empty.select_one(".compt-list").append(heading)
        pages.append(str(empty))
        for html in pages:
            with self.subTest(html=html):
                self.assert_bad_parse(DataFountainCrawler, lambda request: httpx.Response(200, text=html))
                with self.assertRaises(CrawlError):
                    parse_html(html)

    def test_failed_later_pages_preserve_old_rows_and_other_sources_continue(self):
        for failed in ("devpost", "datafountain"):
            with self.subTest(failed=failed):
                self.conn.execute("DELETE FROM competitions")
                self.conn.execute("DELETE FROM crawl_runs")
                db.upsert_competitions(self.conn, [Competition(
                    source=failed, external_id="31302" if failed == "devpost" else "1169",
                    title="Original saved title", url="https://example.test/original",
                    organizer="Saved organizer", tags=["saved"], description="Keep old content",
                )])
                self.conn.execute("UPDATE competitions SET first_seen_at=123, last_seen_at=456")
                self.conn.commit()
                before = dict(self.conn.execute("SELECT * FROM competitions").fetchone())

                def handler(request):
                    if request.url.host == "www.devpost.com":
                        if failed == "devpost" and request.url.params["page"] == "2":
                            return json_response({"error": "maintenance"})
                        return json_response(DEVPOST[request.url.params["status"]])
                    if request.url.host == "www.datafountain.cn":
                        if failed == "datafountain" and request.url.params.get("page") == "2":
                            return httpx.Response(200, text="<h1>Under maintenance</h1>")
                        return httpx.Response(200, text=DATAFOUNTAIN)
                    raise AssertionError(f"Unexpected external URL: {request.url}")

                successful = "datafountain" if failed == "devpost" else "devpost"
                crawlers = {failed: registry.CRAWLERS[failed], successful: registry.CRAWLERS[successful]}
                with offline_http(handler), patch.dict(registry.CRAWLERS, crawlers, clear=True):
                    with self.assertLogs("app.crawlers.base", level="WARNING") as logs:
                        results = asyncio.run(registry.crawl_all(self.conn))
                self.assertEqual(results[failed][0], 0)
                self.assertIn("CrawlError:", results[failed][1])
                self.assertTrue(any(f"[{failed}]" in line and "CrawlError:" in line for line in logs.output))
                self.assertEqual(results[successful], (30 if successful == "datafountain" else 14, ""))
                after = dict(self.conn.execute("SELECT * FROM competitions WHERE source=?", (failed,)).fetchone())
                self.assertEqual(after, before)
                self.assertEqual((after["title"], after["last_seen_at"]), ("Original saved title", 456))
                runs = self.conn.execute("SELECT source,ok,count,error FROM crawl_runs ORDER BY id").fetchall()
                self.assertEqual([(r["source"], r["ok"], r["count"]) for r in runs],
                                 [(failed, 0, 0), (successful, 1, 30 if successful == "datafountain" else 14)])
                self.assertIn("CrawlError:", runs[0]["error"])


if __name__ == "__main__":
    unittest.main()
