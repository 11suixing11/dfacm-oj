#!/usr/bin/env bash
# d&f算法网 anonymous smoke battery. Runs ON THE SERVER by deploy/deploy.sh
# after every restart. Loopback discipline: always curl --resolve (SNI-less
# `curl -k -H Host` against 127.0.0.1 cannot complete TLS and dies with 000).
# Anonymous surface only: no credentials in this script. Count-agnostic —
# never hardcode problem counts that change with every import.
# Exit 0 = all green, 1 = at least one check failed.
set -uo pipefail

HOST="${SMOKE_HOST:-dfacm.website}"
IP="${SMOKE_IP:-127.0.0.1}"
req() { curl -sk --resolve "$HOST:443:$IP" "$@"; }
code() { req -o /dev/null -w '%{http_code}' "$1"; }
hdr() { req -D - -o /dev/null "$1" | tr 'A-Z' 'a-z' | grep -i "$2" >/dev/null; }
fails=0
check() { if [ "$1" -eq 0 ]; then echo "PASS $2"; else echo "FAIL $2"; fails=$((fails+1)); fi; }

# --- pages ---
if [ "$(code "https://$HOST/")" = "200" ]; then check 0 "GET / = 200"; else check 1 "GET / = 200"; fi
req "https://$HOST/" | grep -aF 'dfacm.website' >/dev/null; check $? "landing is the branded facade"
if [ "$(code "https://$HOST/reg")" = "200" ]; then check 0 "GET /reg = 200"; else check 1 "GET /reg = 200"; fi
req "https://$HOST/reg" | grep -aF 'tab-reg' >/dev/null; check $? "auth page renders the branded card"
req "https://$HOST/reg" | grep -aF '__SWPU_BOOT.oauth=[{' >/dev/null; check $? "oauth providers injected (github button)"
req "https://$HOST/reg?tab=pwd" | grep -aF '__SWPU_BOOT.tab="pwd"' >/dev/null; check $? "boot injection: tab=pwd"
req "https://$HOST/reg?embed=1&tab=login" | grep -aF '__SWPU_BOOT.embed=true' >/dev/null; check $? "boot injection: embed flag"
req "https://$HOST/login" | grep -aF '__SWPU_BOOT.tab="pwd"' >/dev/null; check $? "bare /login rewired to the password tab"
req "https://$HOST/register" | grep -aF 'tab-reg' >/dev/null; check $? "bare /register serves the branded page"
if [ "$(code "https://$HOST/p")" = "200" ]; then check 0 "GET /p = 200"; else check 1 "GET /p = 200"; fi
if [ "$(code "https://$HOST/training")" = "200" ]; then check 0 "GET /training = 200"; else check 1 "GET /training = 200"; fi
if [ "$(code "https://$HOST/lostpass")" = "200" ]; then check 0 "GET /lostpass = 200"; else check 1 "GET /lostpass = 200"; fi
if [ "$(code "https://$HOST/user/2")" = "200" ]; then check 0 "user profile renders (regat type regression)"; else check 1 "user profile renders (regat type regression)"; fi

# --- guest gates ---
if [ "$(code "https://$HOST/workbench")" = "302" ]; then check 0 "GET /workbench gated (302)"; else check 1 "GET /workbench gated (302)"; fi
if [ "$(code "https://$HOST/mistakes")" = "302" ]; then check 0 "GET /mistakes gated (302)"; else check 1 "GET /mistakes gated (302)"; fi
if [ "$(code "https://$HOST/shop")" = "200" ]; then check 0 "GET /shop = 200 (points shop, guest-visible)"; else check 1 "GET /shop = 200 (points shop, guest-visible)"; fi
req "https://$HOST/shop" | grep -aF 'data-table' >/dev/null; check $? "shop page renders the badge table"
if [ "$(code "https://$HOST/shop/history")" = "302" ]; then check 0 "GET /shop/history gated (302)"; else check 1 "GET /shop/history gated (302)"; fi
if [ "$(code "https://$HOST/manage/shop")" = "302" ]; then check 0 "GET /manage/shop gated (302)"; else check 1 "GET /manage/shop gated (302)"; fi

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
    if [ "$(req "https://$HOST/$css" | grep -acF 'SWPU ACM brand overlay')" = "2" ]; then check 0 "brand overlay present in served css"; else check 1 "brand overlay present in served css"; fi
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
# The two subsetted fonts are served from custom/ but were never shipped by
# deploy.sh and never asserted here, so a missing or stale subset only showed up
# as invisible fallback type in the browser.
for font in swpu-display.woff2 swpu-mono.woff2; do
    if [ "$(curl -sk --resolve "$HOST:443:$IP" -o /dev/null -w '%{http_code}' "https://$HOST/$font")" = "200" ]; then
        check 0 "$font served"
    else
        check 1 "$font served"
    fi
done
for icon in og-cover.png logo.png; do
    if [ "$(curl -sk --resolve "$HOST:443:$IP" -o /dev/null -w '%{http_code}' "https://$HOST/$icon")" = "200" ]; then
        check 0 "$icon served"
    else
        check 1 "$icon served"
    fi
done
if req -D - -o /dev/null "https://$HOST/__swpu_missing__" | grep -aiq cache-control; then
    check 1 "404 carries no Cache-Control"
else
    check 0 "404 carries no Cache-Control"
fi

# --- protocol and service worker killswitch ---
if [ "$(curl -s --resolve "$HOST:80:$IP" -o /dev/null -w '%{http_code}' "http://$HOST/")" = "308" ]; then check 0 "http redirects 308"; else check 1 "http redirects 308"; fi
req "https://$HOST/service-worker.js" | grep -aF 'unregister' >/dev/null; check $? "service-worker killswitch alive"

if [ "$fails" -gt 0 ]; then
    echo "SMOKE FAILED: $fails check(s)"
    exit 1
fi
echo "SMOKE GREEN: all checks passed"
