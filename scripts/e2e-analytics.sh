#!/usr/bin/env bash
# End-to-end tests for manual analytics. No external API is involved.

BASE=http://localhost:3000
JAR=/tmp/lumen-an-jar.txt
export DB_PATH="${LUMEN_DB:-prisma/lumen.db}"
PSQL="./scripts/db.sh"
. "$(dirname "$0")/lib/session.sh"

pass=0; fail=0
check() {
  if printf '%s' "$3" | grep -qF -- "$2"; then echo "  PASS  $1"; pass=$((pass+1));
  else echo "  FAIL  $1 (expected: $2)"; fail=$((fail+1)); fi
}
absent() {
  if printf '%s' "$3" | grep -qF -- "$2"; then echo "  FAIL  $1 (should NOT contain: $2)"; fail=$((fail+1));
  else echo "  PASS  $1"; pass=$((pass+1)); fi
}
checkeq() {
  if [ "$2" = "$3" ]; then echo "  PASS  $1"; pass=$((pass+1));
  else echo "  FAIL  $1 (expected '$2', got '$3')"; fail=$((fail+1)); fi
}
aid() { node -e "const m=require('$PWD/.next/server/server-reference-manifest.json').node;for(const[k,v]of Object.entries(m))if(v.exportedName==='$1')console.log(k)"; }
call() {
  curl -s -c $JAR -b $JAR -X POST "$BASE/analytics" \
    -H "Next-Action: $1" -H "Content-Type: text/plain;charset=UTF-8" --data-raw "$2"
}

rm -f $JAR
$PSQL "DELETE FROM projects;" > /dev/null
PID=an-test-1
$PSQL "INSERT INTO projects (id,\"workspaceId\",name,industry,country,\"businessStage\",\"primaryGoal\",\"updatedAt\") VALUES ('$PID','$LUMEN_WORKSPACE_ID','Analytics Testbed','saas','US','SCALING','ACQUISITION',now());" > /dev/null
lumen_session_start "$JAR"

ID_SAVE=$(aid saveMetricAction)
ID_DEL=$(aid deleteMetricAction)

echo "===== 1. EMPTY STATE, NO FAKE DATA ====="
P=$(curl -s -c $JAR -b $JAR "$BASE/analytics")
check  "spec empty state"       "No data connected"        "$P"
check  "states no integration"  "connects to no ad platform" "$P"
absent "no invented CTR value"  "2.4%"                     "$P"
absent "no invented spend"      "1,250"                    "$P"

echo "===== 2. VALIDATION ====="
OUT=$(call "$ID_SAVE" "[\"$PID\",{\"date\":\"\",\"channel\":\"SEO\"}]")
check "missing date rejected" "Enter the date" "$OUT"
OUT=$(call "$ID_SAVE" "[\"$PID\",{\"date\":\"not-a-date\",\"channel\":\"SEO\"}]")
check "bad date rejected" "valid date" "$OUT"
OUT=$(call "$ID_SAVE" "[\"$PID\",{\"date\":\"2026-08-10\",\"channel\":\"\"}]")
check "missing channel rejected" "which channel" "$OUT"
# A row with no numbers records nothing and would dilute averages with silence.
OUT=$(call "$ID_SAVE" "[\"$PID\",{\"date\":\"2026-08-10\",\"channel\":\"SEO\"}]")
check "row with no numbers rejected" "at least one number" "$OUT"
checkeq "nothing written" "0" "$($PSQL "SELECT count(*) FROM marketing_metrics;")"

echo "===== 3. MANUAL ENTRY ====="
call "$ID_SAVE" "[\"$PID\",{\"date\":\"2026-08-10\",\"channel\":\"Meta Ads\",\"campaign\":\"Launch\",\"currency\":\"USD\",\"spend\":\"1000\",\"impressions\":\"100000\",\"clicks\":\"2000\",\"leads\":\"100\",\"conversions\":\"50\",\"customers\":\"20\",\"revenue\":\"4000\"}]" > /dev/null
checkeq "row created"     "1" "$($PSQL "SELECT count(*) FROM marketing_metrics WHERE \"projectId\"='$PID';")"
checkeq "marked MANUAL"   "MANUAL" "$($PSQL "SELECT source FROM marketing_metrics LIMIT 1;")"
checkeq "currency stored" "USD" "$($PSQL "SELECT currency FROM marketing_metrics LIMIT 1;")"
# Derived metrics must never be stored — they are computed on read.
checkeq "no derived columns exist" "0" "$($PSQL "SELECT count(*) FROM information_schema.columns WHERE table_name='marketing_metrics' AND column_name IN ('ctr','cpc','cpl','cac','roas');")"

