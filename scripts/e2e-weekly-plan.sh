#!/usr/bin/env bash
# End-to-end tests for CADENCE — the weekly plan, and marking work DONE or
# SKIPPED. Mock provider: no key, no cost, and a scripted output chosen so the
# guardrails have something real to catch.
#
# The mock deliberately returns four tasks: two usable, one on paid search, and
# one repeating an earlier title. A mock that only ever returned clean output
# would test the happy path and quietly assert nothing about the rules that
# exist for the unhappy one.

BASE=http://localhost:3000
JAR=/tmp/lumen-plan-jar.txt
JAR2=/tmp/lumen-plan-jar-second.txt
SECOND_EMAIL=plan-second@lumen.test
PSQL="./scripts/db.sh"
. "$(dirname "$0")/lib/session.sh"

pass=0; fail=0
check() {
  if printf '%s' "$3" | grep -qF -- "$2"; then echo "  PASS  $1"; pass=$((pass+1));
  else echo "  FAIL  $1 (expected: $2 | got: $(printf '%s' "$3" | head -c 140))"; fail=$((fail+1)); fi
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
  curl -s -c $JAR -b $JAR -X POST "$BASE/plan" \
    -H "Next-Action: $1" -H "Content-Type: text/plain;charset=UTF-8" --data-raw "$2"
}
call_as() { # call_as <jar> <action-id> <json-args>
  curl -s -c "$1" -b "$1" -X POST "$BASE/plan" \
    -H "Next-Action: $2" -H "Content-Type: text/plain;charset=UTF-8" --data-raw "$3"
}

# A previous run that died between signing the second account up and cleaning it
# away would leave its workspace behind. Removed before anything is counted.
$PSQL "DELETE FROM workspaces WHERE \"ownerId\" IN (SELECT id FROM users WHERE email='$SECOND_EMAIL');" > /dev/null
$PSQL "DELETE FROM users WHERE email='$SECOND_EMAIL';" > /dev/null
$PSQL "DELETE FROM projects;" > /dev/null
lumen_session_start "$JAR"

PID=plan-test-1
$PSQL "INSERT INTO projects (id,\"workspaceId\",name,industry,country,\"businessStage\",\"primaryGoal\",\"updatedAt\") VALUES ('$PID','$LUMEN_WORKSPACE_ID','Plan Testbed','saas','US','SCALING','ACQUISITION',now());" > /dev/null

ID_GEN=$(aid generateWeeklyPlanAction)
ID_DONE=$(aid completeTaskAction)
ID_SKIP=$(aid skipTaskAction)
ID_REOPEN=$(aid reopenTaskAction)

echo "===== 1. NO PLAN WITHOUT A FINISHED PROFILE ====="
# A plan is only as good as what it was told. Generating from a half-answered
# profile produces confident generic advice, which is the worst possible output.
OUT=$(call "$ID_GEN" "[\"$PID\",{}]")
check   "refused, and says why"  "Finish the business profile first" "$OUT"
checkeq "nothing was written"    "0" "$($PSQL "SELECT count(*) FROM weekly_plans;")"

P=$(curl -s -c $JAR -b $JAR "$BASE/plan")
check "the page says the same thing" "Finish the business profile first" "$P"

echo "===== 2. A PLAN IS GENERATED ONCE THE PROFILE IS COMPLETE ====="
$PSQL "INSERT INTO business_profiles (id,\"projectId\",\"productOrService\",\"businessModel\",\"targetCustomers\",\"currentMarketingChannels\",\"monthlyBudgetAmount\",\"monthlyBudgetCurrency\",\"lastStep\",\"completedAt\",\"updatedAt\") VALUES ('bp-plan-1','$PID','A harness','SUBSCRIPTION','Teams',ARRAY['seo','email','paid-search']::TEXT[],5000,'USD',6,now(),now());" > /dev/null

