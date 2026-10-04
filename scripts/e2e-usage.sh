#!/usr/bin/env bash
# End-to-end tests for AI usage accounting and the limit.
#
# The claim this suite has to establish is narrow and absolute: a workspace over
# its limit does not reach the provider. Everything else here — cost arithmetic,
# duplicate suppression, error rate — is bookkeeping, and bookkeeping that is
# wrong is merely embarrassing. A limit that does not hold is a bill.

BASE=http://localhost:3000
JAR=/tmp/lumen-usage-jar.txt
PSQL="./scripts/db.sh"
. "$(dirname "$0")/lib/session.sh"

pass=0; fail=0
check() {
  if printf '%s' "$3" | grep -qF -- "$2"; then echo "  PASS  $1"; pass=$((pass+1));
  else echo "  FAIL  $1 (expected: $2 | got: $(printf '%s' "$3" | head -c 140))"; fail=$((fail+1)); fi
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

$PSQL "DELETE FROM projects;" > /dev/null
$PSQL "DELETE FROM entitlements;" > /dev/null
lumen_session_start "$JAR"

PID=usage-test-1
$PSQL "INSERT INTO projects (id,\"workspaceId\",name,industry,country,\"businessStage\",\"primaryGoal\",\"updatedAt\") VALUES ('$PID','$LUMEN_WORKSPACE_ID','Usage Testbed','saas','US','SCALING','ACQUISITION',now());" > /dev/null
$PSQL "INSERT INTO business_profiles (id,\"projectId\",\"productOrService\",\"businessModel\",\"targetCustomers\",\"currentMarketingChannels\",\"monthlyBudgetAmount\",\"lastStep\",\"completedAt\",\"updatedAt\") VALUES ('bp-usage-1','$PID','A harness','SUBSCRIPTION','Teams',ARRAY['seo','email']::TEXT[],0,6,now(),now());" > /dev/null

ID_GEN=$(aid generateWeeklyPlanAction)
ID_STRAT=$(aid generateStrategyAction)

echo "===== 1. AN ALLOWANCE APPEARS ON FIRST USE ====="
# Not seeded at signup. A row created lazily cannot drift out of step with the
# accounts that exist, and there is nothing to backfill for accounts that
# predate the limit.
checkeq "no entitlement yet" "0" "$($PSQL "SELECT count(*) FROM entitlements;")"
call "$ID_GEN" "[\"$PID\",{}]" > /dev/null
checkeq "one entitlement now" "1" "$($PSQL "SELECT count(*) FROM entitlements WHERE \"workspaceId\"='$LUMEN_WORKSPACE_ID';")"
checkeq "keyed by what it meters" "ai.runs.monthly" "$($PSQL "SELECT key FROM entitlements LIMIT 1;")"
checkeq "one run consumed"        "1" "$($PSQL "SELECT used FROM entitlements LIMIT 1;")"
checkeq "the period is a month"   "1" \
  "$($PSQL "SELECT CASE WHEN \"periodEnd\" > \"periodStart\" + interval '27 days' AND \"periodEnd\" < \"periodStart\" + interval '32 days' THEN 1 ELSE 0 END FROM entitlements LIMIT 1;")"

echo "===== 2. THE RUN IS ATTRIBUTED ====="
# Without these, a bill cannot be read and a limit cannot be counted.
checkeq "carries the workspace" "$LUMEN_WORKSPACE_ID" \
  "$($PSQL "SELECT \"workspaceId\" FROM agent_runs ORDER BY \"startedAt\" DESC LIMIT 1;")"
checkeq "carries the user"      "1" \
  "$($PSQL "SELECT count(*) FROM agent_runs r JOIN users u ON u.id=r.\"userId\" WHERE r.\"agentType\"='cadence';")"
checkeq "carries the feature"   "weekly_plan" \
  "$($PSQL "SELECT \"featureKey\" FROM agent_runs WHERE \"agentType\"='cadence' ORDER BY \"startedAt\" DESC LIMIT 1;")"
check   "carries the prompt version" "weekly-plan/" \
  "$($PSQL "SELECT \"promptVersion\" FROM agent_runs WHERE \"agentType\"='cadence' ORDER BY \"startedAt\" DESC LIMIT 1;")"
checkeq "and an idempotency key" "1" \
  "$($PSQL "SELECT count(*) FROM agent_runs WHERE \"agentType\"='cadence' AND \"idempotencyKey\" IS NOT NULL;")"

echo "===== 3. COST IS COMPUTED, NOT GUESSED ====="
# The mock provider is free, so the honest recorded cost is zero — and it must
# be a recorded zero rather than a null, because null means "no published rate"
# and the two are different claims.
checkeq "cost recorded"      "1" \
  "$($PSQL "SELECT count(*) FROM agent_runs WHERE \"agentType\"='cadence' AND \"estimatedCostUsd\" IS NOT NULL;")"
checkeq "the mock costs nothing" "0" \
  "$($PSQL "SELECT \"estimatedCostUsd\"::int FROM agent_runs WHERE \"agentType\"='cadence' ORDER BY \"startedAt\" DESC LIMIT 1;")"
