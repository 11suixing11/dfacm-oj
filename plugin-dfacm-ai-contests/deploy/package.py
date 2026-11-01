"""Build a verifiable release and take a consistent backup of the source SQLite DB."""
import argparse
import hashlib
import json
import sqlite3
import tarfile
from pathlib import Path


def portable_member(member):
    """Windows file modes must not become world-writable Linux release files."""
    member.mode = 0o644
    member.uid = member.gid = 0
    member.uname = member.gname = "root"
    return member


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--seed-from", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    plugin = Path(__file__).resolve().parent.parent
    args.output.mkdir(parents=True, exist_ok=True)
    seed = args.output / "competitions.db"
    source = sqlite3.connect(args.seed_from.resolve().as_uri() + "?mode=ro", uri=True)
    target = sqlite3.connect(seed)
    try:
        source.backup(target)
        total = target.execute("SELECT COUNT(*) FROM competitions").fetchone()[0]
        sources = dict(target.execute("SELECT source, COUNT(*) FROM competitions GROUP BY source"))
        assert target.execute("PRAGMA integrity_check").fetchone()[0] == "ok"
    finally:
        source.close()
        target.close()
    archive = args.output / "dfacm-ai-contests.tar.gz"
    with tarfile.open(archive, "w:gz") as release:
        for folder in ("backend", "tests", "deploy"):
            for file in sorted((plugin / folder).rglob("*")):
                if file.is_file() and "__pycache__" not in file.parts and file.suffix != ".pyc":
                    release.add(file, arcname="hub/" + file.relative_to(plugin).as_posix(), recursive=False, filter=portable_member)
        for name in ("index.ts", "package.json", "requirements.txt", "requirements.lock", "README.md"):
            release.add(plugin / name, arcname="hub/" + name, recursive=False, filter=portable_member)
        release.add(seed, arcname="seed/competitions.db", recursive=False, filter=portable_member)
        release.add(plugin.parent / "landing" / "index.html", arcname="landing/index.html", recursive=False, filter=portable_member)
    sha = hashlib.sha256(archive.read_bytes()).hexdigest()
    metadata = {"archive": str(archive), "sha256": sha, "seed_total": total, "sources": sources}
    (args.output / "release.json").write_text(json.dumps(metadata, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(metadata, ensure_ascii=False))


if __name__ == "__main__":
    main()
