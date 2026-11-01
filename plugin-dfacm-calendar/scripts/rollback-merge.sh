#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)
backup=${1:?Usage: bash scripts/rollback-merge.sh /root/backups/calendar-ai-merge.XXXXXXXX}
backup=$(realpath -e -- "$backup")
[[ "$backup" =~ ^/root/backups/calendar-ai-merge\.[A-Za-z0-9]{8}$ ]]
node "$root/scripts/merge-deployment.cjs" restore "$backup"
caddy validate --config /root/.hydro/Caddyfile --adapter caddyfile
timeout 45 caddy reload --config /root/.hydro/Caddyfile --adapter caddyfile
timeout 45 pm2 restart hydrooj
for attempt in {1..40}; do
    if curl -fsS --max-time 3 http://127.0.0.1:8888/calendar -o /dev/null; then
        echo "Calendar merge restored from $backup."
        exit 0
    fi
    sleep 2
done
echo 'Files restored; Hydro did not become ready.' >&2
exit 1