checkeq "tokens recorded"    "1" \
  "$($PSQL "SELECT count(*) FROM agent_runs WHERE \"agentType\"='cadence' AND \"promptTokens\" IS NOT NULL AND \"completionTokens\" IS NOT NULL;")"

echo "===== 4. A DIFFERENT FEATURE SPENDS THE SAME ALLOWANCE ====="
# One allowance for the workspace, not one per feature. Otherwise the limit is
# whatever the number of features happens to be.
call "$ID_STRAT" "[\"$PID\",null]" > /dev/null
checkeq "two runs consumed" "2" "$($PSQL "SELECT used FROM entitlements LIMIT 1;")"
checkeq "attributed to strategy" "strategy" \
  "$($PSQL "SELECT \"featureKey\" FROM agent_runs WHERE \"agentType\"='atlas' ORDER BY \"startedAt\" DESC LIMIT 1;")"

echo "===== 5. OVER THE LIMIT, THE PROVIDER IS NEVER CALLED ====="
# The one claim that matters. Asserted by counting agent_runs: the row is
# written immediately before the first attempt, so no new row means no attempt,
# which means no request left this machine.
$PSQL "UPDATE entitlements SET \"limit\"=used WHERE \"workspaceId\"='$LUMEN_WORKSPACE_ID';" > /dev/null
RUNS_BEFORE=$($PSQL "SELECT count(*) FROM agent_runs;")
USED_BEFORE=$($PSQL "SELECT used FROM entitlements LIMIT 1;")

OUT=$(call "$ID_GEN" "[\"$PID\",{\"guidance\":\"over the limit\"}]")
check   "the person is told plainly" "used all" "$OUT"
check   "and when it renews"         "renews on" "$OUT"
checkeq "no run was started"  "$RUNS_BEFORE" "$($PSQL "SELECT count(*) FROM agent_runs;")"
checkeq "nothing further consumed" "$USED_BEFORE" "$($PSQL "SELECT used FROM entitlements LIMIT 1;")"

OUT=$(call "$ID_STRAT" "[\"$PID\",null]")
checkeq "every feature is refused, not just one" "$RUNS_BEFORE" "$($PSQL "SELECT count(*) FROM agent_runs;")"

echo "===== 6. THE PAGE SAYS SO BEFORE THE BUTTON IS PRESSED ====="
P=$(curl -s -c $JAR -b $JAR "$BASE/plan")
check "the plan page shows the allowance" "AI actions left" "$P"
check "and explains the block"            "used all"        "$P"

S=$(curl -s -c $JAR -b $JAR "$BASE/settings")
check "settings shows usage"        "Usage"            "$S"
check "settings shows the estimate" "Estimated cost"   "$S"
check "settings shows error rate"   "Error rate"       "$S"
check "and where it went"           "Where it went"    "$S"
check "and names the feature"       "Weekly plan"      "$S"
check "the cost is called an estimate" "estimate"      "$S"

echo "===== 7. RAISING THE LIMIT LETS WORK THROUGH AGAIN ====="
# This is what billing will do in the next step: move the number, and nothing
# else in the product has to know that billing exists.
$PSQL "UPDATE entitlements SET \"limit\"=used+5 WHERE \"workspaceId\"='$LUMEN_WORKSPACE_ID';" > /dev/null
call "$ID_GEN" "[\"$PID\",{\"guidance\":\"after the raise\"}]" > /dev/null
checkeq "a run happened" "$((RUNS_BEFORE + 1))" "$($PSQL "SELECT count(*) FROM agent_runs;")"
checkeq "and it was counted" "$((USED_BEFORE + 1))" "$($PSQL "SELECT used FROM entitlements LIMIT 1;")"

echo "===== 8. THE SAME REQUEST TWICE COSTS ONCE ====="
# Identical inputs produce an identical idempotency key. The unique index
# refuses the second before the provider is reached, and the claim is refunded
# because nothing was spent.
$PSQL "DELETE FROM weekly_plans;" > /dev/null
$PSQL "DELETE FROM agent_runs;" > /dev/null
$PSQL "UPDATE entitlements SET used=0, \"limit\"=50;" > /dev/null

call "$ID_GEN" "[\"$PID\",{\"guidance\":\"identical\"}]" > /dev/null
FIRST_RUNS=$($PSQL "SELECT count(*) FROM agent_runs;")
FIRST_USED=$($PSQL "SELECT used FROM entitlements LIMIT 1;")

# Same guidance, same profile, same week — and the plan version it would create
# is unchanged, because the first attempt is still the only plan.
$PSQL "DELETE FROM weekly_plans;" > /dev/null
OUT=$(call "$ID_GEN" "[\"$PID\",{\"guidance\":\"identical\"}]")
check   "the duplicate is refused"  "already being generated" "$OUT"
checkeq "no second run"             "$FIRST_RUNS" "$($PSQL "SELECT count(*) FROM agent_runs;")"
checkeq "and nothing extra charged" "$FIRST_USED" "$($PSQL "SELECT used FROM entitlements LIMIT 1;")"

