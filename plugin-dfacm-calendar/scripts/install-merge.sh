#!/usr/bin/env bash
# Existing-site calendar merge. Reuse the installed Hydro and collector;
# update only the reviewed calendar files and navigation/proxy configuration.
set -Eeuo pipefail
umask 077
root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)
qa="${root}-qa"
hydro_package=${HYDRO_PACKAGE_DIR:-/usr/local/share/.config/yarn/global/node_modules/hydrooj}
mode=${1:-install}
[[ "$mode" == check || "$mode" == install ]] || { echo 'Usage: bash scripts/install-merge.sh [check|install]' >&2; exit 64; }
[[ $(id -u) == 0 && -z ${HYDRO_PROFILE:-} ]] || { echo 'Use the existing root-owned Hydro profile.' >&2; exit 64; }
[[ -f /root/judge-off.yaml ]] || { echo 'Existing CLI judge-disable configuration is missing.' >&2; exit 66; }
for command in node hydrooj pm2 caddy curl timeout flock cp mkdir readlink; do
    command -v "$command" >/dev/null || { echo "Missing installed command: $command" >&2; exit 66; }
done
exec 9>/root/.hydro/.dfacm-calendar-merge.lock
flock -n 9 || { echo 'Another calendar merge is running.' >&2; exit 66; }

if [[ "$mode" == check || ! -f "$qa/native-ok.json" ]]; then
    node "$root/scripts/merge-deployment.cjs" prepare "$root" "$hydro_package" "$qa"
    mkdir -p "$root/node_modules"
    if [[ -e "$root/node_modules/hydrooj" || -L "$root/node_modules/hydrooj" ]]; then
        [[ $(readlink -f "$root/node_modules/hydrooj") == $(readlink -f "$hydro_package") ]]
    else
        ln -s "$hydro_package" "$root/node_modules/hydrooj"
    fi
    caddy validate --config "$qa/candidates/Caddyfile" --adapter caddyfile > "$qa/caddy-validation.log" 2>&1
    native_command=$(node "$root/scripts/merge-deployment.cjs" native-command "$root" "$hydro_package" "$qa")
    rm -f -- "$qa/native-ok.json"
    if ! OVERRIDE_CONFIG=/root/judge-off.yaml SWPU_CALENDAR_AUTO_OFF=1 DFACM_CALENDAR_AI_OFF=1 timeout 150 hydrooj cli execute "$native_command" > "$qa/native.log" 2>&1; then
        echo "Native check failed; see $qa/native.log" >&2
        exit 67
    fi
    [[ -f "$qa/native-ok.json" ]] || { echo "Native check did not complete; see $qa/native.log" >&2; exit 67; }
    if grep -q 'Execution fail:' "$qa/native.log"; then
        echo "Hydro reported a native check failure; see $qa/native.log" >&2
        exit 67
    fi
fi
node "$root/scripts/merge-deployment.cjs" ready "$root" "$qa"
[[ "$mode" == install ]] || { echo "Verified staged merge. QA: $qa"; exit 0; }

mkdir -p /root/backups
backup=$(mktemp -d /root/backups/calendar-ai-merge.XXXXXXXX)
chmod 700 "$backup"
node "$root/scripts/merge-deployment.cjs" backup "$qa/plan.json" "$backup"
pm2 jlist | node "$root/scripts/merge-deployment.cjs" processes > "$backup/processes-before.json"
node - "$backup/processes-before.json" <<'JS'
const fs = require('node:fs'); const list = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
if (!list.some(item => item.name === 'hydrooj' && item.status === 'online')) throw new Error('Hydro must be online before activation');
JS
printf '%s\n' "$backup" > "$qa/backup-path.txt"
mutation=0
rollback_on_error() {
    local code=$?
    trap - ERR
    if [[ "$mutation" == 1 ]]; then
        echo "Activation failed. Restoring from $backup." >&2
        if ! bash "$root/scripts/rollback-merge.sh" "$backup" > "$qa/rollback.log" 2>&1; then
            echo "Automatic restore failed; inspect $qa/rollback.log and preserve $backup." >&2
        fi
    fi
    exit "$code"
}
trap rollback_on_error ERR
mutation=1
node "$root/scripts/merge-deployment.cjs" activate "$backup"
caddy validate --config /root/.hydro/Caddyfile --adapter caddyfile > "$qa/caddy-live-validation.log" 2>&1
timeout 45 caddy reload --config /root/.hydro/Caddyfile --adapter caddyfile > "$qa/caddy-reload.log" 2>&1
timeout 45 pm2 restart hydrooj > "$qa/hydro-restart.log" 2>&1

ready=0
for attempt in {1..40}; do
    if curl -fsS --max-time 3 http://127.0.0.1:8888/calendar -o "$qa/readiness.html" && grep -q 'calendar-1.37.1.js' "$qa/readiness.html"; then
        ready=$((ready + 1))
        [[ "$ready" -lt 3 ]] || break
    else
        ready=0
    fi
    sleep 2
done
[[ "$ready" -ge 3 ]]
node "$root/scripts/check-live.cjs" "$root" "$qa" > "$qa/live.json"
pm2 jlist | node "$root/scripts/merge-deployment.cjs" processes > "$backup/processes-after.json"
node "$root/scripts/merge-deployment.cjs" postcheck "$backup"
mutation=0
trap - ERR
echo 'Calendar merge installed: https://dfacm.website/calendar'
echo "Backup: $backup"
echo "QA: $qa"
