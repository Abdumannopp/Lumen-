#!/usr/bin/env bash
# End-to-end tests for the tenant model.
#
# A workspace is the isolation boundary of the whole product: every business
# record reaches one through Project.workspaceId, and authorisation will resolve
# through Membership. Those two claims have to be true at the database level
# before anything is built on them — a boundary the database does not enforce is
# a boundary that leaks the first time application code forgets it.
#
# Sections 1-8 test what the schema guarantees on its own. Section 9 signs in a
# second real account and tests what the application decides: that the workspace
# a write lands in comes from Membership, and that nothing the browser sends —
# a form field, a cookie — can move it.
#
# What this suite does NOT yet claim is that *reads* are scoped. They are not:
# `listProjects()` and its neighbours still query without a workspace, so the
# second account can currently see the first account's projects. That is the
# recorded release blocker, and the assertions for it belong with the fix rather
# than here, where they would sit red and stop meaning anything.

BASE=http://localhost:3000
JAR=/tmp/lumen-tenancy-jar.txt
JAR2=/tmp/lumen-tenancy-jar-second.txt
SECOND_EMAIL=second@lumen.test
PSQL="./scripts/db.sh"
. "$(dirname "$0")/lib/session.sh"

pass=0; fail=0
check() {
  if printf '%s' "$3" | grep -qF -- "$2"; then echo "  PASS  $1"; pass=$((pass+1));
  else echo "  FAIL  $1 (expected: $2 | got: $(printf '%s' "$3" | head -c 120))"; fail=$((fail+1)); fi
}
checkeq() {
  if [ "$2" = "$3" ]; then echo "  PASS  $1"; pass=$((pass+1));
  else echo "  FAIL  $1 (expected '$2', got '$3')"; fail=$((fail+1)); fi
}
# Extract the progressive-enhancement action fields from a rendered form. A
# plain POST without them is rejected as an unknown Server Action.
action_fields() { # action_fields <html-file>
  ACTION_REF=$(grep -o 'name="\$ACTION_1:0" value="[^"]*"' "$1" | sed 's/.*value="//;s/"$//' | sed 's/&quot;/"/g')
  ACTION_STATE=$(grep -o 'name="\$ACTION_1:1" value="[^"]*"' "$1" | sed 's/.*value="//;s/"$//' | sed 's/&quot;/"/g')
  ACTION_KEY=$(grep -o 'name="\$ACTION_KEY" value="[^"]*"' "$1" | sed 's/.*value="//;s/"$//')
}

create_project() { # create_project <name> [extra curl args...]
  create_project_as "$JAR" "$@"
}

create_project_as() { # create_project_as <jar> <name> [extra curl args...]
  local jar="$1"; shift
  curl -s -c "$jar" -b "$jar" "$BASE/projects/new" -o /tmp/tenancy-form.html
  action_fields /tmp/tenancy-form.html
  local name="$1"; shift
  curl -s -c "$jar" -b "$jar" -X POST "$BASE/projects/new" \
    -F "\$ACTION_REF_1=" -F "\$ACTION_1:0=$ACTION_REF" -F "\$ACTION_1:1=$ACTION_STATE" -F "\$ACTION_KEY=$ACTION_KEY" \
    -F "name=$name" -F "website=" -F "industry=saas" -F "country=US" \
    -F "description=" -F "businessStage=SCALING" -F "primaryGoal=ACQUISITION" "$@"
}

# Server Actions called the way the browser calls them: by id, over the RSC RPC
# path. The id comes from the build manifest, so a renamed action fails loudly
# here instead of quietly not being tested.
aid() { node -e "const m=require('$PWD/.next/server/server-reference-manifest.json').node;for(const[k,v]of Object.entries(m))if(v.exportedName==='$1')console.log(k)"; }

rpc_as() { # rpc_as <jar> <action-id> <json-args>
  curl -s -c "$1" -b "$1" -X POST "$BASE/projects" \
    -H "Next-Action: $2" -H "Content-Type: text/plain;charset=UTF-8" --data-raw "$3"
}

fails() { # fails <label> <sql>  — the statement must be rejected
  if $PSQL "$2" > /dev/null 2>&1; then
    echo "  FAIL  $1 (the database accepted it)"; fail=$((fail+1));
  else
    echo "  PASS  $1"; pass=$((pass+1));
  fi
}