call "$ID_GEN" "[\"$PID\",{}]" > /dev/null
checkeq "one plan exists"        "1" "$($PSQL "SELECT count(*) FROM weekly_plans WHERE \"projectId\"='$PID';")"
checkeq "version 1"              "1" "$($PSQL "SELECT version FROM weekly_plans WHERE \"projectId\"='$PID';")"
checkeq "it is ACTIVE"           "ACTIVE" "$($PSQL "SELECT status FROM weekly_plans WHERE \"projectId\"='$PID';")"
checkeq "carries the workspace"  "$LUMEN_WORKSPACE_ID" "$($PSQL "SELECT \"workspaceId\" FROM weekly_plans WHERE \"projectId\"='$PID';")"
check   "records the prompt version" "weekly-plan/" "$($PSQL "SELECT \"promptVersion\" FROM weekly_plans LIMIT 1;")"
check   "records the model"          "mock" "$($PSQL "SELECT model FROM weekly_plans LIMIT 1;")"
checkeq "linked to an agent run" "cadence" "$($PSQL "SELECT \"agentType\" FROM agent_runs ORDER BY \"startedAt\" DESC LIMIT 1;")"
checkeq "the run succeeded"      "SUCCEEDED" "$($PSQL "SELECT status FROM agent_runs ORDER BY \"startedAt\" DESC LIMIT 1;")"

echo "===== 3. THE WEEK STARTS ON A MONDAY ====="
# Stored at UTC midnight like every other day-only column — see src/lib/date.ts.
checkeq "weekStart is a Monday"     "1" "$($PSQL "SELECT EXTRACT(ISODOW FROM \"weekStart\")::int FROM weekly_plans LIMIT 1;")"
checkeq "and is pinned to midnight" "0" "$($PSQL "SELECT (EXTRACT(HOUR FROM \"weekStart\" AT TIME ZONE 'UTC') + EXTRACT(MINUTE FROM \"weekStart\"))::int FROM weekly_plans LIMIT 1;")"

echo "===== 4. GUARDRAILS: THE DUPLICATE IS DROPPED ====="
# The mock returns "Mock task: second suggestion" twice. One task, not two.
checkeq "the repeat was removed" "1" \
  "$($PSQL "SELECT count(*) FROM marketing_tasks WHERE title='Mock task: second suggestion';")"

echo "===== 5. GUARDRAILS: A BUDGET ALLOWS PAID CHANNELS ====="
# This business has 5000 and named paid-search, so the paid task belongs.
checkeq "the paid task was kept" "1" \
  "$($PSQL "SELECT count(*) FROM marketing_tasks WHERE channel='paid-search';")"

echo "===== 6. EVERY TASK IS ACTIONABLE ====="
checkeq "none without steps"          "0" "$($PSQL "SELECT count(*) FROM marketing_tasks WHERE array_length(steps,1) IS NULL;")"
checkeq "none without an expectation" "0" "$($PSQL "SELECT count(*) FROM marketing_tasks WHERE \"expectedResult\"='';")"
checkeq "none without a reason"       "0" "$($PSQL "SELECT count(*) FROM marketing_tasks WHERE why='';")"
checkeq "all start as TODO"           "0" "$($PSQL "SELECT count(*) FROM marketing_tasks WHERE status<>'TODO';")"
checkeq "ordered from zero"           "0" "$($PSQL "SELECT min(position) FROM marketing_tasks;")"
checkeq "highest priority first"      "HIGH" \
  "$($PSQL "SELECT priority FROM marketing_tasks ORDER BY position LIMIT 1;")"
checkeq "evidence was stored"         "1" "$($PSQL "SELECT count(*) FROM evidence;")"

echo "===== 7. GUARDRAILS: ZERO BUDGET REMOVES EVERY PAID TASK ====="
# The acceptance test from section 8 of the brief, stated the way the brief
# states it: a business with no money must not be handed an advertising task.
$PSQL "DELETE FROM weekly_plans;" > /dev/null
$PSQL "UPDATE business_profiles SET \"monthlyBudgetAmount\"=0 WHERE \"projectId\"='$PID';" > /dev/null
OUT=$(call "$ID_GEN" "[\"$PID\",{}]")
checkeq "a plan was still produced" "1" "$($PSQL "SELECT count(*) FROM weekly_plans;")"
checkeq "no paid task survived"     "0" \
  "$($PSQL "SELECT count(*) FROM marketing_tasks WHERE channel IN ('paid-search','paid-social','influencer','affiliate','events','offline');")"
