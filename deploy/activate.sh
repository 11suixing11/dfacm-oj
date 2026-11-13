#!/usr/bin/env bash
# Internal remote activation batch. deploy.sh supplies the verified staging tree.
# No business code, database migrations, or network probes run in this helper.
set -euo pipefail
umask 077
STAGE="$1"
MANIFEST="$2"
CUSTOM="$3"
SYNC_ONLY="$4"
BACKUP_ROOT="${ACTIVATION_BACKUP_DIR:-/root/swpu-deploy-backups}"

fail() { printf '%s\n' "$*" >&2; exit 66; }
# realpath -m resolves existing symlink parents as well as not-yet-created paths.
BACKUP_ROOT="$(realpath -m -- "$BACKUP_ROOT")"
[ "$BACKUP_ROOT" != / ] || fail 'activation backup root must be a dedicated private directory'
THEME_LIST="$(bash "$STAGE/deploy/install-theme.sh" --print-targets)"
mapfile -t THEME_TARGETS <<< "$THEME_LIST"
[ "${#THEME_TARGETS[@]}" -eq 4 ] || fail 'could not resolve all four theme targets'
for served in "$CUSTOM" "${REMOTE_ADDONS:-/root/.hydro/addons}" "${REMOTE_DEPLOY:-/root/swpu-theme-deploy}" "${STATIC_DIR:-/root/.hydro/static}"; do
    served="$(realpath -m -- "$served")"
    case "$BACKUP_ROOT/" in "$served/"*) fail "refusing public activation backup directory: $BACKUP_ROOT (inside $served)" ;; esac
    case "$served/" in "$BACKUP_ROOT/"*) fail "activation backup root must not contain live trees: $BACKUP_ROOT (contains $served)" ;; esac
done
for target in "${THEME_TARGETS[@]}"; do
    served="$(realpath -m -- "$(dirname "$target")")"
    case "$BACKUP_ROOT/" in "$served/"*) fail "refusing public activation backup directory: $BACKUP_ROOT (inside $served)" ;; esac
    case "$served/" in "$BACKUP_ROOT/"*) fail "activation backup root must not contain live trees: $BACKUP_ROOT (contains $served)" ;; esac
done
mkdir -p -- "$BACKUP_ROOT"
chmod 0700 "$BACKUP_ROOT"
# Never unlink the lock file: a waiter must not acquire a different inode.
exec 9>"$BACKUP_ROOT/activation.lock"
flock -n 9 || { echo "another activation holds $BACKUP_ROOT/activation.lock" >&2; exit 70; }
# A killed process or unresolved conflict requires operator reconciliation first.
if [ -e "$BACKUP_ROOT/INCOMPLETE" ]; then
    echo "unfinished activation: $(cat "$BACKUP_ROOT/INCOMPLETE"); inspect recovery.tsv and journal.tsv before clearing INCOMPLETE" >&2
    exit 71
