#!/usr/bin/env bash
# End-to-end tests for the content calendar and plan generation.

BASE=http://localhost:3000
JAR=/tmp/lumen-cal-jar.txt
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
  curl -s -c $JAR -b $JAR -X POST "$BASE/content/calendar" \
    -H "Next-Action: $1" -H "Content-Type: text/plain;charset=UTF-8" --data-raw "$2"
}

rm -f $JAR
$PSQL "DELETE FROM projects;" > /dev/null
PID=cal-test-1
$PSQL "INSERT INTO projects (id,\"workspaceId\",name,industry,country,\"businessStage\",\"primaryGoal\",\"updatedAt\") VALUES ('$PID','$LUMEN_WORKSPACE_ID','Calendar Testbed','saas','US','SCALING','ACQUISITION',now());" > /dev/null
$PSQL "INSERT INTO business_profiles (id,\"projectId\",\"productOrService\",\"businessModel\",\"targetCustomers\",\"lastStep\",\"completedAt\",\"updatedAt\") VALUES ('bp-cal-1','$PID','A harness','SUBSCRIPTION','Teams',6,now(),now());" > /dev/null
lumen_session_start "$JAR"

ID_PLAN=$(aid generateContentPlanAction)
ID_SCHED=$(aid setContentScheduleAction)

echo "===== 1. CALENDAR RENDERS ====="
P=$(curl -s -c $JAR -b $JAR "$BASE/content/calendar")
check "page loads"            "Content calendar"          "$P"
check "three views offered"   "month"                     "$P"
check "week view offered"     "week"                      "$P"
check "list view offered"     "list"                      "$P"
check "states no publishing"  "LUMEN does not publish"    "$P"
check "offers plan generation" "Generate a content plan"  "$P"

echo "===== 2. VALIDATION BEFORE ANY AI CALL ====="
OUT=$(call "$ID_PLAN" "[\"$PID\",{\"goal\":\"\",\"from\":\"2026-09-01\",\"to\":\"2026-09-28\",\"platforms\":[\"LINKEDIN\"],\"frequency\":\"THREE_PER_WEEK\"}]")
check "empty goal rejected" "Say what this plan is for" "$OUT"

OUT=$(call "$ID_PLAN" "[\"$PID\",{\"goal\":\"G\",\"from\":\"2026-09-01\",\"to\":\"2026-09-28\",\"platforms\":[],\"frequency\":\"THREE_PER_WEEK\"}]")
check "no platform rejected" "Choose at least one platform" "$OUT"

OUT=$(call "$ID_PLAN" "[\"$PID\",{\"goal\":\"G\",\"from\":\"2026-09-28\",\"to\":\"2026-09-01\",\"platforms\":[\"LINKEDIN\"],\"frequency\":\"THREE_PER_WEEK\"}]")
check "reversed range rejected" "end date is before" "$OUT"

OUT=$(call "$ID_PLAN" "[\"$PID\",{\"goal\":\"G\",\"from\":\"bad\",\"to\":\"worse\",\"platforms\":[\"LINKEDIN\"],\"frequency\":\"WEEKLY\"}]")
check "bad dates rejected" "valid start and end dates" "$OUT"

checkeq "nothing created"  "0" "$($PSQL "SELECT count(*) FROM content_items;")"
checkeq "no AI call wasted" "0" "$($PSQL "SELECT count(*) FROM agent_runs WHERE \"agentType\"='muse.plan';")"

echo "===== 3. PLAN GENERATION ====="
# 2026-09-01 is a Tuesday; four weeks at 3x/week (Mon/Wed/Fri) = 12 slots.
call "$ID_PLAN" "[\"$PID\",{\"goal\":\"Book demos\",\"from\":\"2026-09-01\",\"to\":\"2026-09-28\",\"platforms\":[\"LINKEDIN\"],\"frequency\":\"THREE_PER_WEEK\"}]" > /dev/null
checkeq "items created"        "12" "$($PSQL "SELECT count(*) FROM content_items WHERE \"projectId\"='$PID';")"
checkeq "all land as DRAFT"    "12" "$($PSQL "SELECT count(*) FROM content_items WHERE status='DRAFT';")"
checkeq "all have a date"      "12" "$($PSQL "SELECT count(*) FROM content_items WHERE \"scheduledAt\" IS NOT NULL;")"
checkeq "linked to a run"      "muse.plan" "$($PSQL "SELECT \"agentType\" FROM agent_runs ORDER BY \"startedAt\" DESC LIMIT 1;")"

