#!/usr/bin/env bash
# End-to-end tests for the marketing budget planner.

BASE=http://localhost:3000
JAR=/tmp/lumen-bud-jar.txt
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
  curl -s -c $JAR -b $JAR -X POST "$BASE/budget" \
    -H "Next-Action: $1" -H "Content-Type: text/plain;charset=UTF-8" --data-raw "$2"
}

rm -f $JAR
$PSQL "DELETE FROM projects;" > /dev/null
PID=bud-test-1
$PSQL "INSERT INTO projects (id,\"workspaceId\",name,industry,country,\"businessStage\",\"primaryGoal\",\"updatedAt\") VALUES ('$PID','$LUMEN_WORKSPACE_ID','Budget Testbed','saas','US','SCALING','ACQUISITION',now());" > /dev/null
$PSQL "INSERT INTO business_profiles (id,\"projectId\",\"productOrService\",\"businessModel\",\"targetCustomers\",\"monthlyBudgetAmount\",\"monthlyBudgetCurrency\",\"lastStep\",\"completedAt\",\"updatedAt\") VALUES ('bp-bud-1','$PID','A harness','SUBSCRIPTION','Teams',5000,'USD',6,now(),now());" > /dev/null
lumen_session_start "$JAR"

ID_SUGGEST=$(aid suggestBudgetAction)
ID_SAVE=$(aid saveBudgetPlanAction)
ID_DEL=$(aid deleteBudgetPlanAction)

echo "===== 1. PAGE AND THE NO-ROI CONTRACT ====="
P=$(curl -s -c $JAR -b $JAR "$BASE/budget")
check "page loads"              "Budget"                      "$P"
check "states no ROI promise"   "never promises a return"     "$P"
check "prefills recorded budget" "5000"                       "$P"
check "shows the balance state" "unallocated"                 "$P"
check "offers suggestion"       "Suggest an allocation"       "$P"

echo "===== 2. SUGGESTION VALIDATION ====="
OUT=$(call "$ID_SUGGEST" "[\"$PID\",{\"total\":0,\"currency\":\"USD\",\"goal\":\"Acquisition\",\"categories\":[\"content\"]}]")
check "zero budget rejected" "greater than zero" "$OUT"
OUT=$(call "$ID_SUGGEST" "[\"$PID\",{\"total\":1000,\"currency\":\"USD\",\"goal\":\"Acquisition\",\"categories\":[]}]")
check "no categories rejected" "at least one category" "$OUT"
checkeq "no AI call wasted" "0" "$($PSQL "SELECT count(*) FROM agent_runs WHERE \"agentType\"='budget';")"

echo "===== 3. SUGGESTION BALANCES TO THE TOTAL (mock returns 90%) ====="
OUT=$(call "$ID_SUGGEST" "[\"$PID\",{\"total\":1000,\"currency\":\"USD\",\"goal\":\"Acquisition\",\"categories\":[\"content\",\"seo\"]}]")
check   "suggestion returned" "content" "$OUT"
check   "carries a rationale" "Mock rationale" "$OUT"
check   "carries a risk"      "Mock risk"      "$OUT"
check   "carries a priority"  "HIGH"           "$OUT"
checkeq "linked to a run"     "budget" "$($PSQL "SELECT \"agentType\" FROM agent_runs ORDER BY \"startedAt\" DESC LIMIT 1;")"
# The suggestion is a proposal, not a decision — nothing is saved yet.
checkeq "nothing saved yet" "0" "$($PSQL "SELECT count(*) FROM budget_plans;")"

echo "===== 4. EXCLUDED CATEGORIES ARE DROPPED ====="
# The mock always proposes content + seo; asking for content only must not
# smuggle seo into the result.
OUT=$(call "$ID_SUGGEST" "[\"$PID\",{\"total\":1000,\"currency\":\"USD\",\"goal\":\"Acquisition\",\"categories\":[\"content\"]}]")
check "kept the allowed category" "content" "$OUT"
if printf '%s' "$OUT" | grep -q '"category":"seo"'; then
  echo "  FAIL  excluded category dropped"; fail=$((fail+1));
else
  echo "  PASS  excluded category dropped"; pass=$((pass+1));
fi

