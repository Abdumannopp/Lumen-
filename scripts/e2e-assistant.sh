#!/usr/bin/env bash
# End-to-end tests for the LUMEN Assistant.
# Uses the mock provider, so no API key, network or cost is involved.

BASE=http://localhost:3000
JAR=/tmp/lumen-as-jar.txt
export DB_PATH="${LUMEN_DB:-prisma/lumen.db}"
PSQL="./scripts/db.sh"
. "$(dirname "$0")/lib/session.sh"

pass=0; fail=0
check() {
  if printf '%s' "$3" | grep -qF -- "$2"; then echo "  PASS  $1"; pass=$((pass+1));
  else echo "  FAIL  $1 (expected: $2)"; fail=$((fail+1)); fi
}
absent() {
  if printf '%s' "$3" | grep -qF -- "$2"; then echo "  FAIL  $1 (should NOT contain: $2)"; fail=$((fail+1));
  else echo "  PASS  $1"; pass=$((pass+1)); fi
}
checkeq() {
  if [ "$2" = "$3" ]; then echo "  PASS  $1"; pass=$((pass+1));
  else echo "  FAIL  $1 (expected '$2', got '$3')"; fail=$((fail+1)); fi
}

action_fields() {
  A_REF=$(grep -o 'name="\$ACTION_1:0" value="[^"]*"' "$1" | sed 's/.*value="//;s/"$//' | sed 's/&quot;/"/g')
  A_KEY=$(grep -o 'name="\$ACTION_KEY" value="[^"]*"' "$1" | sed 's/.*value="//;s/"$//')
}

rm -f $JAR
$PSQL "DELETE FROM projects;" > /dev/null

PID=as-test-1
$PSQL "INSERT INTO projects (id,\"workspaceId\",name,industry,country,\"businessStage\",\"primaryGoal\",\"updatedAt\") VALUES ('$PID','$LUMEN_WORKSPACE_ID','Assistant Testbed','saas','US','SCALING','ACQUISITION',now());" > /dev/null
lumen_session_start "$JAR"

echo "===== 1. PAGE RENDERS ====="
P=$(curl -s -c $JAR -b $JAR "$BASE/assistant")
check "assistant page loads"        "Ask about this business"   "$P"
check "scoped to active project"    "Assistant Testbed"         "$P"
check "offers spec suggestions"     "What should I do next?"    "$P"
check "warns profile incomplete"    "Profile incomplete"        "$P"

echo "===== 2. CONVERSATION PERSISTENCE ====="
# Drive the real server action the way the browser does.
curl -s -c $JAR -b $JAR "$BASE/assistant" -o /tmp/as.html
ID_ASK=$(node -e "const m=require('$PWD/.next/server/server-reference-manifest.json').node;for(const[k,v]of Object.entries(m))if(v.exportedName==='askAssistantAction')console.log(k)")
OUT=$(curl -s -c $JAR -b $JAR -X POST "$BASE/assistant" \
  -H "Next-Action: $ID_ASK" -H "Content-Type: text/plain;charset=UTF-8" \
  --data-raw "[\"$PID\",null,\"What should I do next?\"]")

checkeq "conversation created"   "1" "$($PSQL "SELECT count(*) FROM conversations WHERE \"projectId\"='$PID';")"
checkeq "title derived"          "What should I do next?" "$($PSQL "SELECT title FROM conversations LIMIT 1;")"
checkeq "user + assistant turns" "2" "$($PSQL "SELECT count(*) FROM messages;")"
checkeq "structured answer saved" "1" "$($PSQL "SELECT count(*) FROM messages WHERE role='ASSISTANT' AND structured IS NOT NULL;")"
checkeq "reply linked to run"    "1" "$($PSQL "SELECT count(*) FROM messages WHERE \"agentRunId\" IS NOT NULL;")"
checkeq "agent run recorded"     "assistant" "$($PSQL "SELECT \"agentType\" FROM agent_runs ORDER BY \"startedAt\" DESC LIMIT 1;")"
checkeq "run succeeded"          "SUCCEEDED" "$($PSQL "SELECT status FROM agent_runs ORDER BY \"startedAt\" DESC LIMIT 1;")"

CID=$($PSQL "SELECT id FROM conversations LIMIT 1;")

echo "===== 3. STRUCTURED ANSWER RENDERS ====="
P=$(curl -s -c $JAR -b $JAR "$BASE/assistant?c=$CID")
check "shows insight section"       "Insight"            "$P"
check "shows why it matters"        "Why it matters"     "$P"
check "shows recommendation"        "Recommendation"     "$P"
check "shows next action"           "Next action"        "$P"
check "shows confidence"            "confidence"         "$P"
check "shows missing information"   "sharpen the answer" "$P"
check "history lists the thread"    "Recent conversations" "$P"

echo "===== 4. HONESTY GUARANTEES ====="
# The mock stands in for a model: its answer must still carry the hedging the
# schema requires, and no fabricated metric may appear anywhere.
checkeq "confidence stored"  "low" "$($PSQL "SELECT structured->>'confidence' FROM messages WHERE role='ASSISTANT' LIMIT 1;")"
absent  "no invented metrics" "impressions" "$P"
absent  "no invented ROI"     "ROI of"      "$P"

echo "===== 5. VALIDATION ====="
OUT=$(curl -s -c $JAR -b $JAR -X POST "$BASE/assistant" \
  -H "Next-Action: $ID_ASK" -H "Content-Type: text/plain;charset=UTF-8" \
  --data-raw "[\"$PID\",null,\" \"]")
check   "empty question refused" "Type a question first" "$OUT"
checkeq "no extra conversation"  "1" "$($PSQL "SELECT count(*) FROM conversations;")"

echo "===== 6. PROJECT ISOLATION ====="
$PSQL "INSERT INTO projects (id,\"workspaceId\",name,industry,country,\"businessStage\",\"primaryGoal\",\"updatedAt\") VALUES ('as-test-2','$LUMEN_WORKSPACE_ID','Other Co','saas','GB','IDEA','AWARENESS',now());" > /dev/null
# A conversation id from another project must not attach or be readable.
OTHER=$(curl -s -c $JAR -b $JAR -X POST "$BASE/assistant" \
  -H "Next-Action: $ID_ASK" -H "Content-Type: text/plain;charset=UTF-8" \
  --data-raw "[\"as-test-2\",\"$CID\",\"Hello from another project\"]")
# Zero is the pass condition: the message from the other project must not have
# landed in this project's thread, even though a valid id was supplied.
checkeq "did not attach to foreign thread" "0" "$($PSQL "SELECT count(*) FROM messages WHERE \"conversationId\"='$CID' AND content LIKE '%another project%';")"
checkeq "created its own thread"           "2" "$($PSQL "SELECT count(*) FROM conversations;")"

echo "===== 7. CASCADE ====="
$PSQL "DELETE FROM projects WHERE id='$PID';" > /dev/null
checkeq "conversations removed with project" "1" "$($PSQL "SELECT count(*) FROM conversations;")"
checkeq "messages removed too"               "2" "$($PSQL "SELECT count(*) FROM messages;")"

echo
echo "===== RESULT: $pass passed, $fail failed ====="
[ "$fail" -eq 0 ]
