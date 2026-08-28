#!/usr/bin/env bash
# =============================================================================
# verify-browser.sh
# -----------------------------------------------------------------------------
# The audits that need a real browser: the homepage static-vs-hydrated parity
# check and the shared-shell regression. They cannot live in `npm run verify`
# because they need a server, so they get their own entry point rather than
# living as scripts nobody remembers to run -- which is what audit-homepage.py
# was doing while twenty-four "Pending" cells shipped past it.
#
# PORT DISCIPLINE. `vite preview` silently AUTO-INCREMENTS off a busy port, so a
# stale server from an earlier run keeps serving an OLD BUILD while this script
# happily measures the new one and passes. The port is therefore asserted free
# before starting, and the server we start is the one we kill.
# =============================================================================
set -euo pipefail

PORT="${VERIFY_BROWSER_PORT:-4173}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if lsof -ti:"$PORT" >/dev/null 2>&1; then
  echo "verify-browser: port $PORT is already in use." >&2
  echo "  Something else is serving there. If this audit started it, that server is" >&2
  echo "  probably serving an older build, and measuring against it would pass while" >&2
  echo "  testing the wrong bytes. Stop it first: kill \$(lsof -ti:$PORT)" >&2
  exit 1
fi

# A marker only this build has, so a passing audit proves it read THIS build and
# not a cached one served from somewhere else.
MARKER="verify-browser-$$-$(date -u +%s)"
echo "$MARKER" > dist/.build-marker

npx vite preview --port "$PORT" --strictPort >/dev/null 2>&1 &
SERVER_PID=$!
trap 'kill "$SERVER_PID" 2>/dev/null || true; rm -f dist/.build-marker' EXIT

for _ in $(seq 1 60); do
  if curl -sf -o /dev/null "http://127.0.0.1:$PORT/"; then break; fi
  sleep 0.5
done
SERVED="$(curl -sf "http://127.0.0.1:$PORT/.build-marker" || true)"
if [ "$SERVED" != "$MARKER" ]; then
  echo "verify-browser: the server on $PORT is not serving this build" >&2
  echo "  expected marker $MARKER, got '${SERVED:-<nothing>}'" >&2
  exit 1
fi

export HOMEPAGE_AUDIT_ORIGIN="http://127.0.0.1:$PORT"
export PRODUCT_SHELL_AUDIT_ORIGIN="http://127.0.0.1:$PORT"
python3 scripts/audit-homepage.py
python3 scripts/audit-product-shell.py
