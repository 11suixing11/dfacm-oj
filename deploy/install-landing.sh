#!/usr/bin/env bash
set -euo pipefail

# Installs the landing page into the UI-rebuild-proof directory Caddy serves
# from, so a Hydro reinstall that recreates static/ cannot take the front door
# with it. Pure copies: rerunning is idempotent by construction.
#
# $1 is the destination directory (default /root/.hydro/custom). SWPU_LANDING_SRC
# overrides the source tree, which is what deploy.sh uses when it runs this from
# its staging copy rather than from a checkout.

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC="${SWPU_LANDING_SRC:-$ROOT/landing}"
DEST="${1:-/root/.hydro/custom}"

for required in index.html swpu-display.woff2 swpu-mono.woff2; do
    if [ ! -f "$SRC/$required" ]; then
        printf 'landing source missing: %s (set SWPU_LANDING_SRC to override)\n' "$SRC/$required" >&2
        exit 66
    fi
done

install -d "$DEST"
# index.html becomes home.html: Caddy rewrites / to it.
install -m 0644 "$SRC/index.html" "$DEST/home.html"
install -m 0644 "$SRC/swpu-display.woff2" "$DEST/swpu-display.woff2"
install -m 0644 "$SRC/swpu-mono.woff2" "$DEST/swpu-mono.woff2"
[ -f "$SRC/FONTS-LICENSE.md" ] && install -m 0644 "$SRC/FONTS-LICENSE.md" "$DEST/FONTS-LICENSE.md"

# Flatten assets/ into the destination so /favicon.png and /og-cover.png resolve
# at the site root. nullglob matters: without it an empty assets/ directory
# passes the literal glob path to install, which then fails under set -e with a
# message that points at the wrong thing entirely.
shopt -s nullglob
assets=("$SRC"/assets/*)
shopt -u nullglob
if [ "${#assets[@]}" -eq 0 ]; then
    printf 'warning: %s/assets is empty or missing; icons will not be served\n' "$SRC" >&2
fi
for asset in "${assets[@]}"; do
    install -m 0644 "$asset" "$DEST/$(basename "$asset")"
done

printf 'landing installed to %s (%d asset(s))\n' "$DEST" "${#assets[@]}"