$PSQL "DELETE FROM projects;" > /dev/null
# Section 9 signs up a second account and removes it again. If a previous run
# died in between, it is still there — and section 1 would count two workspaces.
$PSQL "DELETE FROM workspaces WHERE \"ownerId\" IN (SELECT id FROM users WHERE email='$SECOND_EMAIL');" > /dev/null
$PSQL "DELETE FROM users WHERE email='$SECOND_EMAIL';" > /dev/null
lumen_session_start "$JAR"

echo "===== 1. THE HELPER SUPPLIED A WORKSPACE ====="
checkeq "a workspace exists"        "1" "$($PSQL "SELECT count(*) FROM workspaces;")"
checkeq "it has an owner"           "1" "$($PSQL "SELECT count(*) FROM workspaces w JOIN users u ON u.id=w.\"ownerId\";")"
checkeq "the owner is a member"     "OWNER" "$($PSQL "SELECT role FROM memberships LIMIT 1;")"

echo "===== 2. A PROJECT CANNOT EXIST OUTSIDE A WORKSPACE ====="
fails "no workspace at all is refused" \
  "INSERT INTO projects (id,name,industry,country,\"businessStage\",\"primaryGoal\",\"updatedAt\") VALUES ('t-nows','No workspace','saas','US','IDEA','AWARENESS',now());"
fails "a workspace that does not exist is refused" \
  "INSERT INTO projects (id,\"workspaceId\",name,industry,country,\"businessStage\",\"primaryGoal\",\"updatedAt\") VALUES ('t-ghost','workspace-that-never-existed','Ghost','saas','US','IDEA','AWARENESS',now());"
checkeq "neither was written" "0" "$($PSQL "SELECT count(*) FROM projects WHERE id IN ('t-nows','t-ghost');")"

echo "===== 3. THE APP PUTS NEW PROJECTS IN A WORKSPACE ====="
# Created through the real form, so the workspace comes from the server rather
# than from anything the browser sent.
create_project "Tenancy Testbed" > /dev/null
checkeq "project created"           "1" "$($PSQL "SELECT count(*) FROM projects WHERE name='Tenancy Testbed';")"
checkeq "and it landed in the workspace" "1" \
  "$($PSQL "SELECT count(*) FROM projects p JOIN workspaces w ON w.id=p.\"workspaceId\" WHERE p.name='Tenancy Testbed';")"

echo "===== 4. A workspaceId FROM THE BROWSER IS DATA, NOT AN INSTRUCTION ====="
# A second workspace belonging to someone else, and a form field naming it.
#
# Before there were accounts this was ambiguous and the server refused. It is
# not ambiguous now: Membership says which cabinet this request is acting in,
# and the field in the request body is simply not consulted. So the project is
# created — in the caller's workspace, with the planted one left untouched.
$PSQL "INSERT INTO users (id,email,\"updatedAt\") VALUES ('other-user','other@test.local',now()) ON CONFLICT (id) DO NOTHING;" > /dev/null
$PSQL "INSERT INTO workspaces (id,name,\"ownerId\",\"updatedAt\") VALUES ('other-workspace','Someone else','other-user',now()) ON CONFLICT (id) DO NOTHING;" > /dev/null
create_project "Planted" -F "workspaceId=other-workspace" > /dev/null
checkeq "the project was created"    "1" "$($PSQL "SELECT count(*) FROM projects WHERE name='Planted';")"
checkeq "in the caller's workspace"  "$LUMEN_WORKSPACE_ID" \
  "$($PSQL "SELECT \"workspaceId\" FROM projects WHERE name='Planted';")"
checkeq "the planted workspace stayed empty" "0" \
  "$($PSQL "SELECT count(*) FROM projects WHERE \"workspaceId\"='other-workspace';")"

$PSQL "DELETE FROM workspaces WHERE id='other-workspace';" > /dev/null
$PSQL "DELETE FROM users WHERE id='other-user';" > /dev/null