fi
BATCH="$(mktemp -d "$BACKUP_ROOT/batch.XXXXXX")"
mkdir "$BATCH/original" "$BATCH/prepared-landing" "$BATCH/prepared-theme"
printf '%s\n' "$BATCH" > "$BACKUP_ROOT/INCOMPLETE"
printf 'activation backup: %s\n' "$BATCH"
printf 'id\ttarget\tpresent\tmode\thash\tbackup\n' > "$BATCH/inventory.tsv"
printf 'action\tid\ttarget\thash\tmode\n' > "$BATCH/journal.tsv"
printf 'reason\ttarget\tbackup\tpresent\tmode\toriginal_hash\tbatch_hash\n' > "$BATCH/recovery.tsv"
SOURCES=() TARGETS=() MODES=() PRESENT=() OLD_MODES=() OLD_HASHES=() HASHES=() ATTEMPTED=()
TEMPORARIES=()
COMMITTED=0
UNRESOLVED=0
hash() { local result; result="$(sha256sum -- "$1")" || return; printf '%s' "${result%% *}"; }
mode() { stat -c '%a' -- "$1"; }
matches() {
    local target="$1" wanted_hash="$2" wanted_mode="$3" current_hash current_mode
    [ -f "$target" ] && [ ! -L "$target" ] || return 1
    current_hash="$(hash "$target")" && current_mode="$(mode "$target")" || return 1
    [ "$current_hash" = "$wanted_hash" ] && [ "$current_mode" = "$wanted_mode" ]
}
original_matches() {
    local i="$1" target="${TARGETS[$1]}"
    if [ "${PRESENT[$i]}" = 0 ]; then [ ! -e "$target" ] && [ ! -L "$target" ];
    else matches "$target" "${OLD_HASHES[$i]}" "${OLD_MODES[$i]}"; fi
}
recover_item() {
    local reason="$1" i="$2"
    printf '%s\t%s\t%s\t%s\t%s\t%s\t%s\n' "$reason" "${TARGETS[$i]}" "$BATCH/original/$i" "${PRESENT[$i]}" "${OLD_MODES[$i]}" "${OLD_HASHES[$i]}" "${HASHES[$i]}" >> "$BATCH/recovery.tsv"
    printf '%s: %s; original backup %s/original/%s\n' "$reason" "${TARGETS[$i]}" "$BATCH" "$i" >&2
}
finish() {
    local rc=$? j i target staged incomplete="$UNRESOLVED"
    trap - EXIT HUP INT TERM
    set +e
    if [ "$rc" -ne 0 ] && [ "$COMMITTED" = 0 ]; then
        printf 'activation failed (%s); restoring completed writes in reverse order\n' "$rc" >&2
        for ((j=${#ATTEMPTED[@]}-1; j>=0; j--)); do
            i="${ATTEMPTED[$j]}"; target="${TARGETS[$i]}"
            # Includes the intent-before-rename window: an unchanged original
            # needs no action, while an installed expected image is ours to undo.
            if original_matches "$i"; then continue; fi
            if ! matches "$target" "${HASHES[$i]}" "${MODES[$i]}"; then
                recover_item 'CONFLICT (refusing overwrite)' "$i"; incomplete=1; continue
            fi
            if [ "${PRESENT[$i]}" = 0 ]; then
                if ! rm -- "$target" || ! original_matches "$i"; then
                    recover_item 'FAILED to remove created target' "$i"; incomplete=1; continue
                fi
            else
                if ! matches "$BATCH/original/$i" "${OLD_HASHES[$i]}" "${OLD_MODES[$i]}"; then
                    recover_item 'FAILED backup verification' "$i"; incomplete=1; continue
                fi
                staged="$(mktemp "$(dirname "$target")/.swpu-restore.XXXXXX")"
                if [ -z "$staged" ]; then recover_item 'FAILED to prepare restore' "$i"; incomplete=1; continue; fi
                TEMPORARIES+=("$staged")
                if ! cp -a -- "$BATCH/original/$i" "$staged" || ! matches "$target" "${HASHES[$i]}" "${MODES[$i]}" || ! mv -fT -- "$staged" "$target" || ! original_matches "$i"; then
                    recover_item 'FAILED to restore' "$i"; incomplete=1; continue
                fi
            fi
            printf 'RESTORED\t%s\t%s\t%s\t%s\n' "$i" "$target" "${OLD_HASHES[$i]}" "${OLD_MODES[$i]}" >> "$BATCH/journal.tsv"
        done
        printf 'recovery list: %s/recovery.tsv; inventory and journal retained\n' "$BATCH" >&2
    fi
    for staged in "${TEMPORARIES[@]}"; do rm -f -- "$staged"; done
    if [ "$incomplete" = 0 ]; then rm -f "$BACKUP_ROOT/INCOMPLETE"; else rc=71; fi
    exit "$rc"
}
trap finish EXIT
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM

add_target() {
    local source="$1" target="$2" permissions="$3" existing
    case "$target" in /*) ;; *) fail "non-absolute activation target: $target" ;; esac
    case "$target" in *$'\t'*|*$'\n'*) fail 'activation target contains a tab or newline' ;; esac
    for existing in "${TARGETS[@]}"; do [ "$target" != "$existing" ] || fail "duplicate activation target: $target"; done
    SOURCES+=("$source"); TARGETS+=("$target"); MODES+=("$permissions")
}
while IFS=$'\t' read -r source target; do
    permissions=644
    case "$source" in deploy/install-theme.sh|deploy/install-landing.sh|deploy/smoke.sh) permissions=755 ;; esac
    add_target "$STAGE/$source" "$target" "$permissions"
done < "$MANIFEST"
# Leaf installers work only in private preparation directories. Their own
# failures cannot partially mutate the live resource trees.
SWPU_LANDING_SRC="$STAGE/landing" bash "$STAGE/deploy/install-landing.sh" "$BATCH/prepared-landing"
while IFS= read -r -d '' source; do
    add_target "$source" "$CUSTOM/$(basename "$source")" 644
done < <(find "$BATCH/prepared-landing" -type f -print0 | sort -z)
for i in "${!THEME_TARGETS[@]}"; do
    target="${THEME_TARGETS[$i]}"
    [ -f "$target" ] && [ ! -L "$target" ] || fail "required theme target missing or symlinked: $target"
    permissions=644
    [ "$i" -ge 2 ] || permissions="$(mode "$target")"
    add_target "$BATCH/prepared-theme/$i" "$target" "$permissions"
done
# Inventory every target before the first live write, including nonexistence.
for i in "${!TARGETS[@]}"; do
    target="${TARGETS[$i]}"
    [ ! -L "$target" ] || fail "refusing symlink activation target: $target"
    if [ -e "$target" ]; then
        [ -f "$target" ] || fail "activation target is not a regular file: $target"
        PRESENT+=(1); OLD_MODES+=("$(mode "$target")"); OLD_HASHES+=("$(hash "$target")")
        cp -a -- "$target" "$BATCH/original/$i"
        matches "$BATCH/original/$i" "${OLD_HASHES[$i]}" "${OLD_MODES[$i]}" || fail "backup changed during copy: $target"
    else PRESENT+=(0); OLD_MODES+=(-); OLD_HASHES+=(-); fi
    printf '%s\t%s\t%s\t%s\t%s\t%s\n' "$i" "$target" "${PRESENT[$i]}" "${OLD_MODES[$i]}" "${OLD_HASHES[$i]}" "$BATCH/original/$i" >> "$BATCH/inventory.tsv"
done
# Theme input and rollback originals come from the same verified snapshot.
offset=$((${#TARGETS[@]}-4))
for i in 0 1 2 3; do cp -a -- "$BATCH/original/$((offset+i))" "$BATCH/prepared-theme/$i"; done
STATIC_THEME="$BATCH/prepared-theme/0" SOURCE_THEME="$BATCH/prepared-theme/1" \
STATIC_SW="$BATCH/prepared-theme/2" SOURCE_SW="$BATCH/prepared-theme/3" \
BACKUP_DIR="$BATCH/theme-intermediate-backups" bash "$STAGE/deploy/install-theme.sh"
for i in "${!SOURCES[@]}"; do HASHES+=("$(hash "${SOURCES[$i]}")"); done
for i in "${!TARGETS[@]}"; do
    target="${TARGETS[$i]}"
    original_matches "$i" || { recover_item 'CONFLICT (changed since backup)' "$i"; UNRESOLVED=1; exit 71; }
    mkdir -p -- "$(dirname "$target")"
    staged="$(mktemp "$(dirname "$target")/.swpu-write.XXXXXX")"
    TEMPORARIES+=("$staged")
    install -m "${MODES[$i]}" -- "${SOURCES[$i]}" "$staged"
    matches "$staged" "${HASHES[$i]}" "${MODES[$i]}" || { echo "prepared hash mismatch: $target" >&2; exit 65; }
    original_matches "$i" || { recover_item 'CONFLICT (changed before publication)' "$i"; UNRESOLVED=1; exit 71; }
    # Log the intended image before rename, so a signal immediately after rename
    # is recoverable even before WRITTEN is appended.
    ATTEMPTED+=("$i")
    printf 'INTENT\t%s\t%s\t%s\t%s\n' "$i" "$target" "${HASHES[$i]}" "${MODES[$i]}" >> "$BATCH/journal.tsv"
    mv -fT -- "$staged" "$target"
    printf 'WRITTEN\t%s\t%s\t%s\t%s\n' "$i" "$target" "${HASHES[$i]}" "${MODES[$i]}" >> "$BATCH/journal.tsv"
done
for i in "${!TARGETS[@]}"; do
    matches "${TARGETS[$i]}" "${HASHES[$i]}" "${MODES[$i]}" || { echo "installed hash/mode verification failed: ${TARGETS[$i]}" >&2; exit 65; }
done
echo 'installed files and derived resources verified'
# A restart error can mean pm2 partially replaced workers already. Commit the
# verified files before that external boundary; never put old files beneath a
# possibly new process. The same flock still covers the sole restart attempt.
# Keep rollback enabled until the commit record itself has been written.
printf 'COMMITTED\n' >> "$BATCH/journal.tsv"
COMMITTED=1
if [ "$SYNC_ONLY" != 1 ]; then
    echo 'restarting hydrooj (all files verified in place)'
    if ! pm2 restart hydrooj; then
        UNRESOLVED=1
        printf 'RESTART_FAILED\n' >> "$BATCH/journal.tsv"
        echo "restart failed; verified files retained; inspect process state and $BATCH/journal.tsv before clearing INCOMPLETE" >&2
        exit 71
    fi
fi
echo "activation committed; backups retained in $BATCH"
