#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
THEME_VERSION="${THEME_VERSION:-4.58.5}"
STATIC_THEME="${STATIC_THEME:-/root/.hydro/static/theme-${THEME_VERSION}.css}"
SOURCE_THEME="${SOURCE_THEME:-/usr/local/share/.config/yarn/global/node_modules/@hydrooj/ui-default/public/theme-${THEME_VERSION}.css}"
STATIC_SW="${STATIC_SW:-/root/.hydro/static/service-worker.js}"
SOURCE_SW="${SOURCE_SW:-/usr/local/share/.config/yarn/global/node_modules/@hydrooj/ui-default/public/service-worker.js}"
BRAND_MARKER="SWPU ACM brand overlay"
LEGACY_MARKER="SWPU ACM legacy overlay set"

backup_file() {
    cp -a "$1" "$1.bak-$(date +%Y%m%d-%H%M%S)"
}

strip_overlays() {
    local target="$1"
    local line
    line="$(grep -n -m1 -E '==== SWPU ACM' "$target" | head -1 | cut -d: -f1 || true)"
    if [ -n "$line" ]; then
        backup_file "$target"
        head -n $((line - 1)) "$target" > "$target.tmp"
        mv "$target.tmp" "$target"
        printf 'stripped previous overlays: %s\n' "$target"
    fi
}

apply_brand() {
    local target="$1"
    if [ ! -f "$target" ]; then
        printf 'skip missing: %s\n' "$target"
        return
    fi
    strip_overlays "$target"
    cat "$ROOT/theme/00-brand.css" >> "$target"
    printf 'brand overlay applied: %s\n' "$target"
}

apply_legacy() {
    local target="$1"
    {
        printf '\n/* %s */\n' "$LEGACY_MARKER"
        for name in 01-dark-band.css 02-polish.css 03-immersive.css 04-immersive-buttons.css 05-full-dark.css; do
            printf '\n/* ==== %s ==== */\n' "$name"
            cat "$ROOT/theme/$name"
        done
    } >> "$target"
    printf 'legacy overlays applied: %s\n' "$target"
}

install_service_worker_killswitch() {
    local target="$1"
    if [ ! -f "$target" ]; then
        printf 'skip missing: %s\n' "$target"
        return
    fi
    backup_file "$target"
    install -m 0644 "$ROOT/deploy/service-worker-killswitch.js" "$target"
    printf 'service worker neutralized: %s\n' "$target"
}

for target in "$STATIC_THEME" "$SOURCE_THEME"; do
    apply_brand "$target"
    if [ "${SWPU_THEME_LEGACY:-0}" = "1" ]; then
        apply_legacy "$target"
    fi
done

for target in "$STATIC_SW" "$SOURCE_SW"; do
    install_service_worker_killswitch "$target"
done

printf 'theme targets rebuilt; default theme is light (users can switch via preferences or /set_theme)\n'
