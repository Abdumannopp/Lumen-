#!/usr/bin/env bash
# End-to-end tests for local settings, backup and restore.

BASE=http://localhost:3000
JAR=/tmp/lumen-st2-jar.txt
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
aid() { node -e "const m=require('$PWD/.next/server/server-reference-manifest.json').node;for(const[k,v]of Object.entries(m))if(v.exportedName==='$1')console.log(k)"; }
call() {
  curl -s -c $JAR -b $JAR -X POST "$BASE/settings" \
    -H "Next-Action: $1" -H "Content-Type: text/plain;charset=UTF-8" --data-raw "$2"
}

lumen_session_start "$JAR"
$PSQL "DELETE FROM projects;" > /dev/null
$PSQL "DELETE FROM settings;" > /dev/null
PID=set-test-1
$PSQL "INSERT INTO projects (id,\"workspaceId\",name,industry,country,\"businessStage\",\"primaryGoal\",\"updatedAt\") VALUES ('$PID','$LUMEN_WORKSPACE_ID','Settings Testbed','saas','US','SCALING','ACQUISITION',now());" > /dev/null
$PSQL "INSERT INTO marketing_metrics (id,\"projectId\",date,channel,currency,spend,clicks,source,\"updatedAt\") VALUES ('m-set-1','$PID',now(),'SEO','USD',100,50,'MANUAL',now());" > /dev/null

ID_SAVE=$(aid saveSettingsAction)
ID_TEST=$(aid testAiConnectionAction)
ID_EXPORT=$(aid exportBackupAction)
ID_INSPECT=$(aid inspectBackupAction)
ID_RESTORE=$(aid restoreBackupAction)
ID_CLEAR=$(aid clearProjectDataAction)

echo "===== 1. ALL FIVE SPEC SECTIONS RENDER ====="
P=$(curl -s -c $JAR -b $JAR "$BASE/settings")
for section in General AI Data Backup Appearance; do
  check "section: $section" "$section" "$P"
done
check "settings work with no project selected" "Settings" "$P"

echo "===== 2. THE API KEY IS NEVER SHOWN ====="
check  "reports key presence only" "API key"  "$P"
absent "no key value on the page"  "sk-ant-"  "$P"
check  "states the guarantee"      "never displayed, logged, or written to a backup" "$P"

echo "===== 3. SAVING SETTINGS ====="
call "$ID_SAVE" "[{\"defaultProjectId\":\"$PID\",\"currency\":\"EUR\",\"timezone\":\"Asia/Tashkent\",\"locale\":\"en-GB\",\"theme\":\"light\"}]" > /dev/null
checkeq "currency saved" "EUR" "$($PSQL "SELECT currency FROM settings;")"
checkeq "timezone saved" "Asia/Tashkent" "$($PSQL "SELECT timezone FROM settings;")"
checkeq "theme saved"    "light" "$($PSQL "SELECT theme FROM settings;")"
# The theme must reach the first byte of HTML, not be swapped after hydration.
P=$(curl -s -c $JAR -b $JAR "$BASE/settings")
check "theme applied server-side" 'data-theme="light"' "$P"

# A default pointing at a deleted project would silently fail on next start.
call "$ID_SAVE" "[{\"defaultProjectId\":\"does-not-exist\",\"currency\":\"USD\",\"timezone\":\"UTC\",\"locale\":\"en-US\",\"theme\":\"dark\"}]" > /dev/null
checkeq "unknown default project dropped" "" "$($PSQL "SELECT \"defaultProjectId\" FROM settings;")"

echo "===== 4. CONNECTION TEST ====="
OUT=$(call "$ID_TEST" "[]")
check "reports the provider answered" '"ok":true' "$OUT"
check "names the mock provider"       "mock"      "$OUT"
absent "no key in the response"       "sk-ant-"   "$OUT"

echo "===== 5. EXPORT CONTAINS DATA BUT NO SECRETS ====="
OUT=$(call "$ID_EXPORT" "[]")
check  "export succeeded"       '"ok":true'            "$OUT"
check  "carries a version"      "lumenBackupVersion"   "$OUT"
check  "includes project data"  "Settings Testbed"     "$OUT"
check  "includes metrics"       "marketingMetrics"     "$OUT"
absent "no API key"             "sk-ant-"              "$OUT"
absent "no env key name"        "ANTHROPIC_API_KEY"    "$OUT"
absent "no database url"        "DATABASE_URL"         "$OUT"

