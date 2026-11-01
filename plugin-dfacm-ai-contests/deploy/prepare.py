"""Patch the current live config and home page; preserve unrelated live changes."""
import hashlib
import json
import re
import shutil
import sys
from pathlib import Path

HYDRO = Path("/root/.hydro")
ADDON = HYDRO / "addons" / "dfacm-ai-contests"


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def prepare(release):
    backup = Path("/root/dfacm-ai-install-backups") / release.name
    backup.mkdir(parents=True, mode=0o700, exist_ok=False)
    candidates = release / "candidates"
    candidates.mkdir()
    originals = {
        "Caddyfile": HYDRO / "Caddyfile",
        "addon.json": HYDRO / "addon.json",
        "home.html": HYDRO / "custom" / "home.html",
    }
    state = {"backup": str(backup), "originals": {name: {"path": str(path), "sha256": digest(path)} for name, path in originals.items()}}
    for name, path in originals.items():
        shutil.copy2(path, backup / name)
    if ADDON.exists():
        for name in ("index.ts", "package.json"):
            if (ADDON / name).exists():
                shutil.copy2(ADDON / name, backup / ("addon-" + name))
    caddy = originals["Caddyfile"].read_text(encoding="utf-8")
    snippet = (release / "hub" / "deploy" / "caddy.inc").read_text(encoding="utf-8")
    if "@aiContestRoot" in caddy:
        old = re.compile(r"  @aiContestRoot path /ai-contests\n  redir @aiContestRoot /ai-contests/ 308\n  handle_path /ai-contests/\* \{\n    reverse_proxy http://127\.0\.0\.1:8765 \{\n      header_up -Cookie\n      header_up -Authorization\n    \}\n  \}\n")
        caddy, count = old.subn(snippet, caddy)
        if count != 1:
            raise RuntimeError("Existing AI route differs from the known installation")
    elif "@aiCollectorApi" not in caddy:
        anchor = "  encode zstd gzip\n"
        if caddy.count(anchor) != 1:
            raise RuntimeError("Expected one Caddy site block; inspect config before installing")
        caddy = caddy.replace(anchor, anchor + "\n" + snippet + "\n", 1)
    (candidates / "Caddyfile").write_text(caddy, encoding="utf-8")
    addons = json.loads(originals["addon.json"].read_text(encoding="utf-8"))
    if not isinstance(addons, list):
        raise RuntimeError("Hydro addon.json must be a list")
    calendar = HYDRO / "addons" / "swpu-calendar"
    if str(calendar) not in addons or not (calendar / "ai.cjs").is_file():
        raise RuntimeError("Install the merged calendar addon before activating this collector")
    addons = [addon for addon in addons if addon != str(ADDON)]
    (candidates / "addon.json").write_text(json.dumps(addons, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    home = originals["home.html"].read_text(encoding="utf-8")
    for nav_start in ('<nav class="links"', '<nav id="mmenu"'):
        start = home.find(nav_start)
        end = home.find("</nav>", start)
        if start < 0 or end < 0:
            raise RuntimeError("Expected desktop and mobile navigation blocks")
        navigation = home[start:end]
        replacement = navigation.replace('<a href="/ai-contests/">AI 赛讯</a>', '<a href="/calendar">赛事日历</a>')
        if 'href="/calendar"' not in replacement:
            anchor = re.compile(r'(?P<indent>^[ \t]*)<a href="/contest">比赛</a>', re.MULTILINE)
            replacement, count = anchor.subn(lambda match: match.group(0) + '\n' + match.group("indent") + '<a href="/calendar">赛事日历</a>', replacement)
            if count != 1:
                raise RuntimeError("Expected one contest anchor in each navigation block")
        home = home[:start] + replacement + home[end:]
    (candidates / "home.html").write_text(home, encoding="utf-8")
    (release / "state.json").write_text(json.dumps(state, indent=2), encoding="utf-8")
    print(json.dumps({"backup": str(backup), "candidates": str(candidates), "home_matches_checkout": digest(candidates / "home.html") == digest(release / "landing" / "index.html")}))


def activate(release):
    state = json.loads((release / "state.json").read_text())
    for name, original in state["originals"].items():
        if digest(Path(original["path"])) != original["sha256"]:
            raise RuntimeError(f"Live {name} changed after staging; restage before activating")
    for name, original in state["originals"].items():
        destination = Path(original["path"])
        temp = destination.with_name(destination.name + ".ai-install-tmp")
        shutil.copyfile(release / "candidates" / name, temp)
        temp.chmod(0o644)
        temp.replace(destination)
    print("Live Caddy, addon registration and home navigation installed atomically per file")


if __name__ == "__main__":
    operation, directory = sys.argv[1:]
    release = Path(directory).resolve()
    if not release.is_relative_to(Path("/opt/dfacm-ai-contests/releases")):
        raise RuntimeError("Release must be under the dedicated AI service releases directory")
    {"prepare": prepare, "activate": activate}[operation](release)
