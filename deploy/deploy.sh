#!/usr/bin/env bash
set -euo pipefail

# d&f算法网 deployment orchestrator. Run from the LOCAL checkout (Git Bash on
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
#   activate           - under one remote lock: prepare, back up, publish,
#                        verify installed hashes and perform the ONE restart
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
# unreachable server, 67 service never became ready, 68 smoke battery failed,
# 69 external probe failed, 70 another activation holds the lock,
# 71 unresolved rollback/conflict (see retained recovery.tsv).

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SSH_BIN="${SSH_BIN:-ssh}"
SSH_KEY="${SSH_KEY:-$HOME/.ssh/quiz_platform_server_ed25519}"
SSH_TARGET="${SSH_TARGET:-root@100.69.19.62}"
# accept-new pins the host key on first contact and then rejects any change,
# so a later MITM of this root session cannot go unnoticed. Set
# SSH_STRICT_HOST_KEY_CHECKING=no only for a known-good one-off recovery.
# ConnectTimeout only bounds TCP establishment. Once connected, a stalled
# channel (the 2026-10-04 tar-pipe hang that wedged two deploys) would block
# forever; ServerAlive* makes ssh give up ~45s after the path goes dark.
# ConnectionAttempts rides out the flappy cross-border path where consecutive
# TCP connects alternately succeed and time out (2026-10-04, ~50% loss).
SSH_OPTS=(-o BatchMode=yes -o ConnectTimeout=15 -o ConnectionAttempts=3
    -o ServerAliveInterval=15 -o ServerAliveCountMax=3
    -o "StrictHostKeyChecking=${SSH_STRICT_HOST_KEY_CHECKING:-accept-new}" -i "$SSH_KEY")
# Second line of defense for stalls that keep trickling traffic: every remote
# step is bounded so a hang fails loudly instead of pinning the deploy. Bash
# dynamic scoping lets a caller `local REMOTE_TIMEOUT=...` to override.
REMOTE_TIMEOUT="${REMOTE_TIMEOUT:-180}"
REMOTE_ADDONS="${REMOTE_ADDONS:-/root/.hydro/addons}"
REMOTE_CUSTOM="${REMOTE_CUSTOM:-/root/.hydro/custom}"
REMOTE_DEPLOY="${REMOTE_DEPLOY:-/root/swpu-theme-deploy}"
WAIT_SECONDS="${WAIT_SECONDS:-75}"
SMOKE_HOST="${SMOKE_HOST:-dfacm.website}"
STAGE_ONLY=0
SYNC_ONLY=0
MANIFEST="$(mktemp)"
STAGE=""

remote() { timeout "$REMOTE_TIMEOUT" "$SSH_BIN" "${SSH_OPTS[@]}" "$SSH_TARGET" "$@"; }

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
  REMOTE_TIMEOUT per-step ssh timeout in seconds, default 180
  SMOKE_HOST   site hostname for probes, default dfacm.website
  REMOTE_ADDONS, REMOTE_CUSTOM, REMOTE_DEPLOY  override remote install roots
  ACTIVATION_BACKUP_DIR  private backup/lock root, default /root/swpu-deploy-backups
  STATIC_DIR, THEME_VERSION, STATIC_THEME, SOURCE_THEME, STATIC_SW, SOURCE_SW
               optional remote theme target overrides
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
    # The live server keeps its addon directories under the historical
    # swpu-* names (that is what /root/.hydro/addons/addon.json registers);
    # only the repository-side directories were renamed to plugin-dfacm-*.
    # Map each repo addon back onto its swpu-* install target explicitly.
    local addon remote_addon files f
    for addon in plugin-dfacm-regcode plugin-dfacm-ops plugin-dfacm-train plugin-dfacm-shop plugin-dfacm-calendar; do
        remote_addon="swpu-${addon#plugin-dfacm-}"
        files="$(doc_files "$addon")"
        if [ -z "$files" ]; then
            echo "deployment.md has no cp block for $addon" >&2
            return 66
        fi
        for f in $files; do
            printf '%s\t%s/%s\n' "$addon/$f" "$REMOTE_ADDONS/$remote_addon" "$f"
        done
    done
    # The whole landing tree, not just index.html: the two subsetted woff2
    # fonts and the icon set were previously never shipped at all, so changing
    # one required a manual install-landing.sh that this script would not do.
    while IFS= read -r f; do
        printf 'landing/%s\t%s/landing/%s\n' "$f" "$REMOTE_DEPLOY" "$f"
    done < <(cd "$ROOT/landing" && find . -type f | sed 's#^\./##' | LC_ALL=C sort)
    printf 'theme/00-brand.css\t%s/theme/00-brand.css\n' "$REMOTE_DEPLOY"
    for f in install-theme.sh install-landing.sh service-worker-killswitch.js smoke.sh activate.sh; do
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
    local layout_command
    printf -v layout_command 'command -v pm2 >/dev/null && test -d %q && test -d %q' "$REMOTE_ADDONS" "$REMOTE_CUSTOM"
    remote "$layout_command" \
        || { echo "server layout check failed (connection dropped, or pm2/$REMOTE_ADDONS/$REMOTE_CUSTOM missing)" >&2; exit 66; }
}