echo "===== 6. VERSION VALIDATION ====="
OUT=$(call "$ID_INSPECT" "[\"{\\\"lumenBackupVersion\\\":99,\\\"exportedAt\\\":\\\"2026-01-01\\\",\\\"settings\\\":null,\\\"data\\\":{}}\"]")
check "future format rejected" "newer version of LUMEN" "$OUT"
OUT=$(call "$ID_INSPECT" "[\"{\\\"lumenBackupVersion\\\":0,\\\"exportedAt\\\":\\\"2026-01-01\\\",\\\"settings\\\":null,\\\"data\\\":{}}\"]")
check "older format rejected" "older format" "$OUT"
OUT=$(call "$ID_INSPECT" "[\"not json at all\"]")
check "non-JSON rejected" "not valid JSON" "$OUT"
OUT=$(call "$ID_INSPECT" "[\"{\\\"hello\\\":true}\"]")
check "non-LUMEN JSON rejected" "not a LUMEN backup" "$OUT"

echo "===== 7. RESTORE REQUIRES TYPED CONFIRMATION ====="
GOOD='{"lumenBackupVersion":1,"exportedAt":"2026-08-01T00:00:00.000Z","settings":null,"data":{"projects":[{"id":"restored-1","name":"Restored Project","industry":"saas","country":"GB","targetMarkets":[],"businessStage":"IDEA","primaryGoal":"AWARENESS","createdAt":"2026-08-01T00:00:00.000Z","updatedAt":"2026-08-01T00:00:00.000Z","archivedAt":null,"website":null,"description":null}]}}'
GOOD_ESCAPED=$(node -e 'console.log(JSON.stringify(process.argv[1]))' "$GOOD")

OUT=$(call "$ID_RESTORE" "[$GOOD_ESCAPED,\"nope\"]")
check   "wrong confirmation refused" "Type REPLACE" "$OUT"
checkeq "original data untouched" "1" "$($PSQL "SELECT count(*) FROM projects WHERE id='$PID';")"

echo "===== 8. RESTORE REPLACES EVERYTHING ====="
call "$ID_RESTORE" "[$GOOD_ESCAPED,\"REPLACE\"]" > /dev/null
checkeq "restored project present" "1" "$($PSQL "SELECT count(*) FROM projects WHERE id='restored-1';")"
checkeq "previous project gone"    "0" "$($PSQL "SELECT count(*) FROM projects WHERE id='$PID';")"
# Cascade means the old project's metrics went with it.
checkeq "old child rows cleared"   "0" "$($PSQL "SELECT count(*) FROM marketing_metrics;")"

echo "===== 9. AN ARCHIVE WITH NO PROJECTS IS REFUSED ====="
# Structurally a valid backup, but empty. Restore deletes every project first,
# so this file can only destroy: it once wiped the install and reported success
# with "restored: 0". It must be refused before the operator is asked to confirm.
EMPTY='{"lumenBackupVersion":1,"exportedAt":"2026-08-01T00:00:00.000Z","settings":null,"data":{}}'
EMPTY_ESCAPED=$(node -e 'console.log(JSON.stringify(process.argv[1]))' "$EMPTY")
OUT=$(call "$ID_INSPECT" "[$EMPTY_ESCAPED]")
check   "inspect refuses it"      "contains no projects" "$OUT"
OUT=$(call "$ID_RESTORE" "[$EMPTY_ESCAPED,\"REPLACE\"]")
check   "restore refuses it"      "contains no projects" "$OUT"
check   "and says nothing changed" "Nothing was changed" "$OUT"
checkeq "install still intact"    "1" "$($PSQL "SELECT count(*) FROM projects WHERE id='restored-1';")"

echo "===== 10. A FILE WITH A DANGLING REFERENCE IS REFUSED WHOLE ====="
# Carries a real project so it passes the guard above, plus a row whose
# projectId names an id this same archive never declares under "projects" —
# structurally exactly what a planted cross-tenant row looks like (see #10b),
# but simple enough not to need a second workspace to prove.
BAD='{"lumenBackupVersion":1,"exportedAt":"2026-08-01T00:00:00.000Z","settings":null,"data":{"projects":[{"id":"rollback-probe","name":"Rollback Probe","industry":"saas","country":"GB","targetMarkets":[],"businessStage":"IDEA","primaryGoal":"AWARENESS","createdAt":"2026-08-01T00:00:00.000Z","updatedAt":"2026-08-01T00:00:00.000Z","archivedAt":null,"website":null,"description":null}],"marketingMetrics":[{"id":"orphan","projectId":"missing","date":"2026-08-01T00:00:00.000Z","channel":"SEO","source":"MANUAL","createdAt":"2026-08-01T00:00:00.000Z","updatedAt":"2026-08-01T00:00:00.000Z"}]}}'
BAD_ESCAPED=$(node -e 'console.log(JSON.stringify(process.argv[1]))' "$BAD")
OUT=$(call "$ID_RESTORE" "[$BAD_ESCAPED,\"REPLACE\"]")
check   "failure reported"        "cannot be verified" "$OUT"
checkeq "existing data survived"  "1" "$($PSQL "SELECT count(*) FROM projects WHERE id='restored-1';")"
checkeq "nothing was planted"     "0" "$($PSQL "SELECT count(*) FROM projects WHERE id='rollback-probe';")"
checkeq "no orphan written"       "0" "$($PSQL "SELECT count(*) FROM marketing_metrics;")"

