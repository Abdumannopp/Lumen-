#!/usr/bin/env bash
# Public SEO smoke checks. Requires a running LUMEN instance.
set -euo pipefail
BASE="${LUMEN_BASE_URL:-http://localhost:3000}"
pass=0; fail=0
check() {
  if printf '%s' "$3" | grep -qF -- "$2"; then echo "  PASS  $1"; pass=$((pass+1));
  else echo "  FAIL  $1 (expected: $2)"; fail=$((fail+1)); fi
}
for path in / /solutions /industries /solutions/weekly-growth-plan /industries/saas /industries/ecommerce; do
  body=$(curl -fsSL "$BASE$path")
  check "$path returns Lumen content" "Lumen" "$body"
  check "$path has canonical metadata" "canonical" "$body"
  check "$path has JSON-LD" "application/ld+json" "$body"
done
check "/sitemap.xml is discoverable" "<urlset" "$(curl -fsSL "$BASE/sitemap.xml")"
check "/robots.txt points to sitemap" "Sitemap:" "$(curl -fsSL "$BASE/robots.txt")"
check "/robots.txt disallows app" "/overview" "$(curl -fsSL "$BASE/robots.txt")"
check "/robots.txt allows public search pages" "Disallow: /api" "$(curl -fsSL "$BASE/robots.txt")"

echo
printf '===== RESULT: %s passed, %s failed =====\n' "$pass" "$fail"
[ "$fail" -eq 0 ]
