"""Offline boundaries for importing and exercising the complete production module.

SQLite and production decision/ingestion/poll/send methods stay real. Framework,
Mongo transport, image rendering and message delivery never leave this process.
No AstrBot installation, application startup, source extraction or QA imports.
"""
from contextlib import closing
from copy import deepcopy
from datetime import datetime, timezone
import importlib.util
import logging
from pathlib import Path
import sqlite3
import sys
from types import ModuleType, SimpleNamespace
from unittest.mock import patch


class ObjectId(str):
    """The BSON boundary subset: 24 hex digits, ordering and UTC clock."""

    def __new__(cls, value):
        value = str(value)
        if len(value) != 24:
            raise ValueError(value)
        int(value, 16)
        return super().__new__(cls, value)

    @property
    def generation_time(self):
        return datetime.fromtimestamp(int(self[:8], 16), timezone.utc)

    @classmethod
    def from_datetime(cls, value):
        return cls(f"{int(value.timestamp()):08x}" + "0" * 16)


def oid(ts, sequence=0):
    return ObjectId(f"{ts:08x}{sequence:016x}")


def blocked(*args, **kwargs):
    raise AssertionError("External network/render boundary was not replaced")


class MessageChain:
    def __init__(self):
        self.parts = []

    def file_image(self, value):
        self.parts.append(("image", value))
        return self

    def message(self, value):
        self.parts.append(("text", value))
        return self


class Star:
    def __init__(self, context):
        self.logger = logging.getLogger("broadcast-offline-tests")


def load_production():
    modules = {}

    def module(name, **attrs):
        result = ModuleType(name)
        result.__dict__.update(attrs)
        modules[name] = result
        return result

    module("aiohttp", ClientSession=blocked, ClientTimeout=lambda **kw: kw)
    module("pymongo", MongoClient=blocked)
    module("bson")
    module("bson.objectid", ObjectId=ObjectId)
    module("bs4", BeautifulSoup=blocked)
    module("PIL", **{name: SimpleNamespace(open=blocked, new=blocked)
                     for name in ("Image", "ImageDraw", "ImageFilter", "ImageFont")})
    module("astrbot")
    module("astrbot.api", star=SimpleNamespace(Star=Star, Context=object))
    decorators = SimpleNamespace(command=lambda *a, **kw: lambda fn: fn,
                                 regex=lambda *a, **kw: lambda fn: fn)
    module("astrbot.api.event", AstrMessageEvent=object, filter=decorators)
    module("astrbot.core")
    module("astrbot.core.message")
    module("astrbot.core.message.message_event_result", MessageChain=MessageChain)
    module("astrbot.core.utils")
    module("astrbot.core.utils.astrbot_path", get_astrbot_plugin_data_path=blocked,
           get_astrbot_plugin_path=blocked)
    path = Path(__file__).resolve().parents[1] / "main.py"
    spec = importlib.util.spec_from_file_location("broadcast_production_test", path)
    result = importlib.util.module_from_spec(spec)
    with patch.dict(sys.modules, modules):
        spec.loader.exec_module(result)
    return result


production = load_production()
Production = production.DfacmAcmBroadcast


def matches(doc, query):
    for field, expected in query.items():
        if field == "$or":
            if not any(matches(doc, branch) for branch in expected):
                return False
            continue
        value = doc.get(field)
        if isinstance(expected, dict):
            for operator, bound in expected.items():
                if operator == "$exists":
                    ok = (field in doc) == bound
                elif operator == "$in":
                    ok = value in bound
                elif operator == "$gt":
                    ok = value is not None and value > bound
                elif operator == "$gte":
                    ok = value is not None and value >= bound
                elif operator == "$lt":
                    ok = value is not None and value < bound
                else:
                    raise AssertionError(f"Unsupported Mongo operator: {operator}")
                if not ok:
                    return False
        elif value != expected:
            return False
    return True


class Cursor:
    def __init__(self, values):
        self.values = values

    def sort(self, key, direction):
        self.values.sort(key=lambda row: row[key], reverse=direction < 0)
        return self

    def limit(self, count):
        self.values = self.values[:count]
        return self

    def __iter__(self):
        return iter(self.values)


