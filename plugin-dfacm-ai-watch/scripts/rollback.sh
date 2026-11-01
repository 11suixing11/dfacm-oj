#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
backup=${1:?Usage: bash scripts/rollback.sh /root/backups/ai-watch-before.XXXXXXXX}
backup=$(realpath -e -- "$backup")
destination=/root/.hydro/addons/dfacm-ai-watch
addon_list=/root/.hydro/addon.json
[[ "$backup" =~ ^/root/backups/ai-watch-before\.[A-Za-z0-9]{8}$ ]]
[[ ! -L "$destination" && ! -L "$addon_list" ]]
[[ -f "$backup/addon.json" && -f "$backup/addon-state" ]]
previous=$(cat "$backup/addon-state")
[[ "$previous" == present || "$previous" == absent ]]
if [[ "$previous" == present ]]; then
    [[ -d "$backup/addon" && ! -L "$backup/addon" ]]
fi
# Do not remove registrations added by other work after our installation.
node - "$backup/addon.json" "$addon_list" "$destination" <<'JS'
const fs = require('node:fs'); const assert = require('node:assert/strict');
const [oldFile, currentFile, addon] = process.argv.slice(2);
const old = JSON.parse(fs.readFileSync(oldFile, 'utf8')); const current = JSON.parse(fs.readFileSync(currentFile, 'utf8'));
assert.ok(Array.isArray(old) && Array.isArray(current));
assert.deepEqual(old.filter(item => item !== addon), current.filter(item => item !== addon), 'Other addon registrations changed; restore needs manual review');
JS
if [[ -e "$destination" ]]; then
    failed="$backup/failed-addon-$(date -u +%Y%m%dT%H%M%SZ)"
    [[ ! -e "$failed" ]]
    mv -- "$destination" "$failed"
fi
if [[ "$previous" == present ]]; then
    cp -a -- "$backup/addon" "$destination"
fi
cp -p -- "$backup/addon.json" "$addon_list"
timeout 45 pm2 restart hydrooj
echo "Restored addon files and registration from $backup. Retained audit data and failed files."
