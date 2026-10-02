#!/usr/bin/env bash
# Read-only Linux checks: no backup, restart, install, PM2 daemon start or submission.
set -uo pipefail

usage() {
  cat <<'EOF'
Usage: check-deployment.sh [--role all|web|judge] [--data-dir ABSOLUTE_DIR]
                           [--caddy-config ABSOLUTE_FILE] [--url http(s)://HOST]

Defaults: role=all; data-dir=/data; Hydro state=current user's ~/.hydro.
Checks installed package versions without running the hydrooj/hydrojudge CLI,
process presence, disk space, and (on web hosts) Caddy syntax/config adaptation.
role=web checks hydrooj + ~/.hydro/config.json; role=judge checks hydrojudge +
judge.yaml and skips the default /data check; role=all covers both.
Only --url enables HTTP GET checks of / and /home.html. No submissions are made.
Exit: 0=checks passed; 1=one or more failed; 64=invalid arguments.
EOF
}

role=all
data_dir=/data
data_dir_explicit=0
caddy_config=
site_url=
while (($#)); do
  case "$1" in
    --role|--data-dir|--caddy-config|--url)
      (($# >= 2)) || { printf 'Missing value for %s\n' "$1" >&2; exit 64; }
      case "$1" in
        --role) role=$2 ;;
        --data-dir) data_dir=$2; data_dir_explicit=1 ;;
        --caddy-config) caddy_config=$2 ;;
        --url) site_url=${2%/} ;;
      esac
      shift 2 ;;
    --help|-h) usage; exit 0 ;;
    *) printf 'Unknown argument: %s\n' "$1" >&2; exit 64 ;;
  esac
done
[[ $role == all || $role == web || $role == judge ]] || { usage >&2; exit 64; }
[[ $data_dir == /* ]] || { printf 'data-dir must be absolute\n' >&2; exit 64; }
if [[ -n "$site_url" && ( ! $site_url =~ ^https?://[^[:space:]]+$ || $site_url == *'@'* ) ]]; then
  printf 'url must be HTTP(S) and must not contain credentials\n' >&2; exit 64
fi
hydro_home=${HOME:?HOME must identify the Hydro installation owner}/.hydro
if [[ -n ${HYDRO_PROFILE:-} ]]; then hydro_home=$hydro_home/profiles/$HYDRO_PROFILE; fi
if [[ -z "$caddy_config" ]]; then
  if [[ -r "$HOME/.hydro/Caddyfile" ]]; then caddy_config=$HOME/.hydro/Caddyfile
  else caddy_config=/etc/caddy/Caddyfile; fi
fi
[[ $caddy_config == /* ]] || { printf 'caddy-config must be absolute\n' >&2; exit 64; }
failed=0
ok() { printf 'OK   %s\n' "$*"; }
fail() { printf 'FAIL %s\n' "$*" >&2; failed=1; }
required_command() {
  if command -v "$1" >/dev/null; then ok "command: $1"
  else fail "command missing: $1"; return 1; fi
}
package_version() {
  local executable
  executable=$(command -v "$1") || { fail "command missing: $1"; return; }
  # hydrooj --version would start Hydro in v5.0.7. Read package metadata instead.
  if node -e '
    const fs=require("fs"), path=require("path");
    let dir=path.dirname(fs.realpathSync(process.argv[1]));
    for(let i=0;i<6;i++,dir=path.dirname(dir)) {
      const file=path.join(dir,"package.json");
      if(fs.existsSync(file)) {
        const pkg=JSON.parse(fs.readFileSync(file,"utf8"));
        console.log(`${pkg.name}: ${pkg.version}`); process.exit(0);
      }
    }
    process.exit(1);
  ' "$executable"; then ok "package metadata: $1"
  else fail "cannot read package version: $1"; fi
}
process_check() {
  if pgrep -f "$2" >/dev/null 2>&1; then ok "process present: $1"
  else fail "process missing or pgrep failed: $1"; fi
}
disk_check() {
  local used
  if [[ ! -d "$1" ]]; then fail "directory missing: $1"; return; fi
  if ! used=$(df -Pk -- "$1" | awk 'NR==2 {gsub(/%/, "", $5); print $5}'); then
    fail "cannot inspect disk: $1"; return
  fi
  if [[ ! $used =~ ^[0-9]+$ ]]; then fail "unexpected df output: $1"
  elif ((used >= 90)); then fail "disk usage ${used}% (threshold 90%): $1"
  else ok "disk usage ${used}%: $1"; fi
}

printf 'Read-only deployment checks; no services or business data are changed.\n'
if required_command node; then
  if node --version; then ok 'Node version'; else fail 'Node version command failed'; fi
  if [[ $role != judge ]]; then package_version hydrooj; fi
  if [[ $role != web ]]; then package_version hydrojudge; fi
fi
if required_command pgrep; then
  if [[ $role != judge ]]; then
    process_check hydrooj '[h]ydrooj|[h]ydro\.js'
    process_check MongoDB '[m]ongod'
    process_check Caddy '[c]addy'
  fi
  if [[ $role != web ]]; then
    process_check hydrojudge '[h]ydrojudge'
    process_check sandbox '[h]ydro-sandbox|[g]o-judge'
  fi
fi
if [[ $role != judge || $data_dir_explicit -eq 1 ]]; then disk_check "$data_dir"; fi
disk_check "$hydro_home"
if [[ $role != judge ]]; then
  if [[ -r "$hydro_home/config.json" ]]; then ok 'Hydro config.json readable'
  else fail 'Hydro config.json missing or unreadable'; fi
else
  judge_config=
  if [[ -r "$hydro_home/judge.yaml" ]]; then judge_config=$hydro_home/judge.yaml
  elif [[ -r "$HOME/.config/hydro/judge.yaml" ]]; then judge_config=$HOME/.config/hydro/judge.yaml; fi
  if [[ -n "$judge_config" ]]; then ok "hydrojudge config readable: $judge_config"
  else fail 'hydrojudge judge.yaml missing or unreadable'; fi
fi
if [[ $role != judge ]]; then
  if required_command caddy; then
    if caddy version; then ok 'Caddy version'; else fail 'Caddy version command failed'; fi
    if [[ -f "$caddy_config" && -r "$caddy_config" ]]; then
      # Adapt only; validate provisions modules and may create/open files.
      # Suppress the JSON because it may contain secrets from the configuration.
      if caddy adapt --config "$caddy_config" --adapter caddyfile >/dev/null; then ok 'Caddy configuration adapted (syntax check only)'
      else fail 'Caddy configuration adaptation failed'; fi
    else fail 'Caddy config missing or unreadable'; fi
  fi
fi
if [[ -n "$site_url" ]] && required_command curl; then
  for route in / /home.html; do
    headers=
    if headers=$(curl --silent --show-error --max-time 15 --dump-header - --output /dev/null "$site_url$route"); then
      status=$(printf '%s\n' "$headers" | awk '/^HTTP\// {gsub(/\r/, "", $2); code=$2} END {print code}')
      cache=$(printf '%s\n' "$headers" | awk 'tolower($0) ~ /^cache-control:/ {gsub(/\r/, ""); print tolower($0)}')
      if [[ $status != 200 ]]; then fail "GET $route returned ${status:-unknown status}"
      elif [[ $cache != *no-cache* ]]; then fail "GET $route missing no-cache"
      else ok "GET $route: 200, no-cache"; fi
    else fail "GET $route failed"; fi
  done
fi
printf 'Process presence does not prove judge correctness; run the documented manual verdict checks.\n'
exit "$failed"
