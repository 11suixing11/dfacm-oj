#!/bin/bash
# Usage: run-solutions.sh <batchFile> [--dry]
# 1) verify solutions by judge submission, 2) insert via SolutionModel (cli), 3) checks
export PATH="/root/.nix-profile/bin:/usr/local/bin:/usr/bin:/bin"
export NODE_PATH=/usr/local/share/.config/yarn/global/node_modules
BATCH="$1"; shift || true
node /root/solutions-apply.cjs "$BATCH" "$@"
[ -f /root/sol-ready.json ] || exit 0
printf 'disable: true\n' > /root/judge-off.yaml
N=$(node -pe 'JSON.parse(require("fs").readFileSync("/root/sol-ready.json","utf8")).length')
[ "$N" -gt 0 ] || { echo "nothing to insert"; exit 0; }
OVERRIDE_CONFIG=/root/judge-off.yaml hydrooj cli execute 'const fs=require("fs"); const rs=JSON.parse(fs.readFileSync("/root/sol-ready.json","utf8")); let n=0; for (const r of rs) { await SolutionModel.add("system", r.pid, 1, r.content); n++; if (n%10===0) console.log("inserted", n); } console.log("INSERTED", n);' 2>&1 | grep -E "inserted|INSERTED"
rm -f /root/sol-ready.json
