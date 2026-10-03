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

# Validate every required target before touching any file. Version drift must
# fail deployment, rather than silently skipping all work with exit code 0.
for target in "$STATIC_THEME" "$SOURCE_THEME" "$STATIC_SW" "$SOURCE_SW"; do
    if [ ! -f "$target" ] || [ ! -r "$target" ] || [ ! -w "$target" ]; then
        printf 'required target missing or inaccessible: %s; check THEME_VERSION and target paths\n' "$target" >&2
        exit 66
    fi
done
for source in "$ROOT/theme/00-brand.css" "$ROOT/deploy/service-worker-killswitch.js"; do
    [ -r "$source" ] || { printf 'source missing: %s\n' "$source" >&2; exit 66; }
done
if [ "${SWPU_THEME_LEGACY:-0}" = "1" ]; then
    for name in 01-dark-band.css 02-polish.css 03-immersive.css 04-immersive-buttons.css 05-full-dark.css; do
        [ -r "$ROOT/theme/$name" ] || { printf 'source missing: %s\n' "$name" >&2; exit 66; }
    done
fi

backup_file() {
    local backup
    backup="$(mktemp "$1.bak-$(date +%Y%m%d-%H%M%S)-XXXXXX")"
    cp -a "$1" "$backup"
}

strip_overlays() {
    local target="$1"
    local line
    line="$(grep -n -m1 -E '==== SWPU ACM' "$target" | head -1 | cut -d: -f1 || true)"
    if [ -n "$line" ]; then
        head -n $((line - 1)) "$target" > "$target.tmp"
        mv "$target.tmp" "$target"
        printf 'stripped previous overlays: %s\n' "$target"
    fi
}

apply_brand() {
    local target="$1"
    backup_file "$target"
    strip_overlays "$target"
    # Minified upstream CSS may have no trailing newline. Keep our marker on its
    # own line so a later reinstall never strips the original CSS with it.
    if [ -n "$(tail -c 1 "$target")" ]; then printf '\n' >> "$target"; fi
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

for target in "$STATIC_THEME" "$SOURCE_THEME"; do
    grep -q "$BRAND_MARKER" "$target" || { printf 'brand verification failed: %s\n' "$target" >&2; exit 65; }
done
for target in "$STATIC_SW" "$SOURCE_SW"; do
    cmp -s "$ROOT/deploy/service-worker-killswitch.js" "$target" || { printf 'service worker verification failed: %s\n' "$target" >&2; exit 65; }
done
printf 'theme targets rebuilt and verified; user theme preferences were not changed\n'
