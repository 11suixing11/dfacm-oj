#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# Theme css is versioned per ui-default release. Autodetect the newest
# installed theme-<version>.css so a UI upgrade cannot silently orphan the
# brand overlay; set THEME_VERSION to override the autodetection.
STATIC_DIR="${STATIC_DIR:-/root/.hydro/static}"
# Backups must never live in the directory Caddy serves from /root/.hydro/static
# (root * + try_files {path} + file_server would publish every *.bak-* file).
BACKUP_DIR="${BACKUP_DIR:-/root/swpu-theme-backups}"
BACKUP_KEEP="${SWPU_THEME_BACKUP_KEEP:-10}"

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
        # Not fatal here: the target validation below turns this into exit 66,
        # which is the actionable failure. This value only names the suspect.
        THEME_VERSION="4.58.5"
        printf 'warning: no theme-*.css found in %s; assuming %s so the missing-target check can name it\n' "$STATIC_DIR" "$THEME_VERSION" >&2
    fi
fi
STATIC_THEME="${STATIC_THEME:-${STATIC_DIR}/theme-${THEME_VERSION}.css}"
SOURCE_THEME="${SOURCE_THEME:-/usr/local/share/.config/yarn/global/node_modules/@hydrooj/ui-default/public/theme-${THEME_VERSION}.css}"
STATIC_SW="${STATIC_SW:-${STATIC_DIR}/service-worker.js}"
SOURCE_SW="${SOURCE_SW:-/usr/local/share/.config/yarn/global/node_modules/@hydrooj/ui-default/public/service-worker.js}"
BRAND_MARKER="DFACM brand overlay"
LEGACY_MARKER="DFACM legacy overlay set"

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

# Canonicalise a path that need not exist yet: resolve the nearest existing
# ancestor and re-append the remainder. A plain `cd` would fail on a
# not-yet-created BACKUP_DIR and silently yield an empty string, which then
# compares as a false match against everything.
resolve_path() {
    local p="$1" parent base
    if [ -d "$p" ]; then
        (cd "$p" && pwd -P)
        return 0
    fi
    parent="$(dirname "$p")"
    base="$(basename "$p")"
    if [ "$parent" = "$p" ]; then
        printf '%s' "$p"
        return 0
    fi
    printf '%s/%s' "$(resolve_path "$parent")" "$base"
}

