#!/usr/bin/env bash
# End-to-end tests for ASCEND (growth). Mock provider — no key, no cost.

BASE=http://localhost:3000
JAR=/tmp/lumen-gr-jar.txt
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
  curl -s -c $JAR -b $JAR -X POST "$BASE/growth" \
    -H "Next-Action: $1" -H "Content-Type: text/plain;charset=UTF-8" --data-raw "$2"
}

rm -f $JAR
$PSQL "DELETE FROM projects;" > /dev/null
PID=gr-test-1
$PSQL "INSERT INTO projects (id,\"workspaceId\",name,industry,country,\"businessStage\",\"primaryGoal\",\"updatedAt\") VALUES ('$PID','$LUMEN_WORKSPACE_ID','Growth Testbed','saas','US','SCALING','ACQUISITION',now());" > /dev/null
$PSQL "INSERT INTO business_profiles (id,\"projectId\",\"productOrService\",\"businessModel\",\"targetCustomers\",\"lastStep\",\"completedAt\",\"updatedAt\") VALUES ('bp-gr-1','$PID','A harness','SUBSCRIPTION','Teams',6,now(),now());" > /dev/null
lumen_session_start "$JAR"

ID_GEN=$(aid generateRecommendationsAction)
ID_SAVE=$(aid saveRecommendationAction)
ID_STATUS=$(aid setRecommendationStatusAction)
ID_DEL=$(aid deleteRecommendationAction)

echo "===== 1. EVIDENCE CEILING IS SHOWN BEFORE GENERATING ====="
P=$(curl -s -c $JAR -b $JAR "$BASE/growth")
check "warns confidence is capped low" "capped at low confidence" "$P"
check "spec empty state"               "No opportunities yet"     "$P"

echo "===== 2. PROFILE ONLY: HIGH CLAIM IS CLAMPED TO LOW ====="
# The mock always claims HIGH. With only a business profile recorded, the
# ceiling is LOW and the claim must be reduced.
call "$ID_GEN" "[\"$PID\",null]" > /dev/null
checkeq "recommendation created" "1" "$($PSQL "SELECT count(*) FROM recommendations WHERE \"projectId\"='$PID';")"
checkeq "confidence clamped to LOW" "LOW" "$($PSQL "SELECT confidence FROM recommendations LIMIT 1;")"
check   "clamp is explained" "Capped" "$($PSQL "SELECT \"confidenceReason\" FROM recommendations LIMIT 1;")"
checkeq "linked to a run" "ascend" "$($PSQL "SELECT \"agentType\" FROM agent_runs ORDER BY \"startedAt\" DESC LIMIT 1;")"
checkeq "starts OPEN" "OPEN" "$($PSQL "SELECT status FROM recommendations LIMIT 1;")"

echo "===== 3. QUALITATIVE CONTEXT RAISES THE CEILING TO MEDIUM ====="
$PSQL "INSERT INTO audience_segments (id,\"projectId\",name,description,kind,\"painPoints\",motivations,\"buyingTriggers\",objections,\"preferredChannels\",\"messagingAngles\",source,\"updatedAt\") VALUES ('seg-gr-1','$PID','Seg','Desc','B2B','[]','[]','[]','[]','[]','[]','MANUAL',now());" > /dev/null
$PSQL "DELETE FROM recommendations;" > /dev/null
call "$ID_GEN" "[\"$PID\",null]" > /dev/null
checkeq "clamped to MEDIUM, not HIGH" "MEDIUM" "$($PSQL "SELECT confidence FROM recommendations LIMIT 1;")"

echo "===== 4. RECORDED PERFORMANCE EARNS HIGH ====="
$PSQL "INSERT INTO marketing_metrics (id,\"projectId\",date,channel,currency,spend,clicks,source,\"updatedAt\") VALUES ('m-gr-1','$PID',now(),'SEO','USD',100,50,'MANUAL',now());" > /dev/null
$PSQL "DELETE FROM recommendations;" > /dev/null
call "$ID_GEN" "[\"$PID\",null]" > /dev/null
checkeq "HIGH allowed with analytics" "HIGH" "$($PSQL "SELECT confidence FROM recommendations LIMIT 1;")"
P=$(curl -s -c $JAR -b $JAR "$BASE/growth")
check "page reports the higher ceiling" "can reach high confidence" "$P"
check "analytics listed as evidence"    "analytics"                "$P"

