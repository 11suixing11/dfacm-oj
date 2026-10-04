#!/usr/bin/env bash
# Ranking own-row dedup for the installed ui-default package.
#
# Upstream ranking.html renders the signed-in viewer's own rank row above the
# list unconditionally, so the #1-ranked member sees themself duplicated and
# the numbering reads 1, 1, 2, 3, ... The patch skips the pinned row while the
# viewer's stored rank already falls inside the current page's window (i.e.
# they are listed on this page); the row still pins on later pages and for
# members without a rank, matching the upstream intent of the feature.
#
# Idempotent (marker-checked). Re-run after every ui-default package upgrade
# or UI rebuild; it fails loudly when the upstream anchor no longer matches
# instead of silently skipping. Hydro loads templates into memory at boot, so
# run `pm2 restart hydrooj` afterwards.
#
# The patched condition is pure arithmetic on purpose: the nunjucks build
# shipped with ui-default exposes neither the `namespace` global nor the
# `map` filter, and attribute assignment inside {% set %} crashes it.
set -euo pipefail

TEMPLATE="${UI_DEFAULT_RANKING_TEMPLATE:-/usr/local/share/.config/yarn/global/node_modules/@hydrooj/ui-default/templates/ranking.html}"
MARKER="SWPU ACM patch: ranking own-row dedup"
ANCHOR='{% if handler.user.hasPriv(PRIV.PRIV_USER_PROFILE) %}'

if [ ! -f "$TEMPLATE" ]; then
    echo "ERROR: ranking template not found at $TEMPLATE" >&2
    exit 66
fi

if grep -qF "$MARKER" "$TEMPLATE"; then
    echo "ranking template already patched: $TEMPLATE"
    exit 0
fi

if ! grep -qF "$ANCHOR" "$TEMPLATE"; then
    echo "ERROR: upstream anchor line not found in $TEMPLATE - ui-default changed, revisit the patch" >&2
    exit 65
fi

BACKUP="$TEMPLATE.bak-$(date +%Y%m%d-%H%M%S)"
cp "$TEMPLATE" "$BACKUP"
echo "backup: $BACKUP"

python3 - "$TEMPLATE" <<'PYEOF'
import sys

path = sys.argv[1]
with open(path, encoding='utf-8') as fh:
    src = fh.read()
old = "{% if handler.user.hasPriv(PRIV.PRIV_USER_PROFILE) %}"
new = (
    "{# ==== SWPU ACM patch: ranking own-row dedup (v1.15.0). Upstream renders the logged-in\n"
    "                 user's own rank row unconditionally, so the #1 sees themself twice on page 1. Skip\n"
    "                 the pinned row while the user's stored rank falls inside the current page's window\n"
    "                 (i.e. they are already listed here); it still pins on other pages and for rankless\n"
    "                 users. This nunjucks build lacks namespace/map, so pure arithmetic is used.\n"
    "                 Re-apply after a ui-default package upgrade. ==== #}\n"
    "              {% if handler.user.hasPriv(PRIV.PRIV_USER_PROFILE) and not (handler.user.rank and handler.user.rank >= (page - 1) * model.system.get('pagination.ranking') + 1 and handler.user.rank <= page * model.system.get('pagination.ranking')) %}"
)
count = src.count(old)
assert count == 1, f"anchor count = {count}, expected 1"
with open(path, 'w', encoding='utf-8', newline='\n') as fh:
    fh.write(src.replace(old, new))
print("ranking template patched")
PYEOF

if ! grep -qF "$MARKER" "$TEMPLATE"; then
    echo "ERROR: patch verification failed - marker missing after write" >&2
    exit 65
fi
echo "done: pm2 restart hydrooj to load the patched template (templates are cached in memory)"
