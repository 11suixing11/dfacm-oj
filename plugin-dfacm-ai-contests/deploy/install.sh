#!/usr/bin/env bash
set -euo pipefail

mode="${1:?Usage: install.sh stage ARCHIVE SHA256 | activate RELEASE}"
service_root=/opt/dfacm-ai-contests

case "$mode" in
  stage)
    archive="${2:?Missing archive}"
    expected="${3:?Missing SHA256}"
    printf '%s  %s\n' "$expected" "$archive" | sha256sum --check --status
    release="$service_root/releases/$(date -u +%Y%m%dT%H%M%SZ)-${expected:0:8}"
    install -d -m 0755 "$release"
    tar --extract --gzip --file "$archive" --directory "$release" --no-same-owner
    "$service_root/.venv/bin/python" -m pip install --disable-pip-version-check -r "$release/hub/requirements.lock"
    (
      cd "$release/hub"
      ACH_ENABLE_SCHEDULER=0 PYTHONIOENCODING=utf-8 "$service_root/.venv/bin/python" -m unittest discover -s tests -p 'test_*.py'
    )
    node - "$release/hub/index.ts" <<'JS'
const fs = require('node:fs');
const hydroRequire = require('node:module').createRequire('/usr/local/share/.config/yarn/global/node_modules/hydrooj/package.json');
hydroRequire('esbuild').transformSync(fs.readFileSync(process.argv[2], 'utf8'), { loader: 'ts', format: 'cjs', target: 'node22' });
console.log('Hydro navigation addon TypeScript verified against installed toolchain');
JS
    /usr/bin/python3 "$release/hub/deploy/prepare.py" prepare "$release"
    caddy validate --config "$release/candidates/Caddyfile" --adapter caddyfile
    systemd-analyze verify "$release/hub/deploy/dfacm-ai-contests.service"
    printf 'STAGED_RELEASE=%s\n' "$release"
    ;;
  activate)
    release="$(realpath "${2:?Missing staged release}")"
    case "$release" in
      "$service_root"/releases/*) ;;
      *) echo 'Release is outside the dedicated service directory' >&2; exit 64 ;;
    esac
    test -f "$release/state.json"
    if ! id dfacm-ai >/dev/null 2>&1; then
      useradd --system --user-group --home-dir /var/lib/dfacm-ai-contests --no-create-home --shell /usr/sbin/nologin dfacm-ai
    fi
    install -d -m 0750 -o dfacm-ai -g dfacm-ai /var/lib/dfacm-ai-contests
    if [ ! -f /var/lib/dfacm-ai-contests/competitions.db ]; then
      install -m 0640 -o dfacm-ai -g dfacm-ai "$release/seed/competitions.db" /var/lib/dfacm-ai-contests/competitions.db
    fi
    ln -sfn "$release/hub" "$service_root/current"
    install -m 0644 "$release/hub/deploy/dfacm-ai-contests.service" /etc/systemd/system/dfacm-ai-contests.service
    systemctl daemon-reload
    systemctl enable --now dfacm-ai-contests
    systemctl restart dfacm-ai-contests
    curl --fail --silent --show-error --retry 15 --retry-connrefused --retry-delay 1 http://127.0.0.1:8765/healthz
    printf '\n'
    install -d -m 0755 /root/.hydro/addons/dfacm-ai-contests/node_modules
    install -m 0644 "$release/hub/index.ts" "$release/hub/package.json" /root/.hydro/addons/dfacm-ai-contests/
    ln -sfn /usr/local/share/.config/yarn/global/node_modules/hydrooj /root/.hydro/addons/dfacm-ai-contests/node_modules/hydrooj
    /usr/bin/python3 "$release/hub/deploy/prepare.py" activate "$release"
    if ! caddy reload --config /root/.hydro/Caddyfile --adapter caddyfile; then
      backup="$(/usr/bin/python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["backup"])' "$release/state.json")"
      install -m 0644 "$backup/Caddyfile" /root/.hydro/Caddyfile
      install -m 0644 "$backup/addon.json" /root/.hydro/addon.json
      install -m 0644 "$backup/home.html" /root/.hydro/custom/home.html
      caddy reload --config /root/.hydro/Caddyfile --adapter caddyfile
      echo 'Caddy reload failed; website config and navigation restored' >&2
      exit 67
    fi
    pm2 restart hydrooj
    pm2 save
    printf 'ACTIVATED_RELEASE=%s\n' "$release"
    ;;
  *) echo 'Unknown installation mode' >&2; exit 64 ;;
esac
