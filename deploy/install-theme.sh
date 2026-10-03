#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# Theme css is versioned per ui-default release. Autodetect the newest
# installed theme-<version>.css so a UI upgrade cannot silently orphan the
# brand overlay; set THEME_VERSION to override the autodetection.
STATIC_DIR="${STATIC_DIR:-/root/.hydro/static}"

is_older() {
    # true when $1 sorts before $2 in version order
    local sorted
    sorted="$(printf '%s\n%s\n' "$1" "$2" | sort -V)"
    [ "$1" = "${sorted%%$'\n'*}" ] && [ "$1" != "$2" ]
}

detect_theme_version() {
    local best='' candidate version
    for candidate in "$1"/theme-*.css; do
        [ -f "$candidate" ] || continue
        version="${candidate##*/theme-}"
        version="${version%.css}"
        if [ -z "$best" ] || is_older "$best" "$version"; then best="$version"; fi
    done
    printf '%s' "$best"
}

if [ -n "${THEME_VERSION:-}" ]; then
    printf 'theme version: %s (from THEME_VERSION)\n' "$THEME_VERSION"
else
    THEME_VERSION="$(detect_theme_version "$STATIC_DIR")"
    if [ -n "$THEME_VERSION" ]; then
        printf 'theme version: %s (autodetected in %s)\n' "$THEME_VERSION" "$STATIC_DIR"
    else
        THEME_VERSION="4.58.5"
        printf 'warning: no theme-*.css found in %s, using fallback %s\n' "$STATIC_DIR" "$THEME_VERSION" >&2
    fi
fi
STATIC_THEME="${STATIC_THEME:-${STATIC_DIR}/theme-${THEME_VERSION}.css}"
SOURCE_THEME="${SOURCE_THEME:-/usr/local/share/.config/yarn/global/node_modules/@hydrooj/ui-default/public/theme-${THEME_VERSION}.css}"
STATIC_SW="${STATIC_SW:-${STATIC_DIR}/service-worker.js}"
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
