#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEST="${1:-/root/.hydro/custom}"

install -d "$DEST"
install -m 0644 "$ROOT/landing/index.html" "$DEST/home.html"
install -m 0644 "$ROOT/landing/swpu-display.woff2" "$DEST/swpu-display.woff2"
install -m 0644 "$ROOT/landing/swpu-mono.woff2" "$DEST/swpu-mono.woff2"
install -m 0644 "$ROOT/landing/FONTS-LICENSE.md" "$DEST/FONTS-LICENSE.md"

for asset in "$ROOT"/landing/assets/*; do
    install -m 0644 "$asset" "$DEST/$(basename "$asset")"
done

printf 'landing installed to %s\n' "$DEST"