echo "===== 5. SAVING ALWAYS BALANCES (lines total 700 of a 1000 budget) ====="
call "$ID_SAVE" "[\"$PID\",{\"name\":\"October\",\"total\":\"1000\",\"currency\":\"USD\",\"period\":\"2026-10\",\"lines\":[{\"category\":\"content\",\"amount\":\"400\",\"why\":\"w\",\"role\":\"r\",\"risk\":\"k\",\"priority\":\"HIGH\"},{\"category\":\"seo\",\"amount\":\"300\"}]}]" > /dev/null
checkeq "plan saved"        "1" "$($PSQL "SELECT count(*) FROM budget_plans WHERE \"projectId\"='$PID';")"
checkeq "amounts total the budget" "1000" "$($PSQL "SELECT sum((line->>'amount')::int) FROM budget_plans, jsonb_array_elements(lines) AS line;")"
checkeq "percentages total 100"    "100" "$($PSQL "SELECT round(sum((line->>'percent')::numeric)) FROM budget_plans, jsonb_array_elements(lines) AS line;")"
# 400/700 of 1000 floors to 571 and 300/700 floors to 428, leaving 1 unassigned.
# The remainder settles on the largest line, so content becomes 572 — that is
# what makes the parts sum to exactly the whole.
checkeq "proportions preserved, remainder on the largest line" "572" "$($PSQL "SELECT line->>'amount' FROM budget_plans, jsonb_array_elements(lines) AS line WHERE line->>'category'='content';")"
checkeq "smaller line floored"                                 "428" "$($PSQL "SELECT line->>'amount' FROM budget_plans, jsonb_array_elements(lines) AS line WHERE line->>'category'='seo';")"

echo "===== 6. OVER-ALLOCATION IS ALSO BALANCED ====="
call "$ID_SAVE" "[\"$PID\",{\"name\":\"Over\",\"total\":\"1000\",\"currency\":\"USD\",\"lines\":[{\"category\":\"content\",\"amount\":\"900\"},{\"category\":\"seo\",\"amount\":\"900\"}]}]" > /dev/null
PLAN2=$($PSQL "SELECT id FROM budget_plans WHERE name='Over';")
checkeq "over-budget plan rescaled" "1000" "$($PSQL "SELECT sum((line->>'amount')::int) FROM budget_plans, jsonb_array_elements(lines) AS line WHERE budget_plans.id='$PLAN2';")"

echo "===== 7. VALIDATION ====="
OUT=$(call "$ID_SAVE" "[\"$PID\",{\"name\":\"X\",\"total\":\"0\",\"currency\":\"USD\",\"lines\":[{\"category\":\"content\",\"amount\":\"10\"}]}]")
check "zero total rejected" "greater than zero" "$OUT"
OUT=$(call "$ID_SAVE" "[\"$PID\",{\"name\":\"Nothing\",\"total\":\"1000\",\"currency\":\"USD\",\"lines\":[{\"category\":\"content\",\"amount\":\"0\"}]}]")
check "all-zero allocation rejected" "Allocate the budget" "$OUT"
checkeq "nothing extra written" "2" "$($PSQL "SELECT count(*) FROM budget_plans;")"

echo "===== 8. MONEY IS STORED WITH ITS CURRENCY ====="
checkeq "currency stored" "0" "$($PSQL "SELECT count(*) FROM budget_plans WHERE currency IS NULL OR currency='';")"

echo "===== 9. ISOLATION AND CASCADE ====="
PLAN1=$($PSQL "SELECT id FROM budget_plans WHERE name='October';")
$PSQL "INSERT INTO projects (id,\"workspaceId\",name,industry,country,\"businessStage\",\"primaryGoal\",\"updatedAt\") VALUES ('bud-test-2','$LUMEN_WORKSPACE_ID','Other','saas','GB','IDEA','AWARENESS',now());" > /dev/null
OUT=$(call "$ID_DEL" "[\"bud-test-2\",\"$PLAN1\"]")
check   "cannot delete another project's plan" "does not exist" "$OUT"
checkeq "plan survives" "1" "$($PSQL "SELECT count(*) FROM budget_plans WHERE id='$PLAN1';")"

$PSQL "DELETE FROM projects WHERE id='$PID';" > /dev/null
checkeq "plans removed with project" "0" "$($PSQL "SELECT count(*) FROM budget_plans;")"

echo
echo "===== RESULT: $pass passed, $fail failed ====="
[ "$fail" -eq 0 ]
