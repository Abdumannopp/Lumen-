#!/usr/bin/env bash
# End-to-end tests for the LUMEN Overview dashboard.
# Verifies the two questions it must answer, and that nothing is fabricated.

BASE=http://localhost:3000
JAR=/tmp/lumen-dash-jar.txt
export DB_PATH="${LUMEN_DB:-prisma/lumen.db}"
PSQL="./scripts/db.sh"
. "$(dirname "$0")/lib/session.sh"

pass=0; fail=0
check() {
  if printf '%s' "$3" | grep -qF -- "$2"; then echo "  PASS  $1"; pass=$((pass+1));
  else echo "  FAIL  $1 (expected to find: $2)"; fail=$((fail+1)); fi
}
absent() {
  if printf '%s' "$3" | grep -qF -- "$2"; then echo "  FAIL  $1 (should NOT contain: $2)"; fail=$((fail+1));
  else echo "  PASS  $1"; pass=$((pass+1)); fi
}

$PSQL "DELETE FROM projects;" > /dev/null
rm -f $JAR

PID=dash-test-1
$PSQL "INSERT INTO projects (id,\"workspaceId\",name,industry,country,\"businessStage\",\"primaryGoal\",\"updatedAt\") VALUES ('$PID','$LUMEN_WORKSPACE_ID','Dashboard Co','saas','US','SCALING','ACQUISITION',now());" > /dev/null
# Select it, so the dashboard is scoped to this project.
lumen_session_start "$JAR"

echo "===== 1. INCOMPLETE PROFILE ====="
D=$(curl -s -c $JAR -b $JAR "$BASE/overview")
check "shows active project"      "Dashboard Co"        "$D"
check "shows stage"               "Scaling"             "$D"
check "shows primary goal"        "Acquisition"         "$D"
check "quick action prompts setup" "Finish profile"     "$D"
check "explains the blocker"      "required answers recorded" "$D"

check "all six status cards: strategy"  "Strategy"  "$D"
check "status card: audience"           "Audience"  "$D"
check "status card: content"            "Content"   "$D"
check "status card: campaigns"          "Campaigns" "$D"
check "status card: analytics"          "Analytics" "$D"
check "status card: growth"             "Growth"    "$D"

check "section: business snapshot" "Business snapshot"    "$D"
check "section: recent insights"   "Recent insights"      "$D"
check "section: active campaigns"  "Active campaigns"     "$D"
check "section: upcoming content"  "Upcoming content"     "$D"
check "section: growth opportunities" "Growth opportunities" "$D"
check "section: next actions"      "Next actions"         "$D"

check "empty state copy"           "No campaigns yet"     "$D"
check "blocked modules say why"    "Needs a complete business profile." "$D"
check "next action is the profile" "business profile"     "$D"
check "next action explains why"   "Everything else builds on this."    "$D"

echo "===== 2. NO FABRICATED MARKETING DATA ====="
# A brand-new install has no metrics of any kind. Any of these strings would
# mean the dashboard invented a number rather than reporting absence.
absent "no fake impressions"  "impressions" "$D"
absent "no fake click-through" "CTR"        "$D"
absent "no fake conversion rate" "conversion rate" "$D"
absent "no fake percentage deltas" "% vs last" "$D"
absent "no invented spend"    "Spent this month" "$D"

echo "===== 3. UNSET FIELDS READ AS UNSET, NOT ZERO ====="
check "snapshot marks gaps"   "Not set" "$D"
absent "budget not shown as 0" "0 USD"  "$D"

echo "===== 4. COMPLETE PROFILE CHANGES THE ANSWERS ====="
$PSQL "UPDATE projects SET website='https://dash.co', \"targetMarkets\"='{R-NA}', description='A test business.' WHERE id='$PID';" > /dev/null
$PSQL "INSERT INTO business_profiles (id,\"projectId\",\"productOrService\",\"businessModel\",\"targetCustomers\",\"currentMarketingChannels\",\"monthlyBudgetAmount\",\"monthlyBudgetCurrency\",\"knownCompetitors\",\"brandVoice\",\"lastStep\",\"completedAt\",\"updatedAt\") VALUES ('bp-dash-1','$PID','A dashboard','SUBSCRIPTION','Growth teams','{seo,content}',4000,'USD','{rival.com}','{technical}',6,now(),now());" > /dev/null

D2=$(curl -s -c $JAR -b $JAR "$BASE/overview")
check "quick action becomes profile link" "Business profile" "$D2"
absent "setup banner gone"                "required answers recorded" "$D2"
check "audience reflects the profile"     "Customers described in the profile" "$D2"
# Every module on this dashboard is backed by a real table. An empty one must
# name what is missing and link to the page that fills it — it must never claim
# the module itself does not exist yet.
absent "no module claims to be unbuilt"   "Ships in a later phase." "$D2"
check "empty strategy offers the route"   "No strategy generated yet." "$D2"
check "empty content offers the route"    "No content created yet." "$D2"
check "analytics is honest about syncing" "LUMEN connects to no ad platform." "$D2"
check "status cards link to real pages"   'href="/strategy"' "$D2"
check "snapshot shows real budget"        "4,000 USD" "$D2"
check "snapshot shows real channels"      "SEO"       "$D2"
# Profile gaps are all closed on this fixture, so nothing from that list should
# remain. What is left is the critical path: a complete profile with no strategy
# behind it has an obvious next step, and the dashboard names it.
absent "no profile gaps left"             "Add the website" "$D2"
absent "no budget gap left"               "Add a monthly marketing budget" "$D2"
check "next step is the critical path"    "Generate a strategy" "$D2"
check "and says why it comes first"       "everything else works from" "$D2"

echo "===== 5. ARCHIVED-ONLY INSTALL ====="
$PSQL "UPDATE projects SET \"archivedAt\"=now() WHERE id='$PID';" > /dev/null
D3=$(curl -s -c $JAR -b $JAR "$BASE/overview")
check "falls back to no-active-project state" "No active project" "$D3"

echo
echo "===== RESULT: $pass passed, $fail failed ====="
[ "$fail" -eq 0 ]
