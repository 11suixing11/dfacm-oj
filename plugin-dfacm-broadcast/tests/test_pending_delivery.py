from copy import deepcopy
from pathlib import Path
import tempfile
import time
import unittest
from unittest.mock import AsyncMock, patch

from support import make_bot, Mongo, oid, production, record


class PendingDeliveryTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="broadcast-pending-")
        self.started = int(time.time()) - 1000
        self.bots = []

    def tearDown(self):
        for bot in self.bots:
            bot._db.close()
        self.temp.cleanup()

    async def queued(self, contest=False, **changes):
        doc = record(self.started + 10, **changes)
        if contest:
            doc["tid"] = oid(self.started - 10)
        mongo = Mongo([doc])
        folder = Path(self.temp.name) / str(len(self.bots))
        bot = make_bot(folder, self.started, mongo)
        self.bots.append(bot)
        if contest:
            bot._contest_cache[str(doc["tid"])] = {"title": "Fixture", "pids": [1]}
        await bot._poll_new_records()
        return bot, mongo, str(doc["_id"])

    def row(self, bot, rid):
        return dict(bot._db.execute("SELECT * FROM records WHERE rid = ?", (rid,)).fetchone())

    def assert_withdrawn(self, bot, rid):
        self.assertEqual([], bot.context.messages)
        row = self.row(bot, rid)
        self.assertEqual(1, row["card_sent"], "Invalid source must leave the active queue")
        self.assertEqual(1, row["notify_eligible"], "Unsent RID must retain future eligibility")
        self.assertIsNone(row["delivered_at"])

    def assert_pending(self, bot, rid):
        row = self.row(bot, rid)
        self.assertEqual(0, row["card_sent"], "A transient failure must retain the queue")
        self.assertEqual(1, row["notify_eligible"])
        self.assertIsNone(row["delivered_at"])

    async def test_sync_withdraws_ac_to_wa_and_partial_score_for_both_cards(self):
        # Removing raw verdict/score validation would leave invalid cards queued.
        for contest in (False, True):
            for status, score in ((2, 0), (1, 50), (0, 100)):
                with self.subTest(contest=contest, status=status, score=score):
                    bot, mongo, rid = await self.queued(contest)
                    mongo.record.docs[0].update(status=status, score=score)
                    await bot._poll_new_records()
                    self.assert_withdrawn(bot, rid)
                    await bot._drain_pending_cards()
                    self.assert_withdrawn(bot, rid)

    async def test_send_rechecks_source_without_an_intervening_sync(self):
        # A SQLite Accepted snapshot cannot authorize a now-invalid raw record.
        for contest in (False, True):
            for status, score in ((2, 0), (1, 50), (0, 100)):
                with self.subTest(contest=contest, status=status, score=score):
                    bot, mongo, rid = await self.queued(contest)
                    mongo.record.docs[0].update(status=status, score=score)
                    await bot._drain_pending_cards()
                    self.assert_withdrawn(bot, rid)

    async def test_partial_score_can_restore_to_full_ac_without_status_change(self):
        # Comparing status text alone loses Accepted/50 -> Accepted/100 recovery.
        for contest in (False, True):
            with self.subTest(contest=contest):
                bot, mongo, rid = await self.queued(contest)
                mongo.record.docs[0]["score"] = 50
                await bot._poll_new_records()
                self.assert_withdrawn(bot, rid)
                mongo.record.docs[0]["score"] = 100
                await bot._poll_new_records()
                self.assert_pending(bot, rid)
                await bot._drain_pending_cards()
                self.assertEqual(1, len(bot.context.messages))
                self.assertIsNotNone(self.row(bot, rid)["delivered_at"])

    async def test_initial_wa_and_partial_ac_can_become_eligible_full_ac(self):
        # Full AC is an independent transition even if the stored text is Accepted.
        for contest in (False, True):
            for status, score in ((2, 0), (1, 50)):
                with self.subTest(contest=contest, status=status, score=score):
                    bot, mongo, rid = await self.queued(contest, status=status, score=score)
                    self.assert_withdrawn(bot, rid)
                    mongo.record.docs[0].update(status=1, score=100)
                    await bot._poll_new_records()
                    self.assert_pending(bot, rid)
                    await bot._drain_pending_cards()
                    self.assertEqual(1, len(bot.context.messages))
                    self.assertIsNotNone(self.row(bot, rid)["delivered_at"])

    async def test_removed_raw_record_withdraws_and_restoration_requeues(self):
        # Source deletion is data loss; restoration must retain the original RID's chance.
        for contest in (False, True):
            with self.subTest(contest=contest):
                bot, mongo, rid = await self.queued(contest)
                removed = mongo.record.docs.pop()
                await bot._drain_pending_cards()
                self.assert_withdrawn(bot, rid)
                mongo.record.docs.append(removed)
                await bot._poll_new_records()
                self.assert_pending(bot, rid)
                await bot._drain_pending_cards()
                self.assertEqual(1, len(bot.context.messages))
                self.assertIsNotNone(self.row(bot, rid)["delivered_at"])

    async def test_sync_detects_removed_source_while_channel_is_closed(self):
        # An absent recent-window row is inconclusive; an explicit RID lookup is not.
        for contest in (False, True):
            with self.subTest(contest=contest):
                bot, mongo, rid = await self.queued(contest)
                mongo.record.docs.clear()
                with patch.object(bot, "_passive_window_open", return_value=False):
                    await bot._poll_new_records()
                self.assert_withdrawn(bot, rid)

    async def test_withdrawn_wa_can_re_ac_and_send_once(self):
        for contest in (False, True):
            with self.subTest(contest=contest):
                bot, mongo, rid = await self.queued(contest)
                mongo.record.docs[0].update(status=2, score=0)
                await bot._drain_pending_cards()
                self.assert_withdrawn(bot, rid)
                mongo.record.docs[0].update(status=1, score=100)
                await bot._poll_new_records()
                self.assert_pending(bot, rid)
                await bot._drain_pending_cards()
                await bot._drain_pending_cards()
                self.assertEqual(1, len(bot.context.messages))
                self.assertIsNotNone(self.row(bot, rid)["delivered_at"])

    async def test_missing_verdict_or_score_cannot_authorize_send(self):
        for field in ("status", "score"):
            with self.subTest(field=field):
                bot, mongo, rid = await self.queued()
                del mongo.record.docs[0][field]
                await bot._drain_pending_cards()
                self.assert_withdrawn(bot, rid)

    async def test_raw_lookup_error_preserves_pending_and_recovers(self):
        # A failed query provides no evidence that the source disappeared.
        for contest in (False, True):
            with self.subTest(contest=contest):
                bot, mongo, rid = await self.queued(contest)
                with patch.object(mongo.record, "find_one", side_effect=RuntimeError("offline source failure")), \
                        patch.object(bot.logger, "exception"):
                    await bot._drain_pending_cards()
                self.assertEqual([], bot.context.messages)
                self.assert_pending(bot, rid)
                await bot._drain_pending_cards()
                self.assertEqual(1, len(bot.context.messages))
                self.assertIsNotNone(self.row(bot, rid)["delivered_at"])

    async def test_sync_query_failure_preserves_pending(self):
        bot, mongo, rid = await self.queued()
        with patch.object(mongo.record, "find", side_effect=RuntimeError("offline sync failure")):
            with self.assertRaisesRegex(RuntimeError, "offline sync failure"):
                await bot._poll_new_records()
        self.assertEqual([], bot.context.messages)
        self.assert_pending(bot, rid)

    async def test_revalidation_after_render_prevents_stale_image_send(self):
        # A drain-time check alone misses verdict changes while preparing the card.
        for contest in (False, True):
            with self.subTest(contest=contest):
                bot, mongo, rid = await self.queued(contest)
                renderer = "_render_contest_card" if contest else "_render_ac_card"

                def invalidate(item, folder):
                    mongo.record.docs[0].update(status=2, score=0)
                    return folder / "local-invalidated.png"

                with patch.object(bot, renderer, side_effect=invalidate):
                    await bot._drain_pending_cards()
                self.assert_withdrawn(bot, rid)

    async def test_revalidation_before_text_fallback_prevents_stale_send(self):
        # Text fallback needs the same raw validation as the image path.
        for contest in (False, True):
            with self.subTest(contest=contest):
                bot, mongo, rid = await self.queued(contest)
                renderer = "_render_contest_card" if contest else "_render_ac_card"

                def invalidate(item, folder):
                    mongo.record.docs[0]["score"] = 50
                    raise RuntimeError("offline render failure")

                with patch.object(bot, renderer, side_effect=invalidate), \
                        patch.object(bot.logger, "exception"):
                    await bot._drain_pending_cards()
                self.assert_withdrawn(bot, rid)

    async def test_source_error_after_render_preserves_queue(self):
        # Late query errors must neither send nor classify a RID as withdrawn.
        for contest in (False, True):
            with self.subTest(contest=contest):
                bot, mongo, rid = await self.queued(contest)
                renderer = "_render_contest_card" if contest else "_render_ac_card"
                original = mongo.record.find_one

                def unavailable(*args, **kwargs):
                    raise RuntimeError("offline late source failure")

                def lose_source(item, folder):
                    mongo.record.find_one = unavailable
                    return folder / "local-fixture.png"

                with patch.object(bot, renderer, side_effect=lose_source), \
                        patch.object(bot.logger, "exception"):
                    await bot._drain_pending_cards()
                mongo.record.find_one = original
                self.assertEqual([], bot.context.messages)
                self.assert_pending(bot, rid)
                await bot._drain_pending_cards()
                self.assertEqual(1, len(bot.context.messages))

    async def test_each_retry_rechecks_source(self):
        # A failure followed by rejudge cannot reuse the previous validation.
        for contest in (False, True):
            with self.subTest(contest=contest):
                bot, mongo, rid = await self.queued(contest)
                calls = []

                async def failed_send(session, chain):
                    calls.append(deepcopy(chain.parts))
                    mongo.record.docs[0].update(status=2, score=0)
                    return False

                with patch.object(bot.context, "send_message", side_effect=failed_send), \
                        patch.object(production.asyncio, "sleep", new=AsyncMock()), \
                        patch.object(bot.logger, "warning"):
                    await bot._drain_pending_cards()
                self.assertEqual(1, len(calls))
                self.assert_withdrawn(bot, rid)

    async def test_send_false_and_exception_keep_pending_until_actual_delivery(self):
        for contest in (False, True):
            for exception in (False, True):
                with self.subTest(contest=contest, exception=exception):
                    bot, mongo, rid = await self.queued(contest)
                    bot.context.deliver = False
                    effect = RuntimeError("offline delivery failure") if exception else None
                    with patch.object(bot.context, "send_message", wraps=bot.context.send_message, side_effect=effect), \
                            patch.object(production.asyncio, "sleep", new=AsyncMock()), \
                            patch.object(bot.logger, "warning"):
                        await bot._drain_pending_cards()
                    self.assertEqual([], bot.context.messages)
                    self.assert_pending(bot, rid)
                    bot.context.deliver = True
                    bot._group_send_cooldown_until = 0
                    await bot._drain_pending_cards()
                    self.assertEqual(1, len(bot.context.messages))
                    self.assertIsNotNone(self.row(bot, rid)["delivered_at"])

    async def test_channel_hold_and_cooldown_keep_pending(self):
        for contest in (False, True):
            with self.subTest(contest=contest):
                bot, mongo, rid = await self.queued(contest)
                with patch.object(bot, "_passive_window_open", return_value=False):
                    await bot._drain_pending_cards()
                self.assertEqual([], bot.context.messages)
                self.assert_pending(bot, rid)
                bot._group_send_cooldown_until = float("inf")
                await bot._drain_pending_cards()
                self.assertEqual([], bot.context.messages)
                self.assert_pending(bot, rid)
                bot._group_send_cooldown_until = 0
                await bot._drain_pending_cards()
                self.assertEqual(1, len(bot.context.messages))

    async def test_delivered_rid_does_not_repeat_after_wa_or_partial_then_ac(self):
        for contest in (False, True):
            for status, score in ((2, 0), (1, 50)):
                with self.subTest(contest=contest, status=status, score=score):
                    bot, mongo, rid = await self.queued(contest)
                    await bot._drain_pending_cards()
                    self.assertEqual(1, len(bot.context.messages))
                    delivered_at = self.row(bot, rid)["delivered_at"]
                    self.assertIsNotNone(delivered_at)
                    mongo.record.docs[0].update(status=status, score=score)
                    await bot._poll_new_records()
                    mongo.record.docs[0].update(status=1, score=100)
                    await bot._poll_new_records()
                    await bot._drain_pending_cards()
                    self.assertEqual(1, len(bot.context.messages))
                    self.assertEqual(delivered_at, self.row(bot, rid)["delivered_at"])

    async def test_mongo_find_one_returns_an_independent_snapshot(self):
        # This boundary characterization prevents reference-sharing from hiding races.
        bot, mongo, rid = await self.queued()
        snapshot = mongo.record.find_one({"_id": oid(self.started + 10)})
        mongo.record.docs[0].update(status=2, score=0)
        self.assertEqual(1, snapshot["status"])
        self.assertEqual(100, snapshot["score"])
        snapshot["uid"] = 123
        self.assertEqual(99, mongo.record.docs[0]["uid"])
