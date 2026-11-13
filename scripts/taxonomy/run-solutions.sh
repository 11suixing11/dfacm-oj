#!/bin/bash
# Usage: run-solutions.sh <versioned-batch.json> [--dry]
set -euo pipefail
[ "$#" -ge 1 ] || { echo 'Usage: run-solutions.sh <versioned-batch.json> [--dry]' >&2; exit 2; }
SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
export DFACM_SOL_BATCH="$1"
shift
export DFACM_SOL_DRY=0
if [ "$#" -gt 0 ]; then
    [ "$#" -eq 1 ] && [ "$1" = '--dry' ] || { echo 'Unknown arguments' >&2; exit 2; }
    export DFACM_SOL_DRY=1
fi
export DFACM_SOL_MODULE="$SCRIPT_DIR/solutions-apply.cjs"
export DFACM_SOL_STATE="${DFACM_SOL_STATE:-$DFACM_SOL_BATCH.state.json}"
export DFACM_SOL_RUN_ID
DFACM_SOL_RUN_ID=$(node -p 'require("node:crypto").randomUUID()')
export DFACM_SOL_RECEIPT="$DFACM_SOL_STATE.receipt.$DFACM_SOL_RUN_ID.json"
# Hydro's cli execute catches expression errors and may exit zero. Only this run's
# durable receipt can authorize success. Never consume a shared sol-ready.json.
cli_status=0
"${HYDRO_CLI:-hydrooj}" cli execute 'await require(process.env.DFACM_SOL_MODULE).cliMain({ ...require("hydrooj"), ObjectId: require("mongodb").ObjectId });' || cli_status=$?
node -e '
const fs=require("node:fs");
let receipt;
try { receipt=JSON.parse(fs.readFileSync(process.env.DFACM_SOL_RECEIPT,"utf8")); }
catch { console.error("Missing current verification receipt; no publication success confirmed"); process.exit(1); }
if(receipt.runId!==process.env.DFACM_SOL_RUN_ID || receipt.ok!==true){console.error("Verification receipt reports incomplete or blocked work:",receipt.error||receipt.result);process.exit(1);}
' || exit 1
exit "$cli_status"
