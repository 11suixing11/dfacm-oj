"""Stats include first failed sources and select the latest inserted crawl run."""
import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

os.environ["ACH_ENABLE_SCHEDULER"] = "0"
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))

from fastapi import FastAPI
from fastapi.testclient import TestClient
from app import db
from app.api.stats import router
from app.models import Competition


class StatsSourcesTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="collector-stats-")
        self.path_patch = patch.object(db, "DB_PATH", Path(self.temp.name) / "competitions.db")
        self.path_patch.start()
        self.conn = db.connect()
        app = FastAPI()
        app.include_router(router)
        self.client = TestClient(app)

    def tearDown(self):
        self.client.close()
        self.conn.close()
        self.path_patch.stop()
        self.temp.cleanup()

    def run_row(self, source, ok, count, error, ts):
        self.conn.execute("INSERT INTO crawl_runs(source,ok,count,error,duration,ts) VALUES(?,?,?,?,?,?)",
                          (source, ok, count, error, 0.1, ts))
        self.conn.commit()

    def test_first_failure_has_zero_counts_and_true_error(self):
        self.run_row("devpost", 0, 0, "CrawlError: maintenance", 100)
        response = self.client.get("/api/stats")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {
            "sources": [{"source": "devpost", "total": 0, "active": 0,
                         "last_crawl": {"ok": False, "count": 0, "error": "CrawlError: maintenance", "ts": 100}}],
            "total_competitions": 0,
        })

    def test_union_counts_and_latest_inserted_runs_preserve_response_shape(self):
        db.upsert_competitions(self.conn, [
            Competition(source="devpost", external_id="1", title="Ended", url="https://example.test/1", end_time=1),
            Competition(source="devpost", external_id="2", title="Upcoming", url="https://example.test/2", end_time=4102444800),
            Competition(source="datafountain", external_id="1", title="No deadline", url="https://example.test/3"),
        ])
        # IDs define newest runs, including equal timestamps and clock rollback.
        self.run_row("devpost", 1, 2, "", 300)
        self.run_row("devpost", 0, 0, "CrawlError: newer failure", 300)
        self.run_row("kaggle", 0, 0, "CrawlError: old failure", 999)
        self.run_row("kaggle", 1, 0, "", 100)
        self.run_row("xfyun", 0, 0, "CrawlError: login required", 200)
        payload = self.client.get("/api/stats").json()
        self.assertEqual(payload["total_competitions"], 3)
        sources = {row["source"]: row for row in payload["sources"]}
        self.assertEqual(len(payload["sources"]), 4)
        self.assertEqual(sources, {
            "datafountain": {"source": "datafountain", "total": 1, "active": 1,
                            "last_crawl": {"ok": None, "count": None, "error": None, "ts": None}},
            "devpost": {"source": "devpost", "total": 2, "active": 1,
                        "last_crawl": {"ok": False, "count": 0, "error": "CrawlError: newer failure", "ts": 300}},
            "kaggle": {"source": "kaggle", "total": 0, "active": 0,
                       "last_crawl": {"ok": True, "count": 0, "error": "", "ts": 100}},
            "xfyun": {"source": "xfyun", "total": 0, "active": 0,
                      "last_crawl": {"ok": False, "count": 0, "error": "CrawlError: login required", "ts": 200}},
        })


if __name__ == "__main__":
    unittest.main()
