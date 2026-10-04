#!/usr/bin/env bash
set -euo pipefail

# SWPU OJ deployment orchestrator. Run from the LOCAL checkout (Git Bash on
# Windows works) against the live server.
#
# Origin: the 2026-10-04 audit found the live process still serving pre-merge
# plugin code because files had landed on the server AFTER the single pm2
# restart, while every on-disk hash verified clean. This script makes that
# ordering structurally impossible:
#
#   preflight          - local sources exist, server reachable
#   upload_stage       - ship every file into a private staging directory
#   verify_stage       - sha256 both ends; NOTHING has been activated yet
#   activate           - install staged files into their real locations
#   verify_installed   - sha256 the installed paths
#   restart_hydrooj    - the ONE restart, only after everything is in place
#   wait_ready         - poll until the new process serves the branded /reg
#   run_smoke          - anonymous smoke battery on the server
#
# Verifying the staging directory *before* activating is the point: previously
# the install ran first, so a hash mismatch refused to restart but still left
# the server on new assets with the old process serving them.
#
# Plugin file lists are parsed from deployment.md's documented
# `cp /root/swpu-oj/<addon>/{...}` blocks, so the docs and what actually
# ships can never drift apart. Caddyfile and footer mongosh migrations stay
# manual (see deployment.md §7/§4): they change far less often than code.
#
# Exit codes: 64 usage, 65 hash mismatch, 66 missing local source or
# unreachable server, 67 service never became ready, 68 smoke battery failed.

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SSH_BIN="${SSH_BIN:-ssh}"
SSH_KEY="${SSH_KEY:-$HOME/.ssh/quiz_platform_server_ed25519}"
SSH_TARGET="${SSH_TARGET:-root@100.69.19.62}"
# accept-new pins the host key on first contact and then rejects any change,
# so a later MITM of this root session cannot go unnoticed. Set
# SSH_STRICT_HOST_KEY_CHECKING=no only for a known-good one-off recovery.
SSH_OPTS=(-o BatchMode=yes -o ConnectTimeout=15
    -o "StrictHostKeyChecking=${SSH_STRICT_HOST_KEY_CHECKING:-accept-new}" -i "$SSH_KEY")
REMOTE_ADDONS=/root/.hydro/addons
REMOTE_CUSTOM=/root/.hydro/custom
REMOTE_DEPLOY=/root/swpu-theme-deploy
WAIT_SECONDS="${WAIT_SECONDS:-75}"
SMOKE_HOST="${SMOKE_HOST:-swpuacm.xyz}"
STAGE_ONLY=0
SYNC_ONLY=0
MANIFEST="$(mktemp)"
STAGE=""

remote() { "$SSH_BIN" "${SSH_OPTS[@]}" "$SSH_TARGET" "$@"; }

cleanup() {
    [ -n "$STAGE" ] && remote "test -n '$STAGE' && rm -rf '$STAGE'" >/dev/null 2>&1 || true
    rm -f "$MANIFEST"
}
trap cleanup EXIT

usage() {
    cat >&2 <<'EOF'
Usage: bash deploy/deploy.sh [--stage-only | --sync-only]

  --stage-only   upload and hash-verify the staging copy, change nothing live
  --sync-only    also activate and verify, but skip restart/wait/smoke

Environment overrides:
  SSH_TARGET   default root@100.69.19.62 (Tailscale); use
               root@107.151.246.137 when Tailscale is down
  SSH_KEY      default ~/.ssh/quiz_platform_server_ed25519
  SSH_STRICT_HOST_KEY_CHECKING  default accept-new
  WAIT_SECONDS readiness budget, default 75
  SMOKE_HOST   site hostname for probes, default swpuacm.xyz
EOF
    exit 64
}

for arg in "$@"; do
    case "$arg" in
        --stage-only) STAGE_ONLY=1 ;;
        --sync-only) SYNC_ONLY=1 ;;
        *) usage ;;
    esac
done

# Single source of truth for plugin files: the documented cp blocks.
doc_files() {
    sed -n "s#.*cp /root/swpu-oj/$1/{\([^}]*\)}.*#\1#p" "$ROOT/deploy/deployment.md" | tr ',' ' '
}

# Prints "<local repo path><TAB><remote absolute path>" for every shipped file.
stage_manifest() {
    local addon files f
    for addon in plugin-swpu-regcode plugin-swpu-ops plugin-swpu-train plugin-swpu-shop; do
        files="$(doc_files "$addon")"
        if [ -z "$files" ]; then
            echo "deployment.md has no cp block for $addon" >&2
            return 66
        fi
        for f in $files; do
            printf '%s\t%s/%s\n' "$addon/$f" "$REMOTE_ADDONS/${addon#plugin-}" "$f"
        done
    done
    # The whole landing tree, not just index.html: the two subsetted woff2
    # fonts and the icon set were previously never shipped at all, so changing
    # one required a manual install-landing.sh that this script would not do.
    while IFS= read -r f; do
        printf 'landing/%s\t%s/landing/%s\n' "$f" "$REMOTE_DEPLOY" "$f"
    done < <(cd "$ROOT/landing" && find . -type f | sed 's#^\./##' | LC_ALL=C sort)
    printf 'theme/00-brand.css\t%s/theme/00-brand.css\n' "$REMOTE_DEPLOY"
    for f in install-theme.sh install-landing.sh service-worker-killswitch.js smoke.sh; do
        printf 'deploy/%s\t%s/deploy/%s\n' "$f" "$REMOTE_DEPLOY" "$f"
    done
}