echo "===== 4b. SIGNED OUT, NOTHING IS REACHABLE ====="
# Not a redirect for politeness — a redirect instead of a page. The body that
# comes back is Next's error shell, so the assertion is that it carries no
# project of ours.
SIGNED_OUT=$(curl -s -o /tmp/tenancy-signedout.html -w '%{http_code} %{redirect_url}' "$BASE/projects")
check   "the project list sends you to sign in" "307 $BASE/login" "$SIGNED_OUT"
checkeq "and leaks no project name" "0" "$(grep -c 'Tenancy Testbed' /tmp/tenancy-signedout.html)"
BEFORE=$($PSQL "SELECT count(*) FROM projects;")
create_project_as /tmp/tenancy-empty-jar.txt "Unauthenticated" > /dev/null
checkeq "and a create from no session writes nothing" "$BEFORE" "$($PSQL "SELECT count(*) FROM projects;")"
rm -f /tmp/tenancy-empty-jar.txt

echo "===== 5. DELETING A WORKSPACE TAKES ITS BUSINESSES WITH IT ====="
$PSQL "INSERT INTO users (id,email,\"updatedAt\") VALUES ('cascade-user','cascade@test.local',now());" > /dev/null
$PSQL "INSERT INTO workspaces (id,name,\"ownerId\",\"updatedAt\") VALUES ('cascade-ws','Doomed','cascade-user',now());" > /dev/null
$PSQL "INSERT INTO projects (id,\"workspaceId\",name,industry,country,\"businessStage\",\"primaryGoal\",\"updatedAt\") VALUES ('cascade-p','cascade-ws','Doomed Co','saas','US','IDEA','AWARENESS',now());" > /dev/null
$PSQL "INSERT INTO content_items (id,\"projectId\",platform,type,status,objective,source,\"updatedAt\") VALUES ('cascade-c','cascade-p','LINKEDIN','POST','IDEA','Obj','MANUAL',now());" > /dev/null
checkeq "set up"                    "1" "$($PSQL "SELECT count(*) FROM content_items WHERE id='cascade-c';")"

# Checked before the workspace goes, because that is the situation the rule
# exists for: an owner must not vanish while their cabinet still stands.
echo "===== 6. AN OWNER CANNOT BE DELETED OUT FROM UNDER A WORKSPACE ====="
fails "deleting the owner is refused" "DELETE FROM users WHERE id='cascade-user';"
checkeq "the owner survived"        "1" "$($PSQL "SELECT count(*) FROM users WHERE id='cascade-user';")"

echo "===== 7. AND THEN THE CASCADE ====="
$PSQL "DELETE FROM workspaces WHERE id='cascade-ws';" > /dev/null
checkeq "project went with it"      "0" "$($PSQL "SELECT count(*) FROM projects WHERE id='cascade-p';")"
checkeq "and so did its content"    "0" "$($PSQL "SELECT count(*) FROM content_items WHERE id='cascade-c';")"
# With no workspace left to own, the user can go.
$PSQL "DELETE FROM users WHERE id='cascade-user';" > /dev/null
checkeq "the ownerless user can be removed" "0" "$($PSQL "SELECT count(*) FROM users WHERE id='cascade-user';")"

echo "===== 8. MEMBERSHIP IS ONE ROW PER PERSON PER WORKSPACE ====="
# Both halves read from the same membership row. Taking the user from one query
# and the workspace from another would, once a second account exists, produce a
# pair that is not a duplicate at all — and the test would pass by describing
# something else.
PAIR=$($PSQL "SELECT \"userId\" || ' ' || \"workspaceId\" FROM memberships LIMIT 1;")
MEMBER_ID=${PAIR% *}
WS=${PAIR#* }
fails "a duplicate membership is refused" \
  "INSERT INTO memberships (id,\"userId\",\"workspaceId\",role,\"updatedAt\") VALUES ('dup-m','$MEMBER_ID','$WS','MEMBER',now());"

echo "===== 9. TWO ACCOUNTS, TWO CABINETS ====="
# The first eight sections are about what the database refuses. This one is
# about what the application decides, and it needs a second real person to mean
# anything — so it signs one up through the same flow as the first.
OWNER_WS="$LUMEN_WORKSPACE_ID"
LUMEN_TEST_EMAIL="$SECOND_EMAIL" lumen_session_start "$JAR2"
SECOND_WS="$LUMEN_WORKSPACE_ID"
export LUMEN_WORKSPACE_ID="$OWNER_WS"

check "signing up produced a different workspace" "different" \
  "$([ "$OWNER_WS" != "$SECOND_WS" ] && echo different || echo same)"
checkeq "each account owns exactly one"  "1" \
  "$($PSQL "SELECT count(*) FROM memberships m JOIN users u ON u.id=m.\"userId\" WHERE u.email='$SECOND_EMAIL' AND m.role='OWNER';")"