echo "===== 10b. A PLANTED ROW ON A REAL OTHER-TENANT PROJECT IS REFUSED ====="
# The actual release blocker found by adversarial QA: an archive whose data
# names a project id that is not the file's own, but is a *real* project
# belonging to a workspace that is not the one restoring. Restore used to trust
# projectId as written, so this landed the row under the victim's project. A
# fresh victim workspace/user/project is planted directly, restored against,
# and cleaned up here rather than reusing the suite account's own — the point
# is that the id belongs to someone else entirely.
VICTIM_USER="victim-backup-$$"
VICTIM_WS="victim-ws-backup-$$"
VICTIM_PROJECT="victim-proj-backup-$$"
$PSQL "INSERT INTO users (id, email, \"createdAt\", \"updatedAt\") VALUES ('$VICTIM_USER','$VICTIM_USER@lumen.test',now(),now());" > /dev/null
$PSQL "INSERT INTO workspaces (id, name, \"ownerId\", \"createdAt\", \"updatedAt\") VALUES ('$VICTIM_WS','Victim Co','$VICTIM_USER',now(),now());" > /dev/null
$PSQL "INSERT INTO projects (id, \"workspaceId\", name, industry, country, \"targetMarkets\", \"businessStage\", \"primaryGoal\", \"createdAt\", \"updatedAt\") VALUES ('$VICTIM_PROJECT','$VICTIM_WS','Victim Project','saas','GB','{}','SCALING','ACQUISITION',now(),now());" > /dev/null

PLANT=$(node -e "console.log(JSON.stringify({lumenBackupVersion:1,exportedAt:'2026-08-01T00:00:00.000Z',settings:null,data:{projects:[{id:'attacker-proj-$$',name:'Attacker Project',industry:'saas',country:'GB',targetMarkets:[],businessStage:'IDEA',primaryGoal:'AWARENESS',createdAt:'2026-08-01T00:00:00.000Z',updatedAt:'2026-08-01T00:00:00.000Z',archivedAt:null,website:null,description:null}],contentItems:[{id:'planted-$$',projectId:'$VICTIM_PROJECT',platform:'BLOG',type:'ARTICLE',status:'IDEA',objective:'Planted by attacker',createdAt:'2026-08-01T00:00:00.000Z',updatedAt:'2026-08-01T00:00:00.000Z'}]}}))")
PLANT_ESCAPED=$(node -e 'console.log(JSON.stringify(process.argv[1]))' "$PLANT")
OUT=$(call "$ID_RESTORE" "[$PLANT_ESCAPED,\"REPLACE\"]")
check   "failure reported"     "cannot be verified" "$OUT"
checkeq "nothing planted on the victim's project" "0" "$($PSQL "SELECT count(*) FROM content_items WHERE \"projectId\"='$VICTIM_PROJECT';")"
checkeq "attacker's own project never created either" "0" "$($PSQL "SELECT count(*) FROM projects WHERE id='attacker-proj-$$';")"
checkeq "restoring account's own data untouched" "1" "$($PSQL "SELECT count(*) FROM projects WHERE id='restored-1';")"

$PSQL "DELETE FROM projects WHERE id='$VICTIM_PROJECT';" > /dev/null
$PSQL "DELETE FROM workspaces WHERE id='$VICTIM_WS';" > /dev/null
$PSQL "DELETE FROM users WHERE id='$VICTIM_USER';" > /dev/null

echo "===== 11. CLEARING A PROJECT NEEDS ITS NAME ====="
OUT=$(call "$ID_CLEAR" "[\"restored-1\",\"wrong name\"]")
check   "wrong name refused" "does not match" "$OUT"
checkeq "project survives"   "1" "$($PSQL "SELECT count(*) FROM projects WHERE id='restored-1';")"

call "$ID_CLEAR" "[\"restored-1\",\"Restored Project\"]" > /dev/null
checkeq "project cleared" "0" "$($PSQL "SELECT count(*) FROM projects WHERE id='restored-1';")"

echo
echo "===== RESULT: $pass passed, $fail failed ====="
[ "$fail" -eq 0 ]
