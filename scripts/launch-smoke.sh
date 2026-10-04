#!/usr/bin/env bash
set -euo pipefail

BASE="${1:-${NEXT_PUBLIC_APP_URL:-}}"
BASE="${BASE%/}"
if [ -z "$BASE" ]; then
  echo "Usage: npm run launch:smoke -- https://your-production-domain.com" >&2
  exit 2
fi

case "$BASE" in
  https://*) ;;
  *) echo "FAIL  production smoke requires an https:// URL" >&2; exit 1;;
esac

pass=0
fail=0
check_url() {
  local name="$1" path="$2" expected="$3"
  local status
  status=$(curl -sS -o /tmp/lumen-launch-body -w '%{http_code}' --max-time 15 "$BASE$path")
  if [ "$status" = "$expected" ]; then
    echo "PASS  $name ($status)"
    pass=$((pass+1))
  else
    echo "FAIL  $name (expected $expected, got $status)"
    fail=$((fail+1))
  fi
}

check_url "public landing" "/" "200"
check_url "privacy" "/privacy" "200"
check_url "terms" "/terms" "200"
check_url "security" "/security" "200"
check_url "sitemap" "/sitemap.xml" "200"
check_url "robots" "/robots.txt" "200"
check_url "security.txt" "/.well-known/security.txt" "200"

health_status=$(curl -sS -o /tmp/lumen-health-body -w '%{http_code}' --max-time 15 "$BASE/api/health")
health_body=$(cat /tmp/lumen-health-body)
if [ "$health_status" = "200" ] && printf '%s' "$health_body" | grep -q '"status":"healthy"'; then
  echo "PASS  health ($health_status)"
  pass=$((pass+1))
else
  echo "FAIL  health (expected HTTP 200 + healthy status, got $health_status: $(printf '%s' "$health_body" | head -c 180))"
  fail=$((fail+1))
fi

rm -f /tmp/lumen-launch-body /tmp/lumen-health-body

echo "RESULT  pass=$pass fail=$fail"
[ "$fail" -eq 0 ]
