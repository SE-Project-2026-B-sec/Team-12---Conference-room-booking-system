#!/usr/bin/env bash
# Smoke test for a running deployment. Usage: scripts/smoke-test.sh [base-url]
# Default base URL: http://localhost:${PORT:-3000}
# Optional third check: SEED_CHECK=1 signs in as the seeded demo user (SEED_USER_EMAIL / SEED_USER_PASSWORD
# override the defaults from server/prisma/seed.ts) and expects GET /api/rooms to return 200.
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

# Check 3 (only with SEED_CHECK=1): sign in as the seeded demo user, then GET /api/rooms -> 200.
# Login does not need a CSRF token (only authenticated state-changing requests do).
if [ "${SEED_CHECK:-0}" = "1" ]; then
  jar=$(mktemp)
  trap 'rm -f "$body" "$jar"' EXIT
  email="${SEED_USER_EMAIL:-demo.user@example.com}"
  password="${SEED_USER_PASSWORD:-User123!@#}"
  login=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 -c "$jar" -X POST "${BASE_URL}/api/auth/login" \
    -H 'Content-Type: application/json' \
    --data "$(printf '{"email":"%s","password":"%s"}' "$email" "$password")" || true)
  status=$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 -b "$jar" "${BASE_URL}/api/rooms" || true)
  if [ "$login" = "200" ] && [ "$status" = "200" ]; then
    pass "seeded user sign-in returned 200 and GET /api/rooms returned 200"
  else
    fail "seeded user sign-in returned ${login}, GET /api/rooms returned ${status} (expected 200 and 200)"
  fi
fi

if [ "$failed" -ne 0 ]; then echo "SMOKE TEST FAILED" >&2; exit 1; fi
echo "SMOKE TEST PASSED"
