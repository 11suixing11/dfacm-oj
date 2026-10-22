#!/usr/bin/env python3
"""Regenerate the patched qq_official adapter overlay for the 167 bot stack.

Run ON the 167 host (needs a running astrbot container to read the pristine
in-image file and docker on PATH):

    python3 /opt/swpu-acm/patches/patch-qqofficial-adapter.py

It writes /opt/swpu-acm/patches/qqofficial/qqofficial_platform_adapter.py,
which compose.yml bind-mounts read-only over the in-image module:

    - ./patches/qqofficial/qqofficial_platform_adapter.py:/AstrBot/astrbot/core/platform/sources/qqofficial/qqofficial_platform_adapter.py:ro

Why (AstrBot v4.28.0 upstream behavior, confirmed 2026-10-21):

  1. Group sends strip the cached msg_id whenever _allow_group_proactive_send
     is hard-coded on, so every proactive broadcast goes to the ACTIVE API.
     Bots without the group active-message permission (i.e. before the bot
     passes review) get QQ err 40034105 ("主动消息失败, 无权限") there, even
     while a fresh 5-minute passive window is open.
  2. When no msg_id is cached the adapter silently skips the send, while
     Context.send_message still returns True — callers mark broadcasts as
     delivered although nothing went out (2026-10-21: three AC cards were
     lost this way).
  3. After a successful send the adapter overwrites the cached *user* msg_id
     with the bot's own message id, which would poison every subsequent
     passive reply until the next @-mention.

Re-run after every astrbot image change; the anchors fail loudly (exit 1)
when upstream text drifts, and the result is syntax-checked before install.
"""
import py_compile
import subprocess
import sys
from pathlib import Path

CONTAINER = "astrbot"
CONTAINER_PATH = "/AstrBot/astrbot/core/platform/sources/qqofficial/qqofficial_platform_adapter.py"
OUT = Path("/opt/swpu-acm/patches/qqofficial/qqofficial_platform_adapter.py")
MARKER = "SWPU patch 2026-10-21"

PAIRS = [
    (
        "prefer-passive-reply",
        r'''        if msg_id and not allow_group_proactive_send:
            payload["msg_id"] = msg_id
''',
        r'''        # SWPU patch 2026-10-21 (1/3): prefer the passive reply whenever a
        # cached msg_id exists. Upstream drops msg_id for group scenes while
        # _allow_group_proactive_send is hard-coded on, which forces every
        # group send into the ACTIVE API — bots without the group
        # active-message permission get err 40034105 (主动消息失败, 无权限)
        # there even when a fresh passive window is open. A stale msg_id
        # still falls back to the active API inside
        # _send_with_markdown_fallback.
        if msg_id:
            payload["msg_id"] = msg_id
''',
    ),
    (
        "raise-instead-of-skip",
        r'''            logger.warning(
                "[QQOfficial] No cached msg_id for session: %s, skip send_by_session",
                session.session_id,
            )
            return
''',
        r'''            # SWPU patch 2026-10-21 (2/3): raise instead of silently
            # dropping. Context.send_message returns True as soon as the
            # platform matches, so a silent skip makes proactive broadcasts
            # look delivered while nothing goes out; callers keep their own
            # hold/retry logic on exception.
            raise RuntimeError(
                "[QQOfficial] no cached msg_id for session: "
                f"{session.session_id}; passive window closed and the group "
                "active-message permission is unavailable"
            )
''',
    ),
    (
        "keep-user-msg_id-cache",
        r'''        sent_message_id = self._extract_message_id(ret)
        if sent_message_id:
            self.remember_session_message_id(session.session_id, sent_message_id)
''',
        r'''        sent_message_id = self._extract_message_id(ret)
        # SWPU patch 2026-10-21 (3/3): for group sessions keep the cached
        # *user* msg_id — it is the passive-reply trigger. Overwriting it
        # with the bot's own message id would break every subsequent
        # queued broadcast until the next @-mention.
        if sent_message_id and session.message_type != MessageType.GROUP_MESSAGE:
            self.remember_session_message_id(session.session_id, sent_message_id)
''',
    ),
]


def main() -> int:
    pristine = subprocess.run(
        ["docker", "exec", CONTAINER, "cat", CONTAINER_PATH],
        capture_output=True,
        check=True,
    ).stdout.decode("utf-8")
    for name, old, _new in PAIRS:
        count = pristine.count(old)
        if count != 1:
            print(f"FAIL [{name}]: upstream anchor matched {count} times (expected 1)")
            return 1
    text = pristine
    for _name, old, new in PAIRS:
        text = text.replace(old, new)
    if text.count(MARKER) != 3:
        print(f"FAIL: expected 3 patch markers, found {text.count(MARKER)}")
        return 1
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(text, encoding="utf-8", newline="\n")
    py_compile.compile(str(OUT), doraise=True)
    print(f"OK: wrote {OUT} ({len(text)} bytes, 3 patches, syntax OK)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
