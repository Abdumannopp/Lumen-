#!/usr/bin/env bash
# End-to-end tests for PULSE (audience). Mock provider — no key, no cost.

BASE=http://localhost:3000
JAR=/tmp/lumen-au-jar.txt
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
  curl -s -c $JAR -b $JAR -X POST "$BASE/audience" \
    -H "Next-Action: $1" -H "Content-Type: text/plain;charset=UTF-8" --data-raw "$2"
}

rm -f $JAR
$PSQL "DELETE FROM projects;" > /dev/null
PID=au-test-1
$PSQL "INSERT INTO projects (id,\"workspaceId\",name,industry,country,\"businessStage\",\"primaryGoal\",\"updatedAt\") VALUES ('$PID','$LUMEN_WORKSPACE_ID','Audience Testbed','saas','US','SCALING','ACQUISITION',now());" > /dev/null
lumen_session_start "$JAR"

ID_GEN=$(aid generateAudienceAction)
ID_DEL=$(aid deleteSegmentAction)
ID_SAVE=$(aid saveSegmentAction)

echo "===== 1. GATED ON A COMPLETE PROFILE ====="
P=$(curl -s -c $JAR -b $JAR "$BASE/audience")
check "blocks generation on a thin profile" "Finish the business profile first" "$P"
check "still allows manual entry"           "Add segment"                       "$P"

$PSQL "INSERT INTO business_profiles (id,\"projectId\",\"productOrService\",\"businessModel\",\"targetCustomers\",\"lastStep\",\"completedAt\",\"updatedAt\") VALUES ('bp-au-1','$PID','A test harness','SUBSCRIPTION','Engineering teams',6,now(),now());" > /dev/null

echo "===== 2. EMPTY STATE ====="
P=$(curl -s -c $JAR -b $JAR "$BASE/audience")
check "spec empty state" "No audience defined"  "$P"
check "offers generation" "Generate audience"   "$P"

echo "===== 3. GENERATION BUILDS THE FULL MODEL ====="
call "$ID_GEN" "[\"$PID\",null]" > /dev/null
checkeq "segments created"  "2" "$($PSQL "SELECT count(*) FROM audience_segments WHERE \"projectId\"='$PID';")"
checkeq "icp per segment"   "2" "$($PSQL "SELECT count(*) FROM icps;")"
checkeq "personas created"  "2" "$($PSQL "SELECT count(*) FROM personas;")"
checkeq "marked AI-sourced" "2" "$($PSQL "SELECT count(*) FROM audience_segments WHERE source='AI';")"
checkeq "linked to a run"   "pulse" "$($PSQL "SELECT \"agentType\" FROM agent_runs ORDER BY \"startedAt\" DESC LIMIT 1;")"
checkeq "evidence recorded" "2" "$($PSQL "SELECT count(*) FROM audience_segments WHERE \"evidenceNote\" IS NOT NULL;")"

P=$(curl -s -c $JAR -b $JAR "$BASE/audience")
check "renders segment"        "Mock segment A"  "$P"
check "labels PULSE output"    "PULSE"           "$P"
check "shows evidence basis"   "Basis:"          "$P"
check "offers comparison"      "Compare segments" "$P"

echo "===== 4. INFERRED FACTS ARE LABELLED (spec: no invented demographics) ====="
checkeq "attribute carries a basis" "inferred" "$($PSQL "SELECT attributes->0->>'basis' FROM icps WHERE jsonb_array_length(attributes) > 0 LIMIT 1;")"

echo "===== 5. MANUAL SEGMENTS ====="
# The editor lives in a dialog, so it is a controlled client form; the action
# takes a typed object and is called directly, exactly as the UI calls it.
call "$ID_SAVE" "[\"$PID\",{\"name\":\"Hand written segment\",\"description\":\"Written by the operator.\",\"kind\":\"B2B\",\"painPoints\":[\"First pain\",\"Second pain\"],\"motivations\":[],\"buyingTriggers\":[],\"objections\":[],\"preferredChannels\":[],\"messagingAngles\":[]}]" > /dev/null
checkeq "manual segment created" "1" "$($PSQL "SELECT count(*) FROM audience_segments WHERE source='MANUAL';")"
checkeq "list stored"            "2" "$($PSQL "SELECT jsonb_array_length(\"painPoints\") FROM audience_segments WHERE source='MANUAL';")"
checkeq "manual icp created"     "3" "$($PSQL "SELECT count(*) FROM icps;")"