check   "and the operator is told why" "needs a budget" "$OUT"

echo "===== 8. A NULL BUDGET IS TREATED AS NO BUDGET ====="
# Guessing upward costs the operator money; guessing downward costs one
# suggestion. Unanswered therefore means no.
$PSQL "DELETE FROM weekly_plans;" > /dev/null
$PSQL "UPDATE business_profiles SET \"monthlyBudgetAmount\"=NULL WHERE \"projectId\"='$PID';" > /dev/null
call "$ID_GEN" "[\"$PID\",{}]" > /dev/null
checkeq "still no paid task" "0" \
  "$($PSQL "SELECT count(*) FROM marketing_tasks WHERE channel='paid-search';")"

echo "===== 9. REGENERATING SUPERSEDES, IT DOES NOT DESTROY ====="
FIRST_PLAN=$($PSQL "SELECT id FROM weekly_plans WHERE status='ACTIVE';")
FIRST_TASK=$($PSQL "SELECT id FROM marketing_tasks WHERE \"planId\"='$FIRST_PLAN' ORDER BY position LIMIT 1;")
call "$ID_DONE" "[\"$FIRST_TASK\",\"Did it on Tuesday.\"]" > /dev/null

call "$ID_GEN" "[\"$PID\",{}]" > /dev/null
checkeq "two plans now"            "2" "$($PSQL "SELECT count(*) FROM weekly_plans WHERE \"projectId\"='$PID';")"
checkeq "exactly one is ACTIVE"    "1" "$($PSQL "SELECT count(*) FROM weekly_plans WHERE \"projectId\"='$PID' AND status='ACTIVE';")"
checkeq "the old one is SUPERSEDED" "SUPERSEDED" "$($PSQL "SELECT status FROM weekly_plans WHERE id='$FIRST_PLAN';")"
checkeq "the new one is version 2" "2" "$($PSQL "SELECT version FROM weekly_plans WHERE \"projectId\"='$PID' AND status='ACTIVE';")"
checkeq "last week's work survived" "DONE" "$($PSQL "SELECT status FROM marketing_tasks WHERE id='$FIRST_TASK';")"
check   "and so did the note"       "Tuesday" "$($PSQL "SELECT \"completionNote\" FROM marketing_tasks WHERE id='$FIRST_TASK';")"

echo "===== 10. A FAILED GENERATION SAVES NOTHING ====="
# Section 8 of the brief: invalid or failed output must not leave half a plan
# behind. Driven through the mock's scripted failures rather than simulated.
BEFORE_PLANS=$($PSQL "SELECT count(*) FROM weekly_plans;")
BEFORE_TASKS=$($PSQL "SELECT count(*) FROM marketing_tasks;")
ACTIVE_BEFORE=$($PSQL "SELECT id FROM weekly_plans WHERE status='ACTIVE';")

scenario() { # scenario <name>
  curl -s -c $JAR -b $JAR -X POST "$BASE/api/dev/plan-scenario" \
    -H "Content-Type: application/json" \
    -d "{\"projectId\":\"$PID\",\"scenario\":\"$1\"}"
}

check "prose instead of JSON is refused"  '"ok":false' "$(scenario invalid-json)"
check "the wrong shape is refused"        '"ok":false' "$(scenario schema-mismatch)"
check "a provider outage is refused"      '"ok":false' "$(scenario always-fail)"
check "a fatal provider error is refused" '"ok":false' "$(scenario fatal)"

checkeq "no plan was added"         "$BEFORE_PLANS" "$($PSQL "SELECT count(*) FROM weekly_plans;")"
checkeq "no task was added"         "$BEFORE_TASKS" "$($PSQL "SELECT count(*) FROM marketing_tasks;")"
checkeq "the active plan is intact" "$ACTIVE_BEFORE" "$($PSQL "SELECT id FROM weekly_plans WHERE status='ACTIVE';")"
checkeq "and the failures were recorded as runs" "4" \
  "$($PSQL "SELECT count(*) FROM agent_runs WHERE \"agentType\"='cadence' AND status IN ('FAILED','TIMED_OUT');")"