echo "===== 4. SERVER COMPUTES THE DATES, NOT THE MODEL ====="
checkeq "every date inside the range" "0" "$($PSQL "SELECT count(*) FROM content_items WHERE \"scheduledAt\"::date < '2026-09-01' OR \"scheduledAt\"::date > '2026-09-28';")"
checkeq "no two items share a slot"   "12" "$($PSQL "SELECT count(DISTINCT \"scheduledAt\") FROM content_items;")"
# 3x/week uses Mon/Wed/Fri only — no weekend work is ever scheduled.
checkeq "no weekend dates" "0" "$($PSQL "SELECT count(*) FROM content_items WHERE extract(dow from \"scheduledAt\")::text IN ('0','6');")"

echo "===== 5. RESCHEDULING ====="
ITEM=$($PSQL "SELECT id FROM content_items ORDER BY \"scheduledAt\" LIMIT 1;")
call "$ID_SCHED" "[\"$PID\",\"$ITEM\",\"2026-10-15\"]" > /dev/null
checkeq "date moved" "2026-10-15" "$($PSQL "SELECT to_char(\"scheduledAt\",'YYYY-MM-DD') FROM content_items WHERE id='$ITEM';")"

call "$ID_SCHED" "[\"$PID\",\"$ITEM\",null]" > /dev/null
checkeq "date cleared" "" "$($PSQL "SELECT \"scheduledAt\" FROM content_items WHERE id='$ITEM';")"

OUT=$(call "$ID_SCHED" "[\"$PID\",\"$ITEM\",\"not-a-date\"]")
check "bad date rejected" "Enter a valid date" "$OUT"

echo "===== 6. SCHEDULING AN IDEA PROMOTES IT ====="
$PSQL "INSERT INTO content_items (id,\"projectId\",platform,type,status,objective,source,\"updatedAt\") VALUES ('idea-1','$PID','X','POST','IDEA','A loose idea','MANUAL',now());" > /dev/null
call "$ID_SCHED" "[\"$PID\",\"idea-1\",\"2026-10-20\"]" > /dev/null
checkeq "IDEA became SCHEDULED" "SCHEDULED" "$($PSQL "SELECT status FROM content_items WHERE id='idea-1';")"

echo "===== 7. UNSCHEDULED ITEMS STAY VISIBLE ====="
P=$(curl -s -c $JAR -b $JAR "$BASE/content/calendar")
check "unscheduled tray shown" "Not scheduled" "$P"

echo "===== 8. ISOLATION AND CASCADE ====="
$PSQL "INSERT INTO projects (id,\"workspaceId\",name,industry,country,\"businessStage\",\"primaryGoal\",\"updatedAt\") VALUES ('cal-test-2','$LUMEN_WORKSPACE_ID','Other','saas','GB','IDEA','AWARENESS',now());" > /dev/null
OUT=$(call "$ID_SCHED" "[\"cal-test-2\",\"idea-1\",\"2026-11-01\"]")
check   "cannot reschedule another project's item" "does not exist" "$OUT"
checkeq "date unchanged" "2026-10-20" "$($PSQL "SELECT to_char(\"scheduledAt\",'YYYY-MM-DD') FROM content_items WHERE id='idea-1';")"

$PSQL "DELETE FROM projects WHERE id='$PID';" > /dev/null
checkeq "content removed with project" "0" "$($PSQL "SELECT count(*) FROM content_items;")"

echo
echo "===== RESULT: $pass passed, $fail failed ====="
[ "$fail" -eq 0 ]
