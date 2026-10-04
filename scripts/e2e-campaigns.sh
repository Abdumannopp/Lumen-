#!/usr/bin/env bash
# End-to-end tests for ORBIT (campaigns). Mock provider — no key, no cost.

BASE=http://localhost:3000
JAR=/tmp/lumen-cmp-jar.txt
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
  curl -s -c $JAR -b $JAR -X POST "$BASE/campaigns" \
    -H "Next-Action: $1" -H "Content-Type: text/plain;charset=UTF-8" --data-raw "$2"
}

rm -f $JAR
$PSQL "DELETE FROM projects;" > /dev/null
PID=cmp-test-1
$PSQL "INSERT INTO projects (id,\"workspaceId\",name,industry,country,\"businessStage\",\"primaryGoal\",\"updatedAt\") VALUES ('$PID','$LUMEN_WORKSPACE_ID','Campaign Testbed','saas','US','SCALING','ACQUISITION',now());" > /dev/null
lumen_session_start "$JAR"

ID_PLAN=$(aid planCampaignAction)
ID_SAVE=$(aid saveCampaignAction)
ID_STATUS=$(aid setCampaignStatusAction)
ID_DEL=$(aid deleteCampaignAction)

echo "===== 1. GATING AND THE NO-ADS CONTRACT ====="
P=$(curl -s -c $JAR -b $JAR "$BASE/campaigns")
check "states no ad platform"   "No ad platform is connected" "$P"
check "blocks planning"         "Finish the business profile first" "$P"
check "manual entry offered"    "Add campaign"                "$P"

$PSQL "INSERT INTO business_profiles (id,\"projectId\",\"productOrService\",\"businessModel\",\"targetCustomers\",\"lastStep\",\"completedAt\",\"updatedAt\") VALUES ('bp-cmp-1','$PID','A harness','SUBSCRIPTION','Teams',6,now(),now());" > /dev/null

P=$(curl -s -c $JAR -b $JAR "$BASE/campaigns")
check "spec empty state"  "No campaigns yet"  "$P"
check "offers planning"   "Plan a campaign"   "$P"

echo "===== 2. VALIDATION BEFORE ANY AI CALL ====="
OUT=$(call "$ID_PLAN" "[\"$PID\",{\"brief\":\"\"}]")
check "empty brief rejected" "Describe the campaign" "$OUT"
OUT=$(call "$ID_PLAN" "[\"$PID\",{\"brief\":\"B\",\"startDate\":\"2026-10-10\",\"endDate\":\"2026-10-01\"}]")
check "reversed dates rejected" "end date is before" "$OUT"
checkeq "nothing created"  "0" "$($PSQL "SELECT count(*) FROM campaigns;")"
checkeq "no AI call wasted" "0" "$($PSQL "SELECT count(*) FROM agent_runs WHERE \"agentType\"='orbit';")"

echo "===== 3. PLANNING ====="
call "$ID_PLAN" "[\"$PID\",{\"brief\":\"Launch the new tier\",\"budgetAmount\":1000,\"budgetCurrency\":\"USD\",\"startDate\":\"2026-10-01\",\"endDate\":\"2026-10-31\"}]" > /dev/null
checkeq "campaign created"   "1" "$($PSQL "SELECT count(*) FROM campaigns WHERE \"projectId\"='$PID';")"
checkeq "starts as DRAFT"    "DRAFT" "$($PSQL "SELECT status FROM campaigns LIMIT 1;")"
checkeq "linked to a run"    "orbit" "$($PSQL "SELECT \"agentType\" FROM agent_runs ORDER BY \"startedAt\" DESC LIMIT 1;")"
checkeq "budget stored with currency" "1000|USD" "$($PSQL "SELECT \"totalBudgetAmount\" || '|' || \"totalBudgetCurrency\" FROM campaigns LIMIT 1;")"
checkeq "kpi framework stored" "1" "$($PSQL "SELECT jsonb_array_length(\"kpiFramework\") FROM campaigns LIMIT 1;")"
checkeq "funnel stored"        "2" "$($PSQL "SELECT jsonb_array_length(funnel) FROM campaigns LIMIT 1;")"

echo "===== 4. BUDGET ALWAYS ADDS UP (mock returns 97%) ====="
# Percentages are rescaled to exactly 100 and the money to exactly the budget.
checkeq "percentages total 100" "100" "$($PSQL "SELECT round(sum((line->>'percent')::numeric)) FROM campaigns, jsonb_array_elements(\"budgetAllocation\") AS line;")"
checkeq "amounts total the budget" "1000" "$($PSQL "SELECT sum((line->>'amount')::int) FROM campaigns, jsonb_array_elements(\"budgetAllocation\") AS line;")"
checkeq "every line has a rationale" "0" "$($PSQL "SELECT count(*) FROM campaigns, jsonb_array_elements(\"budgetAllocation\") AS line WHERE line->>'rationale'='';")"