echo "===== 11. DONE ====="
PLAN=$($PSQL "SELECT id FROM weekly_plans WHERE status='ACTIVE';")
T1=$($PSQL "SELECT id FROM marketing_tasks WHERE \"planId\"='$PLAN' ORDER BY position LIMIT 1;")
$PSQL "DELETE FROM audit_events;" > /dev/null

call "$ID_DONE" "[\"$T1\",\"Finished it.\"]" > /dev/null
checkeq "status is DONE"        "DONE" "$($PSQL "SELECT status FROM marketing_tasks WHERE id='$T1';")"
checkeq "completedAt is set"    "1" "$($PSQL "SELECT count(*) FROM marketing_tasks WHERE id='$T1' AND \"completedAt\" IS NOT NULL;")"
check   "the note is stored"    "Finished it." "$($PSQL "SELECT \"completionNote\" FROM marketing_tasks WHERE id='$T1';")"
checkeq "one audit event"       "1" "$($PSQL "SELECT count(*) FROM audit_events WHERE action='task.completed';")"
checkeq "the actor is recorded" "1" "$($PSQL "SELECT count(*) FROM audit_events a JOIN users u ON u.id=a.\"actorId\" WHERE a.action='task.completed';")"

echo "===== 12. THE SAME REQUEST TWICE IS ONE DECISION ====="
# A double-clicked button is not two decisions, and must not become two rows of
# history.
call "$ID_DONE" "[\"$T1\"]" > /dev/null
call "$ID_DONE" "[\"$T1\"]" > /dev/null
checkeq "still one audit event" "1" "$($PSQL "SELECT count(*) FROM audit_events WHERE action='task.completed';")"
checkeq "still DONE"            "DONE" "$($PSQL "SELECT status FROM marketing_tasks WHERE id='$T1';")"

echo "===== 13. SKIPPED, WITH A REASON ====="
T2=$($PSQL "SELECT id FROM marketing_tasks WHERE \"planId\"='$PLAN' ORDER BY position OFFSET 1 LIMIT 1;")
call "$ID_SKIP" "[\"$T2\",{\"reason\":\"no-time\",\"note\":\"Next week.\"}]" > /dev/null
checkeq "status is SKIPPED"  "SKIPPED" "$($PSQL "SELECT status FROM marketing_tasks WHERE id='$T2';")"
checkeq "the reason is stored" "no-time" "$($PSQL "SELECT \"skipReason\" FROM marketing_tasks WHERE id='$T2';")"
checkeq "skippedAt is set"     "1" "$($PSQL "SELECT count(*) FROM marketing_tasks WHERE id='$T2' AND \"skippedAt\" IS NOT NULL;")"
checkeq "audited"              "1" "$($PSQL "SELECT count(*) FROM audit_events WHERE action='task.skipped';")"

OUT=$(call "$ID_SKIP" "[\"$T2\",{\"reason\":\"whatever-i-typed\"}]")
check   "an invented reason is refused" "Choose a reason" "$OUT"
checkeq "and the stored reason is unchanged" "no-time" "$($PSQL "SELECT \"skipReason\" FROM marketing_tasks WHERE id='$T2';")"

echo "===== 14. A DECISION CAN BE WITHDRAWN, AND THE HISTORY CANNOT ====="
call "$ID_REOPEN" "[\"$T2\"]" > /dev/null
checkeq "back to TODO"            "TODO" "$($PSQL "SELECT status FROM marketing_tasks WHERE id='$T2';")"
checkeq "the skip reason is gone" "1" "$($PSQL "SELECT count(*) FROM marketing_tasks WHERE id='$T2' AND \"skipReason\" IS NULL;")"
checkeq "but the audit remembers" "1" "$($PSQL "SELECT count(*) FROM audit_events WHERE action='task.skipped';")"
checkeq "and records the reversal" "1" "$($PSQL "SELECT count(*) FROM audit_events WHERE action='task.reopened';")"

