#!/usr/bin/env bash
# Smoke test for a running deployment. Usage: scripts/smoke-test.sh [base-url]
# Default base URL: http://localhost:${PORT:-3000}
set -euo pipefail

BASE_URL="${1:-http://localhost:${PORT:-3000}}"
BASE_URL="${BASE_URL%/}"
failed=0

pass() { echo "PASS: $1"; }
fail() { echo "FAIL: $1" >&2; failed=1; }

echo "Smoke test against ${BASE_URL}"

# Wait up to 30 s for the app to answer.
up=0
for _ in $(seq 1 30); do
  if curl -fs -o /dev/null --max-time 2 "${BASE_URL}/api/health"; then up=1; break; fi
  sleep 1
done
if [ "$up" -ne 1 ]; then
  fail "app did not become reachable within 30 s"
  exit 1
fi

# Check 1: GET /api/health -> 200
status=$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 "${BASE_URL}/api/health" || true)
if [ "$status" = "200" ]; then pass "GET /api/health returned 200"; else fail "GET /api/health returned ${status} (expected 200)"; fi

# Check 2: GET /api/rooms without a session -> 401 with { "error": { "code", "message" } }
body=$(mktemp)
trap 'rm -f "$body"' EXIT
status=$(curl -s -o "$body" -w '%{http_code}' --max-time 5 "${BASE_URL}/api/rooms" || true)
if [ "$status" = "401" ] && grep -q '"error"' "$body" && grep -q '"code"' "$body" && grep -q '"message"' "$body"; then
  pass "GET /api/rooms without a session returned 401 with the standard error shape"
else
  fail "GET /api/rooms without a session returned ${status}: $(head -c 200 "$body") (expected 401 + error shape)"
fi

if [ "$failed" -ne 0 ]; then echo "SMOKE TEST FAILED" >&2; exit 1; fi
echo "SMOKE TEST PASSED"
