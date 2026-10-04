#!/usr/bin/env bash
# End-to-end tests for MUSE (content). Mock provider — no key, no cost.

BASE=http://localhost:3000
JAR=/tmp/lumen-co-jar.txt
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
  curl -s -c $JAR -b $JAR -X POST "$BASE/content" \
    -H "Next-Action: $1" -H "Content-Type: text/plain;charset=UTF-8" --data-raw "$2"
}

rm -f $JAR
$PSQL "DELETE FROM projects;" > /dev/null
PID=co-test-1
$PSQL "INSERT INTO projects (id,\"workspaceId\",name,industry,country,\"businessStage\",\"primaryGoal\",\"updatedAt\") VALUES ('$PID','$LUMEN_WORKSPACE_ID','Content Testbed','saas','US','SCALING','ACQUISITION',now());" > /dev/null
lumen_session_start "$JAR"

ID_GEN=$(aid generateContentAction)
ID_SAVE=$(aid saveContentItemAction)
ID_STATUS=$(aid setContentStatusAction)
ID_DEL=$(aid deleteContentItemAction)

echo "===== 1. GATED ON A COMPLETE PROFILE ====="
P=$(curl -s -c $JAR -b $JAR "$BASE/content")
check "blocks generation on a thin profile" "Finish the business profile first" "$P"
check "manual entry still offered"          "Add item"                          "$P"

$PSQL "INSERT INTO business_profiles (id,\"projectId\",\"productOrService\",\"businessModel\",\"targetCustomers\",\"lastStep\",\"completedAt\",\"updatedAt\") VALUES ('bp-co-1','$PID','A test harness','SUBSCRIPTION','Engineering teams',6,now(),now());" > /dev/null

echo "===== 2. EMPTY STATE AND BRAND VOICE NOTE ====="
P=$(curl -s -c $JAR -b $JAR "$BASE/content")
check "spec empty state"        "No content planned"          "$P"
check "flags missing voice"     "No brand voice is recorded"  "$P"
check "offers generation"       "Generate content"            "$P"

echo "===== 3. GENERATION ====="
call "$ID_GEN" "[\"$PID\",{\"platform\":\"LINKEDIN\",\"type\":\"POST\",\"count\":3}]" > /dev/null
checkeq "three items created"  "3" "$($PSQL "SELECT count(*) FROM content_items WHERE \"projectId\"='$PID';")"
checkeq "linked to a run"      "muse" "$($PSQL "SELECT \"agentType\" FROM agent_runs ORDER BY \"startedAt\" DESC LIMIT 1;")"
checkeq "starts as IDEA"       "3" "$($PSQL "SELECT count(*) FROM content_items WHERE status='IDEA';")"
checkeq "marked AI-sourced"    "3" "$($PSQL "SELECT count(*) FROM content_items WHERE source='AI';")"
# The requested platform wins even though the mock returns INSTAGRAM.
checkeq "requested platform enforced" "3" "$($PSQL "SELECT count(*) FROM content_items WHERE platform='LINKEDIN';")"
checkeq "hook stored separately" "3" "$($PSQL "SELECT count(*) FROM content_items WHERE hook IS NOT NULL AND cta IS NOT NULL;")"

P=$(curl -s -c $JAR -b $JAR "$BASE/content")
check "renders hook"     "Mock hook 1"  "$P"
check "labels MUSE"      "MUSE"         "$P"
check "offers filters"   "All platforms" "$P"

echo "===== 4. COUNT IS BOUNDED ====="
call "$ID_GEN" "[\"$PID\",{\"platform\":\"X\",\"type\":\"POST\",\"count\":999}]" > /dev/null
checkeq "capped at 8 per batch" "8" "$($PSQL "SELECT count(*) FROM content_items WHERE platform='X';")"

echo "===== 5. GENERATION APPENDS, NEVER REPLACES ====="
checkeq "earlier batch survives" "3" "$($PSQL "SELECT count(*) FROM content_items WHERE platform='LINKEDIN';")"
checkeq "total accumulates"      "11" "$($PSQL "SELECT count(*) FROM content_items;")"