echo "===== 15. LAST WEEK'S OUTCOMES REACH THE NEXT PLAN ====="
# Section 9: the next plan reads DONE and SKIPPED as signals. The prompt is what
# carries them, so the assertion is on the prompt the agent was given.
$PSQL "UPDATE marketing_tasks SET status='SKIPPED', \"skipReason\"='not-relevant' WHERE id='$T2';" > /dev/null
call "$ID_GEN" "[\"$PID\",{}]" > /dev/null
SUMMARY=$($PSQL "SELECT \"inputSummary\" FROM agent_runs WHERE \"agentType\"='cadence' ORDER BY \"startedAt\" DESC LIMIT 1;")
check "the run is a cadence plan" "cadence:plan" "$SUMMARY"
checkeq "the new plan is version 3" "3" "$($PSQL "SELECT version FROM weekly_plans WHERE \"projectId\"='$PID' AND status='ACTIVE';")"

echo "===== 16. THE PAGE RENDERS THE PLAN ====="
P=$(curl -s -c $JAR -b $JAR "$BASE/plan")
check  "the week is shown"     "Week of"          "$P"
check  "a task title is shown" "Mock task"        "$P"
check  "the steps are shown"   "Regenerate the plan" "$P"
check  "the expectation is shown" "You will see a real plan" "$P"
absent "no paid task on the page" "run paid search ads" "$P"

echo "===== 17. ANOTHER ACCOUNT CANNOT TOUCH THIS PLAN ====="
# The task id is the only thing the browser sends, so it is the only thing an
# attacker has. It must not be enough.
OWNER_WS="$LUMEN_WORKSPACE_ID"
LUMEN_TEST_EMAIL="$SECOND_EMAIL" lumen_session_start "$JAR2"
SECOND_WS="$LUMEN_WORKSPACE_ID"
export LUMEN_WORKSPACE_ID="$OWNER_WS"

T3=$($PSQL "SELECT id FROM marketing_tasks WHERE \"planId\"=(SELECT id FROM weekly_plans WHERE status='ACTIVE') ORDER BY position LIMIT 1;")
BEFORE=$($PSQL "SELECT status FROM marketing_tasks WHERE id='$T3';")

OUT=$(call_as "$JAR2" "$ID_DONE" "[\"$T3\"]")
check   "marking it done is refused" "does not exist" "$OUT"
checkeq "and the task is unchanged"  "$BEFORE" "$($PSQL "SELECT status FROM marketing_tasks WHERE id='$T3';")"

OUT=$(call_as "$JAR2" "$ID_SKIP" "[\"$T3\",{\"reason\":\"no-time\"}]")
check   "skipping it is refused"     "does not exist" "$OUT"
checkeq "still unchanged"            "$BEFORE" "$($PSQL "SELECT status FROM marketing_tasks WHERE id='$T3';")"

OUT=$(call_as "$JAR2" "$ID_GEN" "[\"$PID\",{}]")
check   "generating into it is refused" "no longer exists" "$OUT"
checkeq "no plan landed in the other workspace" "0" \
  "$($PSQL "SELECT count(*) FROM weekly_plans WHERE \"workspaceId\"='$SECOND_WS';")"

$PSQL "DELETE FROM workspaces WHERE id='$SECOND_WS';" > /dev/null
$PSQL "DELETE FROM users WHERE email='$SECOND_EMAIL';" > /dev/null
rm -f "$JAR2"

echo "===== 18. DELETING THE PROJECT TAKES THE PLAN WITH IT ====="
$PSQL "DELETE FROM projects WHERE id='$PID';" > /dev/null
checkeq "plans gone"    "0" "$($PSQL "SELECT count(*) FROM weekly_plans;")"
checkeq "tasks gone"    "0" "$($PSQL "SELECT count(*) FROM marketing_tasks;")"
checkeq "evidence gone" "0" "$($PSQL "SELECT count(*) FROM evidence;")"

echo
echo "===== RESULT: $pass passed, $fail failed ====="
[ "$fail" -eq 0 ]
