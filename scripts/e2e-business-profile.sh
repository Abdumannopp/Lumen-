#!/usr/bin/env bash
# End-to-end tests for LUMEN business onboarding.
# Calls the real server actions over the RSC RPC path and verifies the database.

BASE=http://localhost:3000
JAR=/tmp/lumen-bp-jar.txt
export DB_PATH="${LUMEN_DB:-prisma/lumen.db}"
PSQL="./scripts/db.sh"
. "$(dirname "$0")/lib/session.sh"

pass=0; fail=0
check() {
  if printf '%s' "$3" | grep -qF -- "$2"; then echo "  PASS  $1"; pass=$((pass+1));
  else echo "  FAIL  $1 (expected to find: $2)"; fail=$((fail+1)); fi
}
checkeq() {
  if [ "$2" = "$3" ]; then echo "  PASS  $1"; pass=$((pass+1));
  else echo "  FAIL  $1 (expected '$2', got '$3')"; fail=$((fail+1)); fi
}

aid() { # aid <exportedName>
  node -e "const m=require('$PWD/.next/server/server-reference-manifest.json').node;for(const[k,v]of Object.entries(m))if(v.exportedName==='$1')console.log(k)"
}

# The flow is one progressive-enhancement form, so it is driven exactly as a
# browser without JavaScript would: read the action fields out of the rendered
# HTML, then POST them back with the answers.
ONBOARDING_PATH=""
action_fields() { # action_fields <html-file>
  A_REF=$(grep -o 'name="\$ACTION_1:0" value="[^"]*"' "$1" | sed 's/.*value="//;s/"$//' | sed 's/&quot;/"/g')
  A_STATE=$(grep -o 'name="\$ACTION_1:1" value="[^"]*"' "$1" | sed 's/.*value="//;s/"$//' | sed 's/&quot;/"/g')
  A_KEY=$(grep -o 'name="\$ACTION_KEY" value="[^"]*"' "$1" | sed 's/.*value="//;s/"$//')
}

submit() { # submit <intent> <step> <curl -F args...>
  local intent=$1 step=$2; shift 2
  curl -s -c $JAR -b $JAR "$BASE$ONBOARDING_PATH" -o /tmp/bp-form.html
  action_fields /tmp/bp-form.html
  curl -s -c $JAR -b $JAR -X POST "$BASE$ONBOARDING_PATH" \
    -F "\$ACTION_REF_1=" -F "\$ACTION_1:0=$A_REF" -F "\$ACTION_1:1=$A_STATE" -F "\$ACTION_KEY=$A_KEY" \
    -F "projectId=$PID" -F "step=$step" -F "intent=$intent" "$@"
}

$PSQL "DELETE FROM projects;" > /dev/null
lumen_session_start "$JAR"

# Seed a project directly: project creation is already covered by the other suite.
# The id is set explicitly, so it is used directly — capturing psql's RETURNING
# output would also capture its "INSERT 0 1" command tag.
PID=bp-test-1
$PSQL "INSERT INTO projects (id,\"workspaceId\",name,industry,country,\"businessStage\",\"primaryGoal\",\"updatedAt\") VALUES ('$PID','$LUMEN_WORKSPACE_ID','Testbed Co','saas','US','SCALING','ACQUISITION',now());" > /dev/null
ONBOARDING_PATH="/projects/$PID/onboarding"
echo "seeded project: $PID"

echo "===== 1. ONBOARDING PAGE ====="
PAGE=$(curl -s -c $JAR -b $JAR "$BASE/projects/$PID/onboarding")
check "flow renders"            "What is the business?"     "$PAGE"
check "all steps mounted"       "Brand voice"               "$PAGE"
check "step labels present"     "Offering"                  "$PAGE"
check "prefilled from project"  "Testbed Co"                "$PAGE"

echo "===== 2. AUTOSAVE (partial draft must not be rejected) ====="
OUT=$(submit save 1 \
  -F "name=Testbed Co" -F "website=" -F "industry=saas" -F "country=US" \
  -F "businessStage=SCALING" -F "primaryGoal=ACQUISITION" \
  -F "productOrService=A test harness" -F "businessModel=" -F "targetCustomers=" \
  -F "monthlyBudgetAmount=" -F "monthlyBudgetCurrency=" -F "notes=")
checkeq "profile row created"      "1" "$($PSQL "SELECT count(*) FROM business_profiles WHERE \"projectId\"='$PID';")"
checkeq "partial answer persisted" "A test harness" "$($PSQL "SELECT \"productOrService\" FROM business_profiles WHERE \"projectId\"='$PID';")"
checkeq "lastStep recorded"        "1" "$($PSQL "SELECT \"lastStep\" FROM business_profiles WHERE \"projectId\"='$PID';")"
checkeq "not marked complete"      "" "$($PSQL "SELECT \"completedAt\" FROM business_profiles WHERE \"projectId\"='$PID';")"

