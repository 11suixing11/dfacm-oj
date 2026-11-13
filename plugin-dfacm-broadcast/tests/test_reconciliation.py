"""Fair reconciliation through the real poll, verdict and SQLite paths."""
from datetime import datetime
import json
from pathlib import Path
import sqlite3
import tempfile
import unittest
from unittest.mock import patch

from support import make_bot, Mongo, oid, production, record


class ReconciliationTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="broadcast-reconciliation-")
        self.folder = Path(self.temp.name)
        self.now = 1_900_000_000
        self.bots = []

    def tearDown(self):
        for bot in self.bots:
            bot._db.close()
        self.temp.cleanup()

    def bot(self, mongo):
        bot = make_bot(self.folder, self.now - 10_000, mongo)
        self.bots.append(bot)
        return bot

    def clock(self, now):
        class Clock(datetime):
            @classmethod
            def now(cls, tz=None):
                return cls.fromtimestamp(now, tz)
        return Clock

    async def seed(self, bot, docs):
        await bot._decide_and_store(bot._db_map_docs(docs))
        bot._db_set_meta("mongo_last_id", str(max(doc["_id"] for doc in docs)))

    def rows(self, bot):
        return [dict(row) for row in bot._db.execute("SELECT * FROM records ORDER BY rid")]

    async def poll(self, bot, now=None):
        now = self.now if now is None else now
        with patch.object(production, "datetime", self.clock(now)), \
                patch.object(production.time, "time", return_value=now):
            return await bot._poll_new_records()

    async def sweep(self, bot, now=None):
        now = self.now if now is None else now
        with patch.object(production, "datetime", self.clock(now)), \
                patch.object(production.time, "time", return_value=now):
            await bot._maybe_stale_sweep()

    async def test_same_second_402_tail_rejudge_updates_and_queues(self):
        docs = [record(self.now - 100, n, status=0, score=0, pid=n + 1)
                for n in range(402)]
        mongo = Mongo(docs)
        bot = self.bot(mongo)
        await self.seed(bot, docs)
        for doc in mongo.record.docs[-2:]:
            doc.update(status=1, score=100)
        await self.poll(bot)
        tail = self.rows(bot)[-2:]
        self.assertEqual(["Accepted", "Accepted"], [row["status"] for row in tail])
        self.assertEqual([0, 0], [row["card_sent"] for row in tail])
        self.assertEqual([1, 1], [row["notify_eligible"] for row in tail])
        self.assertEqual([None, None], [row["delivered_at"] for row in tail])
        self.assertEqual(str(docs[-1]["_id"]), bot._db_get_meta("mongo_last_id"))

    async def test_snapshot_tail_survives_poll_limit_clock_movement_and_restart(self):
        docs = [record(self.now - 1700, n, status=0, score=0) for n in range(1202)]
        mongo = Mongo(docs)
        bot = self.bot(mongo)
        await self.seed(bot, docs)
        bot._db.execute("UPDATE records SET delivered_at=123 WHERE rid=?", (str(docs[0]["_id"]),))
        for doc in mongo.record.docs:
            doc.update(status=2)
        await self.poll(bot)
        self.assertEqual(["Wrong Answer"] * 800 + ["Waiting"] * 402,
                         [row["status"] for row in self.rows(bot)])
        snapshot = json.loads(bot._db_get_meta("recent_reconcile_scan"))
        self.assertEqual(str(oid(self.now - 1800)), snapshot["lower"])
        self.assertEqual(str(oid(self.now + 1)), snapshot["upper"])
        self.assertEqual(str(docs[799]["_id"]), snapshot["after"])
        bot._db.close()
        restarted = self.bot(mongo)
        later = record(self.now + 2000, status=0, score=0)
        mongo.record.docs.append(later)
        self.assertEqual(1, await self.poll(restarted, self.now + 3600))
        rows = self.rows(restarted)
        self.assertEqual(["Wrong Answer"] * 1202 + ["Waiting"], [row["status"] for row in rows])
        self.assertEqual(str(later["_id"]), restarted._db_get_meta("mongo_last_id"))
        self.assertEqual("", restarted._db_get_meta("recent_reconcile_scan"))
        self.assertEqual(123, rows[0]["delivered_at"])
        self.assertEqual([1] * 1203, [row["notify_eligible"] for row in rows])
        self.assertEqual("2", restarted._db_get_meta("records_schema"))
        self.assertEqual("1", restarted._db_get_meta("delivery_schema"))

    async def test_recent_page_interface_has_fixed_bounds_strict_after_and_limit(self):
        docs = [record(self.now - 1810), record(self.now - 1800),
                record(self.now - 1800, 1), record(self.now, 1),
                record(self.now + 1), record(self.now + 10)]
        bot = self.bot(Mongo(reversed(docs)))
        fetch = getattr(bot, "_db_fetch_recent_page", None)
        self.assertTrue(callable(fetch), "Recent reconciliation needs its own bounded page query")
        lower, upper = str(oid(self.now - 1800)), str(oid(self.now + 1))
        page = fetch(lower, upper, "", limit=2)
        self.assertEqual([str(docs[1]["_id"]), str(docs[2]["_id"])],
                         [str(doc["_id"]) for doc in page])
        page[0]["status"] = 99
        self.assertEqual(1, bot._mongo().record.find_one({"_id": docs[1]["_id"]})["status"])
        self.assertEqual([str(docs[3]["_id"])],
                         [str(doc["_id"]) for doc in fetch(lower, upper, str(docs[2]["_id"]), limit=2)])

    async def test_recent_source_failure_retries_cursor_while_new_ingest_advances(self):
        docs = [record(self.now - 100, n, status=0, score=0) for n in range(1202)]
        mongo = Mongo(docs)
        bot = self.bot(mongo)
        await self.seed(bot, docs)
        for doc in mongo.record.docs:
            doc.update(status=2)
        await self.poll(bot)
        checkpoint = bot._db_get_meta("recent_reconcile_scan")
        self.assertTrue(checkpoint, "The unfinished scan must have a durable checkpoint")
        new_doc = record(self.now, status=0, score=0)
        mongo.record.docs.append(new_doc)
        find = mongo.record.find

        def interrupted(query, projection=None):
            if "$gte" in query.get("_id", {}):
                raise RuntimeError("recent source unavailable")
            return find(query, projection)

        with patch.object(mongo.record, "find", side_effect=interrupted):
            with self.assertRaisesRegex(RuntimeError, "recent source unavailable"):
                await self.poll(bot)
        self.assertEqual(checkpoint, bot._db_get_meta("recent_reconcile_scan"))
        self.assertEqual(str(new_doc["_id"]), bot._db_get_meta("mongo_last_id"))
        bot._db.close()
        restarted = self.bot(mongo)
        await self.poll(restarted)
        self.assertEqual(["Wrong Answer"] * 1202 + ["Waiting"],
                         [row["status"] for row in self.rows(restarted)])

    async def test_recent_sqlite_failure_does_not_skip_partially_updated_page(self):
        docs = [record(self.now - 100, n, status=0, score=0) for n in range(1202)]
        mongo = Mongo(docs)
        bot = self.bot(mongo)
        await self.seed(bot, docs)
        for doc in mongo.record.docs:
            doc.update(status=2)
        await self.poll(bot)
        checkpoint = bot._db_get_meta("recent_reconcile_scan")
        bot._db.execute("CREATE TEMP TRIGGER interrupted BEFORE UPDATE OF status ON records "
                        "WHEN NEW.rid = '" + str(docs[1000]["_id"]) + "' "
                        "BEGIN SELECT RAISE(ABORT, 'local verdict write failed'); END")
        with self.assertRaisesRegex(sqlite3.IntegrityError, "local verdict write failed"):
            await self.poll(bot)
        self.assertEqual(checkpoint, bot._db_get_meta("recent_reconcile_scan"))
        bot._db.close()
        restarted = self.bot(mongo)
        await self.poll(restarted)
        self.assertEqual(["Wrong Answer"] * 1202, [row["status"] for row in self.rows(restarted)])

    async def test_recent_dedup_failure_retries_ac_chance_before_cursor_advances(self):
        docs = [record(self.now - 100, n, status=0, score=0) for n in range(802)]
        docs[-2]["pid"], docs[-1]["pid"] = 999, 1000
        mongo = Mongo(docs)
        bot = self.bot(mongo)
        await self.seed(bot, docs)
        for doc in mongo.record.docs:
            doc.update(status=2)
        for doc in mongo.record.docs[-2:]:
            doc.update(status=1, score=100)
        await self.poll(bot)
        checkpoint = bot._db_get_meta("recent_reconcile_scan")
        find = mongo.record.find

        def interrupted(query, projection=None):
            if "$or" in query:
                raise RuntimeError("dedup source unavailable")
            return find(query, projection)

        with patch.object(mongo.record, "find", side_effect=interrupted):
            with self.assertRaisesRegex(RuntimeError, "dedup source unavailable"):
                await self.poll(bot)
        self.assertEqual(checkpoint, bot._db_get_meta("recent_reconcile_scan"))
        self.assertEqual([1, 1], [row["card_sent"] for row in self.rows(bot)[-2:]])
        await self.poll(bot)
        self.assertEqual([0, 0], [row["card_sent"] for row in self.rows(bot)[-2:]])

    async def test_hourly_permanent_first_pages_do_not_starve_historical_tail_after_restart(self):
        docs = [record(self.now - 7200, n, status=0, score=0) for n in range(602)]
        mongo = Mongo(docs)
        bot = self.bot(mongo)
        await self.seed(bot, docs)
        for doc in mongo.record.docs[400:]:
            doc.update(status=2)
        watermark = bot._db_get_meta("mongo_last_id")
        await self.sweep(bot)
        snapshot = bot._db_get_meta("stale_reconcile_scan")
        self.assertTrue(snapshot, "Permanent unresolved pages must retain forward progress")
        self.assertEqual(str(docs[399]["_id"]), json.loads(snapshot)["after"])
        bot._db.close()
        restarted = self.bot(mongo)
        # A record inserted after snapshot start must wait for the next sweep.
        late = record(self.now - 7000, status=0, score=0)
        mongo.record.docs.append(late)
        await restarted._decide_and_store(restarted._db_map_docs([late]))
        mongo.record.docs[-1].update(status=2)
        await self.sweep(restarted, self.now + 10)
        self.assertEqual(["Waiting"] * 400 + ["Wrong Answer"] * 202 + ["Waiting"],
                         [row["status"] for row in self.rows(restarted)])
        self.assertEqual(watermark, restarted._db_get_meta("mongo_last_id"))
        self.assertEqual("", restarted._db_get_meta("stale_reconcile_scan"))
        await self.sweep(restarted, self.now + 20)
        self.assertEqual("Waiting", self.rows(restarted)[-1]["status"])
        await self.sweep(restarted, self.now + 3611)
        await self.sweep(restarted, self.now + 3612)
        self.assertEqual("Wrong Answer", self.rows(restarted)[-1]["status"])

    async def test_hourly_query_failure_and_missing_source_do_not_skip_or_starve_tail(self):
        docs = [record(self.now - 7200, n, status=0, score=0) for n in range(402)]
        mongo = Mongo(docs)
        bot = self.bot(mongo)
        await self.seed(bot, docs)
        # Missing source RIDs stay unresolved but cannot occupy every poll.
        mongo.record.docs = mongo.record.docs[400:]
        for doc in mongo.record.docs:
            doc.update(status=2)
        with patch.object(mongo.record, "find", side_effect=RuntimeError("hourly source unavailable")):
            with self.assertRaisesRegex(RuntimeError, "hourly source unavailable"):
                await self.sweep(bot)
        checkpoint = bot._db_get_meta("stale_reconcile_scan")
        self.assertTrue(checkpoint, "A failed source query must keep its bounded snapshot")
        self.assertEqual("", json.loads(checkpoint)["after"])
        await self.sweep(bot, self.now + 1)
        await self.sweep(bot, self.now + 2)
        self.assertEqual(["Waiting"] * 400 + ["Wrong Answer"] * 2,
                         [row["status"] for row in self.rows(bot)])

    async def test_hourly_state_failure_retries_completed_source_page_immediately(self):
        docs = [record(self.now - 7200, n, status=0, score=0) for n in range(202)]
        mongo = Mongo(docs)
        bot = self.bot(mongo)
        await self.seed(bot, docs)
        for doc in mongo.record.docs:
            doc.update(status=2)
        bot._db.execute("CREATE TEMP TRIGGER interrupted BEFORE UPDATE OF status ON records "
                        "WHEN NEW.rid = '" + str(docs[100]["_id"]) + "' "
                        "BEGIN SELECT RAISE(ABORT, 'hourly verdict write failed'); END")
        with self.assertRaisesRegex(sqlite3.IntegrityError, "hourly verdict write failed"):
            await self.sweep(bot)
        checkpoint = bot._db_get_meta("stale_reconcile_scan")
        self.assertTrue(checkpoint)
        self.assertEqual("", json.loads(checkpoint)["after"])
        bot._db.execute("DROP TRIGGER interrupted")
        await self.sweep(bot, self.now + 1)
        self.assertEqual(["Wrong Answer"] * 202, [row["status"] for row in self.rows(bot)])

    async def test_complete_poll_resumes_both_scans_and_all_nonfinal_verdicts(self):
        codes = (0, 20, 21, 22)
        older = [record(self.now - 7200, n, status=codes[n % 4], score=0)
                 for n in range(602)]
        recent = [record(self.now - 100, n, status=0, score=0) for n in range(1202)]
        mongo = Mongo(older + recent)
        bot = self.bot(mongo)
        await self.seed(bot, older + recent)
        for doc in mongo.record.docs[400:]:
            doc.update(status=2)
        # Use real polling, sweep and contest-report methods; the existing
        # health/calendar/rank throttles keep their external tasks dormant.
        bot._rank_cache_at = self.clock(self.now).now()
        bot._health_at = bot._calendar_at = self.now
        bot._calendar_events = []
        with patch.object(production, "datetime", self.clock(self.now)), \
                patch.object(production.time, "time", return_value=self.now):
            await bot._poll_once()
        rows = self.rows(bot)
        self.assertEqual(["Waiting", "Running", "Compiling", "Fetched"] * 100,
                         [row["status"] for row in rows[:400]])
        self.assertEqual(["Wrong Answer"] * 800 + ["Waiting"] * 402,
                         [row["status"] for row in rows[602:]])
        with patch.object(production, "datetime", self.clock(self.now + 1)), \
                patch.object(production.time, "time", return_value=self.now + 1):
            await bot._poll_once()
        self.assertEqual(["Wrong Answer"] * 1404,
                         [row["status"] for row in self.rows(bot)[400:]])
        self.assertEqual(str(recent[-1]["_id"]), bot._db_get_meta("mongo_last_id"))
        self.assertEqual(2, bot._poll_count)
        self.assertEqual([], bot.context.messages)


if __name__ == "__main__":
    unittest.main()