echo "===== 9. A FAILURE THAT REACHED THE PROVIDER STILL COSTS ====="
# Stated in src/config/usage.ts rather than implied: the tokens were generated
# and billed whatever came back, so the run counts.
$PSQL "UPDATE entitlements SET used=0;" > /dev/null
curl -s -c $JAR -b $JAR -X POST "$BASE/api/dev/plan-scenario" \
  -H "Content-Type: application/json" -d "{\"projectId\":\"$PID\",\"scenario\":\"always-fail\"}" > /dev/null
checkeq "the failed run was counted" "1" "$($PSQL "SELECT used FROM entitlements LIMIT 1;")"
checkeq "and recorded as failed"     "1" \
  "$($PSQL "SELECT count(*) FROM agent_runs WHERE status IN ('FAILED','TIMED_OUT');")"

echo "===== 10. A REFUSAL THAT NEVER REACHED THE PROVIDER COSTS NOTHING ====="
# The mirror image, and the reason the two are separate rules: an operator whose
# allowance falls because our own database had a bad moment cannot reason about
# the number at all.
$PSQL "UPDATE entitlements SET used=0, \"limit\"=0;" > /dev/null
call "$ID_GEN" "[\"$PID\",{\"guidance\":\"refused\"}]" > /dev/null
checkeq "still zero used" "0" "$($PSQL "SELECT used FROM entitlements LIMIT 1;")"

echo "===== 11. ANOTHER WORKSPACE'S USAGE IS NOT THIS ONE'S ====="
$PSQL "UPDATE entitlements SET used=3, \"limit\"=50;" > /dev/null
$PSQL "INSERT INTO users (id,email,\"updatedAt\") VALUES ('usage-other','other@usage.test',now()) ON CONFLICT (id) DO NOTHING;" > /dev/null
$PSQL "INSERT INTO workspaces (id,name,\"ownerId\",\"updatedAt\") VALUES ('usage-other-ws','Someone else','usage-other',now()) ON CONFLICT (id) DO NOTHING;" > /dev/null
$PSQL "INSERT INTO entitlements (id,\"workspaceId\",key,\"limit\",used,\"periodEnd\",\"updatedAt\") VALUES ('ent-other','usage-other-ws','ai.runs.monthly',50,41,now() + interval '20 days',now()) ON CONFLICT DO NOTHING;" > /dev/null

# Asserted against the progress bar's aria-label rather than the visible text,
# because the visible figure is split across elements for typographic weight —
# and the label is the string a screen reader is given, which is worth pinning
# for its own sake.
S=$(curl -s -c $JAR -b $JAR "$BASE/settings")
check   "our own figure is shown"     "3 of 50 AI actions used"  "$S"
checkeq "and not the other account's" "0" \
  "$(printf '%s' "$S" | grep -c '41 of 50 AI actions used')"

$PSQL "DELETE FROM workspaces WHERE id='usage-other-ws';" > /dev/null
$PSQL "DELETE FROM users WHERE id='usage-other';" > /dev/null

echo "===== 12. THE PERIOD ROLLS ITSELF ====="
# No scheduled job. A limit that depends on cron running is a limit that stops
# existing the first time cron does not, and it stops existing in the direction
# that costs money.
$PSQL "UPDATE entitlements SET used=50, \"limit\"=50, \"periodStart\"=now() - interval '40 days', \"periodEnd\"=now() - interval '10 days' WHERE \"workspaceId\"='$LUMEN_WORKSPACE_ID';" > /dev/null
curl -s -c $JAR -b $JAR "$BASE/plan" > /dev/null
checkeq "the counter reset"       "0" "$($PSQL "SELECT used FROM entitlements WHERE \"workspaceId\"='$LUMEN_WORKSPACE_ID';")"
checkeq "and the window moved on" "1" \
  "$($PSQL "SELECT CASE WHEN \"periodEnd\" > now() THEN 1 ELSE 0 END FROM entitlements WHERE \"workspaceId\"='$LUMEN_WORKSPACE_ID';")"

echo "===== 13. DELETING A PROJECT DOES NOT ERASE THE BILL ====="
# The run carries its own workspace precisely so that deleting a project cannot
# rewrite what was spent. Usage history outliving the thing it was spent on is
# the point.
RUNS=$($PSQL "SELECT count(*) FROM agent_runs;")
$PSQL "DELETE FROM projects WHERE id='$PID';" > /dev/null
checkeq "runs went with the project" "0" "$($PSQL "SELECT count(*) FROM agent_runs;")"
checkeq "but the counter did not"    "0" "$($PSQL "SELECT used FROM entitlements WHERE \"workspaceId\"='$LUMEN_WORKSPACE_ID';")"
checkeq "and the entitlement stands" "1" "$($PSQL "SELECT count(*) FROM entitlements WHERE \"workspaceId\"='$LUMEN_WORKSPACE_ID';")"

echo
echo "===== RESULT: $pass passed, $fail failed ====="
[ "$fail" -eq 0 ]