echo "===== 3. RESUME ====="
PAGE=$(curl -s -c $JAR -b $JAR "$BASE/projects/$PID/onboarding")
check "resumes where it left off" "Resuming onboarding" "$PAGE"
check "saved answer rendered back" "A test harness"     "$PAGE"

echo "===== 4. AUTOSAVE IS LENIENT (malformed values dropped, not rejected) ====="
submit save 3 \
  -F "name=Testbed Co" -F "industry=saas" -F "country=US" \
  -F "businessStage=SCALING" -F "primaryGoal=ACQUISITION" \
  -F "productOrService=A test harness" \
  -F "businessModel=NOT_A_REAL_MODEL" -F "monthlyBudgetAmount=not-a-number" \
  -F "currentMarketingChannels=seo" -F "currentMarketingChannels=bogus-channel" > /dev/null
checkeq "bad enum dropped, not stored"   "" "$($PSQL "SELECT \"businessModel\" FROM business_profiles WHERE \"projectId\"='$PID';")"
checkeq "bad number dropped"             "" "$($PSQL "SELECT \"monthlyBudgetAmount\" FROM business_profiles WHERE \"projectId\"='$PID';")"
checkeq "valid channel kept, junk removed" 'seo' "$($PSQL "SELECT \"currentMarketingChannels\" FROM business_profiles WHERE \"projectId\"='$PID';")"
checkeq "draft still saved"              "3" "$($PSQL "SELECT \"lastStep\" FROM business_profiles WHERE \"projectId\"='$PID';")"

echo "===== 5. STEP VALIDATION IS STRICT ====="
OUT=$(submit next 1 -F "productOrService=" -F "businessModel=")
check "empty required field rejected" "Describe what you sell." "$OUT"
check "missing model rejected"        "Choose the closest business model." "$OUT"

submit next 1 -F "productOrService=A test harness" -F "businessModel=SUBSCRIPTION" > /dev/null
# lastStep is monotonic by design: it records the furthest point reached, so
# stepping back and forward again must not rewind the resume position (3 was
# already reached above).
checkeq "lastStep never rewinds" "3" "$($PSQL "SELECT \"lastStep\" FROM business_profiles WHERE \"projectId\"='$PID';")"
checkeq "model stored on advance" "SUBSCRIPTION" "$($PSQL "SELECT \"businessModel\" FROM business_profiles WHERE \"projectId\"='$PID';")"

echo "===== 6. OPTIONAL FIELDS CAN BE SKIPPED ====="
submit next 4 -F "x=y" > /dev/null
checkeq "wholly optional step advances" "5" "$($PSQL "SELECT \"lastStep\" FROM business_profiles WHERE \"projectId\"='$PID';")"

echo "===== 7. COMPLETION BLOCKED WHILE REQUIRED ANSWERS MISSING ====="
OUT=$(submit complete 6 \
  -F "name=Testbed Co" -F "industry=saas" -F "country=US" \
  -F "businessStage=SCALING" -F "primaryGoal=ACQUISITION" \
  -F "productOrService=A test harness" -F "businessModel=SUBSCRIPTION" \
  -F "targetCustomers=")
check "incomplete profile refused" "Customers" "$OUT"
checkeq "still not complete" "" "$($PSQL "SELECT \"completedAt\" FROM business_profiles WHERE \"projectId\"='$PID';")"

echo "===== 8. COMPLETION SUCCEEDS WITH EVERY REQUIRED ANSWER ====="
submit complete 6 \
  -F "name=Testbed Co" -F "website=testbed.co" -F "industry=saas" -F "country=US" \
  -F "targetMarkets=R-NA" -F "description=A harness for tests." \
  -F "businessStage=SCALING" -F "primaryGoal=ACQUISITION" \
  -F "productOrService=A test harness sold as a subscription" \
  -F "businessModel=SUBSCRIPTION" \
  -F "targetCustomers=Engineering teams that ship on Fridays" \
  -F "currentMarketingChannels=seo" -F "currentMarketingChannels=content" \
  -F "monthlyBudgetAmount=5000" -F "monthlyBudgetCurrency=USD" \
  -F "currentChallenges=no-attribution" -F "knownCompetitors=rival.com" \
  -F "brandVoice=technical" -F "linkedinUrl=linkedin.com/company/testbed" \
  -F "notes=Founder-led marketing." > /dev/null
