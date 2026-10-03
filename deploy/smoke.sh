#!/usr/bin/env bash
# SWPU OJ anonymous smoke battery. Runs ON THE SERVER by deploy/deploy.sh
# after every restart. Loopback discipline: always curl --resolve (SNI-less
# `curl -k -H Host` against 127.0.0.1 cannot complete TLS and dies with 000).
# Anonymous surface only: no credentials in this script. Count-agnostic —
# never hardcode problem counts that change with every import.
# Exit 0 = all green, 1 = at least one check failed.
set -uo pipefail

HOST="${SMOKE_HOST:-swpuacm.xyz}"
IP="${SMOKE_IP:-127.0.0.1}"
req() { curl -sk --resolve "$HOST:443:$IP" "$@"; }
code() { req -o /dev/null -w '%{http_code}' "$1"; }
hdr() { req -D - -o /dev/null "$1" | tr 'A-Z' 'a-z' | grep -i "$2" >/dev/null; }
fails=0
check() { if [ "$1" -eq 0 ]; then echo "PASS $2"; else echo "FAIL $2"; fails=$((fails+1)); fi; }

# --- pages ---
[ "$(code "https://$HOST/")" = "200" ]; check $? "GET / = 200"
req "https://$HOST/" | grep -aF 'swpuacm.xyz' >/dev/null; check $? "landing is the branded facade"
[ "$(code "https://$HOST/reg")" = "200" ]; check $? "GET /reg = 200"
req "https://$HOST/reg" | grep -aF 'tab-reg' >/dev/null; check $? "auth page renders the branded card"
req "https://$HOST/reg" | grep -aF '__SWPU_BOOT.oauth=[{' >/dev/null; check $? "oauth providers injected (github button)"
req "https://$HOST/reg?tab=pwd" | grep -aF '__SWPU_BOOT.tab="pwd"' >/dev/null; check $? "boot injection: tab=pwd"
req "https://$HOST/reg?embed=1&tab=login" | grep -aF '__SWPU_BOOT.embed=true' >/dev/null; check $? "boot injection: embed flag"
req "https://$HOST/login" | grep -aF '__SWPU_BOOT.tab="pwd"' >/dev/null; check $? "bare /login rewired to the password tab"
req "https://$HOST/register" | grep -aF 'tab-reg' >/dev/null; check $? "bare /register serves the branded page"
[ "$(code "https://$HOST/p")" = "200" ]; check $? "GET /p = 200"
[ "$(code "https://$HOST/training")" = "200" ]; check $? "GET /training = 200"
[ "$(code "https://$HOST/lostpass")" = "200" ]; check $? "GET /lostpass = 200"
[ "$(code "https://$HOST/user/2")" = "200" ]; check $? "user profile renders (regat type regression)"

# --- guest gates ---
[ "$(code "https://$HOST/workbench")" = "302" ]; check $? "GET /workbench gated (302)"
[ "$(code "https://$HOST/mistakes")" = "302" ]; check $? "GET /mistakes gated (302)"
[ "$(code "https://$HOST/shop")" = "200" ]; check $? "GET /shop = 200 (points shop, guest-visible)"
req "https://$HOST/shop" | grep -aF 'data-table' >/dev/null; check $? "shop page renders the badge table"
[ "$(code "https://$HOST/shop/history")" = "302" ]; check $? "GET /shop/history gated (302)"
[ "$(code "https://$HOST/manage/shop")" = "302" ]; check $? "GET /manage/shop gated (302)"

# --- regcode POST path (validation-only: no mail sent, no rate consumed) ---
req -X POST -d 'mail=smoke@example.com&purpose=hack' "https://$HOST/reg/code" \
    | grep -a '验证码用途不合法' >/dev/null; check $? "regcode rejects a bad purpose"

# --- security headers ---
hdr "https://$HOST/reg" 'x-frame-options: sameorigin'; check $? "/reg framing SAMEORIGIN"
hdr "https://$HOST/p" 'x-frame-options: deny'; check $? "site framing DENY"
hdr "https://$HOST/" 'strict-transport-security'; check $? "HSTS present"

# --- cache policy ---
hdr "https://$HOST/home.html" 'cache-control: no-cache'; check $? "landing no-cache"
css="$(req "https://$HOST/p" | grep -aoE 'theme-[0-9.]+\.css' | head -1)"
if [ -n "$css" ]; then
    hdr "https://$HOST/$css" 'cache-control: max-age=600'; check $? "theme css max-age=600"
    [ "$(req "https://$HOST/$css" | grep -acF 'SWPU ACM brand overlay')" = "2" ]; check $? "brand overlay present in served css"
else
    check 1 "theme css discoverable from /p"
fi
hjs="$(req "https://$HOST/p" | grep -aoE '/hydro-[0-9.]+\.js' | head -1)"
if [ -n "$hjs" ]; then
    hdr "https://$HOST$hjs" 'cache-control: public, max-age=604800'; check $? "hashed app shell cached 7 days"
else
    check 1 "hydro bundle discoverable from /p"
fi
hdr "https://$HOST/favicon.png" 'cache-control: public, max-age=3600'; check $? "favicon 1h cache"
if req -D - -o /dev/null "https://$HOST/__swpu_missing__" | grep -aiq cache-control; then
    check 1 "404 carries no Cache-Control"
else
    check 0 "404 carries no Cache-Control"
fi

# --- protocol and service worker killswitch ---
[ "$(curl -s --resolve "$HOST:80:$IP" -o /dev/null -w '%{http_code}' "http://$HOST/")" = "308" ]; check $? "http redirects 308"
req "https://$HOST/service-worker.js" | grep -aF 'unregister' >/dev/null; check $? "service-worker killswitch alive"

if [ "$fails" -gt 0 ]; then
    echo "SMOKE FAILED: $fails check(s)"
    exit 1
fi
echo "SMOKE GREEN: all checks passed"