echo "===== 4. DERIVED METRICS ARE CORRECT ====="
P=$(curl -s -c $JAR -b $JAR "$BASE/analytics?from=2026-08-01&to=2026-08-31")
check "CTR = 2000/100000"      "2%"     "$P"
check "CPC = 1000/2000"        "0.5"    "$P"
check "CPL = 1000/100"         "10"     "$P"
check "conversion rate 50/2000" "2.5%"  "$P"
check "CAC = 1000/20"          "50"     "$P"
check "ROAS = 4000/1000"       "4×"     "$P"
check "channel table rendered" "Meta Ads" "$P"
check "campaign table rendered" "Launch"  "$P"
check "funnel rendered"        "Impressions" "$P"

echo "===== 5. DIVISION BY ZERO YIELDS UNKNOWN, NOT ZERO ====="
# Spend recorded but zero clicks: CPC is unknowable, not 0.
$PSQL "DELETE FROM marketing_metrics;" > /dev/null
call "$ID_SAVE" "[\"$PID\",{\"date\":\"2026-08-12\",\"channel\":\"SEO\",\"currency\":\"USD\",\"spend\":\"500\",\"impressions\":\"1000\",\"clicks\":\"0\"}]" > /dev/null
P=$(curl -s -c $JAR -b $JAR "$BASE/analytics?from=2026-08-01&to=2026-08-31")
check "CTR of 0% is a real result" "0%" "$P"

# Assert on the CPC stat specifically. A blanket search for "0.00" would match
# the sparkline's SVG coordinates, which is why this targets the label followed
# by a value carrying the muted "unknown" styling.
# Unknown values render muted; computed ones render in the foreground colour.
# (The muted token used to be faded to 40% opacity, which measured 1.96:1 — a
# dash meaning "we cannot know" is information, so it now uses the full token.)
if printf '%s' "$P" | grep -qE 'CPC</p>[^<]*<p[^>]*text-muted-foreground[^>]*>—'; then
  echo "  PASS  CPC is unknown, not zero"; pass=$((pass+1));
else
  echo "  FAIL  CPC is unknown, not zero"; fail=$((fail+1));
fi

# And the opposite case: CTR genuinely computed, so it must NOT be muted.
if printf '%s' "$P" | grep -qE 'CTR</p>[^<]*<p[^>]*text-muted-foreground[^>]*>—'; then
  echo "  FAIL  computed CTR wrongly shown as unknown"; fail=$((fail+1));
else
  echo "  PASS  computed CTR shown as a real value"; pass=$((pass+1));
fi

echo "===== 6. BLANK IS NOT ZERO ====="
# No revenue recorded at all — ROAS must be unknown rather than 0.
checkeq "revenue stored as null" "" "$($PSQL "SELECT revenue FROM marketing_metrics LIMIT 1;")"
absent "ROAS not shown as zero multiple" "0×" "$P"

echo "===== 7. MIXED CURRENCIES ARE NOT TOTALLED ====="
call "$ID_SAVE" "[\"$PID\",{\"date\":\"2026-08-13\",\"channel\":\"Email\",\"currency\":\"EUR\",\"spend\":\"300\",\"clicks\":\"100\"}]" > /dev/null
P=$(curl -s -c $JAR -b $JAR "$BASE/analytics?from=2026-08-01&to=2026-08-31")
check "warns about mixed currency" "more than one currency" "$P"

echo "===== 8. DATE RANGE FILTERING ====="
P=$(curl -s -c $JAR -b $JAR "$BASE/analytics?from=2026-01-01&to=2026-01-31")
check "range with no rows explained" "none in this date range" "$P"
# A reversed range is a typo, not an intent — it is swapped, not emptied.
P=$(curl -s -c $JAR -b $JAR "$BASE/analytics?from=2026-08-31&to=2026-08-01")
check "reversed range still returns data" "SEO" "$P"

echo "===== 9. EDIT AND DELETE ====="
MID=$($PSQL "SELECT id FROM marketing_metrics WHERE channel='SEO';")
call "$ID_SAVE" "[\"$PID\",{\"metricId\":\"$MID\",\"date\":\"2026-08-12\",\"channel\":\"SEO\",\"currency\":\"USD\",\"spend\":\"600\",\"clicks\":\"200\"}]" > /dev/null
checkeq "row updated" "600" "$($PSQL "SELECT spend FROM marketing_metrics WHERE id='$MID';")"

echo "===== 10. ISOLATION AND CASCADE ====="
$PSQL "INSERT INTO projects (id,\"workspaceId\",name,industry,country,\"businessStage\",\"primaryGoal\",\"updatedAt\") VALUES ('an-test-2','$LUMEN_WORKSPACE_ID','Other','saas','GB','IDEA','AWARENESS',now());" > /dev/null
OUT=$(call "$ID_DEL" "[\"an-test-2\",\"$MID\"]")
check   "cannot delete another project's row" "does not exist" "$OUT"
checkeq "row survives" "1" "$($PSQL "SELECT count(*) FROM marketing_metrics WHERE id='$MID';")"

$PSQL "DELETE FROM projects WHERE id='$PID';" > /dev/null
checkeq "metrics removed with project" "0" "$($PSQL "SELECT count(*) FROM marketing_metrics;")"

echo
echo "===== RESULT: $pass passed, $fail failed ====="
[ "$fail" -eq 0 ]