create_project_as "$JAR2" "Second Account Co" > /dev/null
checkeq "their project lands in their workspace" "$SECOND_WS" \
  "$($PSQL "SELECT \"workspaceId\" FROM projects WHERE name='Second Account Co';")"
checkeq "and not in the first account's"         "0" \
  "$($PSQL "SELECT count(*) FROM projects WHERE name='Second Account Co' AND \"workspaceId\"='$OWNER_WS';")"

# The active-workspace cookie is a preference. Handed one naming a workspace
# they are not a member of, the server must fall back to a workspace they are —
# not honour it. A cookie is the easiest thing in a browser to forge, so it is
# forged here: the value is rewritten in the jar itself, which is exactly what
# the browser sends.
awk -F'\t' -v OFS='\t' -v ws="$OWNER_WS" \
  '$6=="lumen.active_workspace"{$7=ws} {print}' "$JAR2" > "$JAR2.tmp" && mv "$JAR2.tmp" "$JAR2"
checkeq "the cookie really was rewritten" "1" "$(grep -c "$OWNER_WS" "$JAR2")"
create_project_as "$JAR2" "Cookie Says Otherwise" > /dev/null
checkeq "a forged workspace cookie is ignored" "$SECOND_WS" \
  "$($PSQL "SELECT \"workspaceId\" FROM projects WHERE name='Cookie Says Otherwise';")"

# Reads, not only writes. The project list and the single-project lookup both
# carry the workspace now, so the first account's business is not merely hidden
# from the second account's interface — it is absent from the answer.
FIRST_PROJECT_ID=$($PSQL "SELECT id FROM projects WHERE name='Tenancy Testbed';")
SECOND_LIST=$(curl -s -c "$JAR2" -b "$JAR2" "$BASE/projects")
checkeq "the other account's project is not in the list" "0" \
  "$(printf '%s' "$SECOND_LIST" | grep -c 'Tenancy Testbed')"
check   "but their own is"                               "Second Account Co" "$SECOND_LIST"
CROSS=$(curl -s -c "$JAR2" -b "$JAR2" "$BASE/projects/$FIRST_PROJECT_ID/edit")
check   "reaching it by id reads as not-found" "no longer exists" "$CROSS"
checkeq "and shows none of its data"           "0" \
  "$(printf '%s' "$CROSS" | grep -c 'Tenancy Testbed')"

echo "===== 10. A SERVER ACTION WILL NOT ACT ON SOMEONE ELSE'S PROJECT ====="
# Reads are one half. Writes are the half that destroys things — and a Server
# Action takes its projectId as an argument, which is to say from the browser.
#
# archiveProjectAction and deleteProjectAction are the tests worth running:
# until this step archive did no ownership check at all, and delete checked only
# that the typed name matched — a name the other account can read off the list.
ARCHIVE_ID=$(aid archiveProjectAction)
DELETE_ID=$(aid deleteProjectAction)

rpc_as "$JAR2" "$ARCHIVE_ID" "[\"$FIRST_PROJECT_ID\"]" > /dev/null
checkeq "archiving another account's project does nothing" "0" \
  "$($PSQL "SELECT count(*) FROM projects WHERE id='$FIRST_PROJECT_ID' AND \"archivedAt\" IS NOT NULL;")"

rpc_as "$JAR2" "$DELETE_ID" "[\"$FIRST_PROJECT_ID\",\"Tenancy Testbed\"]" > /dev/null
checkeq "nor does deleting it, name typed correctly" "1" \
  "$($PSQL "SELECT count(*) FROM projects WHERE id='$FIRST_PROJECT_ID';")"

