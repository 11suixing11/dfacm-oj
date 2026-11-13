from contextlib import closing
from pathlib import Path
import sqlite3
import tempfile
import time
import unittest
from unittest.mock import AsyncMock, patch

from support import (legacy_database, make_bot, Mongo, oid, production, Production, record)


class RecoveryTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="broadcast-recovery-")
        self.folder = Path(self.temp.name)
        self.started = int(time.time()) - 1000
        self.bots = []

    def tearDown(self):
        for bot in self.bots:
            bot._db.close()
        self.temp.cleanup()

    def bot(self, started=None, mongo=None):
        bot = make_bot(self.folder, self.started if started is None else started, mongo)
        self.bots.append(bot)
        return bot

    def rows(self, bot):
        return [dict(row) for row in bot._db.execute("SELECT * FROM records ORDER BY rid")]

    async def test_first_bootstrap_floor_is_durable_before_first_poll(self):
        bot = self.bot()
        self.assertEqual(str(self.started), bot._db_get_meta("bootstrap_floor_ts"))
        self.assertEqual("", bot._db_get_meta("mongo_last_id"))
        bot._db.close()
        restarted = self.bot(self.started + 100)
        self.assertEqual(str(self.started), restarted._db_get_meta("bootstrap_floor_ts"))

    async def test_history_stays_silent_across_pages_and_restart(self):
        docs = [record(self.started - 100, n, pid=n + 1) for n in range(401)]
        docs.append(record(self.started + 10, pid=500))
        mongo = Mongo(docs)
        bot = self.bot(mongo=mongo)
        self.assertEqual(400, await bot._poll_new_records())
        self.assertEqual(0, sum(row["card_sent"] == 0 for row in self.rows(bot)))
        bot._db.close()
        restarted = self.bot(self.started + 50, mongo)
        self.assertEqual(2, await restarted._poll_new_records())
        pending = [row for row in self.rows(restarted) if row["card_sent"] == 0]
        self.assertEqual([str(docs[-1]["_id"])], [row["rid"] for row in pending])
        self.assertEqual([0] * 401 + [1], [row["notify_eligible"] for row in self.rows(restarted)])
        self.assertTrue(all(row["delivered_at"] is None for row in self.rows(restarted)))

    async def test_existing_watermark_keeps_unseen_downtime_ac(self):
        watermark = str(oid(self.started - 100))
        legacy_database(self.folder, [], watermark)
        doc = record(self.started - 50)
        bot = self.bot(mongo=Mongo([doc]))
        await bot._poll_new_records()
        row = self.rows(bot)[0]
        self.assertEqual(0, row["card_sent"])
        self.assertEqual(1, row["notify_eligible"])
        self.assertIsNone(row["delivered_at"])
        self.assertEqual(str(doc["_id"]), bot._db_get_meta("mongo_last_id"))

    async def test_downtime_nonfinal_can_become_ac_after_another_restart(self):
        legacy_database(self.folder, [], str(oid(self.started - 100)))
        doc = record(self.started - 50, status=0, score=0)
        mongo = Mongo([doc])
        bot = self.bot(mongo=mongo)
        await bot._poll_new_records()
        bot._db.close()
        restarted = self.bot(self.started + 100, mongo)
        mongo.record.docs[0].update(status=1, score=100)
        await restarted._poll_new_records()
        self.assertEqual(0, self.rows(restarted)[0]["card_sent"])

    async def test_legacy_pending_preserved_and_ambiguous_history_not_replayed(self):
        pending, ambiguous = str(oid(self.started - 20)), str(oid(self.started - 10))
        watermark = str(oid(self.started - 5))
        path = legacy_database(self.folder, [(pending, self.started - 20, 0, "Accepted"),
                                           (ambiguous, self.started - 10, 1, "Waiting")], watermark)
        state = path.with_name("state.json")
        state.write_text('{"bindings":{"123":"fixture-user"},"custom":"preserve"}')
        before = state.read_bytes()
        bot = self.bot()
        self.assertEqual("1", bot._db_get_meta("delivery_schema"))
        self.assertEqual("2", bot._db_get_meta("records_schema"))
        self.assertEqual(watermark, bot._db_get_meta("mongo_last_id"))
        self.assertEqual([0, 1], [row["card_sent"] for row in self.rows(bot)])
        self.assertEqual([1, None], [row["notify_eligible"] for row in self.rows(bot)])
        self.assertTrue(all(row["delivered_at"] is None for row in self.rows(bot)))
        await bot._sync_recent([{"_id": ambiguous, "status": 1, "score": 100}])
        self.assertEqual([0, 1], [row["card_sent"] for row in self.rows(bot)])
        self.assertEqual(before, state.read_bytes())
        bot._db.close()
        restarted = self.bot(self.started + 100)
        self.assertEqual(watermark, restarted._db_get_meta("mongo_last_id"))
        self.assertEqual([0, 1], [row["card_sent"] for row in self.rows(restarted)])
        self.assertEqual([1, None], [row["notify_eligible"] for row in self.rows(restarted)])

    async def test_partial_migration_resumes_without_resetting_fields(self):
        pending = str(oid(self.started - 20))
        delivered = str(oid(self.started - 10))
        path = legacy_database(self.folder, [(pending, self.started - 20, 0, "Accepted"),
                                           (delivered, self.started - 10, 1, "Accepted")], delivered)
        with closing(sqlite3.connect(path)) as db, db:
            db.execute("ALTER TABLE records ADD COLUMN notify_eligible INTEGER")
            db.execute("UPDATE records SET notify_eligible=1 WHERE rid=?", (delivered,))
        bot = self.bot()
        self.assertEqual("1", bot._db_get_meta("delivery_schema"))
        self.assertEqual([1, 1], [row["notify_eligible"] for row in self.rows(bot)])
        bot._db.execute("UPDATE records SET delivered_at=123456 WHERE rid=?", (delivered,))
        bot._db.execute("DELETE FROM meta WHERE key='delivery_schema'")
        bot._db.close()
        restarted = self.bot(self.started + 100)
        self.assertEqual([None, 123456], [row["delivered_at"] for row in self.rows(restarted)])
        self.assertEqual([0, 1], [row["card_sent"] for row in self.rows(restarted)])
        self.assertEqual(delivered, restarted._db_get_meta("mongo_last_id"))

    async def test_crash_after_insert_before_watermark_does_not_duplicate_queue(self):
        doc = record(self.started + 10)
        mongo = Mongo([doc])
        bot = self.bot(mongo=mongo)
        original = bot._db_set_meta

        def interrupted(key, value):
            if key == "mongo_last_id":
                raise RuntimeError("simulated crash before watermark")
            original(key, value)

        with patch.object(bot, "_db_set_meta", side_effect=interrupted):
            with self.assertRaisesRegex(RuntimeError, "simulated crash"):
                await bot._poll_new_records()
        self.assertEqual(1, len(self.rows(bot)))
        bot._db.close()
        restarted = self.bot(self.started + 100, mongo)
        await restarted._poll_new_records()
        await restarted._drain_pending_cards()
        self.assertEqual(1, len(restarted.context.messages))
        row = self.rows(restarted)[0]
        self.assertIsNotNone(row.get("delivered_at"))
        sent_at = row["delivered_at"]
        await restarted._decide_and_store(restarted._db_map_docs([doc]))
        await restarted._drain_pending_cards()
        self.assertEqual(1, len(self.rows(restarted)))
        self.assertEqual(1, len(restarted.context.messages))
        self.assertEqual(sent_at, self.rows(restarted)[0]["delivered_at"])

    async def test_failed_delivery_and_cooldown_survive_without_success_stamp(self):
        doc = record(self.started + 10)
        mongo = Mongo([doc])
        bot = self.bot(mongo=mongo)
        await bot._poll_new_records()
        bot.context.deliver = False
        with patch.object(production.asyncio, "sleep", new=AsyncMock()), \
                self.assertLogs(bot.logger, level="WARNING"):
            await bot._drain_pending_cards()
        self.assertEqual([], bot.context.messages)
        self.assertEqual(0, self.rows(bot)[0]["card_sent"])
        self.assertIn("delivered_at", self.rows(bot)[0])
        self.assertIsNone(self.rows(bot)[0]["delivered_at"])
        bot._db.close()
        restarted = self.bot(self.started + 100, mongo)
        await restarted._drain_pending_cards()
        self.assertEqual(1, len(restarted.context.messages))
        self.assertEqual(1, self.rows(restarted)[0]["card_sent"])
        self.assertIsNotNone(self.rows(restarted)[0]["delivered_at"])

    async def test_delivered_rid_stays_sent_after_restart_and_rejudge(self):
        doc = record(self.started + 10)
        mongo = Mongo([doc])
        bot = self.bot(mongo=mongo)
        await bot._poll_new_records()
        await bot._drain_pending_cards()
        self.assertEqual(1, len(bot.context.messages))
        sent_at = self.rows(bot)[0]["delivered_at"]
        self.assertIsNotNone(sent_at)
        bot._db.close()

        restarted = self.bot(self.started + 100, mongo)
        mongo.record.docs[0].update(status=0, score=0)
        await restarted._poll_new_records()
        self.assertEqual("Waiting", self.rows(restarted)[0]["status"])
        mongo.record.docs[0].update(status=1, score=100)
        await restarted._poll_new_records()
        await restarted._drain_pending_cards()
        self.assertEqual([], restarted.context.messages,
                         "A persisted successful send must prevent replay of the same RID")
        row = self.rows(restarted)[0]
        self.assertEqual("Accepted", row["status"])
        self.assertEqual(1, row["card_sent"])
        self.assertEqual(1, row["notify_eligible"])
        self.assertEqual(sent_at, row["delivered_at"])

    async def test_history_verdict_transition_remains_silent(self):
        doc = record(self.started - 10, status=0, score=0)
        mongo = Mongo([doc])
        bot = self.bot(mongo=mongo)
        await bot._poll_new_records()
        mongo.record.docs[0].update(status=1, score=100)
        await bot._poll_new_records()
        await bot._drain_pending_cards()
        self.assertEqual([], bot.context.messages)
        self.assertEqual(1, self.rows(bot)[0]["card_sent"])

    async def test_mongo_dedup_still_suppresses_later_ac(self):
        mongo = Mongo([record(self.started - 10), record(self.started + 10)])
        bot = self.bot(mongo=mongo)
        await bot._poll_new_records()
        await bot._drain_pending_cards()
        self.assertEqual([], bot.context.messages)
        self.assertEqual([1, 1], [row["card_sent"] for row in self.rows(bot)])

    async def test_deleted_contest_drop_is_not_recorded_as_delivery(self):
        doc = record(self.started + 10, tid=oid(self.started - 10))
        mongo = Mongo([doc])
        bot = self.bot(mongo=mongo)
        bot._contest_cache[str(doc["tid"])] = {"title": "Fixture", "pids": [1]}
        await bot._poll_new_records()
        bot._contest_cache[str(doc["tid"])] = {"missing": True}
        await bot._drain_pending_cards()
        self.assertEqual([], bot.context.messages)
        self.assertEqual(1, self.rows(bot)[0]["card_sent"])
        self.assertIn("delivered_at", self.rows(bot)[0])
        self.assertIsNone(self.rows(bot)[0]["delivered_at"])
        self.assertEqual(0, self.rows(bot)[0]["notify_eligible"])

    async def test_contest_lookup_failure_keeps_pending_for_retry(self):
        doc = record(self.started + 10, tid=oid(self.started - 10))
        mongo = Mongo([doc])
        bot = self.bot(mongo=mongo)
        bot._contest_cache[str(doc["tid"])] = {"title": "Fixture", "pids": [1]}
        await bot._poll_new_records()
        bot._contest_cache.clear()
        failures = []
        with patch.object(mongo.document, "find", side_effect=RuntimeError("offline Mongo failure")), \
                patch.object(bot.logger, "exception"):
            try:
                await bot._drain_pending_cards()
            except RuntimeError as exc:
                failures.append(str(exc))
        self.assertEqual([], failures, "Transient metadata lookup must return retryable False")
        self.assertEqual([], bot.context.messages)
        self.assertEqual(0, self.rows(bot)[0]["card_sent"])
        self.assertEqual(1, self.rows(bot)[0]["notify_eligible"])
        self.assertIsNone(self.rows(bot)[0]["delivered_at"])
        self.assertNotIn(str(doc["tid"]), bot._contest_cache)
        mongo.document.docs.append({"_id": doc["tid"], "docType": 30,
                                    "title": "Restored", "pids": [1]})
        await bot._drain_pending_cards()
        self.assertEqual(1, len(bot.context.messages))
        self.assertIsNotNone(self.rows(bot)[0]["delivered_at"])

    async def test_migration_failure_rolls_back_and_retries_without_data_loss(self):
        rid = str(oid(self.started - 10))
        path = legacy_database(self.folder, [(rid, self.started - 10, 0, "Accepted")], rid)
        bot = Production.__new__(Production)
        bot._db = sqlite3.connect(path, isolation_level=None)
        bot._db.row_factory = sqlite3.Row
        bot._started_ts = self.started
        self.bots.append(bot)
        original = bot._db_set_meta

        def interrupted(key, value):
            if key == "delivery_schema":
                raise RuntimeError("simulated interrupted migration")
            original(key, value)

        with patch.object(bot, "_db_set_meta", side_effect=interrupted):
            with self.assertRaisesRegex(RuntimeError, "interrupted migration"):
                bot._init_delivery_state()
        self.assertEqual("", bot._db_get_meta("delivery_schema"))
        self.assertNotIn("notify_eligible", self.rows(bot)[0])
        self.assertEqual(rid, bot._db_get_meta("mongo_last_id"))
        self.assertEqual(0, self.rows(bot)[0]["card_sent"])
        bot._init_delivery_state()
        self.assertEqual("1", bot._db_get_meta("delivery_schema"))
        self.assertEqual(1, self.rows(bot)[0]["notify_eligible"])
        self.assertIsNone(self.rows(bot)[0]["delivered_at"])
        self.assertEqual(rid, bot._db_get_meta("mongo_last_id"))

    async def test_constructor_migration_failure_closes_connection_and_can_retry(self):
        rid = str(oid(self.started - 10))
        path = legacy_database(self.folder, [(rid, self.started - 10, 0, "Accepted")], rid)
        connections = []
        connect = sqlite3.connect
        set_meta = Production._db_set_meta

        def tracked_connect(*args, **kwargs):
            db = connect(*args, **kwargs)
            connections.append(db)
            return db

        def interrupted(bot, key, value):
            if key == "delivery_schema":
                raise RuntimeError("constructor migration failed")
            set_meta(bot, key, value)

        try:
            with patch.object(production.sqlite3, "connect", side_effect=tracked_connect), \
                    patch.object(Production, "_db_set_meta", new=interrupted):
                with self.assertRaisesRegex(RuntimeError, "constructor migration failed"):
                    self.bot()
            self.assertEqual(1, len(connections))
            with self.assertRaises(sqlite3.ProgrammingError,
                                   msg="Failed construction must close its owned database"):
                connections[0].execute("SELECT 1")
        finally:
            for db in connections:
                db.close()

        with closing(connect(path)) as db:
            columns = {row[1] for row in db.execute("PRAGMA table_info(records)")}
            self.assertNotIn("notify_eligible", columns)
            self.assertNotIn("delivered_at", columns)
            self.assertIsNone(db.execute("SELECT value FROM meta WHERE key='delivery_schema'").fetchone())
            self.assertEqual((rid,), db.execute("SELECT value FROM meta WHERE key='mongo_last_id'").fetchone())
            self.assertEqual((rid, 0), db.execute("SELECT rid, card_sent FROM records").fetchone())
        restarted = self.bot()
        self.assertEqual("1", restarted._db_get_meta("delivery_schema"))
        self.assertEqual(rid, restarted._db_get_meta("mongo_last_id"))
        self.assertEqual(0, self.rows(restarted)[0]["card_sent"])
        self.assertEqual(1, self.rows(restarted)[0]["notify_eligible"])


if __name__ == "__main__":
    unittest.main()