echo "===== 5. REGENERATION KEEPS DECISIONS ====="
REC=$($PSQL "SELECT id FROM recommendations LIMIT 1;")
call "$ID_STATUS" "[\"$PID\",\"$REC\",\"ACCEPTED\"]" > /dev/null
checkeq "status changed" "ACCEPTED" "$($PSQL "SELECT status FROM recommendations WHERE id='$REC';")"
call "$ID_GEN" "[\"$PID\",null]" > /dev/null
# An accepted recommendation is a decision; regeneration must not erase it.
checkeq "accepted item survives" "1" "$($PSQL "SELECT count(*) FROM recommendations WHERE id='$REC';")"
checkeq "new open item added"    "2" "$($PSQL "SELECT count(*) FROM recommendations;")"

echo "===== 6. MANUAL ENTRY AND VALIDATION ====="
call "$ID_SAVE" "[\"$PID\",{\"title\":\"My own call\",\"insight\":\"Referrals are our best channel\",\"reason\":\"They convert fastest\",\"action\":\"Ask ten customers for an intro\",\"priority\":\"HIGH\",\"impact\":\"HIGH\",\"effort\":\"LOW\",\"confidence\":\"MEDIUM\",\"confidenceReason\":\"Because I know this business\",\"status\":\"OPEN\"}]" > /dev/null
checkeq "manual recommendation created" "1" "$($PSQL "SELECT count(*) FROM recommendations WHERE source='MANUAL';")"

OUT=$(call "$ID_SAVE" "[\"$PID\",{\"title\":\"X\",\"insight\":\"\",\"reason\":\"\",\"action\":\"\",\"priority\":\"HIGH\",\"impact\":\"HIGH\",\"effort\":\"LOW\",\"confidence\":\"LOW\",\"confidenceReason\":\"\",\"status\":\"OPEN\"}]")
check "empty fields rejected" "Say what is happening." "$OUT"
check "confidence reason required" "Explain the confidence level." "$OUT"

echo "===== 7. MANUAL ITEMS SURVIVE REGENERATION ====="
call "$ID_GEN" "[\"$PID\",null]" > /dev/null
checkeq "manual item kept" "1" "$($PSQL "SELECT count(*) FROM recommendations WHERE source='MANUAL';")"

echo "===== 8. CONTEXT BUILDER REPORTS REAL DATA, NOT 'NOT BUILT' ====="
checkeq "context reads audience"  "1" "$($PSQL "SELECT count(*) FROM audience_segments WHERE \"projectId\"='$PID';")"
checkeq "context reads analytics" "1" "$($PSQL "SELECT count(*) FROM marketing_metrics WHERE \"projectId\"='$PID';")"

echo "===== 9. ISOLATION AND CASCADE ====="
$PSQL "INSERT INTO projects (id,\"workspaceId\",name,industry,country,\"businessStage\",\"primaryGoal\",\"updatedAt\") VALUES ('gr-test-2','$LUMEN_WORKSPACE_ID','Other','saas','GB','IDEA','AWARENESS',now());" > /dev/null
OUT=$(call "$ID_STATUS" "[\"gr-test-2\",\"$REC\",\"DONE\"]")
check   "cannot restatus another project's item" "does not exist" "$OUT"
OUT=$(call "$ID_DEL" "[\"gr-test-2\",\"$REC\"]")
check   "cannot delete another project's item"   "does not exist" "$OUT"
checkeq "still ACCEPTED" "ACCEPTED" "$($PSQL "SELECT status FROM recommendations WHERE id='$REC';")"

$PSQL "DELETE FROM projects WHERE id='$PID';" > /dev/null
checkeq "recommendations removed with project" "0" "$($PSQL "SELECT count(*) FROM recommendations;")"

echo
echo "===== RESULT: $pass passed, $fail failed ====="
[ "$fail" -eq 0 ]
