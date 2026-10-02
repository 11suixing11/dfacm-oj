#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
THEME_VERSION="${THEME_VERSION:-4.58.5}"
STATIC_THEME="${STATIC_THEME:-/root/.hydro/static/theme-${THEME_VERSION}.css}"
SOURCE_THEME="${SOURCE_THEME:-/usr/local/share/.config/yarn/global/node_modules/@hydrooj/ui-default/public/theme-${THEME_VERSION}.css}"
BRAND_MARKER="SWPU ACM native-dark brand overlay"
LEGACY_MARKER="SWPU ACM legacy overlay set"

apply_brand() {
    local target="$1"
    if [ ! -f "$target" ]; then
        printf 'skip missing: %s\n' "$target"
        return
    fi
    if grep -qF "$BRAND_MARKER" "$target"; then
        printf 'brand overlay already present: %s\n' "$target"
        return
    fi
    cp -a "$target" "${target}.bak-$(date +%Y%m%d-%H%M%S)"
    cat "$ROOT/theme/00-native-dark-brand.css" >> "$target"
    printf 'brand overlay applied: %s\n' "$target"
}

apply_legacy() {
    local target="$1"
    if [ ! -f "$target" ]; then
        printf 'skip missing: %s\n' "$target"
        return
    fi
    if grep -qF "$LEGACY_MARKER" "$target"; then
        printf 'legacy overlays already present: %s\n' "$target"
        return
    fi
    cp -a "$target" "${target}.bak-$(date +%Y%m%d-%H%M%S)"
    {
        printf '\n/* %s */\n' "$LEGACY_MARKER"
        for name in 01-dark-band.css 02-polish.css 03-immersive.css 04-immersive-buttons.css 05-full-dark.css; do
            printf '\n/* ==== %s ==== */\n' "$name"
            cat "$ROOT/theme/$name"
        done
    } >> "$target"
    printf 'legacy overlays applied: %s\n' "$target"
}

for target in "$STATIC_THEME" "$SOURCE_THEME"; do
    apply_brand "$target"
    if [ "${SWPU_THEME_LEGACY:-0}" = "1" ]; then
        apply_legacy "$target"
    fi
done

printf 'theme targets processed; set preference.theme=dark and user.theme=dark as described in theme/README.md\n'