preflight() {
    local local_path remote_path missing=0
    stage_manifest > "$MANIFEST"
    while IFS=$'\t' read -r local_path remote_path; do
        [ -n "$local_path" ] && [ -n "$remote_path" ] || { echo "bad manifest line" >&2; exit 66; }
        if [ ! -f "$ROOT/$local_path" ]; then
            echo "missing local source: $local_path" >&2
            missing=1
        fi
    done < "$MANIFEST"
    [ "$missing" -eq 0 ] || exit 66
    remote true || { echo "server unreachable: $SSH_TARGET" >&2; exit 66; }
    remote "command -v pm2 >/dev/null && test -d $REMOTE_ADDONS && test -d $REMOTE_CUSTOM" \
        || { echo "server layout unexpected: pm2, $REMOTE_ADDONS or $REMOTE_CUSTOM missing" >&2; exit 66; }
}

# Hashes every manifest row on both ends and compares. $2 selects what the
# remote side hashes: "stage" the uploaded copy, "live" the installed path.
compare_hashes() {
    local label="$1" target="$2" local_path remote_path
    local local_hashes remote_hashes
    local_hashes="$(
        while IFS=$'\t' read -r local_path remote_path; do
            sha256sum "$ROOT/$local_path" | cut -d' ' -f1
        done < "$MANIFEST"
    )"
    if ! remote_hashes="$(
        {
            while IFS=$'\t' read -r local_path remote_path; do
                case "$target" in
                    stage) printf "sha256sum '%s/%s'\n" "$STAGE" "$local_path" ;;
                    live) printf "sha256sum '%s'\n" "$remote_path" ;;
                esac
            done < "$MANIFEST"
        } | remote bash -s | cut -d' ' -f1
    )"; then
        echo "remote hash probe failed for $label" >&2
        exit 65
    fi
    if [ "$local_hashes" != "$remote_hashes" ]; then
        echo "hash mismatch in $label; nothing further will be activated." >&2
        diff <(printf '%s\n' "$local_hashes") <(printf '%s\n' "$remote_hashes") >&2 || true
        exit 65
    fi
    echo "$label verified on both ends"
}

upload_stage() {
    local tar_list=() local_path
    while IFS=$'\t' read -r local_path _; do
        tar_list+=("$local_path")
    done < "$MANIFEST"
    # mktemp -d, not a fixed path: a predictable /tmp directory can be pre-created
    # or symlinked by a local unprivileged user before we extract into it.
    STAGE="$(remote "mktemp -d /tmp/swpu-deploy-stage.XXXXXX")"
    [ -n "$STAGE" ] || { echo "could not create a staging directory" >&2; exit 66; }
    tar -C "$ROOT" -cf - "${tar_list[@]}" \
        | "$SSH_BIN" "${SSH_OPTS[@]}" "$SSH_TARGET" "tar -C '$STAGE' -xf -"
}

activate() {
    local local_path remote_path
    {
        while IFS=$'\t' read -r local_path remote_path; do
            printf "install -D -m 0644 '%s/%s' '%s'\n" "$STAGE" "$local_path" "$remote_path"
        done < "$MANIFEST"
    } | remote bash -s
    remote "chmod +x $REMOTE_DEPLOY/deploy/install-theme.sh $REMOTE_DEPLOY/deploy/install-landing.sh $REMOTE_DEPLOY/deploy/smoke.sh"
    # Idempotent, no restart needed. install-theme.sh rolls itself back if its
    # own post-write verification fails.
    remote "bash $REMOTE_DEPLOY/deploy/install-landing.sh"
    remote "bash $REMOTE_DEPLOY/deploy/install-theme.sh"
}

restart_hydrooj() {
    echo "restarting hydrooj (all files verified in place)"
    remote pm2 restart hydrooj
}

wait_ready() {
    # Three consecutive successes 1s apart: a single success can come from
    # the draining pre-restart process during the handover window, and the
    # smoke battery must not race that gap.
    local probe
    probe="ok=0; for i in \$(seq 1 $WAIT_SECONDS); do if curl -sk --resolve $SMOKE_HOST:443:127.0.0.1 https://$SMOKE_HOST/reg 2>/dev/null | grep -a tab-reg >/dev/null; then ok=\$((ok+1)); [ \$ok -ge 3 ] && exit 0; else ok=0; fi; sleep 1; done; exit 1"
    if ! remote "$probe"; then
        echo "service did not serve the branded /reg stably within ${WAIT_SECONDS}s; check pm2 logs before trusting this deploy" >&2
        exit 67
    fi
}

run_smoke() {
    if ! remote "bash $REMOTE_DEPLOY/deploy/smoke.sh"; then
        echo "smoke battery failed on the server" >&2
        exit 68
    fi
}

main() {
    preflight
    upload_stage
    compare_hashes "staging copy" stage
    if [ "$STAGE_ONLY" = 1 ]; then
        echo "stage-only: staging copy verified, nothing was activated"
        return 0
    fi
    activate
    compare_hashes "installed files" live
    if [ "$SYNC_ONLY" = 1 ]; then
        echo "sync-only: files in place and verified, restart skipped"
        return 0
    fi
    restart_hydrooj
    wait_ready
    run_smoke
    echo "deploy complete: staged, verified, activated, verified, restarted, ready, smoke green"
}

main