# true when path $2 is inside directory $1
contains() {
    local rdir rpath
    rdir="$(resolve_path "$1")"
    rpath="$(resolve_path "$2")"
    if [ -z "$rdir" ] || [ -z "$rpath" ]; then return 1; fi
    if [ "$rpath" = "$rdir" ]; then return 0; fi
    case "$rpath/" in "$rdir"/*) return 0 ;; esac
    return 1
}

# Guard the leak this script used to have: backups are flat files named after
# their target, so they are published if and only if BACKUP_DIR sits inside a
# directory Caddy serves. One direction only — a backup directory that merely
# contains an asset directory publishes nothing, and cannot happen anyway.
for target in "$STATIC_THEME" "$SOURCE_THEME" "$STATIC_SW" "$SOURCE_SW"; do
    if contains "$(dirname "$target")" "$BACKUP_DIR"; then
        printf 'refusing BACKUP_DIR=%s: it is inside the directory serving %s, so every *.bak-* file would be a public download; pick a directory outside the asset tree\n' "$BACKUP_DIR" "$target" >&2
        exit 66
    fi
done
mkdir -p "$BACKUP_DIR"

case "$BACKUP_KEEP" in
    '' | *[!0-9]*) printf 'SWPU_THEME_BACKUP_KEEP must be a positive integer, got %s\n' "$BACKUP_KEEP" >&2; exit 64 ;;
esac
[ "$BACKUP_KEEP" -ge 1 ] || { printf 'SWPU_THEME_BACKUP_KEEP must be >= 1, got %s\n' "$BACKUP_KEEP" >&2; exit 64; }

ROLLBACK_TARGETS=()
ROLLBACK_SOURCES=()

# Any non-zero exit after the first mutation restores every file we already
# touched, newest first, so a failed run never leaves the site on a
# half-written theme.
rollback() {
    local rc=$? i target source
    [ "$rc" -ne 0 ] || return 0
    set +e
    if [ "${#ROLLBACK_TARGETS[@]}" -gt 0 ]; then
        printf 'install-theme: aborting with exit %d, restoring %d file(s)\n' "$rc" "${#ROLLBACK_TARGETS[@]}" >&2
        for (( i = ${#ROLLBACK_TARGETS[@]} - 1; i >= 0; i-- )); do
            target="${ROLLBACK_TARGETS[$i]}"
            source="${ROLLBACK_SOURCES[$i]}"
            if [ ! -f "$source" ]; then
                printf '  MISSING backup for %s (expected %s) — restore by hand\n' "$target" "$source" >&2
            elif cp -a "$source" "$target"; then
                printf '  restored %s\n' "$target"
            else
                printf '  FAILED to restore %s from %s\n' "$target" "$source" >&2
            fi
        done
        printf 'install-theme: backups retained in %s\n' "$BACKUP_DIR" >&2
    fi
    exit "$rc"
}
trap rollback EXIT

backup_prefix() {
    # Full paths are encoded so the two theme targets and the two service-worker
    # targets (identical basenames) never collide in the flat backup directory.
    local encoded="${1//\//_}"
    printf '%s.bak-' "$encoded"
}

prune_backups() {
    # A shell pattern rather than a regex: an unescaped "/" inside a sed bracket
    # expression terminates the s command, and ls|grep|tail needs three passes
    # where one loop does. `ls -t` is newest-first and filtering keeps that order,
    # so counting down to BACKUP_KEEP is all the retention logic needed.
    local prefix="$1" kept=0 name
    while IFS= read -r name; do
        case "$name" in
            "$prefix"*) ;;
            *) continue ;;
        esac
        kept=$((kept + 1))
        if [ "$kept" -gt "$BACKUP_KEEP" ]; then
            rm -f "$BACKUP_DIR/$name"
        fi
    done < <(ls -1t "$BACKUP_DIR" 2>/dev/null)
}

backup_file() {
    local target="$1" backup prefix
    backup="$(mktemp "$BACKUP_DIR/$(backup_prefix "$target")$(date +%Y%m%d-%H%M%S)-XXXXXX")"
    cp -a "$target" "$backup"
    ROLLBACK_TARGETS+=("$target")
    ROLLBACK_SOURCES+=("$backup")
    printf 'backup: %s\n' "$backup"
    prefix="$(backup_prefix "$target")"
    prune_backups "$prefix"
}

# Build <stripped upstream><optional newline><brand><optional legacy> entirely in
# a staging file in the target's own directory (same filesystem, so the final
# rename is atomic), then swap it in once. An interrupted run therefore leaves
# either the old file or the new file, never a truncated stylesheet.
apply_theme() {
    local target="$1" staged line
    staged="$(mktemp "$target.tmp.XXXXXX")"
    line="$(grep -n -m1 -E '==== (DFACM|SWPU ACM)' "$target" | head -1 | cut -d: -f1 || true)"
    if [ -n "$line" ]; then
        head -n $((line - 1)) "$target" > "$staged"
        printf 'stripped previous overlays: %s\n' "$target"
    else
        cat "$target" > "$staged"
    fi
    # Minified upstream CSS may have no trailing newline. Keep our marker on its
    # own line so a later reinstall never strips the original CSS with it.
    if [ -n "$(tail -c 1 "$staged")" ]; then printf '\n' >> "$staged"; fi
    cat "$ROOT/theme/00-brand.css" >> "$staged"
    if [ "${SWPU_THEME_LEGACY:-0}" = "1" ]; then
        {
            printf '\n/* %s */\n' "$LEGACY_MARKER"
            for name in 01-dark-band.css 02-polish.css 03-immersive.css 04-immersive-buttons.css 05-full-dark.css; do
                printf '\n/* ==== %s ==== */\n' "$name"
                cat "$ROOT/theme/$name"
            done
        } >> "$staged"
    fi
    chmod --reference="$target" "$staged" 2>/dev/null || true
    mv -f "$staged" "$target"
    printf 'theme overlays applied: %s\n' "$target"
}

# Order matters: back up (and register for rollback) before every mutation.
for target in "$STATIC_THEME" "$SOURCE_THEME"; do
    backup_file "$target"
done
for target in "$STATIC_SW" "$SOURCE_SW"; do
    backup_file "$target"
done
for target in "$STATIC_THEME" "$SOURCE_THEME"; do
    apply_theme "$target"
done
for target in "$STATIC_SW" "$SOURCE_SW"; do
    staged="$(mktemp "$target.tmp.XXXXXX")"
    install -m 0644 "$ROOT/deploy/service-worker-killswitch.js" "$staged"
    mv -f "$staged" "$target"
    printf 'service worker neutralized: %s\n' "$target"
done

for target in "$STATIC_THEME" "$SOURCE_THEME"; do
    grep -q "$BRAND_MARKER" "$target" || { printf 'brand verification failed: %s\n' "$target" >&2; exit 65; }
done
for target in "$STATIC_SW" "$SOURCE_SW"; do
    cmp -s "$ROOT/deploy/service-worker-killswitch.js" "$target" || { printf 'service worker verification failed: %s\n' "$target" >&2; exit 65; }
done
printf 'theme targets rebuilt and verified; user theme preferences were not changed\n'
printf 'theme backups: %s (newest %d kept per target)\n' "$BACKUP_DIR" "$BACKUP_KEEP"
trap - EXIT