# And the same actions still work on their own project, so the assertions above
# are about ownership rather than about the calls having failed to arrive.
OWN_ID=$($PSQL "SELECT id FROM projects WHERE name='Second Account Co';")
rpc_as "$JAR2" "$ARCHIVE_ID" "[\"$OWN_ID\"]" > /dev/null
checkeq "but archiving their own works" "1" \
  "$($PSQL "SELECT count(*) FROM projects WHERE id='$OWN_ID' AND \"archivedAt\" IS NOT NULL;")"

echo "===== 11. A BACKUP IS ONE CABINET, AND SO IS A RESTORE ====="
# The recorded release blocker. Export read the whole database and restore
# deleted it, so one tenant's backup carried every tenant's data and one
# tenant's restore erased it.
EXPORT_ID=$(aid exportBackupAction)
RESTORE_ID=$(aid restoreBackupAction)

ARCHIVE=$(rpc_as "$JAR2" "$EXPORT_ID" "[]")
check  "the export contains their own project"     "Second Account Co" "$ARCHIVE"
checkeq "and none of the other account's"     "0" \
  "$(printf '%s' "$ARCHIVE" | grep -c 'Tenancy Testbed')"

# Now the destructive half. The first account restores an archive of its own —
# handcrafted rather than round-tripped, so the test says plainly what is in it.
# Restore empties before it fills, and the question is what it empties.
RESTORED='{"lumenBackupVersion":1,"exportedAt":"2026-08-01T00:00:00.000Z","settings":null,"data":{"projects":[{"id":"tenancy-restored","name":"Restored Into First","industry":"saas","country":"GB","targetMarkets":[],"businessStage":"IDEA","primaryGoal":"AWARENESS","createdAt":"2026-08-01T00:00:00.000Z","updatedAt":"2026-08-01T00:00:00.000Z","archivedAt":null,"website":null,"description":null}]}}'
RESTORED_ESCAPED=$(node -e 'console.log(JSON.stringify(process.argv[1]))' "$RESTORED")

rpc_as "$JAR" "$RESTORE_ID" "[$RESTORED_ESCAPED,\"REPLACE\"]" > /dev/null
checkeq "the restore ran"                           "1" \
  "$($PSQL "SELECT count(*) FROM projects WHERE id='tenancy-restored';")"
checkeq "it emptied the first account's cabinet"    "0" \
  "$($PSQL "SELECT count(*) FROM projects WHERE name='Tenancy Testbed';")"
checkeq "and left the second account's alone"       "1" \
  "$($PSQL "SELECT count(*) FROM projects WHERE name='Second Account Co';")"
checkeq "the restored project belongs to the restorer" "$OWNER_WS" \
  "$($PSQL "SELECT \"workspaceId\" FROM projects WHERE id='tenancy-restored';")"

echo "===== 12. SETTINGS BELONG TO A WORKSPACE ====="
$PSQL "DELETE FROM settings;" > /dev/null
SAVE_ID=$(aid saveSettingsAction)
rpc_as "$JAR"  "$SAVE_ID" '[{"currency":"GBP","timezone":"Europe/London","locale":"en-US","theme":"dark"}]' > /dev/null
rpc_as "$JAR2" "$SAVE_ID" '[{"currency":"JPY","timezone":"Asia/Tokyo","locale":"en-US","theme":"light"}]' > /dev/null
checkeq "two accounts, two settings rows" "2" "$($PSQL "SELECT count(*) FROM settings;")"
checkeq "the first account kept its currency"  "GBP" \
  "$($PSQL "SELECT currency FROM settings WHERE \"workspaceId\"='$OWNER_WS';")"
checkeq "the second account kept its own"      "JPY" \
  "$($PSQL "SELECT currency FROM settings WHERE \"workspaceId\"='$SECOND_WS';")"
$PSQL "DELETE FROM settings;" > /dev/null

# Left behind, the second account would make section 1's "a workspace exists"
# count two on the next run.
$PSQL "DELETE FROM workspaces WHERE id='$SECOND_WS';" > /dev/null
$PSQL "DELETE FROM users WHERE email='$SECOND_EMAIL';" > /dev/null
checkeq "the second account cleaned up" "0" \
  "$($PSQL "SELECT count(*) FROM users WHERE email='$SECOND_EMAIL';")"
rm -f "$JAR2"

echo
echo "===== RESULT: $pass passed, $fail failed ====="
[ "$fail" -eq 0 ]
