#!/usr/bin/env bash
# Ranking template patches for the installed ui-default package.
#
# 1. Own-row dedup. Upstream ranking.html renders the signed-in viewer's own
#    rank row above the list unconditionally, so the #1-ranked member sees
#    themself duplicated and the numbering reads 1, 1, 2, 3, ... The patch
#    skips the pinned row while the viewer's stored rank already falls
#    inside the current page's window (i.e. they are listed on this page);
#    the row still pins on later pages and for members without a rank,
#    matching the upstream intent of the feature.
#
# 2. Self-row highlight. Long leaderboards make it hard to find one's own
#    position. The patch brands the signed-in viewer's own row - the pinned
#    row and the in-list row - with .swpu-row--self; theme/00-brand.css
#    paints the highlight and the self badge. The class check compares
#    handler.user._id against udoc._id (both are numeric uids; guests have
#    _id 0 and never match the uid > 1 list).
#
# Both patches are idempotent (marker-checked) and applied in order, so a
# fresh ui-default package is fully patched by a single run. Re-run after
# every ui-default package upgrade or UI rebuild; the script fails loudly
# when an upstream anchor no longer matches instead of silently skipping.
# Hydro loads templates into memory at boot, so run `pm2 restart hydrooj`
# afterwards.
#
# The patched conditions are pure arithmetic on purpose: the nunjucks build
# shipped with ui-default exposes neither the `namespace` global nor the
# `map` filter, and attribute assignment inside {% set %} crashes it.
set -euo pipefail

TEMPLATE="${UI_DEFAULT_RANKING_TEMPLATE:-/usr/local/share/.config/yarn/global/node_modules/@hydrooj/ui-default/templates/ranking.html}"
MARKER_DEDUP="SWPU ACM patch: ranking own-row dedup"
MARKER_SELF="SWPU ACM patch: ranking self-row highlight"

if [ ! -f "$TEMPLATE" ]; then
    echo "ERROR: ranking template not found at $TEMPLATE" >&2
    exit 66
fi

if grep -qF "$MARKER_DEDUP" "$TEMPLATE" && grep -qF "$MARKER_SELF" "$TEMPLATE"; then
    echo "ranking template already patched: $TEMPLATE"
    exit 0
fi

BACKUP="$TEMPLATE.bak-$(date +%Y%m%d-%H%M%S)"
cp "$TEMPLATE" "$BACKUP"
echo "backup: $BACKUP"

python3 - "$TEMPLATE" <<'PYEOF'
import sys

path = sys.argv[1]
with open(path, encoding='utf-8') as fh:
    src = fh.read()

if "SWPU ACM patch: ranking own-row dedup" not in src:
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
    assert count == 1, f"dedup anchor count = {count}, expected 1"
    src = src.replace(old, new)

if "SWPU ACM patch: ranking self-row highlight" not in src:
    old = (
        "              <tr>\n"
        "                <td class=\"col--rank\">{{ handler.user.rank|default('-') }}</td>"
    )
    new = (
        "              {# ==== SWPU ACM patch: ranking self-row highlight (v1.17.0). Brand the signed-in\n"
        "                 member's own row - the pinned rank card above the list and the in-list row - with\n"
        "                 .swpu-row--self; theme/00-brand.css paints the highlight and the self badge so\n"
        "                 one's position stays findable on long boards. Re-apply after a ui-default upgrade. ==== #}\n"
        "              <tr class=\"swpu-row--self swpu-row--pinned\">\n"
        "                <td class=\"col--rank\">{{ handler.user.rank|default('-') }}</td>"
    )
    count = src.count(old)
    assert count == 1, f"pinned-row anchor count = {count}, expected 1"
    src = src.replace(old, new)

    old = (
        "              {%- for udoc in udocs -%}\n"
        "              <tr>"
    )
    new = (
        "              {%- for udoc in udocs -%}\n"
        "              <tr{% if handler.user._id == udoc._id %} class=\"swpu-row--self\"{% endif %}>"
    )
    count = src.count(old)
    assert count == 1, f"loop-row anchor count = {count}, expected 1"
    src = src.replace(old, new)

with open(path, 'w', encoding='utf-8', newline='\n') as fh:
    fh.write(src)
print("ranking template patched")
PYEOF

if ! grep -qF "$MARKER_DEDUP" "$TEMPLATE"; then
    echo "ERROR: patch verification failed - dedup marker missing after write" >&2
    exit 65
fi
if ! grep -qF "$MARKER_SELF" "$TEMPLATE"; then
    echo "ERROR: patch verification failed - self-row marker missing after write" >&2
    exit 65
fi
echo "done: pm2 restart hydrooj to load the patched template (templates are cached in memory)"
