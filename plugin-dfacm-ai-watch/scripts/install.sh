#!/usr/bin/env bash
# Install only this addon; reuse all installed dependencies and preserve the
# existing addon list. Run from a verified, extracted release directory.
set -Eeuo pipefail
umask 077

root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)
destination=/root/.hydro/addons/dfacm-ai-watch
addon_list=/root/.hydro/addon.json
hydro_package=${HYDRO_PACKAGE_DIR:-/usr/local/share/.config/yarn/global/node_modules/hydrooj}
http_origin=${HYDRO_HTTP_ORIGIN:-http://127.0.0.1:8888}
mode=${1:-install}
[[ "$mode" == install || "$mode" == check ]] || { echo 'Usage: bash scripts/install.sh [check|install]' >&2; exit 64; }
[[ $(id -u) == 0 ]] || { echo 'Use the existing Hydro service owner (root on this site).' >&2; exit 64; }
[[ -z ${HYDRO_PROFILE:-} ]] || { echo 'A custom Hydro profile requires adjusting this site-specific installer.' >&2; exit 64; }
for command in node hydrooj pm2 timeout curl flock cp mktemp sha256sum readlink grep; do
    command -v "$command" >/dev/null || { echo "Missing installed command: $command" >&2; exit 66; }
done
node - "$http_origin" <<'JS'
const url = new URL(process.argv[2]);
if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(url.hostname)
    || !url.port || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('HYDRO_HTTP_ORIGIN must be a loopback HTTP address with a port.');
}
JS
[[ -d /root/.hydro/addons && -f "$addon_list" ]] || { echo 'Existing Hydro layout is unavailable.' >&2; exit 66; }
[[ ! -L "$destination" && ! -L "$addon_list" ]] || { echo 'Refusing a symbolic link at the addon destination or registration file.' >&2; exit 66; }
[[ ! -e "$destination" || -d "$destination" ]] || { echo 'Addon destination must be a directory.' >&2; exit 66; }
mkdir -p /root/backups
exec 9>/root/.hydro/.dfacm-ai-watch-install.lock
flock -n 9 || { echo 'Another AI watch installation is in progress.' >&2; exit 66; }

node "$root/scripts/deployment.cjs" preflight "$root" "$hydro_package"
mkdir -p "$root/node_modules"
if [[ -e "$root/node_modules/hydrooj" || -L "$root/node_modules/hydrooj" ]]; then
    [[ $(readlink -f "$root/node_modules/hydrooj") == $(readlink -f "$hydro_package") ]] || { echo 'Staged Hydro link differs from the installed package.' >&2; exit 66; }
else
    ln -s "$hydro_package" "$root/node_modules/hydrooj"
fi
native_command=$(node "$root/scripts/deployment.cjs" native-command "$root" "$hydro_package" staged)
rm -f -- "$root/native-staged-ok.json"
timeout 150 hydrooj cli execute "$native_command" > "$root/native-staged.log" 2>&1
[[ -f "$root/native-staged-ok.json" ]] || { echo "Native check failed; see $root/native-staged.log" >&2; exit 67; }
[[ "$mode" == install ]] || { echo 'Verified staged addon; production installation was not changed.'; exit 0; }

backup=$(mktemp -d /root/backups/ai-watch-before.XXXXXXXX)
chmod 700 "$backup"
cp -p -- "$addon_list" "$backup/addon.json"
if [[ -d "$destination" ]]; then
    cp -a -- "$destination" "$backup/addon"
    printf '%s\n' present > "$backup/addon-state"
else
    printf '%s\n' absent > "$backup/addon-state"
fi
pm2 jlist | node "$root/scripts/deployment.cjs" processes > "$backup/processes-before.json"
node - "$backup/processes-before.json" <<'JS'
const fs = require('node:fs'); const list = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
if (!list.some(item => item.name === 'hydrooj' && item.status === 'online')) throw new Error('Existing Hydro service is not online');
JS
mutation=0
rollback_on_error() {
    local exit_code=$?
    trap - ERR
    if [[ "$mutation" == 1 ]]; then
        echo "Installation checks failed. Restoring this addon from $backup." >&2
        if ! bash "$root/scripts/rollback.sh" "$backup"; then
            echo "Automatic restore failed. Keep $backup and inspect the service before retrying." >&2
        fi
    fi
    exit "$exit_code"
}
trap rollback_on_error ERR
printf '%s\n' "$backup" > "$root/backup-path.txt"
mutation=1
mkdir -p "$destination/templates" "$destination/public" "$destination/node_modules"
for file in package.json index.ts config.cjs detector.cjs store.cjs engine.cjs http.cjs templates/dfacm_ai_watch.html templates/watch_content.html public/watch.css public/watch.js; do
    cp -- "$root/$file" "$destination/$file"
done
if [[ -e "$destination/node_modules/hydrooj" || -L "$destination/node_modules/hydrooj" ]]; then
    [[ $(readlink -f "$destination/node_modules/hydrooj") == $(readlink -f "$hydro_package") ]]
else
    ln -s "$hydro_package" "$destination/node_modules/hydrooj"
fi
node "$root/scripts/deployment.cjs" verify "$root" "$destination"
timeout 45 hydrooj addon add "$destination" > "$root/registration.log" 2>&1
node "$root/scripts/deployment.cjs" registration "$backup/addon.json" "$addon_list" "$destination"
timeout 45 pm2 restart hydrooj > "$root/restart.log" 2>&1

# Keep each readiness wait short; three successful probes are required.
ready=0
for attempt in {1..50}; do
    if curl -fsS --max-time 3 "$http_origin/login" -o "$root/readiness.html"; then
        ready=$((ready + 1))
        [[ "$ready" -lt 3 ]] || break
    else
        ready=0
    fi
    sleep 2
done
[[ "$ready" -ge 3 ]]
for route in /manage/ai-watch /manage/ai-watch/data /manage/ai-watch/report/000000000000000000000000 /manage/ai-watch/assets/watch-0.1.0.js; do
    code=$(curl -sS --max-time 10 -o /dev/null -w '%{http_code}' "$http_origin$route")
    [[ "$code" == 302 || "$code" == 401 || "$code" == 403 ]]
done
for route in /login /p; do
    code=$(curl -sS --max-time 15 -o /dev/null -w '%{http_code}' "$http_origin$route")
    [[ "$code" == 200 ]]
done
live_command=$(node "$root/scripts/deployment.cjs" live-command "$root" "$hydro_package")
rm -f -- "$root/live-ok.json"
timeout 150 hydrooj cli execute "$live_command" > "$root/live.log" 2>&1
[[ -f "$root/live-ok.json" ]]
pm2 jlist | node "$root/scripts/deployment.cjs" processes > "$backup/processes-after.json"
node "$root/scripts/deployment.cjs" postcheck "$root" "$hydro_package" "$backup/processes-before.json" "$backup/processes-after.json"
node "$root/scripts/deployment.cjs" verify "$root" "$destination"
mutation=0
trap - ERR
echo 'AI watch installed. Open /manage/ai-watch on your OJ as an administrator.'
echo "Rollback backup: $backup"