class Collection:
    def __init__(self, docs=()):
        self.docs = deepcopy(list(docs))

    def find(self, query, projection=None):
        return Cursor([deepcopy(doc) for doc in self.docs if matches(doc, query)])

    def find_one(self, query, projection=None):
        return next(iter(self.find(query, projection)), None)


class Mongo:
    def __init__(self, docs=()):
        self.record = Collection(docs)
        self.user = Collection([{"_id": 99, "uname": "fixture-user", "avatar": ""}])
        self.domain_user = Collection()
        self.document = Collection([
            {"domainId": "system", "docType": 10, "docId": index,
             "pid": str(index), "title": f"Problem {index}", "hidden": False,
             "difficulty": 1, "tag": [], "nAccept": 1}
            for index in range(1, 1001)
        ])

    def __getitem__(self, name):
        if name == "domain.user":
            return self.domain_user
        raise AssertionError(f"Unsupported Mongo collection: {name}")


class Context:
    def __init__(self):
        self.messages = []
        self.deliver = True

    async def send_message(self, session, chain):
        if not self.deliver:
            return False
        self.messages.append((session, deepcopy(chain.parts)))
        return True


def make_bot(folder, started_ts, mongo=None):
    class Clock(datetime):
        @classmethod
        def now(cls, tz=None):
            return cls.fromtimestamp(started_ts, tz)

    with patch.object(production, "get_astrbot_plugin_data_path", return_value=str(folder)), \
            patch.object(production, "get_astrbot_plugin_path", return_value=str(folder / "legacy")), \
            patch.object(production, "datetime", Clock):
        bot = Production(Context())
    bot._mongo = lambda: mongo or Mongo()
    bot._avatar_cache = {"99": b""}
    bot._db_user_ac_count = lambda *args: 1
    bot._db_contest_card_stats = lambda *args: (1, 1, 1, 1)
    bot._render_ac_card = lambda item, folder: folder / "local-fixture.png"
    bot._render_contest_card = lambda item, folder: folder / "local-contest.png"
    # Owner paging is suppressed by its real throttle in failure tests.
    bot._channel_alert_at = float("inf")
    return bot


def record(ts, sequence=0, **changes):
    result = {"_id": oid(ts, sequence), "uid": 99, "pid": 1,
              "domainId": "system", "status": 1, "score": 100,
              "lang": "py", "time": 1, "memory": 128}
    result.update(changes)
    return result


LEGACY_DDL = """
CREATE TABLE records (
 rid TEXT PRIMARY KEY, user_id TEXT NOT NULL, user_name TEXT NOT NULL,
 status TEXT NOT NULL, domain_id TEXT NOT NULL DEFAULT 'system',
 doc_id INTEGER NOT NULL DEFAULT 0, problem_url TEXT NOT NULL,
 problem_title TEXT NOT NULL DEFAULT '', hidden INTEGER NOT NULL DEFAULT 0,
 tid TEXT NOT NULL DEFAULT '', contest_title TEXT NOT NULL DEFAULT '',
 contest_key TEXT NOT NULL DEFAULT '', language TEXT NOT NULL DEFAULT '',
 difficulty TEXT NOT NULL DEFAULT '', time_ms TEXT NOT NULL DEFAULT '',
 memory_kb TEXT NOT NULL DEFAULT '', tags TEXT NOT NULL DEFAULT '',
 n_accept INTEGER NOT NULL DEFAULT 0, avatar_url TEXT NOT NULL DEFAULT '',
 submitted_at TEXT NOT NULL, ts INTEGER NOT NULL,
 card_sent INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
INSERT INTO meta VALUES ('records_schema', '2');
"""


def legacy_database(folder, rows, watermark=""):
    path = folder / "swpu_acm_broadcast" / "records.db"
    path.parent.mkdir(parents=True, exist_ok=True)
    with closing(sqlite3.connect(path)) as db, db:
        db.executescript(LEGACY_DDL)
        if watermark:
            db.execute("INSERT INTO meta VALUES ('mongo_last_id', ?)", (watermark,))
        for rid, ts, sent, status in rows:
            db.execute("INSERT INTO records (rid, user_id, user_name, status, "
                       "problem_url, submitted_at, ts, card_sent, doc_id) "
                       "VALUES (?, '99', 'fixture-user', ?, 'https://invalid.test/p/1', "
                       "'fixture', ?, ?, 1)", (rid, status, ts, sent))
    return path
