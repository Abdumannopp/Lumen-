#!/usr/bin/env bash
# End-to-end checks for the AI evaluation and learning loop.
# Uses the same authenticated Server Action path as the growth/plan suites.
# Requires a running LUMEN instance and the configured DB helper.

BASE=http://localhost:3000
JAR=/tmp/lumen-ai-learning-jar.txt
PSQL="./scripts/db.sh"
. "$(dirname "$0")/lib/session.sh"

pass=0; fail=0
checkeq() {
  if [ "$2" = "$3" ]; then echo "  PASS  $1"; pass=$((pass+1));
  else echo "  FAIL  $1 (expected '$2', got '$3')"; fail=$((fail+1)); fi
}
check() {
  if printf '%s' "$3" | grep -qF -- "$2"; then echo "  PASS  $1"; pass=$((pass+1));
  else echo "  FAIL  $1 (expected: $2)"; fail=$((fail+1)); fi
}
aid() { node -e "const m=require('$PWD/.next/server/server-reference-manifest.json').node;for(const[k,v]of Object.entries(m))if(v.exportedName==='$1')console.log(k)"; }
call_growth() {
  curl -s -c "$JAR" -b "$JAR" -X POST "$BASE/growth" \
    -H "Next-Action: $1" -H "Content-Type: text/plain;charset=UTF-8" --data-raw "$2"
}
call_plan() {
  curl -s -c "$JAR" -b "$JAR" -X POST "$BASE/plan" \
    -H "Next-Action: $1" -H "Content-Type: text/plain;charset=UTF-8" --data-raw "$2"
}

PID=ai-learning-test-1
$PSQL "DELETE FROM projects WHERE id='$PID';" > /dev/null
$PSQL "INSERT INTO projects (id,\"workspaceId\",name,industry,country,\"businessStage\",\"primaryGoal\",\"updatedAt\") VALUES ('$PID','$LUMEN_WORKSPACE_ID','Learning Testbed','saas','US','SCALING','ACQUISITION',now());" > /dev/null
$PSQL "INSERT INTO business_profiles (id,\"projectId\",\"productOrService\",\"businessModel\",\"targetCustomers\",\"currentMarketingChannels\",\"monthlyBudgetAmount\",\"monthlyBudgetCurrency\",\"lastStep\",\"completedAt\",\"updatedAt\") VALUES ('bp-ai-learning-1','$PID','A harness','SUBSCRIPTION','Teams',ARRAY['seo']::TEXT[],0,'USD',6,now(),now());" > /dev/null
lumen_session_start "$JAR"

ID_GEN=$(aid generateRecommendationsAction)
ID_STATUS=$(aid setRecommendationStatusAction)
ID_PLAN=$(aid generateWeeklyPlanAction)
ID_DONE=$(aid completeTaskAction)

# Generate an AI recommendation, then make an operator decision on it.
call_growth "$ID_GEN" "[\"$PID\",null]" > /dev/null
REC=$($PSQL "SELECT id FROM recommendations WHERE \"projectId\"='$PID' AND source='AI' ORDER BY \"createdAt\" DESC LIMIT 1;")
call_growth "$ID_STATUS" "[\"$PID\",\"$REC\",\"ACCEPTED\"]" > /dev/null
checkeq "AI recommendation decision recorded" "1" "$($PSQL "SELECT count(*) FROM product_events WHERE \"projectId\"='$PID' AND \"eventName\"='recommendation.status_changed';")"
checkeq "decision event carries ACCEPTED" "1" "$($PSQL "SELECT count(*) FROM product_events WHERE \"projectId\"='$PID' AND \"eventName\"='recommendation.status_changed' AND metadata->>'to'='ACCEPTED';")"

# Generate and complete a plan with an operator-written result.
call_plan "$ID_PLAN" "[\"$PID\",{}]" > /dev/null
TASK=$($PSQL "SELECT id FROM marketing_tasks WHERE \"planId\"=(SELECT id FROM weekly_plans WHERE \"projectId\"='$PID' ORDER BY version DESC LIMIT 1) ORDER BY position LIMIT 1;")
call_plan "$ID_DONE" "[\"$TASK\",\"Observed a qualified enquiry after the change.\"]" > /dev/null
checkeq "task outcome is stored" "1" "$($PSQL "SELECT count(*) FROM marketing_tasks WHERE id='$TASK' AND status='DONE' AND \"completionNote\" LIKE '%qualified enquiry%';")"
checkeq "outcome telemetry exists" "1" "$($PSQL "SELECT count(*) FROM product_events WHERE \"projectId\"='$PID' AND \"eventName\"='task.completed';")"

# Learning data must remain project-scoped and auditable.
checkeq "AI runs remain project-scoped" "0" "$($PSQL "SELECT count(*) FROM agent_runs WHERE \"projectId\" <> '$PID';")"
# /admin is founder-only, and the suite account must stay a non-founder because
# scripts/e2e-beta.sh asserts exactly that. So this signs in the first
# FOUNDER_EMAILS address the same way e2e-beta.sh does — no invite, same
# password — and leaves the suite account's own session untouched.
FOUNDER_EMAIL=$(grep '^FOUNDER_EMAILS=' .env | head -1 | cut -d= -f2- | tr -d '"' | cut -d, -f1 | xargs)
FOUNDER_JAR=/tmp/lumen-ai-learning-founder-jar.txt
if [ -z "$FOUNDER_EMAIL" ]; then
  echo "  FAIL  admin exposes evaluation surface (.env has no FOUNDER_EMAILS)"; fail=$((fail+1))
else
  rm -f "$FOUNDER_JAR"
  (
    LUMEN_TEST_EMAIL="$FOUNDER_EMAIL"
    _lumen_post_form "$FOUNDER_JAR" /signup \
      -F "email=$FOUNDER_EMAIL" -F "password=beta-suite-password-1234" -F "terms=on" -F "invite="
    token=$(curl -s "$BASE/api/dev/confirm-link?email=$FOUNDER_EMAIL" | sed -n 's/.*"tokenHash":"\([^"]*\)".*/\1/p')
    if [ -n "$token" ]; then
      curl -s -c "$FOUNDER_JAR" -b "$FOUNDER_JAR" "$BASE/auth/confirm?token_hash=$token&type=signup" -o /dev/null
    else
      _lumen_post_form "$FOUNDER_JAR" /login -F "email=$FOUNDER_EMAIL" -F "password=beta-suite-password-1234"
    fi
  )
  check "admin exposes evaluation surface" "Evaluation &amp; learning" "$(curl -s -c "$FOUNDER_JAR" -b "$FOUNDER_JAR" "$BASE/admin")"
fi

$PSQL "DELETE FROM projects WHERE id='$PID';" > /dev/null

echo
echo "===== RESULT: $pass passed, $fail failed ====="
[ "$fail" -eq 0 ]