# Hashes every manifest row on both ends and compares. $2 selects what the
# remote side hashes: "stage" the uploaded copy, "live" the installed path.
compare_hashes() {
    local label="$1" target="$2" local_path remote_path
    local local_hashes remote_hashes command remote_command=$'set -euo pipefail\n'
    local_hashes="$(
        while IFS=$'\t' read -r local_path remote_path; do
            sha256sum "$ROOT/$local_path" | cut -d' ' -f1
        done < "$MANIFEST"
    )"
    # Do not pipe a generated script into `ssh ... bash -s` here. On Windows
    # Git Bash, a long stdin-fed SSH command can keep the channel open after
    # the remote hashes have been produced, which made deployment hang during
    # the otherwise harmless staging verification. The paths come only from
    # the repository manifest and contain no shell quotes, so one remote
    # command string is both simpler and bounded well below SSH's command-line
    # limits.
    while IFS=$'\t' read -r local_path remote_path; do
        case "$target" in
            stage) printf -v command 'sha256sum -- %q' "$STAGE/$local_path" ;;
            live) printf -v command 'sha256sum -- %q' "$remote_path" ;;
        esac
        remote_command+="$command"$'\n'
    done < "$MANIFEST"
    if ! remote_hashes="$(remote "$remote_command" | cut -d' ' -f1)"; then
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
    # tail -n 1 because a first-contact host-key notice or MOTD could otherwise
    # end up inside the path we later interpolate into every remote command.
    STAGE="$(remote "mktemp -d /tmp/swpu-deploy-stage.XXXXXX" 2>/dev/null | tail -n 1)"
    case "$STAGE" in
        /tmp/swpu-deploy-stage.*) ;;
        *) echo "could not create a staging directory (got: '$STAGE')" >&2; exit 66 ;;
    esac
    # 600s bounds: the payload is a few MB, so a wedged pipe must fail loudly
    # long before a human notices the deploy is "taking a while".
    timeout 600 tar -C "$ROOT" -cf - "${tar_list[@]}" \
        | timeout 600 "$SSH_BIN" "${SSH_OPTS[@]}" "$SSH_TARGET" "tar -C '$STAGE' -xf -"
}

activate() {
    # One remote shell owns backup, activation, verification and restart. Its
    # EXIT trap remains installed throughout; local SSH failure never triggers
    # an unconditional second restart. printf %q protects configured paths.
    {
        printf 'set -euo pipefail\n'
        local name
        for name in REMOTE_ADDONS REMOTE_DEPLOY ACTIVATION_BACKUP_DIR STATIC_DIR THEME_VERSION STATIC_THEME SOURCE_THEME STATIC_SW SOURCE_SW; do
            if [ -n "${!name:-}" ]; then printf 'export %s=%q\n' "$name" "${!name}"; fi
        done
        printf "cat > %q <<'SWPU_ACTIVATION_MANIFEST'\n" "$STAGE/.activation-manifest"
        cat "$MANIFEST"
        printf 'SWPU_ACTIVATION_MANIFEST\n'
        printf 'exec bash %q %q %q %q %q\n' "$STAGE/deploy/activate.sh" "$STAGE" "$STAGE/.activation-manifest" "$REMOTE_CUSTOM" "$SYNC_ONLY"
    } | remote bash -s
}

wait_ready() {
    # Three consecutive successes 1s apart: a single success can come from
    # the draining pre-restart process during the handover window, and the
    # smoke battery must not race that gap.
    # The grep marker follows the branded /reg page: m-mail since the
    # passwordless rework (v1.29.0). The pre-rework marker `tab-reg` no
    # longer exists in the page, which made every deploy since 2026-10-12
    # false-fail here while the service was perfectly healthy.
    local probe REMOTE_TIMEOUT=$((WAIT_SECONDS + 60))
    probe="ok=0; for i in \$(seq 1 $WAIT_SECONDS); do if curl -sk --resolve $SMOKE_HOST:443:127.0.0.1 https://$SMOKE_HOST/reg 2>/dev/null | grep -a m-mail >/dev/null; then ok=\$((ok+1)); [ \$ok -ge 3 ] && exit 0; else ok=0; fi; sleep 1; done; exit 1"
    if ! remote "$probe"; then
        echo "service did not serve the branded /reg stably within ${WAIT_SECONDS}s; check pm2 logs before trusting this deploy" >&2
        exit 67
    fi
}

run_smoke() {
    local command
    printf -v command 'bash %q' "$REMOTE_DEPLOY/deploy/smoke.sh"
    if ! remote "$command"; then
        echo "smoke battery failed on the server" >&2
        exit 68
    fi
}

# The server-side smoke probes 127.0.0.1 and cannot see edge failures
# (Caddy config, certificate, DNS). One probe of the public name from this
# machine closes that gap; curl -m keeps it bounded.
verify_from_outside() {
    local code
    code="$(curl -sk -o /dev/null -m 20 -w '%{http_code}' "https://$SMOKE_HOST/reg" || true)"
    [ "$code" = "200" ] || { echo "external probe of https://$SMOKE_HOST/reg returned '$code'" >&2; exit 69; }
    echo "external probe: https://$SMOKE_HOST/reg -> 200"
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
    if [ "$SYNC_ONLY" = 1 ]; then
        echo "sync-only: files in place and verified, restart skipped"
        return 0
    fi
    wait_ready
    run_smoke
    verify_from_outside
    echo "deploy complete: staged, verified, activated, verified, restarted, ready, smoke green, external probe green"
}

main