checkeq "marked complete"       "1" "$($PSQL "SELECT count(*) FROM business_profiles WHERE \"projectId\"='$PID' AND \"completedAt\" IS NOT NULL;")"
checkeq "budget stored"         "5000" "$($PSQL "SELECT \"monthlyBudgetAmount\" FROM business_profiles WHERE \"projectId\"='$PID';")"
checkeq "social url normalised" "https://linkedin.com/company/testbed" "$($PSQL "SELECT \"linkedinUrl\" FROM business_profiles WHERE \"projectId\"='$PID';")"
checkeq "competitors stored"    'rival.com' "$($PSQL "SELECT \"knownCompetitors\" FROM business_profiles WHERE \"projectId\"='$PID';")"

echo "===== 8b. NO WEBSITE AND NO BUDGET DO NOT BLOCK COMPLETION ====="
# Both are acceptance tests from section 7 of the brief, and getting either
# wrong is the same mistake: treating "I do not have one" as "you have not
# answered". A business with no website is a business, and a budget of zero is
# an answer — the weekly plan reads it as one.
$PSQL "DELETE FROM business_profiles WHERE \"projectId\"='$PID';" > /dev/null
$PSQL "UPDATE projects SET website=NULL WHERE id='$PID';" > /dev/null

submit complete 6 \
  -F "name=Testbed Co" -F "website=" -F "industry=saas" -F "country=US" \
  -F "businessStage=SCALING" -F "primaryGoal=ACQUISITION" \
  -F "productOrService=A test harness sold as a subscription" \
  -F "businessModel=SUBSCRIPTION" \
  -F "targetCustomers=Engineering teams that ship on Fridays" \
  -F "monthlyBudgetAmount=0" > /dev/null
checkeq "completed with no website" "1" \
  "$($PSQL "SELECT count(*) FROM business_profiles WHERE \"projectId\"='$PID' AND \"completedAt\" IS NOT NULL;")"
checkeq "and the website stayed empty" "" "$($PSQL "SELECT website FROM projects WHERE id='$PID';")"
checkeq "zero budget stored as zero, not null" "0" \
  "$($PSQL "SELECT \"monthlyBudgetAmount\" FROM business_profiles WHERE \"projectId\"='$PID';")"

# Put the full answers back, so the sections below still describe a filled-in
# profile rather than this deliberately sparse one.
$PSQL "UPDATE projects SET website='https://testbed.co', \"targetMarkets\"=ARRAY['R-NA']::TEXT[] WHERE id='$PID';" > /dev/null
$PSQL "UPDATE business_profiles SET \"monthlyBudgetAmount\"=5000, \"monthlyBudgetCurrency\"='USD', \"linkedinUrl\"='https://linkedin.com/company/testbed', \"knownCompetitors\"=ARRAY['rival.com']::TEXT[], \"currentMarketingChannels\"=ARRAY['seo','content']::TEXT[], \"currentChallenges\"=ARRAY['no-attribution']::TEXT[], \"brandVoice\"=ARRAY['technical']::TEXT[], notes='Founder-led marketing.' WHERE \"projectId\"='$PID';" > /dev/null

echo "===== 9. PROJECT-OWNED FIELDS WRITTEN TO PROJECT, NOT DUPLICATED ====="
checkeq "website on project row" "https://testbed.co" "$($PSQL "SELECT website FROM projects WHERE id='$PID';")"
checkeq "markets on project row" 'R-NA' "$($PSQL "SELECT \"targetMarkets\" FROM projects WHERE id='$PID';")"
checkeq "no duplicate website column on profile" "0" "$($PSQL "SELECT count(*) FROM information_schema.columns WHERE table_name='business_profiles' AND column_name='website';")"

echo "===== 10. PROFILE PAGE ====="
PAGE=$(curl -s -c $JAR -b $JAR "$BASE/projects/$PID/profile")
check "profile renders"        "Business profile"  "$PAGE"
check "shows complete badge"   "Complete"          "$PAGE"
check "shows offering"         "test harness"      "$PAGE"
check "shows customers"        "ship on Fridays"   "$PAGE"
check "shows channels"         "SEO"               "$PAGE"
check "shows budget"           "5,000"             "$PAGE"
check "shows competitor"       "rival.com"         "$PAGE"
check "shows notes"            "Founder-led"       "$PAGE"

echo "===== 11. CASCADE DELETE ====="
$PSQL "DELETE FROM projects WHERE id='$PID';" > /dev/null
checkeq "profile removed with project" "0" "$($PSQL "SELECT count(*) FROM business_profiles WHERE \"projectId\"='$PID';")"

echo
echo "===== RESULT: $pass passed, $fail failed ====="
[ "$fail" -eq 0 ]
