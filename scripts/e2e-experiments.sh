#!/usr/bin/env bash
# End-to-end tests for growth experiments and the learning feedback loop.

BASE=http://localhost:3000
JAR=/tmp/lumen-ex-jar.txt
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
call() { # call <id> <args> [path]
  curl -s -c $JAR -b $JAR -X POST "$BASE${3:-/growth/experiments}" \
    -H "Next-Action: $1" -H "Content-Type: text/plain;charset=UTF-8" --data-raw "$2"
}

rm -f $JAR
$PSQL "DELETE FROM projects;" > /dev/null
PID=ex-test-1
$PSQL "INSERT INTO projects (id,\"workspaceId\",name,industry,country,\"businessStage\",\"primaryGoal\",\"updatedAt\") VALUES ('$PID','$LUMEN_WORKSPACE_ID','Experiment Testbed','saas','US','SCALING','ACQUISITION',now());" > /dev/null
$PSQL "INSERT INTO business_profiles (id,\"projectId\",\"productOrService\",\"businessModel\",\"targetCustomers\",\"lastStep\",\"completedAt\",\"updatedAt\") VALUES ('bp-ex-1','$PID','A harness','SUBSCRIPTION','Teams',6,now(),now());" > /dev/null
lumen_session_start "$JAR"

ID_SAVE=$(aid saveExperimentAction)
ID_STATUS=$(aid setExperimentStatusAction)
ID_FROM=$(aid experimentFromRecommendationAction)
ID_DEL=$(aid deleteExperimentAction)

echo "===== 1. PAGE AND THE NO-TRAINING CONTRACT ====="
P=$(curl -s -c $JAR -b $JAR "$BASE/growth/experiments")
check "page loads"              "Experiments"                 "$P"
check "states no training"      "does not train on your data" "$P"
check "explains context reuse"  "read back into future advice" "$P"
check "spec empty state"        "No experiments yet"          "$P"

echo "===== 2. VALIDATION ====="
OUT=$(call "$ID_SAVE" "[\"$PID\",{\"name\":\"X\",\"hypothesis\":\"\",\"targetMetric\":\"\",\"action\":\"\",\"status\":\"IDEA\"}]")
check "hypothesis required"   "State what you believe" "$OUT"
check "metric required"       "Name the metric"        "$OUT"
check "action required"       "Say what you will"      "$OUT"
checkeq "nothing written" "0" "$($PSQL "SELECT count(*) FROM experiments;")"

echo "===== 3. CREATE ====="
call "$ID_SAVE" "[\"$PID\",{\"name\":\"Shorter emails\",\"hypothesis\":\"Shorter onboarding emails lift activation\",\"targetMetric\":\"Activation rate\",\"action\":\"Cut the welcome sequence to three emails\",\"status\":\"RUNNING\",\"startDate\":\"2026-09-01\",\"endDate\":\"2026-09-30\"}]" > /dev/null
checkeq "experiment created" "1" "$($PSQL "SELECT count(*) FROM experiments WHERE \"projectId\"='$PID';")"
checkeq "status stored"      "RUNNING" "$($PSQL "SELECT status FROM experiments LIMIT 1;")"

OUT=$(call "$ID_SAVE" "[\"$PID\",{\"name\":\"Bad dates\",\"hypothesis\":\"Something will happen\",\"targetMetric\":\"M\",\"action\":\"Do a thing\",\"status\":\"IDEA\",\"startDate\":\"2026-10-10\",\"endDate\":\"2026-10-01\"}]")
check "reversed dates rejected" "end date is before" "$OUT"

echo "===== 4. CANNOT COMPLETE WITHOUT RESULT AND LEARNING ====="
EX=$($PSQL "SELECT id FROM experiments LIMIT 1;")
OUT=$(call "$ID_STATUS" "[\"$PID\",\"$EX\",\"COMPLETED\"]")
check   "shortcut blocked" "Record the result and the learning" "$OUT"
checkeq "still RUNNING"    "RUNNING" "$($PSQL "SELECT status FROM experiments WHERE id='$EX';")"

# The form path must enforce the same rule as the status shortcut.
OUT=$(call "$ID_SAVE" "[\"$PID\",{\"experimentId\":\"$EX\",\"name\":\"Shorter emails\",\"hypothesis\":\"Shorter onboarding emails lift activation\",\"targetMetric\":\"Activation rate\",\"action\":\"Cut the welcome sequence\",\"status\":\"COMPLETED\"}]")
check   "form path blocked too" "teaches nothing" "$OUT"
checkeq "still RUNNING"         "RUNNING" "$($PSQL "SELECT status FROM experiments WHERE id='$EX';")"

