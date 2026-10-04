#!/usr/bin/env bash
# End-to-end tests for the LUMEN AI runtime.
# Drives the gated self-test endpoint, which uses the deterministic mock
# provider — no API key, no network, no cost.

BASE=http://localhost:3000
JAR=/tmp/lumen-ai-jar.txt
export DB_PATH="${LUMEN_DB:-prisma/lumen.db}"
PSQL="./scripts/db.sh"
. "$(dirname "$0")/lib/session.sh"

pass=0; fail=0
check() {
  if printf '%s' "$3" | grep -qF -- "$2"; then echo "  PASS  $1"; pass=$((pass+1));
  else echo "  FAIL  $1 (expected: $2 | got: $(printf '%s' "$3" | head -c 200))"; fail=$((fail+1)); fi
}
checkeq() {
  if [ "$2" = "$3" ]; then echo "  PASS  $1"; pass=$((pass+1));
  else echo "  FAIL  $1 (expected '$2', got '$3')"; fail=$((fail+1)); fi
}

probe() { # probe <scenario>
  # Carries the jar so this route travels the same authenticated path as the
  # rest of the suites once signup exists.
  curl -s -c $JAR -b $JAR -X POST "$BASE/api/ai/selftest" -H 'content-type: application/json' \
    -d "{\"projectId\":\"$PID\",\"scenario\":\"$1\"}"
}

lumen_session_start "$JAR"
$PSQL "DELETE FROM projects;" > /dev/null
PID=ai-test-1
$PSQL "INSERT INTO projects (id,\"workspaceId\",name,industry,country,\"businessStage\",\"primaryGoal\",\"updatedAt\") VALUES ('$PID','$LUMEN_WORKSPACE_ID','AI Testbed','saas','US','SCALING','ACQUISITION',now());" > /dev/null

echo "===== 1. SUCCESSFUL RUN ====="
OUT=$(probe ok)
check   "returns ok envelope"     '"ok":true'      "$OUT"
check   "structured result parsed" '"echo"'        "$OUT"
check   "reports provider"        '"provider":"mock"' "$OUT"
check   "reports usage"           '"promptTokens":42' "$OUT"
checkeq "single attempt"          "1" "$($PSQL "SELECT attempts FROM agent_runs WHERE \"agentType\"='probe' ORDER BY \"startedAt\" DESC LIMIT 1;")"
checkeq "run persisted SUCCEEDED" "SUCCEEDED" "$($PSQL "SELECT status FROM agent_runs ORDER BY \"startedAt\" DESC LIMIT 1;")"
checkeq "output stored"           "1" "$($PSQL "SELECT count(*) FROM agent_runs WHERE output IS NOT NULL;")"
checkeq "latency recorded"        "1" "$($PSQL "SELECT count(*) FROM agent_runs WHERE \"latencyMs\" IS NOT NULL;")"
checkeq "input summary stored"    "probe:ok" "$($PSQL "SELECT \"inputSummary\" FROM agent_runs ORDER BY \"startedAt\" DESC LIMIT 1;")"

echo "===== 2. RETRY ON TRANSIENT FAILURE ====="
OUT=$(probe fail-then-ok)
check   "eventually succeeds" '"ok":true' "$OUT"
checkeq "took three attempts" "3" "$($PSQL "SELECT attempts FROM agent_runs ORDER BY \"startedAt\" DESC LIMIT 1;")"
checkeq "recorded as SUCCEEDED" "SUCCEEDED" "$($PSQL "SELECT status FROM agent_runs ORDER BY \"startedAt\" DESC LIMIT 1;")"

echo "===== 3. ATTEMPTS ARE BOUNDED ====="
OUT=$(probe always-fail)
check   "fails after exhausting attempts" '"ok":false' "$OUT"
checkeq "stopped at max attempts" "3" "$($PSQL "SELECT attempts FROM agent_runs ORDER BY \"startedAt\" DESC LIMIT 1;")"
checkeq "recorded as FAILED" "FAILED" "$($PSQL "SELECT status FROM agent_runs ORDER BY \"startedAt\" DESC LIMIT 1;")"
checkeq "error message stored" "1" "$($PSQL "SELECT count(*) FROM agent_runs WHERE \"errorMessage\" IS NOT NULL;")"

echo "===== 4. NON-RETRYABLE FAILURES ARE NOT RETRIED ====="
probe fatal > /dev/null
checkeq "only one attempt" "1" "$($PSQL "SELECT attempts FROM agent_runs ORDER BY \"startedAt\" DESC LIMIT 1;")"
checkeq "recorded as FAILED" "FAILED" "$($PSQL "SELECT status FROM agent_runs ORDER BY \"startedAt\" DESC LIMIT 1;")"

echo "===== 5. MALFORMED OUTPUT IS REJECTED ====="
# SERVICE_UNAVAILABLE is marked non-exposing, so the HTTP body is deliberately
# sanitised. The diagnostic detail lives on the run row, which is where it
# belongs — asserting it here also proves nothing internal leaked to the client.
OUT=$(probe invalid-json)
check   "client sees no internal detail" "Something went wrong on our side" "$OUT"
check   "reason stored on the run" "did not return JSON" "$($PSQL "SELECT \"errorMessage\" FROM agent_runs ORDER BY \"startedAt\" DESC LIMIT 1;")"
checkeq "retried as transient" "3" "$($PSQL "SELECT attempts FROM agent_runs ORDER BY \"startedAt\" DESC LIMIT 1;")"

probe schema-mismatch > /dev/null
check "schema mismatch reason stored" "did not match the expected shape" "$($PSQL "SELECT \"errorMessage\" FROM agent_runs ORDER BY \"startedAt\" DESC LIMIT 1;")"

echo "===== 6. TIMEOUT ====="
probe slow > /dev/null
check   "timeout reason stored" "did not respond within" "$($PSQL "SELECT \"errorMessage\" FROM agent_runs ORDER BY \"startedAt\" DESC LIMIT 1;")"
checkeq "recorded as TIMED_OUT" "TIMED_OUT" "$($PSQL "SELECT status FROM agent_runs ORDER BY \"startedAt\" DESC LIMIT 1;")"

echo "===== 7. PROJECT SCOPING AND CASCADE ====="
checkeq "all runs scoped to the project" "0" "$($PSQL "SELECT count(*) FROM agent_runs WHERE \"projectId\" <> '$PID';")"
RUNS=$($PSQL "SELECT count(*) FROM agent_runs;")
$PSQL "DELETE FROM projects WHERE id='$PID';" > /dev/null
checkeq "runs deleted with project" "0" "$($PSQL "SELECT count(*) FROM agent_runs;")"

echo
echo "===== RESULT: $pass passed, $fail failed (runs recorded: $RUNS) ====="
[ "$fail" -eq 0 ]
