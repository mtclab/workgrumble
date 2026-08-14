#!/usr/bin/env bash
# box-chunked-e2e.sh - the box e2e runner, one spec per chunk. Lives in the
# repo since 2026-08-15 because its /tmp copy was wiped once and had to be
# reconstructed mid-release. Copy to the box and run from anywhere.
# One spec per chunk, fresh wrangler dev each, whole process GROUP killed
# between chunks (v1 killed only the npx wrapper; the node supervisor
# survived and respawned workerd onto the port).
set -u
PORT=8788
REPO="$HOME/staging/workgrumble"
LOG=/tmp/wg-chunked
mkdir -p "$LOG"
cd "$REPO" || exit 1

node scripts/tokens.mjs seed-fixtures --local || exit 1

port_free() { ! ss -tln 2>/dev/null | grep -q ":$PORT "; }

sweep() {
  # kill anything of ours still attached to the repo, by literal pid
  for pid in $(pgrep -x workerd) $(pgrep -x node) $(pgrep -x npm); do
    cwd=$(readlink "/proc/$pid/cwd" 2>/dev/null)
    case "$cwd" in "$REPO"*) kill -9 "$pid" 2>/dev/null;; esac
  done
}

boot() {
  # refuse to boot onto an occupied port - polling a stale server green is
  # exactly the failure this script exists to prevent
  if ! port_free; then
    sweep; sleep 2
    port_free || { echo "PORT $PORT STILL HELD before $1 - aborting chunk"; return 1; }
  fi
  setsid nohup npx wrangler dev --ip 0.0.0.0 --port "$PORT" \
    --var SIGNING_KEY:any-long-throwaway-string-for-staging \
    --var FEEDBACK_DRY_RUN:true > "$LOG/wrangler-$1.log" 2>&1 < /dev/null &
  WRANGLER_PID=$!
  for _ in $(seq 1 90); do
    # -m 5: a half-crashed workerd can accept TCP and never answer (the 3h45 hang)
    code=$(curl -s -m 5 -o /dev/null -w '%{http_code}' "http://127.0.0.1:$PORT/" || true)
    if [ "$code" != "000" ] && [ -n "$code" ]; then return 0; fi
    sleep 1
  done
  echo "BOOT FAILED for $1 (see $LOG/wrangler-$1.log)"
  return 1
}

put_down() {
  # setsid made WRANGLER_PID a group leader: kill the WHOLE group (npx,
  # node supervisor, workerd), then sweep strays, then wait for the port
  kill -9 -- "-$WRANGLER_PID" 2>/dev/null
  sleep 1
  sweep
  for _ in $(seq 1 15); do port_free && return 0; sleep 1; done
  echo "WARNING: port $PORT still held after put_down"
}

PASS=0; FAIL=0; FAILED_SPECS=""
# Edit this list to subset; the full suite is every spec under e2e/.
for spec in corporate interruptions services total-walk visual-sweep; do
  echo "=== chunk: $spec ==="
  if ! boot "$spec"; then FAIL=$((FAIL+1)); FAILED_SPECS="$FAILED_SPECS $spec(boot)"; continue; fi
  PLAYWRIGHT_BASE_URL="http://127.0.0.1:$PORT" \
    npx playwright test "e2e/$spec.spec.ts" --workers=2 2>&1 | tee "$LOG/$spec.log"
  rc=${PIPESTATUS[0]}
  put_down
  if [ "$rc" -eq 0 ]; then PASS=$((PASS+1)); else FAIL=$((FAIL+1)); FAILED_SPECS="$FAILED_SPECS $spec"; fi
done

echo "==============================================="
echo "chunks green=$PASS red=$FAIL failed:${FAILED_SPECS:- none}"
[ "$FAIL" -eq 0 ]