P=$(curl -s -c $JAR -b $JAR "$BASE/campaigns")
check "labels ORBIT output" "ORBIT" "$P"

# ORBIT proposes what to measure, never what the number will be. The schema has
# no target field at all, so a predicted value cannot be stored even if a model
# tried to return one.
checkeq "KPIs carry no predicted targets" "0" "$($PSQL "SELECT count(*) FROM campaigns, jsonb_array_elements(\"kpiFramework\") AS line WHERE line->>'target' IS NOT NULL;")"
checkeq "every KPI explains why it matters" "0" "$($PSQL "SELECT count(*) FROM campaigns, jsonb_array_elements(\"kpiFramework\") AS line WHERE line->>'why' IS NULL OR line->>'why'='';")"

echo "===== 5. CHANGING THE BUDGET RE-DERIVES THE SPLIT ====="
CID=$($PSQL "SELECT id FROM campaigns LIMIT 1;")
call "$ID_SAVE" "[\"$PID\",{\"campaignId\":\"$CID\",\"name\":\"Renamed\",\"objective\":\"Same objective\",\"channels\":[\"meta-ads\",\"email\"],\"totalBudgetAmount\":\"2000\",\"totalBudgetCurrency\":\"USD\",\"status\":\"PLANNED\"}]" > /dev/null
checkeq "budget updated"        "2000" "$($PSQL "SELECT \"totalBudgetAmount\" FROM campaigns WHERE id='$CID';")"
checkeq "amounts re-derived"    "2000" "$($PSQL "SELECT sum((line->>'amount')::int) FROM campaigns, jsonb_array_elements(\"budgetAllocation\") AS line WHERE campaigns.id='$CID';")"
checkeq "editing marks it EDITED" "EDITED" "$($PSQL "SELECT source FROM campaigns WHERE id='$CID';")"

echo "===== 6. MANUAL CAMPAIGNS AND VALIDATION ====="
call "$ID_SAVE" "[\"$PID\",{\"name\":\"Hand written\",\"objective\":\"Written by the operator\",\"channels\":[\"seo\"],\"status\":\"DRAFT\"}]" > /dev/null
checkeq "manual campaign created" "1" "$($PSQL "SELECT count(*) FROM campaigns WHERE source='MANUAL';")"

OUT=$(call "$ID_SAVE" "[\"$PID\",{\"name\":\"X\",\"objective\":\"\",\"channels\":[],\"status\":\"DRAFT\"}]")
check   "short name rejected"     "Give the campaign a name." "$OUT"
check   "empty objective rejected" "Say what this campaign is for." "$OUT"
checkeq "nothing written"          "2" "$($PSQL "SELECT count(*) FROM campaigns;")"

OUT=$(call "$ID_SAVE" "[\"$PID\",{\"name\":\"Dates\",\"objective\":\"Test\",\"channels\":[],\"status\":\"DRAFT\",\"startDate\":\"2026-12-01\",\"endDate\":\"2026-11-01\"}]")
check "reversed dates rejected on save" "end date is before" "$OUT"

echo "===== 7. STATUS LIFECYCLE ====="
for S in PLANNED ACTIVE PAUSED COMPLETED; do
  call "$ID_STATUS" "[\"$PID\",\"$CID\",\"$S\"]" > /dev/null
done
checkeq "reached COMPLETED" "COMPLETED" "$($PSQL "SELECT status FROM campaigns WHERE id='$CID';")"

echo "===== 8. ISOLATION AND CASCADE ====="
$PSQL "INSERT INTO projects (id,\"workspaceId\",name,industry,country,\"businessStage\",\"primaryGoal\",\"updatedAt\") VALUES ('cmp-test-2','$LUMEN_WORKSPACE_ID','Other','saas','GB','IDEA','AWARENESS',now());" > /dev/null
OUT=$(call "$ID_STATUS" "[\"cmp-test-2\",\"$CID\",\"DRAFT\"]")
check   "cannot restatus another project's campaign" "does not exist" "$OUT"
OUT=$(call "$ID_DEL" "[\"cmp-test-2\",\"$CID\"]")
check   "cannot delete another project's campaign"   "does not exist" "$OUT"
checkeq "still COMPLETED" "COMPLETED" "$($PSQL "SELECT status FROM campaigns WHERE id='$CID';")"

$PSQL "DELETE FROM projects WHERE id='$PID';" > /dev/null
checkeq "campaigns removed with project" "0" "$($PSQL "SELECT count(*) FROM campaigns;")"

echo
echo "===== RESULT: $pass passed, $fail failed ====="
[ "$fail" -eq 0 ]
