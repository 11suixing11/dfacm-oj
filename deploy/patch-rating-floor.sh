#!/usr/bin/env bash
# Problem-component RP floor for the installed hydrooj package.
#
# Upstream's problem RP component (src/script/rating.ts) compresses each
# member's raw score with `max(0, min(raw, log(raw) / log(1.03)))`. The log
# branch is exactly 0 at raw == 1, and one full AC on a difficulty-1 problem
# contributes raw 1 - so a member whose only activity is a single easy AC
# ends up with rp 0. The ranking page filters `rp > 0` and calcLevel only
# assigns ranks to rp > 0, so first-AC members vanish from the leaderboard
# while their profile reads "RP: 0 (No. ?)". The upstream contest component
# already floors its own output with max(1, ...); this patch gives the
# problem component the same floor: any positive raw scores at least 1 RP.
#
# Idempotent (marker-checked). Re-run after every hydrooj package upgrade;
# it fails loudly when the upstream anchor no longer matches instead of
# silently skipping. The rating script is TypeScript compiled at boot, so
# run `pm2 restart hydrooj` afterwards and trigger a recalculation
# (`hydrooj cli script swpuRpSweep '{}'`, or wait for the hourly swpu-ops
# sweep, or the 3-minute first pass after the restart).
set -euo pipefail

RATING="${HYDROOJ_RATING_TS:-/usr/local/share/.config/yarn/global/node_modules/hydrooj/src/script/rating.ts}"
MARKER="SWPU ACM patch: problem RP floor"

if [ ! -f "$RATING" ]; then
    echo "ERROR: rating script not found at $RATING" >&2
    exit 66
fi

if grep -qF "$MARKER" "$RATING"; then
    echo "rating script already patched: $RATING"
    exit 0
fi

BACKUP="$RATING.bak-$(date +%Y%m%d-%H%M%S)"
cp "$RATING" "$BACKUP"
echo "backup: $BACKUP"

python3 - "$RATING" <<'PYEOF'
import sys

path = sys.argv[1]
with open(path, encoding='utf-8') as fh:
    src = fh.read()
old = "for (const key in udict) udict[key] = max(0, min(udict[key], log(udict[key]) / log(1.03)));"
new = (
    "// ==== SWPU ACM patch: problem RP floor. The log compression maps raw == 1 (a single\n"
    "            // easy AC) to 0, which drops first-AC members from the ranking (rp > 0 filter) even\n"
    "            // though they solved a problem. Floor any positive raw at 1, mirroring the contest\n"
    "            // component's own max(1, ...) floor. Re-apply after a hydrooj package upgrade. ====\n"
    "            for (const key in udict) udict[key] = udict[key] > 0 ? max(1, min(udict[key], log(udict[key]) / log(1.03))) : 0;"
)
count = src.count(old)
assert count == 1, f"anchor count = {count}, expected 1"
with open(path, 'w', encoding='utf-8', newline='\n') as fh:
    fh.write(src.replace(old, new))
print("rating script patched")
PYEOF

if ! grep -qF "$MARKER" "$RATING"; then
    echo "ERROR: patch verification failed - marker missing after write" >&2
    exit 65
fi
echo "done: pm2 restart hydrooj to load the patched script, then trigger an RP recalculation"
