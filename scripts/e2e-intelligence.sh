#!/usr/bin/env bash
# End-to-end tests for SCOUT (market intelligence). Mock provider — no key.

BASE=http://localhost:3000
JAR=/tmp/lumen-in-jar.txt
export DB_PATH="${LUMEN_DB:-prisma/lumen.db}"
PSQL="./scripts/db.sh"
. "$(dirname "$0")/lib/session.sh"

pass=0; fail=0
check() {
  if printf '%s' "$3" | grep -qF -- "$2"; then echo "  PASS  $1"; pass=$((pass+1));
  else echo "  FAIL  $1 (expected: $2)"; fail=$((fail+1)); fi
}
checkeq() {
  if [ "$2" = "$3" ]; then echo "  PASS  $1"; pass=$((pass+1));
  else echo "  FAIL  $1 (expected '$2', got '$3')"; fail=$((fail+1)); fi
}
aid() { node -e "const m=require('$PWD/.next/server/server-reference-manifest.json').node;for(const[k,v]of Object.entries(m))if(v.exportedName==='$1')console.log(k)"; }
call() {
  curl -s -c $JAR -b $JAR -X POST "$BASE/intelligence" \
    -H "Next-Action: $1" -H "Content-Type: text/plain;charset=UTF-8" --data-raw "$2"
}

rm -f $JAR
$PSQL "DELETE FROM projects;" > /dev/null
PID=in-test-1
$PSQL "INSERT INTO projects (id,\"workspaceId\",name,industry,country,\"businessStage\",\"primaryGoal\",\"updatedAt\") VALUES ('$PID','$LUMEN_WORKSPACE_ID','Scout Testbed','saas','US','SCALING','ACQUISITION',now());" > /dev/null
lumen_session_start "$JAR"

ID_SAVE=$(aid saveCompetitorAction)
ID_DELC=$(aid deleteCompetitorAction)
ID_GEN=$(aid generateInsightsAction)
ID_DELI=$(aid deleteInsightAction)

echo "===== 1. EMPTY STATE AND THE NO-INTERNET CONTRACT ====="
P=$(curl -s -c $JAR -b $JAR "$BASE/intelligence")
check "states the limitation up front" "no internet access"        "$P"
check "spec empty state"               "No competitors recorded"   "$P"
check "offers manual entry"            "Add the first competitor"  "$P"

echo "===== 2. SCOUT REFUSES WITH NOTHING TO ANALYSE ====="
OUT=$(call "$ID_GEN" "[\"$PID\",null]")
check   "refuses on an empty set" "Record at least one competitor" "$OUT"
checkeq "no insights invented"    "0" "$($PSQL "SELECT count(*) FROM market_insights;")"
checkeq "no agent run wasted"     "0" "$($PSQL "SELECT count(*) FROM agent_runs WHERE \"agentType\"='scout';")"

echo "===== 3. COMPETITOR ENTRY ====="
call "$ID_SAVE" "[\"$PID\",{\"name\":\"Northwind Analytics\",\"website\":\"northwind.com\",\"description\":\"Dashboards for retail.\",\"strengths\":[\"Strong brand\",\"Cheap entry tier\"],\"weaknesses\":[\"Poor support\"],\"positioning\":\"The affordable option\",\"pricingNotes\":\"From \$19/mo\",\"marketingNotes\":\"Heavy on paid search\"}]" > /dev/null
checkeq "competitor created" "1" "$($PSQL "SELECT count(*) FROM competitors WHERE \"projectId\"='$PID';")"
checkeq "strengths stored"   "2" "$($PSQL "SELECT jsonb_array_length(strengths) FROM competitors LIMIT 1;")"

# A name-only record must not unlock analysis by itself.
call "$ID_SAVE" "[\"$PID\",{\"name\":\"Bare Name Co\",\"strengths\":[],\"weaknesses\":[]}]" > /dev/null
checkeq "name-only competitor allowed" "2" "$($PSQL "SELECT count(*) FROM competitors;")"

P=$(curl -s -c $JAR -b $JAR "$BASE/intelligence")
check "flags a name-only record" "Name only" "$P"

echo "===== 4. VALIDATION ====="
OUT=$(call "$ID_SAVE" "[\"$PID\",{\"name\":\"\",\"strengths\":[],\"weaknesses\":[]}]")
check   "empty name rejected" "Give the competitor a name." "$OUT"
checkeq "nothing written"     "2" "$($PSQL "SELECT count(*) FROM competitors;")"

echo "===== 5. ANALYSIS ====="
call "$ID_GEN" "[\"$PID\",null]" > /dev/null
checkeq "insights created" "2" "$($PSQL "SELECT count(*) FROM market_insights WHERE \"projectId\"='$PID';")"
checkeq "linked to a run"  "scout" "$($PSQL "SELECT \"agentType\" FROM agent_runs ORDER BY \"startedAt\" DESC LIMIT 1;")"
checkeq "kinds preserved"  "1" "$($PSQL "SELECT count(*) FROM market_insights WHERE kind='POSITIONING';")"

echo "===== 6. EVERY INSIGHT CITES ITS FOOTING (spec requirement) ====="
checkeq "no insight without evidence" "0" "$($PSQL "SELECT count(*) FROM market_insights WHERE jsonb_array_length(evidence)=0;")"
P=$(curl -s -c $JAR -b $JAR "$BASE/intelligence")
check "shows what was recorded" "You recorded"   "$P"
check "shows what was inferred" "SCOUT inferred" "$P"
check "shows what is unknown"   "Still unknown"  "$P"
check "groups by kind"          "Competitive gaps" "$P"

echo "===== 7. RE-ANALYSIS REPLACES, DOES NOT DUPLICATE ====="
call "$ID_GEN" "[\"$PID\",null]" > /dev/null
checkeq "still two insights" "2" "$($PSQL "SELECT count(*) FROM market_insights;")"

echo "===== 8. ISOLATION ====="
COMP=$($PSQL "SELECT id FROM competitors LIMIT 1;")
INS=$($PSQL "SELECT id FROM market_insights LIMIT 1;")
$PSQL "INSERT INTO projects (id,\"workspaceId\",name,industry,country,\"businessStage\",\"primaryGoal\",\"updatedAt\") VALUES ('in-test-2','$LUMEN_WORKSPACE_ID','Other Co','saas','GB','IDEA','AWARENESS',now());" > /dev/null
OUT=$(call "$ID_DELC" "[\"in-test-2\",\"$COMP\"]")
check   "cannot delete another project's competitor" "does not exist" "$OUT"
OUT=$(call "$ID_DELI" "[\"in-test-2\",\"$INS\"]")
check   "cannot delete another project's insight"    "does not exist" "$OUT"
checkeq "both survive" "2" "$($PSQL "SELECT count(*) FROM competitors;")"

echo "===== 9. CASCADE ====="
$PSQL "DELETE FROM projects WHERE id='$PID';" > /dev/null
checkeq "competitors removed" "0" "$($PSQL "SELECT count(*) FROM competitors;")"
checkeq "insights removed"    "0" "$($PSQL "SELECT count(*) FROM market_insights;")"

echo
echo "===== RESULT: $pass passed, $fail failed ====="
[ "$fail" -eq 0 ]