echo "===== 6. MANUAL ITEMS AND VALIDATION ====="
call "$ID_SAVE" "[\"$PID\",{\"platform\":\"BLOG\",\"type\":\"ARTICLE\",\"status\":\"DRAFT\",\"objective\":\"Explain the pricing change\",\"hook\":\"Our pricing changed\",\"body\":\"Long form.\",\"cta\":\"Read the FAQ\"}]" > /dev/null
checkeq "manual item created" "1" "$($PSQL "SELECT count(*) FROM content_items WHERE source='MANUAL';")"

OUT=$(call "$ID_SAVE" "[\"$PID\",{\"platform\":\"BLOG\",\"type\":\"ARTICLE\",\"status\":\"DRAFT\",\"objective\":\"\"}]")
check   "empty objective rejected" "Say what this piece is for." "$OUT"
checkeq "nothing written"          "12" "$($PSQL "SELECT count(*) FROM content_items;")"

OUT=$(call "$ID_SAVE" "[\"$PID\",{\"platform\":\"BLOG\",\"type\":\"ARTICLE\",\"status\":\"DRAFT\",\"objective\":\"Valid\",\"scheduledAt\":\"not-a-date\"}]")
check   "bad date rejected" "Enter a valid date." "$OUT"

echo "===== 7. EDITING ADOPTS AN AI ITEM ====="
AIITEM=$($PSQL "SELECT id FROM content_items WHERE source='AI' LIMIT 1;")
call "$ID_SAVE" "[\"$PID\",{\"itemId\":\"$AIITEM\",\"platform\":\"LINKEDIN\",\"type\":\"POST\",\"status\":\"APPROVED\",\"objective\":\"Edited by hand\"}]" > /dev/null
checkeq "source flipped to EDITED" "EDITED" "$($PSQL "SELECT source FROM content_items WHERE id='$AIITEM';")"
checkeq "status change persisted"  "APPROVED" "$($PSQL "SELECT status FROM content_items WHERE id='$AIITEM';")"

echo "===== 8. STATUS LIFECYCLE ====="
call "$ID_STATUS" "[\"$PID\",\"$AIITEM\",\"SCHEDULED\"]" > /dev/null
checkeq "moved to SCHEDULED" "SCHEDULED" "$($PSQL "SELECT status FROM content_items WHERE id='$AIITEM';")"
call "$ID_STATUS" "[\"$PID\",\"$AIITEM\",\"PUBLISHED\"]" > /dev/null
checkeq "moved to PUBLISHED" "PUBLISHED" "$($PSQL "SELECT status FROM content_items WHERE id='$AIITEM';")"

echo "===== 9. ISOLATION AND CASCADE ====="
$PSQL "INSERT INTO projects (id,\"workspaceId\",name,industry,country,\"businessStage\",\"primaryGoal\",\"updatedAt\") VALUES ('co-test-2','$LUMEN_WORKSPACE_ID','Other Co','saas','GB','IDEA','AWARENESS',now());" > /dev/null
OUT=$(call "$ID_DEL" "[\"co-test-2\",\"$AIITEM\"]")
check   "cannot delete another project's item" "does not exist" "$OUT"
OUT=$(call "$ID_STATUS" "[\"co-test-2\",\"$AIITEM\",\"IDEA\"]")
check   "cannot restatus another project's item" "does not exist" "$OUT"
checkeq "item untouched" "PUBLISHED" "$($PSQL "SELECT status FROM content_items WHERE id='$AIITEM';")"

$PSQL "DELETE FROM projects WHERE id='$PID';" > /dev/null
checkeq "content removed with project" "0" "$($PSQL "SELECT count(*) FROM content_items;")"

echo
echo "===== RESULT: $pass passed, $fail failed ====="
[ "$fail" -eq 0 ]
