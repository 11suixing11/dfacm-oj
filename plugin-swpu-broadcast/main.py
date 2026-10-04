from __future__ import annotations

import asyncio
import hashlib
import io
import json
import math
import os
import re
import secrets
import sqlite3
from datetime import datetime, timedelta, timezone
from pathlib import Path
from tempfile import TemporaryDirectory
from threading import RLock
from urllib.parse import quote
from zoneinfo import ZoneInfo

import aiohttp
import pymongo
from bson.objectid import ObjectId
from bs4 import BeautifulSoup
from PIL import Image, ImageDraw, ImageFilter, ImageFont

from astrbot.api import star
from astrbot.api.event import AstrMessageEvent, filter
from astrbot.core.message.message_event_result import MessageChain
from astrbot.core.utils.astrbot_path import (
    get_astrbot_plugin_data_path,
    get_astrbot_plugin_path,
)


class SwpuAcmBroadcast(star.Star):
    """Broadcast new SWPU ACM AC submissions and cumulative ranking."""

    STATE_SCHEMA_VERSION = 1

    GROUP_SESSION = "qq-onebot:GroupMessage:879670443"
    BASE_URL = "https://swpuacm.xyz"
    # Poll the OJ's MongoDB directly through a read-only account: no web
    # scraping, no login sessions, and the public site keeps its
    # records-behind-login policy. Credentials come from mongo_uri.txt next
    # to this file (or the SWPU_MONGO_URI environment variable).
    MONGO_DB_NAME = "hydro"
    WATCH_DOMAINS: tuple[str, ...] = ("system", "poj")
    # Hydro system account (uid 1) and the judge service account (uid 3):
    # their maintenance submissions never reach the group.
    SERVICE_UIDS: frozenset[int] = frozenset({1, 3})
    POLL_SECONDS = 15
    CARD_DRAIN_LIMIT = 20
    WATCHING_WINDOW_SECONDS = 86_400
    USER_QQ_MAP: dict[str, str] = {}
    DEFAULT_MERGE_ADMINS: tuple[str, ...] = ("1977717178",)
    # Contest scoreboard polling stays available for future contests: add
    # {id, oj_id, name, start, end} entries here to enable live broadcasts.
    CONTEST_RANKINGS: tuple[dict[str, object], ...] = ()
    # Hydro STATUS enum -> the display text the web UI shows. The
    # "%Accepted%" LIKE matches downstream rely on status 1 being the exact
    # string "Accepted".
    STATUS_TEXTS: dict[int, str] = {
        0: "Waiting",
        1: "Accepted",
        2: "Wrong Answer",
        3: "Time Exceeded",
        4: "Memory Exceeded",
        5: "Output Exceeded",
        6: "Runtime Error",
        7: "Compile Error",
        8: "System Error",
        9: "Cancelled",
        10: "Unknown Error",
        11: "Hacked",
        20: "Running",
        21: "Compiling",
        22: "Fetched",
        30: "Ignored",
        31: "Format Error",
        32: "Hack Successful",
        33: "Hack Unsuccessful",
    }
    NON_FINAL_TEXTS: tuple[str, ...] = ("Waiting", "Running", "Compiling", "Fetched")
    LANG_NAMES: dict[str, str] = {
        "c": "C",
        "cc": "C++",
        "cc.cc98": "C++98",
        "cc.cc98o2": "C++98 O2",
        "cc.cc11": "C++11",
        "cc.cc11o2": "C++11 O2",
        "cc.cc14": "C++14",
        "cc.cc14o2": "C++14 O2",
        "cc.cc17": "C++17",
        "cc.cc17o2": "C++17 O2",
        "cc.cc20": "C++20",
        "cc.cc20o2": "C++20 O2",
        "py": "Python",
        "py.py2": "Python 2",
        "py.py3": "Python 3",
        "java": "Java",
        "pas": "Pascal",
        "js": "JavaScript",
        "go": "Go",
        "rs": "Rust",
        "kt": "Kotlin",
        "cs": "C#",
    }

    def __init__(self, context: star.Context):
        super().__init__(context)
        self.context = context
        self._task: asyncio.Task | None = None
        self._state_path = (
            Path(get_astrbot_plugin_data_path()) / "swpu_acm_broadcast" / "state.json"
        )
        self._legacy_state_path = (
            Path(get_astrbot_plugin_path()) / "swpu_acm_broadcast" / "state.json"
        )
        self._state_file_lock = RLock()
        self._state = self._load_state()
        self._stats_lock = asyncio.Lock()
        self._db_path = (
            Path(get_astrbot_plugin_data_path()) / "swpu_acm_broadcast" / "records.db"
        )
        self._db: sqlite3.Connection | None = None
        self._init_db()
        self._started_at = datetime.now()
        self._started_ts = int(self._started_at.timestamp())
        self._rank_cache: dict[str, str] = {}
        self._rank_cache_at: datetime | None = None
        self._rank_refresh_task: asyncio.Task | None = None
        self._avatar_cache: dict[str, bytes] = {}
        self._mongo_client: pymongo.MongoClient | None = None
        self._user_cache: dict[int, dict] = {}
        self._problem_cache: dict[tuple[str, int], dict] = {}

    def _load_state(self) -> dict:
        """Load, migrate, and normalize persisted plugin state.

        Returns:
            A schema-compatible state dictionary. Legacy state is copied to the
            plugin data directory on first load.
        """
        data = None
        loaded_from_legacy = False
        for state_path in (self._state_path, self._legacy_state_path):
            try:
                candidate = json.loads(state_path.read_text(encoding="utf-8"))
            except (OSError, ValueError):
                continue
            if isinstance(candidate, dict):
                data = candidate
                loaded_from_legacy = state_path == self._legacy_state_path
                break

        if data is None:
            data = {}

        list_fields = ("seen", "solved", "welcomed")
        dict_fields = (
            "users",
            "bindings",
            "binding_profiles",
            "pending_bindings",
            "checkins",
            "display_names",
        )
        for field in list_fields:
            if not isinstance(data.get(field), list):
                data[field] = []
        for field in dict_fields:
            if not isinstance(data.get(field), dict):
                data[field] = {}
        normalized_users = {}
        for username, count in data["users"].items():
            try:
                count = int(count)
            except (TypeError, ValueError):
                continue
            if count < 0:
                continue
            normalized_users[str(username)] = count
        data["users"] = normalized_users
        data["bindings"] = {
            str(qq): str(username)
            for qq, username in data["bindings"].items()
            if str(qq).strip() and str(username).strip()
        }
        data["display_names"] = {
            str(user_id): str(name)
            for user_id, name in data["display_names"].items()
            if str(user_id).strip() and str(name).strip()
        }
        data["binding_profiles"] = {
            str(qq): profile
            for qq, profile in data["binding_profiles"].items()
            if str(qq).strip() and isinstance(profile, dict)
        }
        normalized_pending = {}
        for qq, profile in data["pending_bindings"].items():
            if not str(qq).strip() or not isinstance(profile, dict):
                continue
            try:
                expires_at = float(profile.get("expires_at", 0))
            except (TypeError, ValueError):
                expires_at = 0
            normalized_pending[str(qq)] = {
                **profile,
                "expires_at": expires_at,
            }
        data["pending_bindings"] = normalized_pending
        normalized_checkins = {}
        for qq, record in data["checkins"].items():
            if not str(qq).strip() or not isinstance(record, dict):
                continue
            try:
                total = max(0, int(record.get("total", 0)))
                streak = max(0, int(record.get("streak", 0)))
            except (TypeError, ValueError):
                continue
            normalized_checkins[str(qq)] = {
                **record,
                "total": total,
                "streak": streak,
                "last_date": str(record.get("last_date") or ""),
            }
        data["checkins"] = normalized_checkins
        if not isinstance(data.get("baseline_ready"), bool):
            data["baseline_ready"] = False
        for field in ("day", "counting_since", "ranking_sent_day", "updated_at"):
            if not isinstance(data.get(field), str):
                data[field] = ""
        try:
            schema_version = int(data.get("schema_version", 0))
        except (TypeError, ValueError):
            schema_version = 0
        if schema_version > self.STATE_SCHEMA_VERSION:
            self.logger.warning(
                "SWPU state schema %s is newer than supported schema %s",
                schema_version,
                self.STATE_SCHEMA_VERSION,
            )
        data["schema_version"] = max(schema_version, self.STATE_SCHEMA_VERSION)

        if loaded_from_legacy or not self._state_path.exists():
            self._state = data
            self._save_state()
        return data

    def _save_state(self) -> None:
        """Persist normalized state atomically in the plugin data directory."""
        with self._state_file_lock:
            self._state_path.parent.mkdir(parents=True, exist_ok=True)
            try:
                schema_version = int(self._state.get("schema_version", 0))
            except (TypeError, ValueError):
                schema_version = 0
            self._state["schema_version"] = max(
                schema_version,
                self.STATE_SCHEMA_VERSION,
            )
            self._state["updated_at"] = datetime.now(
                ZoneInfo("Asia/Shanghai")
            ).isoformat()
            tmp = self._state_path.with_suffix(".tmp")
            tmp.write_text(
                json.dumps(self._state, ensure_ascii=False), encoding="utf-8"
            )
            tmp.replace(self._state_path)

    def _init_db(self) -> None:
        """Open (or create) the append-only local submission store."""
        self._db_path.parent.mkdir(parents=True, exist_ok=True)
        self._db = sqlite3.connect(self._db_path, isolation_level=None)
        self._db.row_factory = sqlite3.Row
        self._db.execute("PRAGMA journal_mode=WAL")
        self._db.execute("PRAGMA synchronous=NORMAL")
        self._db.executescript(
            """
            CREATE TABLE IF NOT EXISTS records (
                rid TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                user_name TEXT NOT NULL,
                status TEXT NOT NULL,
                problem_url TEXT NOT NULL,
                problem_title TEXT NOT NULL DEFAULT '',
                hidden INTEGER NOT NULL DEFAULT 0,
                language TEXT NOT NULL DEFAULT '',
                difficulty TEXT NOT NULL DEFAULT '',
                avatar_url TEXT NOT NULL DEFAULT '',
                submitted_at TEXT NOT NULL,
                ts INTEGER NOT NULL,
                card_sent INTEGER NOT NULL DEFAULT 1
            );
            CREATE INDEX IF NOT EXISTS idx_records_user_prob
                ON records(user_id, problem_url);
            CREATE INDEX IF NOT EXISTS idx_records_ts ON records(ts);
            CREATE INDEX IF NOT EXISTS idx_records_pending
                ON records(card_sent) WHERE card_sent = 0;
            CREATE TABLE IF NOT EXISTS users (
                user_id TEXT PRIMARY KEY,
                display_name TEXT NOT NULL,
                last_ts INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS meta (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS user_merges (
                alt_id TEXT PRIMARY KEY,
                main_id TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_user_merges_main
                ON user_merges(main_id);
            CREATE TABLE IF NOT EXISTS contest_solves (
                contest_id TEXT NOT NULL,
                uid TEXT NOT NULL,
                user_name TEXT NOT NULL,
                avatar_url TEXT NOT NULL DEFAULT '',
                problem_key TEXT NOT NULL,
                problem_title TEXT NOT NULL DEFAULT '',
                solve_at TEXT NOT NULL DEFAULT '',
                solve_seconds INTEGER NOT NULL DEFAULT 0,
                solved_count INTEGER NOT NULL DEFAULT 0,
                contest_rank INTEGER NOT NULL DEFAULT 0,
                solve_order INTEGER NOT NULL DEFAULT 0,
                first_seen_ts INTEGER NOT NULL,
                card_sent INTEGER NOT NULL DEFAULT 0,
                PRIMARY KEY (contest_id, uid, problem_key)
            );
            CREATE INDEX IF NOT EXISTS idx_contest_solves_pending
                ON contest_solves(card_sent) WHERE card_sent = 0;
            """
        )

    def _db_get_meta(self, key: str) -> str:
        row = self._db.execute(
            "SELECT value FROM meta WHERE key = ?", (key,)
        ).fetchone()
        return str(row["value"]) if row else ""

    def _db_set_meta(self, key: str, value: str) -> None:
        self._db.execute(
            "INSERT INTO meta(key, value) VALUES(?, ?) "
            "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            (key, value),
        )

    def _stats_cutoff_epoch(self) -> int:
        counting_since = str(
            self._state.get("counting_since") or datetime.now().strftime("%Y-%m-%d")
        )
        try:
            cutoff = datetime.strptime(counting_since, "%Y-%m-%d")
        except ValueError:
            cutoff = datetime.strptime(datetime.now().strftime("%Y-%m-%d"), "%Y-%m-%d")
        return int(cutoff.replace(tzinfo=ZoneInfo("Asia/Shanghai")).timestamp())

    def _earlier_ac_exists(self, user_id: str, problem_url: str, ts: int) -> bool:
        """Whether the user ever AC'd this problem before `ts`.

        Deliberately unbounded (no counting-window floor): once the full
        history backfill has run, re-solving a problem first AC'd before
        the counting window stays silent instead of re-broadcasting.
        Person-level: merged alt accounts share the main account's
        identity, so a re-solve on any of one person's accounts counts as
        already solved.
        """
        row = self._db.execute(
            "SELECT 1 FROM records r "
            "LEFT JOIN user_merges um ON um.alt_id = r.user_id "
            "WHERE COALESCE(um.main_id, r.user_id) = ? AND r.problem_url = ? "
            "AND r.status LIKE '%Accepted%' AND r.ts < ? LIMIT 1",
            (self._person_id(user_id), problem_url, ts),
        ).fetchone()
        return row is not None

    def _ingest_records(self, items: list[dict], force_no_card: bool = False) -> int:
        """Append parsed records (oldest first); returns how many were new.

        Rows are re-sorted by submission time instead of trusting the page
        order, so an earlier AC always lands in the store before a later
        re-submission of the same problem is judged. `force_no_card` (used
        by the history backfill) stores every row as never-broadcast
        history, skipping the earlier-AC check entirely.
        """
        new_count = 0
        for item in sorted(items, key=lambda entry: entry["ts"]):
            if item.get("hidden"):
                # Hidden problems have no stable URL, so synthesize a
                # per-user per-day key. Hidden rows are fully invisible (no
                # card, no count); the key only keeps storage well-formed.
                day = datetime.fromtimestamp(
                    item["ts"], tz=ZoneInfo("Asia/Shanghai")
                ).strftime("%Y-%m-%d")
                problem_url = f"{self.BASE_URL}/record/HIDDEN/{item['user_id']}/{day}"
            else:
                problem_url = item["problem_url"]
            card_sent = 1
            if (
                not force_no_card
                # Hidden (contest/homework) problems are invisible to the
                # bot: never broadcast, never counted.
                and not item.get("hidden")
                and "Accepted" in item["status"]
                and item["ts"] >= self._started_ts
                and not self._earlier_ac_exists(
                    item["user_id"], problem_url, item["ts"]
                )
            ):
                card_sent = 0
            cursor = self._db.execute(
                "INSERT OR IGNORE INTO records("
                "rid, user_id, user_name, status, problem_url, problem_title,"
                " hidden, language, difficulty, avatar_url, submitted_at, ts, card_sent"
                ") VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)",
                (
                    item["id"],
                    item["user_id"],
                    item["oj_user"],
                    item["status"],
                    problem_url,
                    item["problem"],
                    1 if item.get("hidden") else 0,
                    item["language"],
                    str(item.get("difficulty", "") or ""),
                    item.get("avatar_url", ""),
                    item["submitted_at"],
                    item["ts"],
                    card_sent,
                ),
            )
            if not cursor.rowcount:
                continue
            new_count += 1
            self._db.execute(
                "INSERT INTO users(user_id, display_name, last_ts) VALUES(?,?,?) "
                "ON CONFLICT(user_id) DO UPDATE SET "
                "display_name = CASE WHEN excluded.last_ts >= last_ts "
                "THEN excluded.display_name ELSE display_name END, "
                "last_ts = MAX(last_ts, excluded.last_ts)",
                (item["user_id"], item["oj_user"], item["ts"]),
            )
        return new_count

    def _person_id(self, user_id: str) -> str:
        """Canonical person id for an OJ account.

        Merged alt accounts (user_merges) share their main account's id so
        every leaderboard/statistic counts each problem once per person.
        The table is kept flat at write time (alts point straight to the
        root main), so one hop per step is enough; the seen-set still
        guards against stale cycles.
        """
        uid = str(user_id)
        seen: set[str] = set()
        while uid not in seen:
            seen.add(uid)
            row = self._db.execute(
                "SELECT main_id FROM user_merges WHERE alt_id = ?", (uid,)
            ).fetchone()
            if row is None:
                break
            uid = str(row["main_id"])
        return uid

    def _display_name_for(self, user_id: str) -> str:
        uid = self._person_id(user_id)
        remapped = self._state.get("display_names", {}).get(uid)
        if remapped:
            return str(remapped)
        row = self._db.execute(
            "SELECT display_name FROM users WHERE user_id = ?", (uid,)
        ).fetchone()
        return str(row["display_name"]) if row else uid

    def _stats_from_db(
        self, since_ts: int | None = None, until_ts: int | None = None
    ) -> dict[str, int]:
        """Per-user new-problem counts in [since_ts, until_ts), keyed by name.

        A problem counts only when its first-ever AC (full history) falls
        inside the window, so re-solving a problem first AC'd earlier —
        even before the counting window — never double-counts. Hidden
        (contest/homework) problems are excluded entirely: the bot treats
        them as invisible. Accounts merged via /合并账号 share one person
        id, so every problem counts once per person (union of their
        accounts, first-AC attribution preserved). Without arguments this
        covers the whole counting window since counting_since; pass
        explicit bounds for per-day leaderboards.
        """
        if since_ts is None:
            since_ts = self._stats_cutoff_epoch()
        if until_ts is None:
            until_ts = 2**62
        rows = self._db.execute(
            "SELECT person_id, COUNT(*) AS cnt FROM ("
            "SELECT COALESCE(um.main_id, r.user_id) AS person_id, "
            "r.problem_url, MIN(r.ts) AS first_ts "
            "FROM records r LEFT JOIN user_merges um ON um.alt_id = r.user_id "
            "WHERE r.status LIKE '%Accepted%' AND r.hidden = 0 "
            "GROUP BY person_id, r.problem_url) "
            "WHERE first_ts >= ? AND first_ts < ? GROUP BY person_id",
            (since_ts, until_ts),
        ).fetchall()
        stats: dict[str, int] = {}
        for row in rows:
            name = self._display_name_for(row["person_id"])
            stats[name] = stats.get(name, 0) + row["cnt"]
        return stats

    @staticmethod
    def _day_epoch(day: str) -> int:
        """Midnight (Asia/Shanghai) epoch for a YYYY-MM-DD string."""
        return int(
            datetime.strptime(day, "%Y-%m-%d")
            .replace(tzinfo=ZoneInfo("Asia/Shanghai"))
            .timestamp()
        )

    def _user_ac_count(self, user_id: str) -> int:
        row = self._db.execute(
            "SELECT COUNT(*) AS cnt FROM ("
            "SELECT COALESCE(um.main_id, r.user_id) AS person_id, "
            "r.problem_url, MIN(r.ts) AS first_ts "
            "FROM records r LEFT JOIN user_merges um ON um.alt_id = r.user_id "
            "WHERE r.status LIKE '%Accepted%' AND r.hidden = 0 "
            "GROUP BY person_id, r.problem_url) "
            "WHERE person_id = ? AND first_ts >= ?",
            (self._person_id(user_id), self._stats_cutoff_epoch()),
        ).fetchone()
        return int(row["cnt"]) if row else 0

    def _refresh_contest_rankings(self, now_ts: int | None = None) -> None:
        """Store leaderboard snapshots for configured contest time windows.

        The public record feed does not expose a stable problem identifier for
        hidden contest problems. Rankings therefore use accepted submission
        counts, including hidden records, instead of claiming a solved-problem
        count. The time window is start-inclusive and end-exclusive.

        Args:
            now_ts: Optional current timestamp for the snapshot. Primarily used
                by tests; defaults to the current China Standard Time.
        """
        if self._db is None:
            return
        current_ts = now_ts or int(datetime.now(ZoneInfo("Asia/Shanghai")).timestamp())
        contests: list[dict[str, object]] = []
        for contest in self.CONTEST_RANKINGS:
            start = contest["start"]
            end = contest["end"]
            assert isinstance(start, datetime) and isinstance(end, datetime)
            start_ts = int(start.timestamp())
            end_ts = int(end.timestamp())
            if current_ts < start_ts:
                status = "upcoming"
                query_end = start_ts
            elif current_ts < end_ts:
                status = "ongoing"
                query_end = current_ts
            else:
                status = "ended"
                query_end = end_ts
            rows = self._db.execute(
                "SELECT COALESCE(um.main_id, r.user_id) AS person_id, "
                "COUNT(*) AS ac_count, MIN(r.ts) AS first_ac_ts "
                "FROM records r LEFT JOIN user_merges um ON um.alt_id = r.user_id "
                "WHERE r.status LIKE '%Accepted%' AND r.ts >= ? AND r.ts < ? "
                "GROUP BY person_id "
                "ORDER BY ac_count DESC, first_ac_ts ASC, person_id ASC",
                (start_ts, query_end),
            ).fetchall()
            contests.append(
                {
                    "id": str(contest["id"]),
                    "name": str(contest["name"]),
                    "start": start.strftime("%Y-%m-%d %H:%M"),
                    "end": end.strftime("%Y-%m-%d %H:%M"),
                    "status": status,
                    "ranking": [
                        {
                            "user": self._display_name_for(str(row["person_id"])),
                            "ac": int(row["ac_count"]),
                        }
                        for row in rows
                    ],
                }
            )
        self._state["contest_rankings"] = contests
        self._save_state()

    # ------------------------------------------------------------------
    # Contest broadcasts: scoreboard diff -> contest card queue.
    # ------------------------------------------------------------------

    def _active_broadcast_contests(self, now: datetime) -> list[dict]:
        """Contests currently running that have an anonymous scoreboard."""
        active: list[dict] = []
        for contest in self.CONTEST_RANKINGS:
            start = contest["start"]
            end = contest["end"]
            oj_id = str(contest.get("oj_id", "") or "")
            if not oj_id:
                continue
            assert isinstance(start, datetime) and isinstance(end, datetime)
            if start <= now < end:
                active.append(contest)
        return active

    @staticmethod
    def _elapsed_seconds(value: str) -> int:
        total = 0
        for part in str(value).strip().split(":"):
            try:
                total = total * 60 + int(part)
            except ValueError:
                return 0
        return total

    @staticmethod
    def _format_elapsed(seconds: int) -> str:
        hours, rem = divmod(int(seconds), 3600)
        minutes = rem // 60
        if hours:
            return f"{hours}:{minutes:02d}"
        return f"0:{minutes:02d}"

    @staticmethod
    def _parse_contest_scoreboard(soup) -> tuple[list[dict], list[dict]]:
        """Parse a Hydro contest scoreboard page (anonymous view).

        Returns (problems, entries). A problem cell counts as solved only
        when its span carries a non-empty data-tooltip (HH:MM:SS elapsed
        time); empty tooltips and CSS colors are ignored on purpose.
        """
        problems: list[dict] = []
        for cell in soup.select("thead th.col--problem"):
            link = cell.select_one('a[href^="/p/"]')
            if link is None:
                continue
            letter = (
                link.get_text(" ", strip=True).replace("\n", " ").strip().split(" ")[0]
            )
            if not letter:
                continue
            problems.append(
                {"key": letter, "title": str(link.get("data-tooltip", "")).strip()}
            )
        entries: list[dict] = []
        for row in soup.select("tbody tr"):
            user_link = row.select_one('td.col--user a[href^="/user/"]')
            rank_cell = row.select_one("td.col--rank")
            if user_link is None or rank_cell is None:
                continue
            uid = str(user_link.get("href", "")).rstrip("/").rsplit("/", 1)[-1]
            if not uid:
                continue
            avatar = row.select_one("td.col--user img.user-profile-avatar")
            avatar_url = str(avatar.get("src", "")).strip() if avatar else ""
            if avatar_url.startswith("//"):
                avatar_url = f"https:{avatar_url}"
            elif avatar_url.startswith("/"):
                # Site-hosted default avatars are root-relative paths; this
                # is a staticmethod, so reference the class constant here.
                avatar_url = f"{SwpuAcmBroadcast.BASE_URL}{avatar_url}"
            rank_text = rank_cell.get_text(" ", strip=True)
            solved = 0
            total_time = ""
            solved_cell = row.select_one("td.col--solved")
            if solved_cell is not None:
                solved_text = solved_cell.get_text(" ", strip=True)
                match = re.search(r"\d+", solved_text)
                if match:
                    solved = int(match.group(0))
                time_match = re.search(r"\d+:\d{2}(?::\d{2})?", solved_text)
                if time_match:
                    total_time = time_match.group(0)
            solves: dict[str, tuple[str, int]] = {}
            for problem, cell in zip(problems, row.select("td.col--problem")):
                tip_node = cell.select_one("[data-tooltip]")
                tooltip = (
                    str(tip_node.get("data-tooltip", "") or "").strip()
                    if tip_node is not None
                    else ""
                )
                if not tooltip:
                    continue
                solves[problem["key"]] = (tooltip, SwpuAcmBroadcast._elapsed_seconds(tooltip))
            entries.append(
                {
                    "uid": uid,
                    "name": user_link.get_text(" ", strip=True),
                    "avatar_url": avatar_url,
                    "rank": rank_text,
                    "solved": solved,
                    "total_time": total_time,
                    "solves": solves,
                }
            )
        return problems, entries

    def _upsert_contest_solves(
        self, contest: dict, problems: list[dict], entries: list[dict]
    ) -> int:
        """Insert newly solved (contest, user, problem) rows.

        The first sync of a contest is a silent baseline: solves that
        happened before the bot started watching are recorded with
        card_sent = 1, so history never floods the group. Only solves first
        seen after the baseline get queued for broadcast.
        """
        contest_id = str(contest["id"])
        baseline_key = f"contest_baseline_done_{contest_id}"
        baseline = self._db_get_meta(baseline_key) != "1"
        now_ts = int(datetime.now(ZoneInfo("Asia/Shanghai")).timestamp())
        fresh_by_problem: dict[str, list[tuple[dict, dict, str, int]]] = {}
        for entry in entries:
            for problem in problems:
                solved = entry["solves"].get(problem["key"])
                if solved is None:
                    continue
                known = self._db.execute(
                    "SELECT 1 FROM contest_solves WHERE contest_id = ? "
                    "AND uid = ? AND problem_key = ?",
                    (contest_id, entry["uid"], problem["key"]),
                ).fetchone()
                if known is not None:
                    continue
                fresh_by_problem.setdefault(
                    problem["key"], []
                ).append((entry, problem, solved[0], solved[1]))
        inserted = 0
        # The problem count never changes mid-contest; keep it next to the
        # other contest meta so cards can render a progress bar.
        self._db_set_meta(
            f"contest_total_problems_{contest_id}", str(len(problems))
        )
        # Participant count feeds the daily report's "opened" denominator.
        self._db_set_meta(f"contest_participants_{contest_id}", str(len(entries)))
        for problem_key, newcomers in fresh_by_problem.items():
            known_count = int(
                self._db.execute(
                    "SELECT COUNT(*) AS n FROM contest_solves "
                    "WHERE contest_id = ? AND problem_key = ?",
                    (contest_id, problem_key),
                ).fetchone()["n"]
            )
            newcomers.sort(key=lambda item: item[3])
            for offset, (entry, problem, solve_at, solve_seconds) in enumerate(
                newcomers, 1
            ):
                self._db.execute(
                    "INSERT OR IGNORE INTO contest_solves ("
                    "contest_id, uid, user_name, avatar_url, problem_key, "
                    "problem_title, solve_at, solve_seconds, solved_count, "
                    "contest_rank, solve_order, first_seen_ts, card_sent"
                    ") VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                    (
                        contest_id,
                        entry["uid"],
                        entry["name"],
                        entry["avatar_url"],
                        problem["key"],
                        problem["title"],
                        solve_at,
                        solve_seconds,
                        entry["solved"],
                        entry["rank"],
                        known_count + offset,
                        now_ts,
                        1 if baseline else 0,
                    ),
                )
                inserted += 1
        if baseline:
            self._db_set_meta(baseline_key, "1")
            self.logger.info(
                "Contest baseline recorded for %s: %d pre-existing solve(s)",
                contest["name"],
                inserted,
            )
        return inserted

    async def _poll_contest_broadcasts(self) -> None:
        """Detect newly solved contest problems and queue them for broadcast.

        Contest submissions never appear in the public /record feed, so the
        anonymous scoreboard is the only data source. Each running contest
        is fetched once per poll cycle; failures are logged and retried on
        the next cycle.
        """
        if self._db is None:
            return
        now = datetime.now(ZoneInfo("Asia/Shanghai"))
        contests = self._active_broadcast_contests(now)
        if not contests:
            return
        timeout = aiohttp.ClientTimeout(total=30)
        async with aiohttp.ClientSession(timeout=timeout) as session:
            for contest in contests:
                try:
                    url = f"{self.BASE_URL}/contest/{contest['oj_id']}/scoreboard"
                    async with session.get(url) as response:
                        response.raise_for_status()
                        html = await response.text()
                    problems, entries = self._parse_contest_scoreboard(
                        BeautifulSoup(html, "html.parser")
                    )
                    if not problems:
                        self.logger.warning(
                            "Contest scoreboard parse found no problems for %s; "
                            "page layout change?",
                            contest["name"],
                        )
                        continue
                    # Read the baseline flag before the sync marks it, so the
                    # "new solve" log never fires for the silent baseline round.
                    was_baseline = (
                        self._db_get_meta(
                            f"contest_baseline_done_{contest['id']}"
                        )
                        != "1"
                    )
                    inserted = self._upsert_contest_solves(contest, problems, entries)
                    if inserted and not was_baseline:
                        self.logger.info(
                            "Contest %s: %d new solve(s) detected",
                            contest["name"],
                            inserted,
                        )
                except asyncio.CancelledError:
                    raise
                except Exception:
                    self.logger.exception("Contest scoreboard sync failed")
        await self._drain_contest_cards()

    def _contests_in_report_window(self, now: datetime) -> list[dict]:
        """Contests whose daily midnight report window covers ``now``.

        Date-based on purpose and inclusive of the end date, so a contest
        closing at midnight still gets its final wrap-up report that day.
        """
        if now.tzinfo is None:
            now = now.replace(tzinfo=ZoneInfo("Asia/Shanghai"))
        active: list[dict] = []
        for contest in self.CONTEST_RANKINGS:
            start = contest["start"]
            end = contest["end"]
            oj_id = str(contest.get("oj_id", "") or "")
            if not oj_id:
                continue
            assert isinstance(start, datetime) and isinstance(end, datetime)
            end_local = end.astimezone(ZoneInfo("Asia/Shanghai"))
            if start <= now and now.date() <= end_local.date():
                active.append(contest)
        return active

    async def _maybe_send_contest_daily_report(self) -> None:
        """Publish each in-window contest's daily report once per day.

        The report goes out on the first poll after midnight, right after
        the scoreboard sync, so the numbers are fresh. The per-contest
        meta guard survives restarts: a report is never duplicated, and
        one missed to downtime is sent on the first poll afterwards.
        """
        if self._db is None:
            return
        now = datetime.now(ZoneInfo("Asia/Shanghai"))
        today = now.strftime("%Y-%m-%d")
        for contest in self._contests_in_report_window(now):
            guard_key = f"contest_report_day_{contest['id']}"
            if self._db_get_meta(guard_key) == today:
                continue
            message = self._build_contest_daily_report(contest, now)
            if message:
                await self.context.send_message(
                    self.GROUP_SESSION,
                    MessageChain().message(message),
                )
                self.logger.info(
                    "Contest daily report sent for %s", contest["name"]
                )
            self._db_set_meta(guard_key, today)

    def _build_contest_daily_report(self, contest: dict, now: datetime) -> str:
        """Compose the daily contest report text from contest_solves."""
        contest_id = str(contest["id"])
        start = contest["start"]
        assert isinstance(start, datetime)
        # Rows only store the elapsed solve time; wall-clock AC time is
        # contest start + elapsed, so a day window maps to elapsed bounds.
        start_ts = int(start.timestamp())
        today_start = self._day_epoch(now.strftime("%Y-%m-%d"))
        lo = today_start - 86400 - start_ts
        hi = today_start - start_ts
        row = self._db.execute(
            "SELECT COUNT(*) AS total, COUNT(DISTINCT uid) AS people, "
            "COUNT(DISTINCT problem_key) AS problems "
            "FROM contest_solves WHERE contest_id = ?",
            (contest_id,),
        ).fetchone()
        total = int(row["total"])
        solved_people = int(row["people"])
        solved_problems = int(row["problems"])
        row = self._db.execute(
            "SELECT COUNT(*) AS cnt, COUNT(DISTINCT uid) AS people "
            "FROM contest_solves WHERE contest_id = ? "
            "AND solve_seconds >= ? AND solve_seconds < ?",
            (contest_id, lo, hi),
        ).fetchone()
        yesterday_new = int(row["cnt"])
        yesterday_people = int(row["people"])
        try:
            total_problems = int(
                self._db_get_meta(f"contest_total_problems_{contest_id}") or 0
            )
            participants = int(
                self._db_get_meta(f"contest_participants_{contest_id}") or 0
            )
        except (TypeError, ValueError):
            total_problems = 0
            participants = 0
        lines = [f"🏆 {contest['name']} · 每日战报"]
        if yesterday_new:
            lines.append(f"昨日新解出 {yesterday_new} 题 · {yesterday_people} 人有产出")
        else:
            lines.append("昨日暂无新解出")
        cumulative = f"开赛至今累计解出 {total} 题"
        if total_problems:
            cumulative += f"（{total_problems} 题中已攻破 {solved_problems} 题）"
        lines.append(cumulative)
        if not solved_people:
            lines.append("暂无人开张，等你来解出第一题！")
            return "\n".join(lines)
        leader = self._db.execute(
            "SELECT uid, user_name, COUNT(*) AS cnt FROM contest_solves "
            "WHERE contest_id = ? GROUP BY uid "
            "ORDER BY cnt DESC, MIN(solve_seconds) ASC, uid ASC LIMIT 1",
            (contest_id,),
        ).fetchone()
        people = (
            f"{solved_people} / {participants} 人已开张"
            if participants
            else f"{solved_people} 人已开张"
        )
        if leader is not None:
            name = self._display_contest_name(
                str(leader["uid"]), str(leader["user_name"])
            )
            people += f" · 当前领跑：{name}（{int(leader['cnt'])} 题）"
        lines.append(people)
        return "\n".join(lines)

    async def _fetch_contest_scoreboard(
        self, contest: dict
    ) -> tuple[list[dict], list[dict]] | None:
        """Fetch and parse the live contest scoreboard, or None on failure."""
        timeout = aiohttp.ClientTimeout(total=30)
        try:
            async with aiohttp.ClientSession(timeout=timeout) as session:
                url = f"{self.BASE_URL}/contest/{contest['oj_id']}/scoreboard"
                async with session.get(url) as response:
                    response.raise_for_status()
                    html = await response.text()
        except Exception:
            self.logger.exception("Contest scoreboard fetch failed")
            return None
        return self._parse_contest_scoreboard(BeautifulSoup(html, "html.parser"))

    async def _send_contest_ranking(
        self, contest: dict, now: datetime
    ) -> None:
        """Post the live contest ranking as a plain-text message."""
        scoreboard = await self._fetch_contest_scoreboard(contest)
        if scoreboard is None:
            await self.context.send_message(
                self.GROUP_SESSION,
                MessageChain().message(
                    f"🏆 {contest['name']}\n暂时无法获取比赛排名，稍后再试。"
                ),
            )
            return
        problems, entries = scoreboard
        solved_users = [e for e in entries if e["solved"] > 0]
        unsolved = len(entries) - len(solved_users)
        remaining = contest["end"] - now
        if remaining.total_seconds() >= 86400:
            left_note = (
                f"还剩 {remaining.days} 天 {remaining.seconds // 3600} 小时"
            )
        elif remaining.total_seconds() >= 3600:
            left_note = (
                f"还剩 {remaining.seconds // 3600} 小时 "
                f"{(remaining.seconds // 60) % 60} 分"
            )
        else:
            left_note = f"还剩 {remaining.seconds // 60} 分钟"
        lines = [
            f"🏆 {contest['name']} · 实时排名",
            f"共 {len(problems)} 题 · {len(entries)} 人参赛 · {left_note}",
            "",
        ]
        if solved_users:
            for entry in solved_users:
                name = self._display_contest_name(entry["uid"], entry["name"])
                total_note = (
                    f"（用时 {entry['total_time']}）" if entry["total_time"] else ""
                )
                lines.append(
                    f"{entry['rank']}. {name} —— {entry['solved']} 题{total_note}"
                )
            if unsolved:
                lines.append("")
                lines.append(f"另有 {unsolved} 人暂未解出")
        else:
            lines.append("暂无人解出题目，等你来开张！")
        await self.context.send_message(
            self.GROUP_SESSION,
            MessageChain().message("\n".join(lines)),
        )

    async def _drain_contest_cards(self) -> None:
        """Broadcast queued contest cards, oldest solve first."""
        if self._db is None:
            return
        rows = self._db.execute(
            "SELECT * FROM contest_solves WHERE card_sent = 0 "
            "ORDER BY first_seen_ts ASC, solve_seconds ASC, uid ASC, problem_key ASC "
            "LIMIT ?",
            (self.CARD_DRAIN_LIMIT,),
        ).fetchall()
        contests_by_id = {
            str(contest["id"]): contest for contest in self.CONTEST_RANKINGS
        }
        for row in rows:
            contest = contests_by_id.get(row["contest_id"])
            if contest is None:
                # Unknown contest id (config removed): drop the card silently.
                self._db.execute(
                    "UPDATE contest_solves SET card_sent = 1 "
                    "WHERE contest_id = ? AND uid = ? AND problem_key = ?",
                    (row["contest_id"], row["uid"], row["problem_key"]),
                )
                continue
            sent = await self._broadcast_contest_card(contest, row)
            if sent:
                self._db.execute(
                    "UPDATE contest_solves SET card_sent = 1 "
                    "WHERE contest_id = ? AND uid = ? AND problem_key = ?",
                    (row["contest_id"], row["uid"], row["problem_key"]),
                )

    def _display_contest_name(self, uid: str, raw_name: str) -> str:
        """Preferred display name for a contest participant (merged or set)."""
        display = self._display_name_for(uid)
        if not display or display == uid:
            return raw_name
        return display

    def _contest_card_item(self, contest: dict, row: sqlite3.Row) -> dict:
        bindings = self._state.get("bindings", {})
        raw_name = str(row["user_name"]).strip()
        bound_qq = next(
            (
                qq
                for qq, name in bindings.items()
                if str(name).strip().casefold() == raw_name.casefold()
            ),
            "未绑定",
        )
        display = self._display_contest_name(str(row["uid"]), raw_name)
        try:
            total_problems = int(
                self._db_get_meta(
                    f"contest_total_problems_{contest['id']}"
                )
                or 0
            )
        except (TypeError, ValueError):
            total_problems = 0
        # Wall-clock AC time = contest start + elapsed solve time.
        ac_clock = ""
        start = contest.get("start")
        if isinstance(start, datetime) and int(row["solve_seconds"]) > 0:
            ac_dt = start.astimezone(ZoneInfo("Asia/Shanghai")) + timedelta(
                seconds=int(row["solve_seconds"])
            )
            ac_clock = ac_dt.strftime("%m-%d %H:%M")
        return {
            "contest_name": str(contest["name"]),
            "contest_url": f"{self.BASE_URL}/contest/{contest['oj_id']}",
            "user": display,
            "oj_user": raw_name,
            "qq": bound_qq,
            "avatar_url": str(row["avatar_url"]),
            "problem_key": str(row["problem_key"]),
            "problem_title": str(row["problem_title"]),
            "solve_at": str(row["solve_at"]),
            "solve_display": self._format_elapsed(int(row["solve_seconds"])),
            "solved_count": int(row["solved_count"]),
            "total_problems": total_problems,
            "ac_clock": ac_clock,
            "contest_rank": str(row["contest_rank"]),
            "solve_order": int(row["solve_order"]),
        }

    async def _broadcast_contest_card(
        self, contest: dict, row: sqlite3.Row
    ) -> bool:
        item = self._contest_card_item(contest, row)
        avatar_key = str(row["uid"])
        avatar_data = self._avatar_cache.get(avatar_key, b"") if avatar_key else b""
        if avatar_key and not avatar_data:
            # Primary: the scoreboard avatar URL (usually the QQ CDN, which
            # is flaky from the HK host). Fallback: scrape the OJ profile
            # page like the regular AC card. Successful bytes are cached so
            # later cards for the same user never re-download.
            avatar_url = str(item.get("avatar_url", "")).strip()
            try:
                timeout = aiohttp.ClientTimeout(total=15)
                async with aiohttp.ClientSession(timeout=timeout) as session:
                    if avatar_url:
                        try:
                            async with session.get(avatar_url) as response:
                                if response.status == 200:
                                    avatar_data = await response.content.read(
                                        1_000_000
                                    )
                        except asyncio.CancelledError:
                            raise
                        except Exception:
                            pass  # CDN hiccup; try the OJ profile below
                    if not avatar_data:
                        profile_url = (
                            f"{self.BASE_URL}/user/{quote(avatar_key, safe='')}"
                        )
                        async with session.get(profile_url) as response:
                            if response.status == 200:
                                profile_soup = BeautifulSoup(
                                    await response.text(), "html.parser"
                                )
                                avatar = profile_soup.select_one(
                                    "img.large.user-profile-avatar, "
                                    "img.user-profile-avatar"
                                )
                                fallback_url = (
                                    str(avatar.get("src", "")).strip()
                                    if avatar
                                    else ""
                                )
                                if fallback_url.startswith("//"):
                                    fallback_url = f"https:{fallback_url}"
                                elif fallback_url.startswith("/"):
                                    fallback_url = (
                                        f"{self.BASE_URL}{fallback_url}"
                                    )
                                if fallback_url:
                                    async with session.get(fallback_url) as response:
                                        if response.status == 200:
                                            avatar_data = (
                                                await response.content.read(
                                                    1_000_000
                                                )
                                            )
            except Exception:
                self.logger.info("Contest avatar unavailable; using initial fallback")
        if avatar_data:
            item["avatar_data"] = avatar_data
            self._avatar_cache[avatar_key] = avatar_data
        ac_clock = item.get("ac_clock", "")
        fallback = (
            f"🏆 比赛播报 · {item['contest_name']}\n"
            f"用户：{item['user']}\n"
            f"解出题目：{item['problem_key']} 「{item['problem_title']}」"
            f"（第 {item['solve_order']} 个解出）\n"
            + (
                f"AC 于 {ac_clock} · 比赛用时 {item['solve_display']}"
                if ac_clock
                else f"用时：{item['solve_display']}"
            )
            + "\n"
            f"本场已解 {item['solved_count']}"
            + (f"/{item['total_problems']}" if item.get("total_problems") else "")
            + f" 题 · 排名第 {item['contest_rank']}\n"
            f"比赛链接：{item['contest_url']}"
        )
        try:
            with TemporaryDirectory(prefix="swpu-acm-") as temp_dir:
                image_path = self._render_contest_card(item, Path(temp_dir))
                for attempt in range(3):
                    try:
                        sent = bool(
                            await self.context.send_message(
                                self.GROUP_SESSION,
                                MessageChain().file_image(str(image_path)),
                            )
                        )
                        if sent:
                            return True
                    except Exception:
                        if attempt == 2:
                            self.logger.exception(
                                "Contest card delivery failed after retries"
                            )
                        else:
                            self.logger.warning("Contest card delivery failed; retrying")
                    if attempt < 2:
                        await asyncio.sleep(2 * (attempt + 1))
        except Exception:
            self.logger.exception("Contest card rendering failed; sending text fallback")
        for attempt in range(2):
            try:
                sent = bool(
                    await self.context.send_message(
                        self.GROUP_SESSION,
                        MessageChain().message(fallback),
                    )
                )
                if sent:
                    return True
            except Exception:
                if attempt == 1:
                    self.logger.exception("Contest text fallback delivery failed")
                else:
                    self.logger.warning("Contest text fallback delivery failed; retrying")
            if attempt == 0:
                await asyncio.sleep(2)
        return False

    def _card_item_from_row(self, row: sqlite3.Row) -> dict:
        problem_url = row["problem_url"]
        if row["hidden"]:
            # The stored URL is a synthetic dedupe key; the card should link
            # to the real (login-gated) record page instead.
            problem_url = f"{self.BASE_URL}/record/{row['rid']}"
        return {
            "id": row["rid"],
            "status": row["status"],
            "problem": row["problem_title"],
            "problem_url": problem_url,
            "hidden": bool(row["hidden"]),
            "user": self._display_name_for(row["user_id"]),
            "oj_user": row["user_name"],
            # Cards show the canonical person (main account) so a merged
            # alt account broadcasts under its owner's name.
            "user_id": self._person_id(row["user_id"]),
            "avatar_url": row["avatar_url"],
            "qq": "未绑定",
            "difficulty": str(row["difficulty"] or "") or "暂未标注",
            "language": row["language"],
            "submitted_at": row["submitted_at"],
        }

    async def initialize(self) -> None:
        try:
            await asyncio.wait_for(asyncio.to_thread(self._db_ping), timeout=8)
            self.logger.info("SWPU ACM broadcast: OJ database connection OK")
        except Exception:
            self.logger.error(
                "SWPU ACM broadcast: OJ database unreachable — check mongo_uri.txt"
            )
        self._task = asyncio.create_task(self._worker())
        self.logger.info("SWPU ACM broadcast started for QQ group 879670443")

    async def terminate(self) -> None:
        if self._task:
            self._task.cancel()
            await asyncio.gather(self._task, return_exceptions=True)
            self._task = None
        if self._db is not None:
            self._db.close()
            self._db = None
        if self._mongo_client is not None:
            self._mongo_client.close()
            self._mongo_client = None

    async def _worker(self) -> None:
        # Let the OneBot reverse WebSocket finish connecting before the first poll.
        await asyncio.sleep(30)
        try:
            await self._maybe_run_initial_import()
        except Exception:
            self.logger.exception("Failed to import OJ records")
        while True:
            try:
                await self._maybe_send_ranking()
                await self._poll_once()
            except asyncio.CancelledError:
                raise
            except Exception:
                self.logger.exception("SWPU OJ polling failed")
            await asyncio.sleep(self.POLL_SECONDS)

    # ------------------------------------------------------------------
    # Direct read-only MongoDB access layer (runs inside worker threads).
    # ------------------------------------------------------------------

    def _mongo_uri(self) -> str:
        uri = str(os.environ.get("SWPU_MONGO_URI", "")).strip()
        if uri:
            return uri
        try:
            path = Path(__file__).parent / "mongo_uri.txt"
            if path.exists():
                value = path.read_text(encoding="utf-8").strip()
                if value:
                    return value
        except OSError:
            pass
        return ""

    def _mongo(self) -> pymongo.database.Database:
        """Lazy, thread-safe client for the OJ database (read-only account)."""
        if self._mongo_client is None:
            uri = self._mongo_uri()
            if not uri:
                raise RuntimeError(
                    "MongoDB URI missing: create mongo_uri.txt next to main.py "
                    "or set the SWPU_MONGO_URI environment variable"
                )
            self._mongo_client = pymongo.MongoClient(
                uri,
                directConnection=True,
                serverSelectionTimeoutMS=5000,
                connectTimeoutMS=5000,
                socketTimeoutMS=15000,
                appName="swpu_acm_broadcast",
            )
        return self._mongo_client[self.MONGO_DB_NAME]

    def _db_ping(self) -> bool:
        return bool(self._mongo().command("ping").get("ok"))

    def _status_text(self, code: object) -> str:
        try:
            return self.STATUS_TEXTS.get(int(code), "Unknown Error")
        except (TypeError, ValueError):
            return "Unknown Error"

    @staticmethod
    def _record_clock(oid: ObjectId) -> tuple[datetime, int]:
        """Submission time embedded in the record ObjectId (UTC -> Beijing)."""
        generated = oid.generation_time
        if generated.tzinfo is None:
            generated = generated.replace(tzinfo=timezone.utc)
        return generated.astimezone(ZoneInfo("Asia/Shanghai")), int(
            generated.timestamp()
        )

    @staticmethod
    def _avatar_url_from_field(avatar: object) -> str:
        """Build a fetchable avatar URL from Hydro's avatar field."""
        value = str(avatar or "").strip()
        if value.startswith("qq:"):
            return f"//q1.qlogo.cn/g?b=qq&nk={quote(value[3:].strip())}&s=140"
        if value.startswith("gravatar:"):
            digest = hashlib.md5(
                value[len("gravatar:"):].strip().lower().encode()
            ).hexdigest()
            return f"//gravatar.com/avatar/{digest}?s=140&d=identicon"
        return ""

    @staticmethod
    def _problem_display_key(pdoc: dict) -> str:
        """Card label for a problem: numeric docId on system, pid elsewhere."""
        if str(pdoc.get("domainId", "system")) == "system":
            return str(pdoc.get("docId", ""))
        return str(pdoc.get("pid") or pdoc.get("docId") or "")

    def _problem_url(self, pdoc: dict) -> str:
        domain = str(pdoc.get("domainId", "system"))
        if domain == "system":
            return f"{self.BASE_URL}/p/{pdoc.get('docId')}"
        return f"{self.BASE_URL}/d/{domain}/p/{pdoc.get('pid')}"

    _RECORD_PROJECTION: dict = {
        "_id": 1,
        "uid": 1,
        "pid": 1,
        "domainId": 1,
        "status": 1,
        "lang": 1,
        "tid": 1,
    }

    def _db_user_docs(self, db, uids) -> dict[int, dict]:
        wanted = set()
        for uid in uids:
            if uid is None:
                continue
            try:
                wanted.add(int(uid))
            except (TypeError, ValueError):
                continue
        missing = [uid for uid in wanted if uid not in self._user_cache]
        if missing:
            for udoc in db.user.find({"_id": {"$in": missing}}):
                try:
                    uid = int(udoc["_id"])
                except (TypeError, ValueError):
                    continue
                self._user_cache[uid] = {
                    "uname": str(udoc.get("uname") or uid),
                    "avatar": udoc.get("avatar") or "",
                }
            for uid in missing:
                # Negative cache: unknown uids never re-query.
                self._user_cache.setdefault(uid, {"uname": str(uid), "avatar": ""})
        return {uid: self._user_cache[uid] for uid in wanted if uid in self._user_cache}

    def _db_problem_docs(self, db, keys) -> dict[tuple[str, int], dict]:
        wanted: list[tuple[str, int]] = []
        for domain, doc_id in keys:
            try:
                wanted.append((str(domain), int(doc_id)))
            except (TypeError, ValueError):
                continue
        missing = [key for key in wanted if key not in self._problem_cache]
        by_domain: dict[str, list[int]] = {}
        for domain, doc_id in missing:
            by_domain.setdefault(domain, []).append(doc_id)
        for domain, doc_ids in by_domain.items():
            found = {
                int(p["docId"]): p
                for p in db.document.find(
                    {"domainId": domain, "docType": 10, "docId": {"$in": doc_ids}},
                    {"docId": 1, "pid": 1, "title": 1, "hidden": 1, "difficulty": 1},
                )
            }
            for doc_id in doc_ids:
                pdoc = found.get(doc_id)
                if pdoc is None:
                    # Deleted problems get a negative cache entry (treated
                    # like hidden ones) so they never re-query.
                    pdoc = {
                        "docId": doc_id,
                        "pid": "",
                        "title": "",
                        "hidden": True,
                        "difficulty": 0,
                    }
                self._problem_cache[(domain, doc_id)] = {**pdoc, "domainId": domain}
        return {
            key: self._problem_cache[key] for key in wanted if key in self._problem_cache
        }

    def _db_fetch_increment(self, after_hex: str, watching: list[str]):
        """Worker thread: fresh records past the watermark + status rechecks."""
        db = self._mongo()
        query: dict = {}
        if after_hex:
            query["_id"] = {"$gt": ObjectId(after_hex)}
        new_docs = list(
            db.record.find(query, self._RECORD_PROJECTION).sort("_id", 1).limit(400)
        )
        watch_docs: list[dict] = []
        if watching:
            watch_docs = list(
                db.record.find(
                    {"_id": {"$in": [ObjectId(rid) for rid in watching]}},
                    self._RECORD_PROJECTION,
                )
            )
        return new_docs, watch_docs

    def _db_map_docs(self, docs: list[dict]) -> list[dict]:
        """Worker thread: enrich record documents into ingest items."""
        if not docs:
            return []
        db = self._mongo()
        user_docs = self._db_user_docs(db, [doc.get("uid") for doc in docs])
        problem_docs = self._db_problem_docs(
            db,
            [(str(doc.get("domainId") or "system"), doc.get("pid")) for doc in docs],
        )
        items: list[dict] = []
        for doc in docs:
            try:
                uid = int(doc.get("uid") or 0)
            except (TypeError, ValueError):
                continue
            if uid in self.SERVICE_UIDS:
                continue
            domain = str(doc.get("domainId") or "system")
            if domain not in self.WATCH_DOMAINS:
                continue
            if doc.get("tid"):
                # Contest submissions never entered the old public-feed
                # statistics either; keep that parity until a contest
                # feature is configured for the new site.
                continue
            rid = str(doc["_id"])
            submitted_dt, ts = self._record_clock(doc["_id"])
            udoc = user_docs.get(uid) or {"uname": str(uid), "avatar": ""}
            pdoc = problem_docs.get((domain, int(doc.get("pid") or 0)))
            hidden = bool(
                pdoc is None or pdoc.get("hidden") or not pdoc.get("title")
            )
            if hidden:
                problem = "隐藏题目 题目信息未公开"
                problem_url = f"{self.BASE_URL}/record/{rid}"
                difficulty = ""
            else:
                problem = (
                    f"{self._problem_display_key(pdoc)}. "
                    f"{str(pdoc.get('title') or '').strip()}"
                )
                problem_url = self._problem_url(pdoc)
                diff = pdoc.get("difficulty") or 0
                try:
                    difficulty = str(int(diff)) if diff else ""
                except (TypeError, ValueError):
                    difficulty = ""
            items.append(
                {
                    "id": rid,
                    "status": self._status_text(doc.get("status")),
                    "problem": problem,
                    "problem_url": problem_url,
                    "hidden": hidden,
                    "user": str(
                        self._state.get("display_names", {}).get(str(uid), udoc["uname"])
                    ),
                    "oj_user": udoc["uname"],
                    "user_id": str(uid),
                    "avatar_url": self._avatar_url_from_field(udoc.get("avatar")),
                    "qq": "未绑定",
                    "difficulty": difficulty,
                    "language": self.LANG_NAMES.get(
                        str(doc.get("lang") or ""), str(doc.get("lang") or "未知语言")
                    ),
                    "submitted_at": submitted_dt.strftime("%Y-%m-%d %H:%M:%S"),
                    "ts": ts,
                }
            )
        return items

    def _db_user_bio(self, user_id: str) -> str:
        try:
            uid = int(user_id)
        except (TypeError, ValueError):
            return ""
        db = self._mongo()
        for domain in self.WATCH_DOMAINS:
            dudoc = db["domain.user"].find_one(
                {"domainId": domain, "uid": uid}, {"bio": 1}
            )
            if dudoc and dudoc.get("bio"):
                return str(dudoc["bio"])
        return ""

    def _db_rank_cache(self) -> dict[str, str]:
        db = self._mongo()
        cache: dict[str, str] = {}
        pairs: list[tuple[int, object, str]] = []
        for dudoc in db["domain.user"].find(
            {"domainId": "system", "rp": {"$gt": 0}},
            {"uid": 1, "rank": 1, "displayName": 1},
        ):
            if dudoc.get("rank") is None:
                continue
            try:
                pairs.append(
                    (
                        int(dudoc["uid"]),
                        dudoc["rank"],
                        str(dudoc.get("displayName") or ""),
                    )
                )
            except (TypeError, ValueError):
                continue
        user_docs = self._db_user_docs(db, [uid for uid, _, _ in pairs])
        for uid, rank, display_name in pairs:
            udoc = user_docs.get(uid)
            name = str(udoc["uname"]) if udoc else str(uid)
            for key in (name, name.casefold(), str(uid), display_name):
                if key:
                    cache[key] = str(int(rank))
        return cache

    def _db_problem_info(self, doc_id: int) -> dict | None:
        db = self._mongo()
        for domain in self.WATCH_DOMAINS:
            pdoc = db.document.find_one(
                {"domainId": domain, "docType": 10, "docId": doc_id},
                {"pid": 1, "title": 1, "difficulty": 1},
            )
            if pdoc and pdoc.get("title"):
                diff = pdoc.get("difficulty") or 0
                if domain == "system":
                    label, url = str(doc_id), f"{self.BASE_URL}/p/{doc_id}"
                else:
                    label = str(pdoc.get("pid") or doc_id)
                    url = f"{self.BASE_URL}/d/{domain}/p/{pdoc.get('pid')}"
                return {
                    "label": label,
                    "title": str(pdoc["title"]),
                    "difficulty": str(int(diff)) if diff else "",
                    "url": url,
                }
        return None

    def _db_user_records(self, uid: int, limit: int = 5) -> list[dict]:
        db = self._mongo()
        docs = list(
            db.record.find({"uid": uid}, self._RECORD_PROJECTION)
            .sort("_id", -1)
            .limit(limit)
        )
        if not docs:
            return []
        problem_docs = self._db_problem_docs(
            db,
            [(str(doc.get("domainId") or "system"), doc.get("pid")) for doc in docs],
        )
        records: list[dict] = []
        for doc in docs:
            pdoc = problem_docs.get(
                (str(doc.get("domainId") or "system"), int(doc.get("pid") or 0))
            )
            if pdoc and not pdoc.get("hidden") and pdoc.get("title"):
                problem = (
                    f"{self._problem_display_key(pdoc)}. "
                    f"{str(pdoc.get('title') or '').strip()}"
                )
            else:
                problem = "隐藏题目"
            submitted_dt, _ = self._record_clock(doc["_id"])
            records.append(
                {
                    "status": self._status_text(doc.get("status")),
                    "problem": problem,
                    "language": self.LANG_NAMES.get(
                        str(doc.get("lang") or ""), str(doc.get("lang") or "未知语言")
                    ),
                    "submitted_at": submitted_dt.strftime("%Y-%m-%d %H:%M:%S"),
                }
            )
        return records

    def _db_user_profile_stats(self, uid: int) -> dict | None:
        db = self._mongo()
        if db.user.find_one({"_id": uid}, {"uname": 1}) is None:
            return None
        solved = len(
            list(
                db.record.aggregate(
                    [
                        {"$match": {"uid": uid, "status": 1}},
                        {"$group": {"_id": {"d": "$domainId", "p": "$pid"}}},
                    ]
                )
            )
        )
        dudoc = db["domain.user"].find_one(
            {"domainId": "system", "uid": uid}, {"rp": 1, "rank": 1}
        )
        rp = dudoc.get("rp") if dudoc else None
        rank = dudoc.get("rank") if dudoc else None
        return {
            "solved_count": solved,
            "rp": str(int(rp)) if rp else "",
            "rank": str(int(rank)) if rank else "",
        }

    def _db_find_user_profiles(self, query: str) -> list[dict[str, str]]:
        db = self._mongo()
        udoc = None
        if re.fullmatch(r"\d{1,10}", query):
            udoc = db.user.find_one({"_id": int(query)})
        if udoc is None:
            udoc = db.user.find_one({"unameLower": query.casefold()})
        if udoc is None:
            dudoc = db["domain.user"].find_one(
                {"domainId": "system", "displayName": query}
            )
            if dudoc is not None:
                try:
                    udoc = db.user.find_one({"_id": int(dudoc["uid"])})
                except (TypeError, ValueError):
                    udoc = None
        if udoc is None:
            return []
        uid = int(udoc["_id"])
        return [
            {
                "profile_url": f"{self.BASE_URL}/user/{uid}",
                "username": str(udoc.get("uname") or uid),
                "user_id": str(uid),
            }
        ]

    async def _maybe_run_initial_import(self) -> None:
        """One-time full sync of every OJ record into the local store.

        The new OJ is young, so the old "counting window import" and the
        "full history backfill" collapse into a single full-table pass: rows
        older than the process start land with card_sent=1 (silent history
        that widens the earlier-AC dedup view), while anything newer flows
        through the normal card decision. Idempotent by record id: a failed
        import simply retries on the next poll.
        """
        if self._db is None:
            return
        if self._db_get_meta("import_done") == "1":
            return
        async with self._stats_lock:
            if self._db_get_meta("import_done") == "1":
                return
            docs, _pending_watch = await asyncio.to_thread(
                self._db_fetch_increment, "", []
            )
            items = await asyncio.to_thread(self._db_map_docs, docs)
            imported = self._ingest_records(items)
            if docs:
                self._db_set_meta("mongo_last_id", str(docs[-1]["_id"]))
            counting_since = str(
                self._state.get("counting_since")
                or datetime.now().strftime("%Y-%m-%d")
            )
            self._db_set_meta("import_done", "1")
            self._db_set_meta("history_backfill_done", "1")
            self._db_set_meta("import_scope", counting_since)
            self._state["counting_since"] = counting_since
            self._save_state()
            self.logger.info(
                "Local OJ records store ready: %s record(s) synced, %s new row(s) stored",
                len(docs),
                imported,
            )

    async def _poll_new_records(self) -> None:
        """Watermark poll: fetch fresh records and re-check unfinished ones.

        New records arrive with a submission-time ObjectId, so a single
        indexed ``_id > watermark`` query is the whole fetch. Records still
        in a non-final status (queued / compiling / judging — remote judges
        can take minutes) are re-checked every cycle until they settle; an
        AC transition re-runs the card decision exactly like a fresh
        ingest would.
        """
        if self._db is None:
            return
        last_hex = self._db_get_meta("mongo_last_id")
        watching = self._watching_rids()
        new_docs, watch_docs = await asyncio.to_thread(
            self._db_fetch_increment, last_hex, watching
        )
        items = await asyncio.to_thread(self._db_map_docs, new_docs)
        if items:
            self._ingest_records(items)
        if new_docs:
            self._db_set_meta("mongo_last_id", str(new_docs[-1]["_id"]))
        await self._apply_judgement_updates(watch_docs)

    def _watching_rids(self) -> list[str]:
        """Rids of recent submissions still waiting for a verdict."""
        if self._db is None:
            return []
        horizon = int(datetime.now().timestamp()) - self.WATCHING_WINDOW_SECONDS
        placeholders = ",".join("?" for _ in self.NON_FINAL_TEXTS)
        rows = self._db.execute(
            f"SELECT rid FROM records WHERE status IN ({placeholders}) "
            "AND ts > ? ORDER BY ts ASC LIMIT 200",
            (*self.NON_FINAL_TEXTS, horizon),
        ).fetchall()
        return [str(row["rid"]) for row in rows]

    async def _apply_judgement_updates(self, watch_docs: list[dict]) -> None:
        """Mirror verdict transitions of watched records into the store."""
        if not watch_docs or self._db is None:
            return
        for doc in watch_docs:
            rid = str(doc["_id"])
            status_text = self._status_text(doc.get("status"))
            row = self._db.execute(
                "SELECT status, hidden, user_id, problem_url, ts, card_sent "
                "FROM records WHERE rid = ?",
                (rid,),
            ).fetchone()
            if row is None or row["status"] == status_text:
                continue
            self._db.execute(
                "UPDATE records SET status = ? WHERE rid = ?", (status_text, rid)
            )
            if int(doc.get("status") or 0) != 1:
                continue
            if row["hidden"] or int(row["card_sent"]) != 1:
                continue
            if int(row["ts"]) < self._started_ts:
                continue
            if self._earlier_ac_exists(
                str(row["user_id"]), str(row["problem_url"]), int(row["ts"])
            ):
                continue
            self._db.execute(
                "UPDATE records SET card_sent = 0 WHERE rid = ?", (rid,)
            )
            self.logger.info("Watched record %s turned Accepted; card queued", rid)

    async def _drain_pending_cards(self) -> None:
        """Broadcast queued AC cards, oldest first.

        hidden = 0 re-enforces the invisible rule at drain time, so a hidden
        row can never send a card even if it somehow reached the queue.
        """
        if self._db is None:
            return
        rows = self._db.execute(
            "SELECT * FROM records WHERE card_sent = 0 AND hidden = 0 "
            "ORDER BY ts ASC, rid ASC LIMIT ?",
            (self.CARD_DRAIN_LIMIT,),
        ).fetchall()
        for row in rows:
            sent = await self._broadcast_ac(self._card_item_from_row(row))
            if sent:
                self._db.execute(
                    "UPDATE records SET card_sent = 1 WHERE rid = ?", (row["rid"],)
                )

    async def _refresh_rank_cache(self) -> None:
        """Load user ranks straight from the OJ database into the cache."""
        try:
            cache = await asyncio.to_thread(self._db_rank_cache)
            if cache:
                self._rank_cache = cache
            self._rank_cache_at = datetime.now()
        except asyncio.CancelledError:
            raise
        except Exception:
            self.logger.exception("Ranking cache refresh failed")

    async def _fetch_user_rank(self, user: str) -> str:
        # The cache is pre-warmed by the poll loop; if it happens to be
        # stale, serve the stale value instead of blocking the AC card on a
        # 10-page crawl. Unknown users simply report "1000+".
        return self._rank_cache.get(
            str(user).strip(),
            self._rank_cache.get(str(user).strip().casefold(), "1000+"),
        )

    async def _fetch_problem(self, problem_id: str) -> str:
        problem_id = problem_id.strip()
        if not problem_id:
            return "用法：/oj题目 题号"
        if not re.fullmatch(r"\d{1,10}", problem_id):
            return f"题号需要是纯数字（如 /oj题目 1000），收到：{problem_id[:20]}"
        try:
            info = await asyncio.to_thread(self._db_problem_info, int(problem_id))
        except Exception:
            self.logger.exception("Problem lookup failed")
            return f"题目 {problem_id} 查询失败，请稍后再试"
        if info is None:
            return f"没有找到题目 {problem_id}"
        return (
            f"题目：{info['label']}. {info['title']}\n"
            f"题号：{info['label']}\n难度：{info['difficulty'] or '未标注'}\n"
            f"链接：{info['url']}"
        )

    async def _get_bound_user(self, qq: str) -> tuple[str, str] | None:
        """Resolve a QQ binding to its OJ user ID, using the local cache first.

        Args:
            qq: QQ identifier associated with the binding.

        Returns:
            The bound username and OJ user ID, or ``None`` when unbound or
            unresolved.
        """
        bindings = self._state.setdefault("bindings", {})
        username = bindings.get(qq)
        if not username:
            return None
        cached_profile = self._state.setdefault("binding_profiles", {}).get(qq)
        if isinstance(cached_profile, dict) and cached_profile.get("user_id"):
            return str(username), str(cached_profile["user_id"])
        profile_url = await self._resolve_user_profile(str(username))
        if not profile_url:
            return None
        user_id = profile_url.rstrip("/").rsplit("/", 1)[-1]
        self._state.setdefault("binding_profiles", {})[qq] = {
            "username": str(username),
            "user_id": user_id,
            "profile_url": profile_url,
        }
        self._save_state()
        return str(username), user_id

    async def _fetch_user_records(self, user_id: str) -> list[dict]:
        try:
            return await asyncio.to_thread(self._db_user_records, int(user_id))
        except (TypeError, ValueError):
            return []

    async def _find_user_profiles(self, username: str) -> list[dict[str, str]]:
        query = str(username).strip()
        if not query:
            return []
        try:
            return await asyncio.to_thread(self._db_find_user_profiles, query)
        except Exception:
            self.logger.exception("User profile lookup failed")
            return []

    async def _resolve_user_profile(self, username: str) -> str:
        matches = await self._find_user_profiles(username)
        return matches[0]["profile_url"] if len(matches) == 1 else ""

    async def _fetch_user_profile_stats(self, user_id: str) -> dict[str, object]:
        """Read historical solving statistics straight from the database.

        Raises:
            ValueError: If the user does not exist or the database is
                unreachable.
        """
        try:
            stats = await asyncio.to_thread(self._db_user_profile_stats, int(user_id))
        except (TypeError, ValueError):
            raise ValueError("用户 UID 无效")
        if stats is None:
            raise ValueError("用户主页不存在或暂时无法访问")
        return stats

    async def _poll_once(self) -> None:
        await self._maybe_run_initial_import()
        # Pre-warm the rank cache in the background so AC cards never wait
        # on a ranking query.
        if (
            self._rank_cache_at is None
            or (datetime.now() - self._rank_cache_at).total_seconds() > 300
        ) and (self._rank_refresh_task is None or self._rank_refresh_task.done()):
            self._rank_refresh_task = asyncio.create_task(self._refresh_rank_cache())
        await self._poll_new_records()
        await self._drain_pending_cards()
        await self._poll_contest_broadcasts()
        await self._maybe_send_contest_daily_report()
        self._refresh_contest_rankings()

    async def _broadcast_ac(self, item: dict) -> bool:
        bindings = self._state.get("bindings", {})
        item_name = str(item.get("user", "")).strip().casefold()
        item_oj_name = str(item.get("oj_user", "")).strip().casefold()
        item_user_id = str(item.get("user_id", "")).strip()
        bound_qq = next(
            (
                qq
                for qq, name in bindings.items()
                if str(name).strip().casefold()
                in {item_name, item_oj_name, item_user_id.casefold()}
            ),
            "未绑定",
        )
        item["qq"] = bound_qq
        item["rank"] = await self._fetch_user_rank(item.get("user_id") or item["user"])
        item["difficulty"] = str(item.get("difficulty") or "") or "暂未标注"
        total_count = self._user_ac_count(item["user_id"])
        item["total_count"] = total_count
        item["count_index"] = total_count
        avatar_key = str(item.get("user_id") or item.get("oj_user") or "").strip()
        avatar_data = self._avatar_cache.get(avatar_key, b"") if avatar_key else b""
        if avatar_key and avatar_key not in self._avatar_cache:
            avatar_url = str(item.get("avatar_url", "")).strip()
            try:
                timeout = aiohttp.ClientTimeout(total=10)
                async with aiohttp.ClientSession(timeout=timeout) as session:
                    if not avatar_url:
                        profile_url = (
                            f"{self.BASE_URL}/user/{quote(avatar_key, safe='')}"
                        )
                        async with session.get(profile_url) as response:
                            if response.status == 200:
                                profile_soup = BeautifulSoup(
                                    await response.text(), "html.parser"
                                )
                                avatar = profile_soup.select_one(
                                    "img.large.user-profile-avatar, img.user-profile-avatar"
                                )
                                avatar_url = (
                                    str(avatar.get("src", "")).strip() if avatar else ""
                                )
                    if avatar_url.startswith("//"):
                        avatar_url = f"https:{avatar_url}"
                    elif avatar_url.startswith("/"):
                        avatar_url = f"{self.BASE_URL}{avatar_url}"
                    if avatar_url:
                        async with session.get(avatar_url) as response:
                            if response.status == 200:
                                avatar_data = await response.content.read(1_000_000)
            except Exception:
                self.logger.info("User avatar unavailable; using initial fallback")
            self._avatar_cache[avatar_key] = avatar_data
        if avatar_data:
            item["avatar_data"] = avatar_data
        fallback = (
            "🎉 新的 AC 提交！\n"
            f"用户：{item['user']}\n"
            f"当前排名：{item['rank']}\n"
            f"题目：{item['problem']}\n"
            f"难度：{item['difficulty']}\n"
            f"语言：{item['language']}\n"
            f"提交时间：{item['submitted_at']}\n"
            f"题目链接：{item['problem_url']}"
        )
        try:
            with TemporaryDirectory(prefix="swpu-acm-") as temp_dir:
                image_path = self._render_ac_card(item, Path(temp_dir))
                for attempt in range(3):
                    try:
                        sent = bool(
                            await self.context.send_message(
                                self.GROUP_SESSION,
                                MessageChain().file_image(str(image_path)),
                            )
                        )
                        if sent:
                            return True
                    except Exception:
                        if attempt == 2:
                            self.logger.exception(
                                "AC card delivery failed after retries"
                            )
                        else:
                            self.logger.warning("AC card delivery failed; retrying")
                    if attempt < 2:
                        await asyncio.sleep(2 * (attempt + 1))
        except Exception:
            self.logger.exception("AC card rendering failed; sending text fallback")
        for attempt in range(2):
            try:
                sent = bool(
                    await self.context.send_message(
                        self.GROUP_SESSION,
                        MessageChain().message(fallback),
                    )
                )
                if sent:
                    return True
            except Exception:
                if attempt == 1:
                    self.logger.exception("Text fallback delivery failed")
                else:
                    self.logger.warning("Text fallback delivery failed; retrying")
            if attempt == 0:
                await asyncio.sleep(2)
        return False

    async def _maybe_send_ranking(self) -> None:
        # ranking_sent_day guards against duplicates, so the daily leaderboard
        # simply goes out on the first poll after midnight — even if the bot
        # was restarting at 00:00 or offline for hours.
        now = datetime.now()
        today = now.strftime("%Y-%m-%d")
        if self._state.get("ranking_sent_day") == today:
            return
        # While any contest is inside its daily-report window the regular
        # midnight leaderboards stay silent; ranking_sent_day is left
        # unmarked so they resume automatically once every contest is over.
        if self._contests_in_report_window(now):
            return
        await self._send_ranking(mark_sent=True)
        yesterday = (now.date().fromordinal(now.date().toordinal() - 1)).strftime(
            "%Y-%m-%d"
        )
        await self._send_daily_ranking(yesterday, "")

    async def _send_daily_ranking(self, target_day: str, until_note: str) -> None:
        """Publish the per-day AC leaderboard for a YYYY-MM-DD day."""
        day_start = self._day_epoch(target_day)
        users = self._stats_from_db(day_start, day_start + 86400)
        header = f"📊 {target_day} AC 榜单{until_note}"
        if not users:
            await self.context.send_message(
                self.GROUP_SESSION,
                MessageChain().message(f"{header}\n当日暂无 AC 记录"),
            )
            return
        ranking = sorted(users.items(), key=lambda item: (-item[1], item[0]))
        lines = [
            header,
            "按 SWPUOJ 首次通过统计：重做已通过的题不重复计数",
            "",
        ]
        lines.extend(
            f"{index}. {user} —— {count} 题"
            for index, (user, count) in enumerate(ranking, 1)
        )
        await self.context.send_message(
            self.GROUP_SESSION, MessageChain().message("\n".join(lines))
        )

    async def _send_ranking(
        self, target_day: str | None = None, mark_sent: bool = False
    ) -> None:
        today = datetime.now().strftime("%Y-%m-%d")
        counting_since = self._state.get("counting_since") or target_day or today
        users = self._stats_from_db()
        if not users:
            await self.context.send_message(
                self.GROUP_SESSION,
                MessageChain().message(
                    f"📊 累计 AC 排名（自 {counting_since}）\n当前暂无已播报 AC 的用户"
                ),
            )
            if mark_sent:
                self._state["ranking_sent_day"] = today
                self._save_state()
            return
        ranking = sorted(users.items(), key=lambda item: (-item[1], item[0]))
        lines = [
            f"📊 累计 AC 排名（自 {counting_since}）",
            "按 SWPUOJ 首次通过统计：重做已通过的题不重复计数",
            "",
        ]
        lines.extend(
            f"{index}. {user} —— {count} 题"
            for index, (user, count) in enumerate(ranking, 1)
        )
        await self.context.send_message(
            self.GROUP_SESSION, MessageChain().message("\n".join(lines))
        )
        if mark_sent:
            self._state["ranking_sent_day"] = today
            self._save_state()

    @staticmethod
    def _font(size: int, bold: bool = False):
        name = "NotoSansCJK-Bold.ttc" if bold else "NotoSansCJK-Regular.ttc"
        return ImageFont.truetype(f"/usr/share/fonts/opentype/noto/{name}", size)

    def _render_ac_card(self, item: dict, output_dir: Path) -> Path:
        """Render a dark neon competition-style AC card."""
        width, height = 1200, 680
        image = Image.new("RGBA", (width, height), "#0d1120")
        draw = ImageDraw.Draw(image)

        for y in range(height):
            ratio = y / height
            color = (
                14 + int(8 * ratio),
                18 + int(8 * ratio),
                34 + int(20 * ratio),
                255,
            )
            draw.line((0, y, width, y), fill=color)

        glow = Image.new("RGBA", (width, height), (0, 0, 0, 0))
        glow_draw = ImageDraw.Draw(glow)
        glow_draw.ellipse((760, -180, 1300, 360), fill=(50, 43, 170, 65))
        glow_draw.ellipse((-240, 420, 420, 900), fill=(126, 37, 126, 45))
        glow = glow.filter(ImageFilter.GaussianBlur(70))
        image = Image.alpha_composite(image, glow)
        draw = ImageDraw.Draw(image)

        outer = (38, 28, width - 38, height - 28)
        draw.rounded_rectangle(
            outer, radius=30, fill="#101527", outline="#3b3c86", width=3
        )

        grid = Image.new("RGBA", (width, height), (0, 0, 0, 0))
        grid_draw = ImageDraw.Draw(grid)
        for x in range(70, width - 50, 52):
            grid_draw.line((x, 40, x, height - 48), fill=(72, 77, 138, 22), width=1)
        for y in range(70, height - 40, 52):
            grid_draw.line((54, y, width - 54, y), fill=(72, 77, 138, 18), width=1)
        image = Image.alpha_composite(image, grid)
        draw = ImageDraw.Draw(image)

        def fit(value: str, font, max_width: int) -> str:
            value = str(value)
            if draw.textbbox((0, 0), value, font=font)[2] <= max_width:
                return value
            while (
                value and draw.textbbox((0, 0), value + "…", font=font)[2] > max_width
            ):
                value = value[:-1]
            return value + "…"

        def text(xy, value: str, size: int, fill: str, bold: bool = False, anchor=None):
            draw.text(
                xy, str(value), font=self._font(size, bold), fill=fill, anchor=anchor
            )

        def chip(x: int, y: int, label: str, border: str, color: str, fill: str) -> int:
            font = self._font(19, True)
            bbox = draw.textbbox((0, 0), label, font=font)
            chip_width = bbox[2] - bbox[0] + 34
            draw.rounded_rectangle(
                (x, y, x + chip_width, y + 40),
                radius=20,
                fill=fill,
                outline=border,
                width=2,
            )
            draw.text(
                (x + chip_width / 2, y + 20), label, font=font, fill=color, anchor="mm"
            )
            return x + chip_width + 12

        def neon_line(points, color=(67, 242, 183, 255), width_px=4):
            nonlocal image, draw
            layer = Image.new("RGBA", (width, height), (0, 0, 0, 0))
            layer_draw = ImageDraw.Draw(layer)
            layer_draw.line(
                points, fill=(*color[:3], 150), width=width_px + 12, joint="curve"
            )
            layer = layer.filter(ImageFilter.GaussianBlur(10))
            image = Image.alpha_composite(image, layer)
            draw = ImageDraw.Draw(image)
            draw.line(points, fill=color, width=width_px, joint="curve")

        # Brand header.
        text((80, 67), "< />", 40, "#32efb3", True)
        text((180, 56), "SWPU_ACM", 35, "#f0f3ff", True)
        text((183, 101), "ONLINE JUDGE", 18, "#8f93c7", False)
        text((665, 64), "用代码书写更好的自己", 17, "#7b7fae", False)

        # Accepted status panel.
        status_box = (878, 54, 1130, 148)
        draw.rounded_rectangle(
            status_box, radius=25, fill="#102b2b", outline="#46f0b4", width=3
        )
        neon_line(
            [(914, 102), (930, 118), (961, 82)], color=(67, 242, 183, 255), width_px=8
        )
        text((980, 76), "ACCEPTED", 22, "#55f5bd", True)
        text((980, 109), "+1 AC", 29, "#55f5bd", True)

        # User summary.
        avatar_center = (148, 246)
        draw.ellipse((80, 178, 216, 314), fill="#22254a", outline="#7b68f2", width=5)
        avatar_data = item.get("avatar_data")
        avatar_loaded = False
        if avatar_data:
            try:
                avatar = Image.open(io.BytesIO(avatar_data)).convert("RGB")
                avatar.thumbnail((116, 116), Image.Resampling.LANCZOS)
                avatar_layer = Image.new("RGB", (116, 116), "#22254a")
                avatar_layer.paste(
                    avatar, ((116 - avatar.width) // 2, (116 - avatar.height) // 2)
                )
                mask = Image.new("L", (116, 116), 0)
                ImageDraw.Draw(mask).ellipse((0, 0, 115, 115), fill=255)
                image.paste(avatar_layer, (90, 188), mask)
                avatar_loaded = True
            except Exception:
                self.logger.info("User avatar decode failed; using initial fallback")
        if not avatar_loaded:
            draw.ellipse((94, 192, 202, 300), outline="#4b3a9f", width=2)
            user_initial = (str(item.get("user", "A")).strip() or "A")[0].upper()
            text(
                (avatar_center[0], avatar_center[1]),
                user_initial,
                58,
                "#f4f2ff",
                True,
                "mm",
            )
        draw.ellipse((186, 282, 218, 314), fill="#42efb5", outline="#101527", width=5)

        user_font = self._font(40, True)
        text(
            (260, 192),
            fit(item.get("user", "未知用户"), user_font, 450),
            40,
            "#f4f2ff",
            True,
        )
        total_text = f"累计完成 {item.get('total_count', 1)} 题  ·  当前排名 第 "
        text((260, 246), total_text, 22, "#b8b9dc")
        total_width = draw.textbbox((0, 0), total_text, font=self._font(22))[2]
        rank = str(item.get("rank", "未上榜"))
        try:
            rank_color = (
                "#48efb5"
                if rank != "1000+" and int(rank) <= 100
                else "#9a8cff"
                if rank != "1000+" and int(rank) <= 1000
                else "#777da9"
            )
        except ValueError:
            rank_color = "#777da9"
        text((260 + total_width, 246), rank, 22, rank_color, True)
        rank_width = draw.textbbox((0, 0), rank, font=self._font(22, True))[2]
        text((260 + total_width + rank_width, 246), " 名", 22, "#b8b9dc")
        x = 260
        x = chip(
            x, 282, f"QQ {item.get('qq', '未绑定')}", "#bd4b9b", "#f08ad1", "#281a42"
        )
        chip(
            x,
            282,
            f"累计第 {item.get('count_index', 1)} 题",
            "#6562d5",
            "#a5a2ff",
            "#1d2148",
        )

        # Decorative handwritten-like message.
        text((1014, 245), "不断提交", 24, "#7779ae", False)
        text((1032, 282), "不断变强！", 24, "#7779ae", False)
        neon_line([(1012, 322), (1112, 302)], color=(67, 242, 183, 255), width_px=2)

        # Problem panel.
        panel = (70, 366, 1130, 560)
        draw.rounded_rectangle(
            panel, radius=22, fill="#11182a", outline="#3b427b", width=2
        )
        draw.rounded_rectangle((70, 366, 84, 560), radius=7, fill="#43efb4")
        problem_id, problem_name = item.get("problem", "题目"), ""
        parts = str(item.get("problem", "题目")).split(None, 1)
        if len(parts) == 2:
            problem_id, problem_name = parts
        text(
            (112, 402), fit(problem_id, self._font(48, True), 215), 48, "#43efb4", True
        )
        text((112, 467), "新的通过提交", 23, "#38dfaa", False)
        text(
            (300, 409),
            fit(problem_name, self._font(33, True), 480),
            33,
            "#f0f1ff",
            True,
        )
        text((300, 468), "这道题已经被成功提交，继续保持节奏吧", 21, "#a6a8c8", False)
        x = 300
        x = chip(
            x,
            505,
            f"难度 {item.get('difficulty', '暂未标注')}",
            "#a44786",
            "#ef82c8",
            "#251b3d",
        )
        x = chip(
            x,
            505,
            str(item.get("language", "未知语言")),
            "#4e56a1",
            "#aaa8ff",
            "#1a2144",
        )
        chip(
            x,
            505,
            f"{str(item.get('submitted_at', '')).split(' ', 1)[-1][:5]} 提交",
            "#238d74",
            "#57e8b0",
            "#102e2c",
        )

        # Terminal decoration on the right.
        terminal = (848, 395, 1087, 522)
        draw.rounded_rectangle(
            terminal, radius=15, fill="#151c31", outline="#394276", width=2
        )
        draw.line((848, 431, 1087, 431), fill="#30385e", width=2)
        for index, color in enumerate(("#f05f6f", "#e2c554", "#42d89b")):
            draw.ellipse((869 + index * 22, 407, 881 + index * 22, 419), fill=color)
        text((871, 447), "Accepted!", 21, "#43efb4", False)
        text((871, 479), "// Keep going", 17, "#6e7399", False)
        text((871, 502), "// AC one more!", 17, "#6e7399", False)
        draw.rectangle((1015, 476, 1056, 490), fill="#43efb4")
        draw.polygon(
            [(1015, 490), (1056, 490), (1047, 516), (1024, 516)], fill="#43efb4"
        )
        draw.rectangle((1029, 516, 1043, 522), fill="#43efb4")

        # Footer.
        draw.line((70, 582, 1130, 582), fill="#2d355d", width=2)
        text((82, 598), "↗", 30, "#8c77ff", True)
        text((132, 603), "查看题目", 23, "#eef0ff", True)
        draw.line((274, 592, 274, 628), fill="#555b88", width=2)
        link = str(item.get("problem_url", "")).replace("https://", "")
        text((308, 603), fit(link, self._font(22), 550), 22, "#9b8bff", False)
        text((82, 625), "当天自动播报  ·  SWPU Online Judge", 16, "#777da9", False)
        text((960, 603), "CODE  /  THINK  /  SOLVE", 14, "#555b82", True)
        text((1008, 625), "A BRIGHTER YOU", 14, "#555b82", True)

        path = output_dir / "ac_card.png"
        image.convert("RGB").save(path, format="PNG", optimize=True)
        return path

    def _render_contest_card(self, item: dict, output_dir: Path) -> Path:
        """Render a light pastel contest-solve card on the illustration base.

        The base image (assets/contest_card_base.png) carries the static
        pastel artwork; this routine only paints the dynamic fields. A
        plain gradient fallback keeps cards flowing if the asset is
        missing.
        """
        width, height = 1200, 680
        base_path = Path(__file__).parent / "assets" / "contest_card_base.jpg"
        if base_path.exists():
            image = Image.open(base_path).convert("RGBA").resize(
                (width, height), Image.Resampling.LANCZOS
            )
        else:
            image = Image.new("RGBA", (width, height), "#f7f4ff")
        draw = ImageDraw.Draw(image)

        def fit(value: str, font, max_width: int) -> str:
            value = str(value)
            if draw.textbbox((0, 0), value, font=font)[2] <= max_width:
                return value
            while (
                value and draw.textbbox((0, 0), value + "…", font=font)[2] > max_width
            ):
                value = value[:-1]
            return value + "…"

        def text(xy, value: str, size: int, fill: str, bold: bool = False, anchor=None):
            draw.text(
                xy, str(value), font=self._font(size, bold), fill=fill, anchor=anchor
            )

        def chip(
            x: int,
            y: int,
            label: str,
            border: str,
            color: str,
            fill: str,
            icon: str | None = None,
        ) -> int:
            font = self._font(18, True)
            bbox = draw.textbbox((0, 0), label, font=font)
            text_w = bbox[2] - bbox[0]
            icon_w = 22 if icon else 0
            chip_width = text_w + 30 + icon_w
            draw.rounded_rectangle(
                (x, y, x + chip_width, y + 38),
                radius=19,
                fill=fill,
                outline=border,
                width=2,
            )
            text_x = x + 15 + icon_w
            if icon:
                cx, cy = text_x - 13, y + 19
                if icon == "clock":
                    draw.ellipse((cx - 8, cy - 8, cx + 8, cy + 8), outline=color, width=2)
                    draw.line((cx, cy, cx, cy - 5), fill=color, width=2)
                    draw.line((cx, cy, cx + 4, cy + 2), fill=color, width=2)
                elif icon == "flag":
                    draw.line((cx - 6, cy - 9, cx - 6, cy + 9), fill=color, width=2)
                    draw.polygon(
                        [(cx - 6, cy - 9), (cx + 8, cy - 4), (cx - 6, cy + 1)],
                        fill=color,
                    )
            draw.text((text_x, y + 19), label, font=font, fill=color, anchor="lm")
            return x + chip_width + 12

        # Brand header (shifted right to dodge the pastel sparkle in the art).
        text((170, 62), "</>", 36, "#7d6bf5", True)
        text((240, 52), "SWPU_ACM", 30, "#3d4265", True)
        text((243, 92), "ONLINE JUDGE", 15, "#8b8fb5", False)
        text((430, 62), "Write Code · Build Tomorrow!", 17, "#6f7296", False)
        draw.rounded_rectangle(
            (912, 46, 1130, 108), radius=31, fill="#e6f7ec", outline="#57c07a", width=3
        )
        text((958, 56), "✓ ACCEPTED", 19, "#2e9e5b", True)
        text((958, 80), "+1 AC", 21, "#2e9e5b", True)

        # Contest name banner.
        draw.polygon(
            [(80, 128), (80, 168), (100, 148)], fill="#e04fa1"
        )
        draw.polygon([(80, 128), (80, 148), (98, 138)], fill="#f08ad1")
        text((124, 128), fit(item["contest_name"], self._font(24, True), 640), 24, "#7a4dd8", True)

        # User summary.
        avatar_data = item.get("avatar_data")
        avatar_loaded = False
        draw.ellipse((82, 196, 194, 308), fill="#eae4ff", outline="#8b7cf6", width=5)
        if avatar_data:
            try:
                avatar = Image.open(io.BytesIO(avatar_data)).convert("RGB")
                avatar.thumbnail((96, 96), Image.Resampling.LANCZOS)
                avatar_layer = Image.new("RGB", (96, 96), "#eae4ff")
                avatar_layer.paste(
                    avatar, ((96 - avatar.width) // 2, (96 - avatar.height) // 2)
                )
                mask = Image.new("L", (96, 96), 0)
                ImageDraw.Draw(mask).ellipse((0, 0, 95, 95), fill=255)
                image.paste(avatar_layer, (90, 204), mask)
                avatar_loaded = True
            except Exception:
                self.logger.info("Contest avatar decode failed; using initial fallback")
        if not avatar_loaded:
            user_initial = (str(item.get("user", "A")).strip() or "A")[0].upper()
            text((138, 252), user_initial, 46, "#8b7cf6", True, "mm")
        draw.ellipse((170, 276, 202, 308), fill="#57c07a", outline="#ffffff", width=3)
        text((186, 292), "✓", 18, "#ffffff", True, "mm")

        user_font = self._font(30, True)
        text(
            (228, 200),
            fit(item.get("user", "未知用户"), user_font, 360),
            30,
            "#2f3350",
            True,
        )
        rank = str(item.get("contest_rank", "0"))
        try:
            rank_color = "#e0a13a" if int(rank) <= 3 else "#7a4dd8"
        except ValueError:
            rank_color = "#7a4dd8"
        solved_n = int(item.get("solved_count", 0))
        total_n = int(item.get("total_problems", 0))
        if total_n > 0:
            stat_text = f"本场已解 {solved_n}/{total_n} 题  ·  排名第 "
        else:
            stat_text = f"本场已解 {solved_n} 题  ·  排名第 "
        text((228, 246), stat_text, 18, "#555a7c")
        stat_width = draw.textbbox((0, 0), stat_text, font=self._font(18))[2]
        text((228 + stat_width, 246), rank, 18, rank_color, True)
        rank_width = draw.textbbox((0, 0), rank, font=self._font(18, True))[2]
        text((228 + stat_width + rank_width, 246), " 名", 18, "#555a7c")
        if total_n > 0:
            # Mini progress bar for the whole contest (the X/Y figure is
            # already in the stat line, so the bar stays label-free).
            bar_x, bar_y, bar_w, bar_h = 228, 274, 220, 12
            draw.rounded_rectangle(
                (bar_x, bar_y, bar_x + bar_w, bar_y + bar_h),
                radius=6,
                fill="#e6e2f7",
            )
            fill_w = max(6, int(bar_w * min(1.0, solved_n / total_n)))
            draw.rounded_rectangle(
                (bar_x, bar_y, bar_x + fill_w, bar_y + bar_h),
                radius=6,
                fill="#8d7cf0",
            )
        x = 228
        qq_label = f"QQ {item.get('qq', '未绑定')}"
        x = chip(x, 296, qq_label, "#e5a0c8", "#c74f9e", "#fdf0f8")
        chip(x, 296, "XCPC 赛制", "#b3aef2", "#6f68d8", "#f2f0fe")

        # Soft divider between the user block and the problem panel.
        draw.line((228, 340, 780, 340), fill="#dcd6f2", width=2)

        # Problem panel: typeset inside the white card frame baked into the
        # artwork (frame spans roughly y 345-558 with a red spine at x 72-100).
        hex_cx, hex_cy, hex_r = 168, 412, 58
        hex_pts = [
            (
                hex_cx + hex_r * math.sin(math.radians(60 * i - 90)),
                hex_cy + hex_r * math.cos(math.radians(60 * i - 90)),
            )
            for i in range(6)
        ]
        draw.polygon(hex_pts, fill="#f3efff", outline="#cfc6f4")
        text((hex_cx, hex_cy - 2), fit(item.get("problem_key", "?"), self._font(56, True), 90), 56, "#e04fa1", True, "mm")
        text((290, 372), fit(item.get("problem_title", "题目"), self._font(27, True), 500), 27, "#2f3350", True)
        text((290, 424), "比赛中的新通过提交", 15, "#c74f9e", False)
        text((290, 455), "这道比赛题被成功解出，继续保持节奏吧~", 15, "#8a8eab", False)
        x = 140
        ac_clock = str(item.get("ac_clock", "")).strip()
        if ac_clock:
            time_chip = f"AC {ac_clock}"
        else:
            time_chip = f"用时 {item.get('solve_display', '0:00')}"
        x = chip(
            x,
            492,
            time_chip,
            "#9fd6ae",
            "#2e9e5b",
            "#eefaf1",
            "clock",
        )
        chip(
            x,
            492,
            f"第 {item.get('solve_order', 1)} 个解出",
            "#b3aef2",
            "#6f68d8",
            "#f2f0fe",
            "flag",
        )

        # Handwritten-style quote in the empty right half of the white
        # problem card (its place in the original template), with an
        # oversized opening quote mark for a stamped-handwriting feel.
        text((838, 396), "“", 30, "#c5b8f2", True)
        text((820, 430), "每一次 AC", 22, "#8d7cf0", True, "ra")
        text((820, 462), "都是更强的自己！", 22, "#8d7cf0", True, "ra")

        # Footer (kept clear of the 680px canvas bottom; text ink extends
        # below the anchor, so everything sits at least 8px above the edge).
        text((82, 608), "比赛期间自动播报  ·  SWPU Online Judge", 13, "#9a9ec6", False)
        draw.line((70, 632, 1130, 632), fill="#c5bfe8", width=2)
        text((82, 642), "↗", 26, "#7a4dd8", True)
        text((128, 646), "查看比赛", 20, "#2f3350", True)
        draw.line((268, 636, 268, 670), fill="#b9b3de", width=2)
        link = str(item.get("contest_url", "")).replace("https://", "")
        text((300, 647), fit(link, self._font(19), 560), 19, "#5d51d6", False)
        text((1130, 638), "More Problem", 15, "#9a9ec6", True, "ra")
        text((1130, 656), "A Brighter You!", 14, "#9a9ec6", True, "ra")

        path = output_dir / "contest_card.png"
        image.convert("RGB").save(path, format="PNG", optimize=True)
        return path

    @filter.command("oj排名")
    async def manual_ranking(self, event: AstrMessageEvent):
        """手动发送累计 AC 排名。"""
        await self._maybe_run_initial_import()
        await self._send_ranking()
        yield event.plain_result("已发送累计 AC 排名。")

    @filter.command("今日榜单")
    async def today_ranking(self, event: AstrMessageEvent):
        """查看今天 0 点至今的 AC 榜单。"""
        await self._maybe_run_initial_import()
        today = datetime.now().strftime("%Y-%m-%d")
        now = datetime.now().strftime("%H:%M")
        await self._send_daily_ranking(today, f"（截至 {now}）")
        yield event.plain_result("已发送今日榜单。")

    @filter.command("比赛排名")
    async def contest_ranking(self, event: AstrMessageEvent):
        """查看当前比赛的实时排名。"""
        now = datetime.now(ZoneInfo("Asia/Shanghai"))
        active: list[dict] = []
        for contest in self.CONTEST_RANKINGS:
            start = contest["start"]
            end = contest["end"]
            assert isinstance(start, datetime) and isinstance(end, datetime)
            if start <= now < end:
                active.append(contest)
        if not active:
            yield event.plain_result("当前没有进行中的比赛。")
            return
        for contest in active:
            await self._send_contest_ranking(contest, now)
        yield event.plain_result("已发送比赛排名。")

    @filter.command("oj题目")
    async def problem_lookup(self, event: AstrMessageEvent, problem_id: str = ""):
        """查询 SWPUOJ 题目信息。"""
        yield event.plain_result(await self._fetch_problem(problem_id))

    @filter.command("oj状态")
    async def plugin_status(self, event: AstrMessageEvent):
        """查看 OJ 播报插件状态。"""
        total_records = 0
        pending_cards = 0
        stats: dict[str, int] = {}
        if self._db is not None:
            total_records = int(
                self._db.execute("SELECT COUNT(*) AS n FROM records").fetchone()["n"]
            )
            pending_cards = int(
                self._db.execute(
                    "SELECT COUNT(*) AS n FROM records WHERE card_sent = 0"
                ).fetchone()["n"]
            )
            stats = self._stats_from_db()
        counting_since = self._state.get("counting_since") or "未记录"
        db_ok = True
        try:
            await asyncio.wait_for(asyncio.to_thread(self._db_ping), timeout=4)
        except Exception:
            db_ok = False
        yield event.plain_result(
            f"SWPUOJ 播报正常运行\n数据源：OJ 数据库直连（{'正常' if db_ok else '异常'}）\n"
            f"检查间隔：{self.POLL_SECONDS} 秒\n"
            f"本地记录库：{total_records} 条提交\n"
            f"累计通过：{sum(stats.values())} 题 / {len(stats)} 人（自 {counting_since}）\n"
            f"待发 AC 卡片：{pending_cards} 张\n"
            "每日 00:00 自动公布累计做题榜单与昨日 AC 榜单"
        )

    @filter.command("oj帮助")
    async def plugin_help(self, event: AstrMessageEvent):
        """显示 OJ 相关命令。"""
        yield event.plain_result(
            "SWPU_ACM 命令\n/oj题目 题号：查询题目\n/oj排名：发送累计 AC 排名\n/今日榜单：查看今天 AC 榜单\n/比赛排名：查看当前比赛实时排名\n/oj状态：查看播报状态\n/绑定 SWPUOJ用户名：开始账号绑定\n/绑定确认：验证个人简介中的验证码\n/解绑：解除当前 QQ 绑定\n/我的排名：查询当前排名\n/最近提交：查询最近提交\n/我的做题统计：查询累计统计\n/合并账号 小号 主号：合并同一人的多个OJ账号（管理员）\n/解除合并 小号：解除账号合并（管理员）\n/合并列表：查看账号合并关系（管理员）\n/oj帮助：显示本帮助"
        )

    @filter.command("指令")
    async def command_list(self, event: AstrMessageEvent):
        """Show the public command list."""
        yield event.plain_result(
            "SWPU_ACM Bot 指令\n"
            "/指令：查看全部指令\n"
            "/绑定 SWPUOJ用户名：绑定账号\n"
            "/绑定确认：确认验证码\n"
            "/解绑：解除绑定\n"
            "/签到：每日签到\n"
            "/我的排名：查询当前排名\n"
            "/最近提交：查询最近提交\n"
            "/我的做题统计：查询做题统计\n"
            "/oj题目 题号：查询题目\n"
            "/oj排名：查看累计 AC 排名\n"
            "/今日榜单：查看今天 AC 榜单\n"
            "/比赛排名：查看当前比赛排名\n"
            "/oj状态：查看播报状态\n"
            "/oj帮助：查看 OJ 帮助"
        )

    @filter.command("我的排名")
    async def my_rank(self, event: AstrMessageEvent):
        bound = await self._get_bound_user(event.get_sender_id())
        if not bound:
            yield event.plain_result("你还没有绑定 SWPUOJ 账号，请先发送 /绑定 用户名")
            return
        username, _ = bound
        rank = await self._fetch_user_rank(username)
        yield event.plain_result(f"SWPUOJ 用户：{username}\n当前排名：{rank}")

    @filter.command("最近提交")
    async def recent_submissions(self, event: AstrMessageEvent):
        bound = await self._get_bound_user(event.get_sender_id())
        if not bound:
            yield event.plain_result("你还没有绑定 SWPUOJ 账号，请先发送 /绑定 用户名")
            return
        username, user_id = bound
        records = await self._fetch_user_records(user_id)
        if not records:
            yield event.plain_result(f"暂时没有找到 {username} 的提交记录")
            return
        lines = [f"{username} 最近提交："]
        for item in records[:5]:
            lines.append(
                f"{item['status']}｜{item['problem']}｜{item['language']}｜{item['submitted_at']}"
            )
        yield event.plain_result("\n".join(lines))

    @filter.command("我的做题统计")
    async def my_stats(self, event: AstrMessageEvent):
        bound = await self._get_bound_user(event.get_sender_id())
        if not bound:
            yield event.plain_result("你还没有绑定 SWPUOJ 账号，请先发送 /绑定 用户名")
            return
        username, user_id = bound
        try:
            stats = await self._fetch_user_profile_stats(user_id)
        except ValueError as exc:
            self.logger.warning(
                "Failed to fetch profile stats for %s: %s", user_id, exc
            )
            yield event.plain_result(
                "暂时无法读取该用户主页的历史做题统计，请稍后再试。"
            )
            return

        solved_count = int(stats["solved_count"])
        rp = f"\nRP：{stats['rp']}" if stats["rp"] else ""
        rank = f"（第 {stats['rank']} 名）" if stats["rank"] else ""
        yield event.plain_result(
            f"SWPUOJ 用户：{username}\n历史独立通过：{solved_count} 题{rp}{rank}"
        )

    @filter.command("签到")
    async def daily_checkin(self, event: AstrMessageEvent):
        """Daily check-in for bound SWPUOJ users."""
        qq = event.get_sender_id()
        bound = await self._get_bound_user(qq)
        if not bound:
            yield event.plain_result("请先绑定 SWPUOJ 账号，再使用 /签到")
            return
        today = datetime.now().strftime("%Y-%m-%d")
        checkins = self._state.setdefault("checkins", {})
        record = checkins.setdefault(qq, {"last_date": "", "total": 0, "streak": 0})
        if record.get("last_date") == today:
            yield event.plain_result(
                f"今天已经签到过了喵\n累计签到：{record.get('total', 0)} 天\n连续签到：{record.get('streak', 0)} 天"
            )
            return
        yesterday = (
            datetime.now().date().fromordinal(datetime.now().date().toordinal() - 1)
        ).strftime("%Y-%m-%d")
        record["streak"] = (
            int(record.get("streak", 0)) + 1
            if record.get("last_date") == yesterday
            else 1
        )
        record["total"] = int(record.get("total", 0)) + 1
        record["last_date"] = today
        self._save_state()
        yield event.plain_result(
            f"签到成功，{bound[0]}喵\n累计签到：{record['total']} 天\n连续签到：{record['streak']} 天"
        )

    @filter.regex(r"^\s*绑定(?!\W*确认)")
    async def bind_swpuoj(self, event: AstrMessageEvent):
        """Start a SWPUOJ account ownership verification.

        宽松匹配「绑定<任意分隔>用户名」：/绑定AiraKeq、/绑定：AiraKeq、
        /绑定 AiraKeq 等，只要带 / 前缀都能正确取到用户名。
        """
        if not event.is_at_or_wake_command:
            return  # 必须带唤醒前缀（/）或 @ 才处理，避免群里闲聊误触发
        m = re.match(r"^\s*绑定\W*(\S+)", event.get_message_str().strip())
        username = m.group(1) if m else ""
        if not username:
            yield event.plain_result(
                "用法：/绑定 SWPUOJ用户名（“绑定”和用户名之间空格、冒号或直接连写都行），也可用数字 UID：/绑定 2358"
            )
            return
        qq = event.get_sender_id()
        code = f"SWPU-BOT-{secrets.randbelow(900000) + 100000}"
        matches = await self._find_user_profiles(username)
        if not matches:
            yield event.plain_result(
                "没有找到这个 SWPUOJ 用户。请检查："
                "①要写 OJ 上注册时的完整用户名（不是昵称或QQ号）；"
                "②也可以用数字 UID 绑定：/绑定 2358（登录 OJ 进入个人主页，地址栏 /user/ 后面的数字）"
            )
            return
        if len(matches) > 1:
            yield event.plain_result(
                "匹配到多个 SWPUOJ 用户，请改用 UID 绑定，例如：/绑定 2358"
            )
            return
        profile = matches[0]
        pending = self._state.setdefault("pending_bindings", {})
        pending[qq] = {
            "username": profile["username"],
            "user_id": profile["user_id"],
            "profile_url": profile["profile_url"],
            "code": code,
            "expires_at": datetime.now().timestamp() + 600,
        }
        self._save_state()
        yield event.plain_result(
            f"请把验证码 {code} 临时写入 SWPUOJ 个人简介，然后发送 /绑定确认。验证码 10 分钟内有效。"
        )

    @filter.regex(r"^\s*绑定\W*确认")
    async def confirm_swpuoj(self, event: AstrMessageEvent):
        """Confirm SWPUOJ account ownership using the profile code."""
        if not event.is_at_or_wake_command:
            return
        qq = event.get_sender_id()
        pending = self._state.setdefault("pending_bindings", {}).get(qq)
        if not pending:
            yield event.plain_result(
                "当前没有待确认的绑定，请先发送 /绑定 SWPUOJ用户名。"
            )
            return
        if datetime.now().timestamp() > float(pending.get("expires_at", 0)):
            self._state["pending_bindings"].pop(qq, None)
            self._save_state()
            yield event.plain_result("验证码已过期，请重新发送 /绑定 SWPUOJ用户名。")
            return
        try:
            bio = await asyncio.to_thread(self._db_user_bio, str(pending["user_id"]))
        except Exception:
            self.logger.exception("Binding bio check failed")
            bio = ""
        if str(pending["code"]) not in bio:
            yield event.plain_result(
                "还没有在 SWPUOJ 个人简介中找到验证码，请确认保存后再试。"
            )
            return
        bindings = self._state.setdefault("bindings", {})
        bindings[qq] = pending["username"]
        self._state.setdefault("binding_profiles", {})[qq] = {
            "username": pending["username"],
            "user_id": pending["user_id"],
            "profile_url": pending["profile_url"],
        }
        self._state["pending_bindings"].pop(qq, None)
        self._save_state()
        yield event.plain_result(f"绑定成功：{pending['username']}")

    @filter.command("解绑")
    async def unbind_swpuoj(self, event: AstrMessageEvent):
        """Remove the current QQ to SWPUOJ binding."""
        qq = event.get_sender_id()
        existed = self._state.setdefault("bindings", {}).pop(qq, None)
        self._state.setdefault("binding_profiles", {}).pop(qq, None)
        self._state.setdefault("pending_bindings", {}).pop(qq, None)
        self._save_state()
        yield event.plain_result("已解除绑定。" if existed else "当前没有绑定账号。")

    # ------------------------------------------------------------ 账号合并
    # 同一人开多个 OJ 账号时，把小号并入主号：榜单/统计按"人"去重，
    # 每人每题只计一次（并集口径，全历史首 AC 归因不变）。

    def _merge_admins(self) -> set[str]:
        admins = self._state.get("merge_admin_qqs")
        if isinstance(admins, list) and admins:
            return {str(qq).strip() for qq in admins if str(qq).strip()}
        return set(self.DEFAULT_MERGE_ADMINS)

    def _account_name(self, user_id: str) -> str:
        """Raw account display name (no merge resolution), for admin listings."""
        row = self._db.execute(
            "SELECT display_name FROM users WHERE user_id = ?", (user_id,)
        ).fetchone()
        return str(row["display_name"]) if row else str(user_id)

    async def _resolve_account_id(self, token: str) -> str:
        """Resolve an OJ username or numeric UID to its user_id."""
        token = token.strip()
        if not token:
            return ""
        row = self._db.execute(
            "SELECT user_id FROM users WHERE user_id = ?", (token,)
        ).fetchone()
        if row is None:
            row = self._db.execute(
                "SELECT user_id FROM users WHERE display_name = ?", (token,)
            ).fetchone()
        if row:
            return str(row["user_id"])
        matches = await self._find_user_profiles(token)
        if matches and len(matches) == 1:
            return str(matches[0].get("user_id") or "")
        return ""

    @filter.command("合并账号")
    async def merge_accounts(
        self, event: AstrMessageEvent, alt: str = "", main: str = ""
    ):
        """Merge one person's alt OJ account into their main account."""
        if str(event.get_sender_id()) not in self._merge_admins():
            yield event.plain_result("仅管理员可以管理账号合并。")
            return
        if not alt or not main:
            yield event.plain_result(
                "用法：/合并账号 小号 主号\n"
                "把同一个人的小号并入主号：榜单按人去重，每人每题只计一次。\n"
                "小号/主号写 OJ 完整用户名或数字 UID 均可。"
            )
            return
        alt_id = await self._resolve_account_id(alt)
        main_id = await self._resolve_account_id(main)
        if not alt_id or not main_id:
            yield event.plain_result(
                "没有找到对应 SWPUOJ 账号（或匹配到多个），"
                "请改用数字 UID：OJ 个人主页地址栏 /user/ 后面的数字。"
            )
            return
        alt_name = self._account_name(alt_id)
        main_name = self._account_name(main_id)
        if alt_id == main_id:
            yield event.plain_result("两个是同一个账号，无需合并。")
            return
        root_id = self._person_id(main_id)
        if root_id == alt_id:
            yield event.plain_result(
                f"主号 {main_name} 目前挂在 {alt_name} 名下，不能反向合并；"
                "请先用 /解除合并 解除后再操作。"
            )
            return
        if self._person_id(alt_id) == root_id:
            yield event.plain_result(
                f"{alt_name} 已经在 {main_name} 名下，"
                f"当前按人去重累计 {self._user_ac_count(alt_id)} 题，无需重复合并。"
            )
            return
        # Keep the table flat: alts currently hanging on `alt_id` move to the
        # root as well, so one COALESCE hop always reaches the person's root.
        self._db.execute(
            "UPDATE user_merges SET main_id = ? WHERE main_id = ?",
            (root_id, alt_id),
        )
        self._db.execute(
            "INSERT INTO user_merges(alt_id, main_id) VALUES(?, ?) "
            "ON CONFLICT(alt_id) DO UPDATE SET main_id = excluded.main_id",
            (alt_id, root_id),
        )
        total = self._user_ac_count(alt_id)
        yield event.plain_result(
            f"合并成功：{alt_name}（小号）已并入 {self._account_name(root_id)}。\n"
            f"按人去重后该用户累计 {total} 题（每人每题只计一次）。"
        )

    @filter.command("解除合并")
    async def unmerge_account(self, event: AstrMessageEvent, alt: str = ""):
        """Remove an alt account from its merge relationship."""
        if str(event.get_sender_id()) not in self._merge_admins():
            yield event.plain_result("仅管理员可以管理账号合并。")
            return
        if not alt:
            yield event.plain_result(
                "用法：/解除合并 小号（写 OJ 完整用户名或数字 UID）"
            )
            return
        alt_id = await self._resolve_account_id(alt)
        if not alt_id:
            yield event.plain_result("没有找到对应 SWPUOJ 账号，请改用数字 UID 重试。")
            return
        row = self._db.execute(
            "SELECT main_id FROM user_merges WHERE alt_id = ?", (alt_id,)
        ).fetchone()
        if row is None:
            yield event.plain_result(
                f"{self._account_name(alt_id)} 当前没有被并入任何主号。"
            )
            return
        main_name = self._account_name(str(row["main_id"]))
        self._db.execute("DELETE FROM user_merges WHERE alt_id = ?", (alt_id,))
        yield event.plain_result(
            f"已解除：{self._account_name(alt_id)} 不再并入 {main_name}，"
            "两边恢复独立计数。"
        )

    @filter.command("合并列表")
    async def list_merges(self, event: AstrMessageEvent):
        """List current account merge relationships."""
        if str(event.get_sender_id()) not in self._merge_admins():
            yield event.plain_result("仅管理员可以管理账号合并。")
            return
        rows = self._db.execute(
            "SELECT alt_id, main_id FROM user_merges ORDER BY main_id, alt_id"
        ).fetchall()
        if not rows:
            yield event.plain_result("当前没有账号合并。")
            return
        lines = ["当前账号合并（小号 → 主号）："]
        lines.extend(
            f"{self._account_name(r['alt_id'])}（{r['alt_id']}）→ "
            f"{self._account_name(r['main_id'])}（{r['main_id']}）"
            for r in rows
        )
        yield event.plain_result("\n".join(lines))