echo "===== 6. VALIDATION ====="
OUT=$(call "$ID_SAVE" "[\"$PID\",{\"name\":\"X\",\"description\":\"\",\"kind\":\"B2B\",\"painPoints\":[],\"motivations\":[],\"buyingTriggers\":[],\"objections\":[],\"preferredChannels\":[],\"messagingAngles\":[]}]")
check   "short name rejected"   "Give the segment a name." "$OUT"
check   "empty description too" "Describe who this segment is." "$OUT"
checkeq "nothing written"       "3" "$($PSQL "SELECT count(*) FROM audience_segments;")"

echo "===== 6b. EDITING ADOPTS A PULSE SEGMENT ====="
AISEG=$($PSQL "SELECT id FROM audience_segments WHERE source='AI' LIMIT 1;")
call "$ID_SAVE" "[\"$PID\",{\"segmentId\":\"$AISEG\",\"name\":\"Adopted segment\",\"description\":\"Now edited by hand.\",\"kind\":\"B2B\",\"painPoints\":[],\"motivations\":[],\"buyingTriggers\":[],\"objections\":[],\"preferredChannels\":[],\"messagingAngles\":[]}]" > /dev/null
checkeq "source flipped to EDITED" "EDITED" "$($PSQL "SELECT source FROM audience_segments WHERE id='$AISEG';")"

echo "===== 7. REGENERATION PROTECTS HUMAN WORK ====="
call "$ID_GEN" "[\"$PID\",null]" > /dev/null
checkeq "manual segment survived" "1" "$($PSQL "SELECT count(*) FROM audience_segments WHERE source='MANUAL';")"
# The adopted segment must also survive — that is the whole point of EDITED.
checkeq "adopted segment survived" "1" "$($PSQL "SELECT count(*) FROM audience_segments WHERE source='EDITED';")"
checkeq "AI segments replaced not duplicated" "2" "$($PSQL "SELECT count(*) FROM audience_segments WHERE source='AI';")"
checkeq "total is stable" "4" "$($PSQL "SELECT count(*) FROM audience_segments;")"

echo "===== 8. DELETE AND ISOLATION ====="
SEG=$($PSQL "SELECT id FROM audience_segments WHERE source='MANUAL';")
$PSQL "INSERT INTO projects (id,\"workspaceId\",name,industry,country,\"businessStage\",\"primaryGoal\",\"updatedAt\") VALUES ('au-test-2','$LUMEN_WORKSPACE_ID','Other Co','saas','GB','IDEA','AWARENESS',now());" > /dev/null
OUT=$(call "$ID_DEL" "[\"au-test-2\",\"$SEG\"]")
check   "cannot delete another project's segment" "does not exist" "$OUT"
checkeq "segment still there" "1" "$($PSQL "SELECT count(*) FROM audience_segments WHERE id='$SEG';")"

call "$ID_DEL" "[\"$PID\",\"$SEG\"]" > /dev/null
checkeq "own segment deleted" "0" "$($PSQL "SELECT count(*) FROM audience_segments WHERE id='$SEG';")"

echo "===== 9. CASCADE ====="
$PSQL "DELETE FROM projects WHERE id='$PID';" > /dev/null
checkeq "segments removed" "0" "$($PSQL "SELECT count(*) FROM audience_segments;")"
checkeq "icps removed"     "0" "$($PSQL "SELECT count(*) FROM icps;")"
checkeq "personas removed" "0" "$($PSQL "SELECT count(*) FROM personas;")"

echo
echo "===== RESULT: $pass passed, $fail failed ====="
[ "$fail" -eq 0 ]
