"""Exercise the mounted website, filters, full lists, calendar and subscriptions."""
import os
import sys
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import parse_qs, urlsplit
from xml.etree import ElementTree

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))
_database = tempfile.TemporaryDirectory(prefix="dfacm-ai-tests-")
os.environ["ACH_DB_PATH"] = str(Path(_database.name) / "competitions.db")
os.environ["ACH_ENABLE_SCHEDULER"] = "0"
os.environ["ACH_ROOT_PATH"] = "/ai-contests"
os.environ["ACH_PUBLIC_URL"] = "https://dfacm.website/ai-contests/"

from bs4 import BeautifulSoup
from fastapi.testclient import TestClient
from app import config, db
config.ROOT_PATH = os.environ["ACH_ROOT_PATH"]
config.PUBLIC_URL = os.environ["ACH_PUBLIC_URL"]
db.DB_PATH = Path(os.environ["ACH_DB_PATH"])
from app.main import app
from app.models import Competition

CST = timezone(timedelta(hours=8))


class WebsiteIntegrationTests(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)
        self.conn = db.connect()
        self.conn.execute("DELETE FROM competitions")
        self.conn.commit()

    def tearDown(self):
        self.conn.close()
        self.client.close()

    def add(self, count=1, *, title="AI 比赛", start=None, end=None, tags=None):
        start = start or int(datetime(2031, 11, 1, tzinfo=CST).timestamp())
        end = end or int(datetime(2031, 11, 6, tzinfo=CST).timestamp())
        rows = [Competition(
            source="devpost", external_id=str(i), title=f"{title} {i}",
            url=f"https://example.com/contest/{i}", category="hackathon",
            organizer="d&f", start_time=start, end_time=end, tags=tags or [],
        ) for i in range(count)]
        db.upsert_competitions(self.conn, rows)

    def test_subdirectory_links_and_search_keep_category(self):
        self.add(title="A&B + 大模型", tags=["vibe-coding"])
        result = self.client.get("/", params={"category": "vibe-coding", "q": "A&B + 大模型"})
        self.assertEqual(result.status_code, 200)
        soup = BeautifulSoup(result.text, "html.parser")
        self.assertEqual(soup.select_one("form")["action"], "/ai-contests/")
        self.assertEqual(soup.select_one('input[name="category"]')["value"], "vibe-coding")
        self.assertEqual(soup.select_one('link[rel="stylesheet"]')["href"].split("?")[0], "/ai-contests/static/style.css")
        link = soup.select_one('a[href*="category=datascience"]')["href"]
        self.assertEqual(parse_qs(urlsplit(link).query)["q"], ["A&B + 大模型"])
        self.assertEqual(len(soup.select(".card")), 1)

    def test_pagination_reaches_all_competitions(self):
        self.add(count=65)
        first = BeautifulSoup(self.client.get("/").text, "html.parser")
        second = BeautifulSoup(self.client.get("/", params={"page": 2}).text, "html.parser")
        self.assertEqual(len(first.select(".card")), 60)
        self.assertEqual(len(second.select(".card")), 5)
        self.assertEqual(len({c["href"] for c in first.select(".card") + second.select(".card")}), 65)

    def test_calendar_keeps_ended_events_and_beijing_dates(self):
        start = int(datetime(2025, 11, 1, tzinfo=CST).timestamp())
        end = int(datetime(2025, 11, 2, tzinfo=CST).timestamp())
        self.add(title="历史 AI 赛事", start=start, end=end, tags=["vibe-coding"])
        result = self.client.get("/calendar", params={"month": "2025-11", "category": "vibe-coding"})
        self.assertEqual(result.status_code, 200)
        soup = BeautifulSoup(result.text, "html.parser")
        bar = soup.select_one(".cal-bar")
        self.assertIsNotNone(bar)
        self.assertIn("2025-11-02", bar["title"])
        self.assertIn("71.428", bar["style"])
        next_month = next(a["href"] for a in soup.select(".cal-nav a") if "下月" in a.text)
        self.assertEqual(parse_qs(urlsplit(next_month).query), {"month": ["2025-12"], "category": ["vibe-coding"]})

    def test_ics_keeps_every_event_and_escapes_multibyte_text(self):
        self.add(count=205, title="中文" * 25 + " A&B,智能体;下一行\n挑战", tags=["vibe-coding"])
        response = self.client.get("/feed.ics", params={"category": "vibe-coding"})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.text.count("BEGIN:VEVENT"), 205)
        self.assertTrue(all(len(line.encode("utf-8")) <= 75 for line in response.text.split("\r\n")))
        unfolded = response.text.replace("\r\n ", "")
        self.assertIn("A&B\\,智能体\\;下一行\\n挑战", unfolded)
        self.assertIn("DTSTART;VALUE=DATE:20311101", unfolded)
        self.assertIn("DTEND;VALUE=DATE:20311107", unfolded)
        self.assertNotIn("&amp;", unfolded)

    def test_rss_uses_public_site_and_applies_interest_filter(self):
        self.add(title="A&B", tags=["agent"])
        xml = ElementTree.fromstring(self.client.get("/feed.xml", params={"category": "agent"}).content)
        self.assertEqual(xml.findtext("channel/link"), "https://dfacm.website/ai-contests/")
        self.assertEqual(xml.findtext("channel/item/title"), "A&B 0")
        self.assertEqual(xml.find("channel/item/guid").attrib["isPermaLink"], "false")
        empty = ElementTree.fromstring(self.client.get("/feed.xml", params={"category": "vibe-coding"}).content)
        self.assertEqual(len(empty.findall("channel/item")), 0)

    def test_health_and_existing_api_report_database(self):
        self.add(count=3, tags=["vibe-coding"])
        self.assertEqual(self.client.get("/healthz").json(), {"ok": True, "competitions": 3})
        payload = self.client.get("/api/competitions", params={"category": "vibe-coding"}).json()
        self.assertEqual(payload["total"], 3)
        self.assertEqual(len(payload["items"]), 3)


if __name__ == "__main__":
    unittest.main()
