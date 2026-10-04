#!/usr/bin/env bash
# End-to-end tests for ATLAS (strategy). Mock provider — no key, no cost.

BASE=http://localhost:3000
JAR=/tmp/lumen-st-jar.txt
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

call() { # call <action-id> <json-args>
  curl -s -c $JAR -b $JAR -X POST "$BASE/strategy" \
    -H "Next-Action: $1" -H "Content-Type: text/plain;charset=UTF-8" --data-raw "$2"
}

rm -f $JAR
$PSQL "DELETE FROM projects;" > /dev/null
PID=st-test-1
$PSQL "INSERT INTO projects (id,\"workspaceId\",name,industry,country,\"businessStage\",\"primaryGoal\",\"updatedAt\") VALUES ('$PID','$LUMEN_WORKSPACE_ID','Strategy Testbed','saas','US','SCALING','ACQUISITION',now());" > /dev/null
lumen_session_start "$JAR"

ID_GEN=$(aid generateStrategyAction)
ID_EDIT=$(aid editSectionAction)
ID_REGEN=$(aid regenerateSectionAction)
ID_RESTORE=$(aid restoreVersionAction)

echo "===== 1. GATED ON A COMPLETE PROFILE ====="
P=$(curl -s -c $JAR -b $JAR "$BASE/strategy")
check "refuses to generate on a thin profile" "Finish the business profile first" "$P"
check "explains why"                          "worse than none"                   "$P"
absent "offers no generate button yet"        "Generate strategy"                 "$P"

# Complete the profile.
$PSQL "INSERT INTO business_profiles (id,\"projectId\",\"productOrService\",\"businessModel\",\"targetCustomers\",\"lastStep\",\"completedAt\",\"updatedAt\") VALUES ('bp-st-1','$PID','A test harness','SUBSCRIPTION','Engineering teams',6,now(),now());" > /dev/null

echo "===== 2. EMPTY STATE ONCE UNBLOCKED ====="
P=$(curl -s -c $JAR -b $JAR "$BASE/strategy")
check "shows the spec empty state" "No strategy yet"    "$P"
check "offers generation"          "Generate strategy"  "$P"

echo "===== 3. GENERATION ====="
call "$ID_GEN" "[\"$PID\",null]" > /dev/null
checkeq "strategy created"    "1"  "$($PSQL "SELECT count(*) FROM strategies WHERE \"projectId\"='$PID';")"
checkeq "one version"         "1"  "$($PSQL "SELECT count(*) FROM strategy_versions;")"
checkeq "version numbered 1"  "1"  "$($PSQL "SELECT version FROM strategy_versions LIMIT 1;")"
checkeq "all 14 sections"     "14" "$($PSQL "SELECT jsonb_array_length(sections) FROM strategy_versions LIMIT 1;")"
checkeq "linked to an agent run" "atlas" "$($PSQL "SELECT \"agentType\" FROM agent_runs ORDER BY \"startedAt\" DESC LIMIT 1;")"
checkeq "current pointer set" "1"  "$($PSQL "SELECT count(*) FROM strategies WHERE \"currentVersionId\" IS NOT NULL;")"

P=$(curl -s -c $JAR -b $JAR "$BASE/strategy")
check "renders spec sections: positioning" "Positioning"        "$P"
check "renders: 30-day priorities"         "30-day priorities"  "$P"
check "renders: 90-day roadmap"            "90-day roadmap"     "$P"
check "labels AI-written sections"         "ATLAS"              "$P"
check "surfaces assumptions"               "confirm or correct" "$P"

echo "===== 4. EDITS ARE MARKED AS YOURS ====="
call "$ID_EDIT" "[\"$PID\",\"positioning\",\"Our own words about positioning.\"]" > /dev/null
checkeq "still one version (edit is in place)" "1" "$($PSQL "SELECT count(*) FROM strategy_versions;")"
P=$(curl -s -c $JAR -b $JAR "$BASE/strategy")
check "edited text shown"        "Our own words about positioning." "$P"
check "provenance flipped"       "Yours"                            "$P"

echo "===== 5. EMPTY EDIT REFUSED ====="
OUT=$(call "$ID_EDIT" "[\"$PID\",\"positioning\",\"   \"]")
check "empty section rejected" "cannot be empty" "$OUT"
P=$(curl -s -c $JAR -b $JAR "$BASE/strategy")
check "original text survives" "Our own words about positioning." "$P"

echo "===== 6. AI NEVER OVERWRITES ====="
call "$ID_REGEN" "[\"$PID\",\"targetMarket\",null]" > /dev/null
checkeq "regeneration created a version" "2" "$($PSQL "SELECT count(*) FROM strategy_versions;")"
checkeq "current moved to v2" "2" "$($PSQL "SELECT v.version FROM strategy_versions v JOIN strategies s ON s.\"currentVersionId\"=v.id;")"
# The hand-edited section must survive a regeneration of a different section.
P=$(curl -s -c $JAR -b $JAR "$BASE/strategy")
check "hand-edited section preserved" "Our own words about positioning." "$P"
check "version history appears"       "Version history"                  "$P"

echo "===== 7. FULL REGENERATION KEEPS HISTORY ====="
call "$ID_GEN" "[\"$PID\",null]" > /dev/null
checkeq "third version appended" "3" "$($PSQL "SELECT count(*) FROM strategy_versions;")"
checkeq "nothing deleted"        "3" "$($PSQL "SELECT count(DISTINCT version) FROM strategy_versions;")"

echo "===== 8. RESTORE ====="
V1=$($PSQL "SELECT id FROM strategy_versions WHERE version=1;")
call "$ID_RESTORE" "[\"$PID\",\"$V1\"]" > /dev/null
checkeq "current restored to v1" "1" "$($PSQL "SELECT v.version FROM strategy_versions v JOIN strategies s ON s.\"currentVersionId\"=v.id;")"
checkeq "later versions kept"    "3" "$($PSQL "SELECT count(*) FROM strategy_versions;")"

echo "===== 9. PROJECT ISOLATION AND CASCADE ====="
$PSQL "INSERT INTO projects (id,\"workspaceId\",name,industry,country,\"businessStage\",\"primaryGoal\",\"updatedAt\") VALUES ('st-test-2','$LUMEN_WORKSPACE_ID','Other Co','saas','GB','IDEA','AWARENESS',now());" > /dev/null
OUT=$(call "$ID_RESTORE" "[\"st-test-2\",\"$V1\"]")
check "cannot restore another project's version" "does not exist" "$OUT"
$PSQL "DELETE FROM projects WHERE id='$PID';" > /dev/null
checkeq "strategy removed with project" "0" "$($PSQL "SELECT count(*) FROM strategies;")"
checkeq "versions removed too"          "0" "$($PSQL "SELECT count(*) FROM strategy_versions;")"

echo
echo "===== RESULT: $pass passed, $fail failed ====="
[ "$fail" -eq 0 ]