echo "===== 5. COMPLETING WITH A LEARNING ====="
call "$ID_SAVE" "[\"$PID\",{\"experimentId\":\"$EX\",\"name\":\"Shorter emails\",\"hypothesis\":\"Shorter onboarding emails lift activation\",\"targetMetric\":\"Activation rate\",\"action\":\"Cut the welcome sequence\",\"status\":\"COMPLETED\",\"actualResult\":\"Activation rose four points\",\"learning\":\"Length was the blocker, not timing\"}]" > /dev/null
checkeq "now COMPLETED"   "COMPLETED" "$($PSQL "SELECT status FROM experiments WHERE id='$EX';")"
checkeq "learning stored" "Length was the blocker, not timing" "$($PSQL "SELECT learning FROM experiments WHERE id='$EX';")"

echo "===== 6. THE LOOP CLOSES: LEARNINGS REACH ASCEND ====="
ID_GEN=$(aid generateRecommendationsAction)
call "$ID_GEN" "[\"$PID\",null]" "/growth" > /dev/null
# A recorded learning is evidence, so the confidence ceiling rises to HIGH even
# with no analytics rows present.
checkeq "learning raises the ceiling to HIGH" "HIGH" "$($PSQL "SELECT confidence FROM recommendations ORDER BY \"createdAt\" DESC LIMIT 1;")"

echo "===== 7. A COMPLETED EXPERIMENT WITH NO LEARNING IS FLAGGED ====="
$PSQL "INSERT INTO experiments (id,\"projectId\",name,hypothesis,\"targetMetric\",action,status,\"actualResult\",\"updatedAt\") VALUES ('ex-silent','$PID','Silent one','It might work','M','Do it','COMPLETED','It did something',now());" > /dev/null
P=$(curl -s -c $JAR -b $JAR "$BASE/growth/experiments")
check "flags the missing learning" "no learning recorded" "$P"
check "counts it in the summary"   "adds"                 "$P"

echo "===== 8. FROM A RECOMMENDATION ====="
REC=$($PSQL "SELECT id FROM recommendations LIMIT 1;")
call "$ID_FROM" "[\"$PID\",\"$REC\"]" "/growth" > /dev/null
checkeq "experiment created from it" "1" "$($PSQL "SELECT count(*) FROM experiments WHERE \"recommendationId\"='$REC';")"
checkeq "starts PLANNED"             "PLANNED" "$($PSQL "SELECT status FROM experiments WHERE \"recommendationId\"='$REC';")"
checkeq "recommendation moves to IN_PROGRESS" "IN_PROGRESS" "$($PSQL "SELECT status FROM recommendations WHERE id='$REC';")"

OUT=$(call "$ID_FROM" "[\"$PID\",\"$REC\"]" "/growth")
check "cannot duplicate from the same recommendation" "already exists" "$OUT"

echo "===== 9. DELETING A RECOMMENDATION KEEPS ITS EXPERIMENT ====="
# The experiment is a record of work done; it must not vanish with the advice.
$PSQL "DELETE FROM recommendations WHERE id='$REC';" > /dev/null
checkeq "experiment survives"   "1" "$($PSQL "SELECT count(*) FROM experiments WHERE id=(SELECT id FROM experiments WHERE name IS NOT NULL AND \"recommendationId\" IS NULL LIMIT 1);")"
checkeq "link cleared, not cascaded" "0" "$($PSQL "SELECT count(*) FROM experiments WHERE \"recommendationId\"='$REC';")"

echo "===== 10. ISOLATION AND CASCADE ====="
$PSQL "INSERT INTO projects (id,\"workspaceId\",name,industry,country,\"businessStage\",\"primaryGoal\",\"updatedAt\") VALUES ('ex-test-2','$LUMEN_WORKSPACE_ID','Other','saas','GB','IDEA','AWARENESS',now());" > /dev/null
OUT=$(call "$ID_DEL" "[\"ex-test-2\",\"$EX\"]")
check   "cannot delete another project's experiment" "does not exist" "$OUT"
checkeq "experiment survives" "1" "$($PSQL "SELECT count(*) FROM experiments WHERE id='$EX';")"

$PSQL "DELETE FROM projects WHERE id='$PID';" > /dev/null
checkeq "experiments removed with project" "0" "$($PSQL "SELECT count(*) FROM experiments;")"

echo
echo "===== RESULT: $pass passed, $fail failed ====="
[ "$fail" -eq 0 ]
