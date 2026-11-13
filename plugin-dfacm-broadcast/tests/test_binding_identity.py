"""Verified binding identity through real ingestion, cards and command handlers."""
from copy import deepcopy
import json
from pathlib import Path
import tempfile
import time
import unittest

from support import make_bot, Mongo, oid, record


class Event:
    is_at_or_wake_command = True

    def __init__(self, qq="200", message=""):
        self.qq = qq
        self.message = message

    def get_sender_id(self):
        return self.qq

    def get_message_str(self):
        return self.message

    def plain_result(self, text):
        return text


async def replies(handler, event):
    return [text async for text in handler(event)]


class BindingIdentityTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="broadcast-binding-")
        self.started = int(time.time()) - 1000
        self.bots = []

    def tearDown(self):
        for bot in self.bots:
            bot._db.close()
        self.temp.cleanup()

    async def queued(self, contest=False, username="fixture-user"):
        doc = record(self.started + 10)
        if contest:
            doc["tid"] = oid(self.started - 10)
        mongo = Mongo([doc])
        mongo.user.docs[0].update(uname=username, unameLower=username.casefold())
        folder = Path(self.temp.name) / str(len(self.bots))
        bot = make_bot(folder, self.started, mongo)
        self.bots.append(bot)
        if contest:
            bot._contest_cache[str(doc["tid"])] = {"title": "Fixture", "pids": [1]}
        await bot._poll_new_records()
        return bot, mongo

    def binding(self, bot, qq="200", username="fixture-user", uid="99"):
        bot._state["bindings"][qq] = username
        bot._state["binding_profiles"][qq] = {
            "username": username, "user_id": uid,
            "profile_url": f"{bot.BASE_URL}/user/{uid}",
        }

    async def sent_card(self, bot, contest=False):
        cards = []

        def render(item, folder):
            cards.append(deepcopy(item))
            return folder / "identity-fixture.png"

        if contest:
            bot._render_contest_card = render
        else:
            bot._render_ac_card = render
        await bot._drain_pending_cards()
        self.assertEqual(1, len(bot.context.messages))
        self.assertEqual(1, len(cards))
        return cards[0]

    async def test_display_name_collision_cannot_attribute_another_users_qq(self):
        # Name matching attributes UID 99's remapped display to UID 123's QQ.
        for contest in (False, True):
            with self.subTest(contest=contest):
                bot, _ = await self.queued(contest)
                bot._state["display_names"]["99"] = "other-account"
                self.binding(bot, username="other-account", uid="123")
                card = await self.sent_card(bot, contest)
                self.assertEqual("other-account", card["user"])
                self.assertEqual("未绑定", card["qq"])

    async def test_same_username_at_different_uid_cannot_attribute_qq(self):
        # A reused username must not transfer a verified account's QQ.
        for contest in (False, True):
            with self.subTest(contest=contest):
                bot, _ = await self.queued(contest, username="shared-name")
                self.binding(bot, username=" SHARED-NAME ", uid="123")
                self.assertEqual("未绑定", (await self.sent_card(bot, contest))["qq"])

    async def test_renamed_username_keeps_verified_uid_attribution_for_both_cards(self):
        # Matching an old verified username loses the binding after rename.
        for contest in (False, True):
            with self.subTest(contest=contest):
                bot, _ = await self.queued(contest, username="new-account-name")
                self.binding(bot, username="old-account-name")
                card = await self.sent_card(bot, contest)
                self.assertEqual("new-account-name", card["oj_user"])
                self.assertEqual("200", card["qq"])

    async def test_missing_legacy_uid_never_authorizes_card_attribution(self):
        # Even a matching old name needs a UID confirmed by the owner.
        for contest in (False, True):
            for uid in (None, "", "   "):
                with self.subTest(contest=contest, uid=uid):
                    bot, _ = await self.queued(contest)
                    bot._state["bindings"]["200"] = "fixture-user"
                    if uid is not None:
                        bot._state["binding_profiles"]["200"] = {"user_id": uid}
                    self.assertEqual("未绑定", (await self.sent_card(bot, contest))["qq"])

    async def test_legacy_lookup_does_not_hydrate_from_current_same_name(self):
        # This real Mongo lookup would currently bind the name's new owner.
        bot, mongo = await self.queued(username="legacy-name")
        mongo.user.docs = [{"_id": 123, "uname": "legacy-name", "unameLower": "legacy-name"}]
        bot._state["bindings"]["200"] = "legacy-name"
        bot._save_state()
        before = deepcopy(bot._state)
        self.assertIsNone(await bot._get_bound_user("200"))
        self.assertEqual(before, bot._state)
        self.assertEqual({}, json.loads(bot._state_path.read_text())["binding_profiles"])

    async def test_legacy_commands_explain_reconfirmation_without_guessing_uid(self):
        # Bound-only commands must distinguish unknown old identity from unbound.
        for command in ("my_rank", "recent_submissions", "my_stats", "daily_checkin"):
            with self.subTest(command=command):
                bot, _ = await self.queued()
                bot._state["bindings"]["200"] = "missing-old-account"
                texts = await replies(getattr(bot, command), Event())
                self.assertEqual(1, len(texts))
                self.assertIn("未确认", texts[0])
                self.assertIn("/绑定 数字UID", texts[0])
                self.assertIn("/绑定确认", texts[0])
                self.assertEqual({}, bot._state["binding_profiles"])
                self.assertEqual({}, bot._state["checkins"])

    async def test_multiple_verified_matches_choose_stable_first_qq(self):
        # Dict insertion order must not choose the winner among legitimate matches.
        for contest in (False, True):
            for order in (("200", "100"), ("100", "200")):
                with self.subTest(contest=contest, order=order):
                    bot, _ = await self.queued(contest)
                    for qq in order:
                        self.binding(bot, qq=qq)
                    self.assertEqual("100", (await self.sent_card(bot, contest))["qq"])

    async def test_name_collision_cannot_override_correct_uid_match(self):
        # A coincidentally named binding ordered first must not mask the owner.
        for contest in (False, True):
            with self.subTest(contest=contest):
                bot, _ = await self.queued(contest)
                self.binding(bot, qq="100", uid="123")
                self.binding(bot, qq="200", username="renamed-owner", uid=99)
                self.assertEqual("200", (await self.sent_card(bot, contest))["qq"])

    async def test_orphaned_profile_and_pending_binding_do_not_authorize_cards(self):
        # Only a completed, active binding may contribute a QQ, not draft state.
        for contest in (False, True):
            with self.subTest(contest=contest):
                bot, _ = await self.queued(contest)
                bot._state["binding_profiles"]["100"] = {"user_id": "99"}
                bot._state["pending_bindings"]["200"] = {"user_id": "99"}
                self.assertEqual("未绑定", (await self.sent_card(bot, contest))["qq"])

    async def test_merge_display_does_not_transfer_verified_uid_binding(self):
        # A display/statistics merge is not verification of the other account.
        for contest in (False, True):
            with self.subTest(contest=contest):
                bot, _ = await self.queued(contest)
                bot._db.execute("INSERT INTO user_merges (alt_id, main_id) VALUES ('99', '123')")
                bot._state["display_names"]["123"] = "main-account"
                self.binding(bot, username="main-account", uid="123")
                card = await self.sent_card(bot, contest)
                self.assertEqual("main-account", card["user"])
                self.assertEqual("未绑定", card["qq"])

    async def test_merge_keeps_raw_account_binding_on_both_cards(self):
        for contest in (False, True):
            with self.subTest(contest=contest):
                bot, _ = await self.queued(contest)
                bot._db.execute("INSERT INTO user_merges (alt_id, main_id) VALUES ('99', '123')")
                self.binding(bot, username="old-alt-name")
                # Mongo count boundary still receives the canonical person and map.
                bot._db_user_ac_count = lambda person, merges: (
                    7 if person == "123" and merges == {"99": "123"} else 0
                )
                card = await self.sent_card(bot, contest)
                self.assertEqual("200", card["qq"])
                if not contest:
                    self.assertEqual("123", card["user_id"])
                    self.assertEqual(7, card["total_count"])

    async def test_confirmation_replaces_all_binding_fields_and_survives_reload(self):
        # Missing profile replacement or pending cleanup leaks the old account identity.
        bot, mongo = await self.queued(username="current-name")
        self.binding(bot, username="old-owner", uid="123")
        bot._state["checkins"]["200"] = {"last_date": "", "total": 7, "streak": 0}
        texts = await replies(bot.bind_swpuoj, Event(message="绑定 99"))
        self.assertIn("/绑定确认", texts[0])
        self.assertEqual("123", bot._state["binding_profiles"]["200"]["user_id"])
        pending = deepcopy(bot._state["pending_bindings"]["200"])
        mongo.domain_user.docs = [{"domainId": "system", "uid": 99, "bio": pending["code"]}]
        self.assertIn("绑定成功", (await replies(bot.confirm_swpuoj, Event()))[0])
        self.assertEqual("current-name", bot._state["bindings"]["200"])
        self.assertEqual({"username": "current-name", "user_id": "99",
                          "profile_url": f"{bot.BASE_URL}/user/99"},
                         bot._state["binding_profiles"]["200"])
        self.assertNotIn("200", bot._state["pending_bindings"])
        self.assertEqual(7, bot._state["checkins"]["200"]["total"])
        bot._state = bot._load_state()
        self.assertEqual(("current-name", "99"), await bot._get_bound_user("200"))
        self.assertEqual("200", (await self.sent_card(bot))["qq"])

    async def test_failed_and_expired_confirmation_leave_verified_binding_intact(self):
        # Failure must neither replace verified identity nor consume retryable codes.
        bot, _ = await self.queued()
        self.binding(bot, username="verified-old", uid="123")
        await replies(bot.bind_swpuoj, Event(message="绑定 99"))
        self.assertIn("还没有", (await replies(bot.confirm_swpuoj, Event()))[0])
        self.assertEqual("123", bot._state["binding_profiles"]["200"]["user_id"])
        self.assertIn("200", bot._state["pending_bindings"])
        bot._state["pending_bindings"]["200"]["expires_at"] = 0
        self.assertIn("过期", (await replies(bot.confirm_swpuoj, Event()))[0])
        self.assertNotIn("200", bot._state["pending_bindings"])
        self.assertEqual("verified-old", bot._state["bindings"]["200"])
        self.assertEqual("123", bot._state["binding_profiles"]["200"]["user_id"])

    async def test_unbind_removes_companion_fields_persistently_for_both_cards(self):
        # A leftover profile must never restore QQ attribution after unbinding.
        for contest in (False, True):
            with self.subTest(contest=contest):
                bot, _ = await self.queued(contest)
                self.binding(bot)
                bot._state["pending_bindings"]["200"] = {"user_id": "123"}
                self.assertIn("已解除", (await replies(bot.unbind_swpuoj, Event()))[0])
                bot._state = bot._load_state()
                for field in ("bindings", "binding_profiles", "pending_bindings"):
                    self.assertNotIn("200", bot._state[field])
                self.assertIsNone(await bot._get_bound_user("200"))
                self.assertEqual("未绑定", (await self.sent_card(bot, contest))["qq"])
