#!/usr/bin/env bash
# End-to-end tests for smart agent routing.

BASE=http://localhost:3000
JAR=/tmp/lumen-rt-jar.txt
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
  curl -s -c $JAR -b $JAR -X POST "$BASE/assistant" \
    -H "Next-Action: $1" -H "Content-Type: text/plain;charset=UTF-8" --data-raw "$2"
}

rm -f $JAR
$PSQL "DELETE FROM projects;" > /dev/null
PID=rt-test-1
$PSQL "INSERT INTO projects (id,\"workspaceId\",name,industry,country,\"businessStage\",\"primaryGoal\",\"updatedAt\") VALUES ('$PID','$LUMEN_WORKSPACE_ID','Routing Testbed','saas','US','SCALING','ACQUISITION',now());" > /dev/null
$PSQL "INSERT INTO business_profiles (id,\"projectId\",\"productOrService\",\"businessModel\",\"targetCustomers\",\"lastStep\",\"completedAt\",\"updatedAt\") VALUES ('bp-rt-1','$PID','A harness','SUBSCRIPTION','Teams',6,now(),now());" > /dev/null
lumen_session_start "$JAR"

ID_ROUTE=$(aid routeRequestAction)
ID_RUN=$(aid runRouteAction)

echo "===== 1. THE OPERATOR NEVER PICKS AN AGENT ====="
P=$(curl -s -c $JAR -b $JAR "$BASE/assistant")
check "explains automatic routing" "picks the right specialist" "$P"
check "names the specialists"      "ATLAS"                      "$P"

echo "===== 2. ROUTING DESTINATIONS (spec examples) ====="
OUT=$(call "$ID_ROUTE" "[\"$PID\",\"Create a marketing strategy\"]")
check "strategy routes to ATLAS" '"agent":"ATLAS"' "$OUT"
OUT=$(call "$ID_ROUTE" "[\"$PID\",\"Who are our ideal customers?\"]")
check "customers route to PULSE" '"agent":"PULSE"' "$OUT"
OUT=$(call "$ID_ROUTE" "[\"$PID\",\"Analyze my competitors\"]")
check "competitors route to SCOUT" '"agent":"SCOUT"' "$OUT"
OUT=$(call "$ID_ROUTE" "[\"$PID\",\"Create Instagram content ideas\"]")
check "content routes to MUSE" '"agent":"MUSE"' "$OUT"
OUT=$(call "$ID_ROUTE" "[\"$PID\",\"Plan a launch campaign\"]")
check "campaign routes to ORBIT" '"agent":"ORBIT"' "$OUT"
OUT=$(call "$ID_ROUTE" "[\"$PID\",\"What should we improve next?\"]")
check "improvement routes to ASCEND" '"agent":"ASCEND"' "$OUT"

echo "===== 3. ROUTING DECIDES BUT WRITES NOTHING ====="
checkeq "no strategy created by routing"   "0" "$($PSQL "SELECT count(*) FROM strategies;")"
checkeq "no segments created by routing"   "0" "$($PSQL "SELECT count(*) FROM audience_segments;")"
checkeq "no campaigns created by routing"  "0" "$($PSQL "SELECT count(*) FROM campaigns;")"
checkeq "router runs are logged"           "6" "$($PSQL "SELECT count(*) FROM agent_runs WHERE \"agentType\"='router';")"

echo "===== 4. THE ROUTE DECLARES WHAT IT WOULD CREATE ====="
OUT=$(call "$ID_ROUTE" "[\"$PID\",\"Create a marketing strategy\"]")
check "flags that it writes"   '"writes":true'          "$OUT"
check "names what it creates"  "a new strategy version" "$OUT"
check "gives a reason"         '"reason"'               "$OUT"
check "echoes its understanding" '"understanding"'      "$OUT"

echo "===== 5. QUESTIONS DO NOT WRITE ====="
OUT=$(call "$ID_ROUTE" "[\"$PID\",\"What are my biggest weaknesses?\"]")
check "question routes to ASSISTANT" '"agent":"ASSISTANT"' "$OUT"
check "marked as non-writing"        '"writes":false'      "$OUT"

echo "===== 6. RUNNING EXECUTES FOR REAL ====="
call "$ID_RUN" "[\"$PID\",[\"ATLAS\"],\"Create a marketing strategy\"]" > /dev/null
checkeq "strategy created" "1" "$($PSQL "SELECT count(*) FROM strategies WHERE \"projectId\"='$PID';")"
checkeq "linked to an atlas run" "1" "$($PSQL "SELECT count(*) FROM agent_runs WHERE \"agentType\"='atlas';")"

echo "===== 7. SEQUENTIAL ROUTES RUN IN ORDER ====="
OUT=$(call "$ID_RUN" "[\"$PID\",[\"PULSE\",\"ORBIT\"],\"Plan a launch\"]")
checkeq "audience created"  "2" "$($PSQL "SELECT count(*) FROM audience_segments WHERE \"projectId\"='$PID';")"
checkeq "campaign created"  "1" "$($PSQL "SELECT count(*) FROM campaigns WHERE \"projectId\"='$PID';")"
check   "both steps reported" "PULSE" "$OUT"
check   "second step reported" "ORBIT" "$OUT"

echo "===== 8. A FAILED STEP STOPS THE REST ====="
# SCOUT refuses with no competitors recorded, so MUSE must not run after it.
BEFORE=$($PSQL "SELECT count(*) FROM content_items;")
OUT=$(call "$ID_RUN" "[\"$PID\",[\"SCOUT\",\"MUSE\"],\"Analyze competitors then write posts\"]")
check   "failure reported"    "could not finish" "$OUT"
checkeq "later step skipped"  "$BEFORE" "$($PSQL "SELECT count(*) FROM content_items;")"

echo "===== 9. GUARDS ====="
OUT=$(call "$ID_ROUTE" "[\"$PID\",\" \"]")
check "empty request rejected" "Type a request first" "$OUT"
OUT=$(call "$ID_RUN" "[\"$PID\",[],\"x\"]")
check "empty route rejected" "Nothing to run" "$OUT"
OUT=$(call "$ID_RUN" "[\"$PID\",[\"ATLAS\",\"PULSE\",\"SCOUT\",\"MUSE\",\"ORBIT\"],\"x\"]")
check "over-long route rejected" "too long to run" "$OUT"

echo "===== 10. ISOLATION ====="
OUT=$(call "$ID_ROUTE" "[\"nope-not-a-project\",\"Create a marketing strategy\"]")
check "unknown project rejected" "no longer exists" "$OUT"

$PSQL "DELETE FROM projects WHERE id='$PID';" > /dev/null
checkeq "everything removed with project" "0" "$($PSQL "SELECT count(*) FROM strategies;")"

echo
echo "===== RESULT: $pass passed, $fail failed ====="
[ "$fail" -eq 0 ]
