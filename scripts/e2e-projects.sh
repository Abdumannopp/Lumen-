#!/usr/bin/env bash
# End-to-end tests for LUMEN project management.
# Drives the real HTTP surface: progressive-enhancement form posts for the
# create/edit forms, and RSC action calls for archive/restore/delete/switch.

BASE=http://localhost:3000
JAR=/tmp/lumen-jar.txt
export DB_PATH="${LUMEN_DB:-prisma/lumen.db}"
PSQL="./scripts/db.sh"
. "$(dirname "$0")/lib/session.sh"

pass=0; fail=0
check() { # check <label> <expected-substring> <actual>
  if printf '%s' "$3" | grep -qF -- "$2"; then
    echo "  PASS  $1"; pass=$((pass+1))
  else
    echo "  FAIL  $1 (expected to find: $2)"; fail=$((fail+1))
  fi
}
checkeq() {
  if [ "$2" = "$3" ]; then echo "  PASS  $1"; pass=$((pass+1));
  else echo "  FAIL  $1 (expected '$2', got '$3')"; fail=$((fail+1)); fi
}

# Extract the progressive-enhancement action fields from a rendered form.
action_fields() { # action_fields <html-file>
  ACTION_REF=$(grep -o 'name="\$ACTION_1:0" value="[^"]*"' "$1" | sed 's/.*value="//;s/"$//' | sed 's/&quot;/"/g')
  ACTION_STATE=$(grep -o 'name="\$ACTION_1:1" value="[^"]*"' "$1" | sed 's/.*value="//;s/"$//' | sed 's/&quot;/"/g')
  ACTION_KEY=$(grep -o 'name="\$ACTION_KEY" value="[^"]*"' "$1" | sed 's/.*value="//;s/"$//')
}

# Call a server action by id with JSON args (the RSC RPC path).
rpc() { # rpc <action-id> <json-args>
  curl -s -c $JAR -b $JAR -X POST "$BASE/projects" \
    -H "Next-Action: $1" \
    -H "Content-Type: text/plain;charset=UTF-8" \
    --data-raw "$2"
}

ID_CREATE=$(node -e "const m=require('$PWD/.next/server/server-reference-manifest.json').node;for(const[k,v]of Object.entries(m))if(v.exportedName==='createProjectAction')console.log(k)")
ID_ARCHIVE=$(node -e "const m=require('$PWD/.next/server/server-reference-manifest.json').node;for(const[k,v]of Object.entries(m))if(v.exportedName==='archiveProjectAction')console.log(k)")
ID_RESTORE=$(node -e "const m=require('$PWD/.next/server/server-reference-manifest.json').node;for(const[k,v]of Object.entries(m))if(v.exportedName==='restoreProjectAction')console.log(k)")
ID_DELETE=$(node -e "const m=require('$PWD/.next/server/server-reference-manifest.json').node;for(const[k,v]of Object.entries(m))if(v.exportedName==='deleteProjectAction')console.log(k)")
ID_SETACTIVE=$(node -e "const m=require('$PWD/.next/server/server-reference-manifest.json').node;for(const[k,v]of Object.entries(m))if(v.exportedName==='setActiveProjectAction')console.log(k)")

lumen_session_start "$JAR"
$PSQL "DELETE FROM projects;" > /dev/null

echo "===== 1. ONBOARDING (empty install) ====="
ONB=$(curl -s -c $JAR -b $JAR "$BASE/onboarding")
check "wizard renders on empty install" "set up your first business" "$ONB"
check "step labels present"             "Basics"                     "$ONB"
check "all steps mounted in one form"   "Primary goal"               "$ONB"
check "escape hatch to full form"       "/projects/new"              "$ONB"
# Streamed responses cannot carry a 3xx (headers are already sent), so Next
# emits the redirect as a meta refresh inside the body. That is the mechanism a
# real browser acts on, so it is what the test asserts.
DASHREDIR=$(curl -s -c $JAR -b $JAR "$BASE/overview")
check "empty dashboard redirects to onboarding" 'content="1;url=/onboarding"' "$DASHREDIR"

echo "===== 2. VALIDATION: empty submit ====="
curl -s -c $JAR -b $JAR "$BASE/projects/new" -o /tmp/f.html
action_fields /tmp/f.html
OUT=$(curl -s -c $JAR -b $JAR -X POST "$BASE/projects/new" \
  -F "\$ACTION_REF_1=" -F "\$ACTION_1:0=$ACTION_REF" -F "\$ACTION_1:1=$ACTION_STATE" -F "\$ACTION_KEY=$ACTION_KEY" \
  -F "name=" -F "website=" -F "industry=" -F "country=" -F "description=" \
  -F "businessStage=" -F "primaryGoal=")
check "rejects short name"      "Give the business a name of at least 2 characters." "$OUT"
check "requires industry"       "Choose the closest industry."                       "$OUT"
check "requires country"        "Choose where the business is based."                "$OUT"
check "requires stage"          "Choose the current stage."                          "$OUT"
check "requires goal"           "Choose the primary goal."                           "$OUT"
check "form-level message"      "Check the highlighted fields."                      "$OUT"
checkeq "nothing written to db" "0" "$($PSQL 'SELECT count(*) FROM projects;')"

echo "===== 3. VALIDATION: bad website ====="
OUT=$(curl -s -c $JAR -b $JAR -X POST "$BASE/projects/new" \
  -F "\$ACTION_REF_1=" -F "\$ACTION_1:0=$ACTION_REF" -F "\$ACTION_1:1=$ACTION_STATE" -F "\$ACTION_KEY=$ACTION_KEY" \
  -F "name=Acme Analytics" -F "website=not a url" -F "industry=saas" -F "country=US" \
  -F "description=" -F "businessStage=SCALING" -F "primaryGoal=ACQUISITION")
check "rejects malformed website" "Enter a valid website" "$OUT"
checkeq "still nothing in db" "0" "$($PSQL 'SELECT count(*) FROM projects;')"

echo "===== 4. CREATE: valid submit ====="
CODE=$(curl -s -c $JAR -b $JAR -o /tmp/created.txt -w "%{http_code}" -X POST "$BASE/projects/new" \
  -F "\$ACTION_REF_1=" -F "\$ACTION_1:0=$ACTION_REF" -F "\$ACTION_1:1=$ACTION_STATE" -F "\$ACTION_KEY=$ACTION_KEY" \
  -F "name=Acme Analytics" -F "website=acme.com" -F "industry=saas" -F "country=US" \
  -F "targetMarkets=R-NA" -F "targetMarkets=GB" \
  -F "description=Self-serve analytics for independent brands." \
  -F "businessStage=SCALING" -F "primaryGoal=ACQUISITION")
checkeq "row created"            "1" "$($PSQL "SELECT count(*) FROM projects WHERE name='Acme Analytics';")"
checkeq "website normalised"     "https://acme.com" "$($PSQL "SELECT website FROM projects WHERE name='Acme Analytics';")"
checkeq "markets stored"         'R-NA,GB' "$($PSQL "SELECT \"targetMarkets\" FROM projects WHERE name='Acme Analytics';")"
checkeq "enum stored"            "SCALING" "$($PSQL "SELECT \"businessStage\" FROM projects WHERE name='Acme Analytics';")"
check   "active project cookie set" "lumen.active_project" "$(cat $JAR)"

P1=$($PSQL "SELECT id FROM projects WHERE name='Acme Analytics';")

echo "===== 5. DUPLICATE NAME ====="
curl -s -c $JAR -b $JAR "$BASE/projects/new" -o /tmp/f.html; action_fields /tmp/f.html
OUT=$(curl -s -c $JAR -b $JAR -X POST "$BASE/projects/new" \
  -F "\$ACTION_REF_1=" -F "\$ACTION_1:0=$ACTION_REF" -F "\$ACTION_1:1=$ACTION_STATE" -F "\$ACTION_KEY=$ACTION_KEY" \
  -F "name=acme analytics" -F "website=" -F "industry=saas" -F "country=US" \
  -F "description=" -F "businessStage=IDEA" -F "primaryGoal=AWARENESS")
check "case-insensitive duplicate rejected" "A project with this name already exists." "$OUT"
checkeq "no duplicate row" "1" "$($PSQL 'SELECT count(*) FROM projects;')"

echo "===== 6. SECOND PROJECT + SWITCHING ====="
curl -s -c $JAR -b $JAR "$BASE/projects/new" -o /tmp/f.html; action_fields /tmp/f.html
curl -s -c $JAR -b $JAR -o /dev/null -X POST "$BASE/projects/new" \
  -F "\$ACTION_REF_1=" -F "\$ACTION_1:0=$ACTION_REF" -F "\$ACTION_1:1=$ACTION_STATE" -F "\$ACTION_KEY=$ACTION_KEY" \
  -F "name=Northwind Coffee" -F "website=" -F "industry=food-beverage" -F "country=GB" \
  -F "targetMarkets=R-UK-IE" -F "description=" -F "businessStage=EARLY_TRACTION" -F "primaryGoal=RETENTION"
P2=$($PSQL "SELECT id FROM projects WHERE name='Northwind Coffee';")
checkeq "two projects" "2" "$($PSQL 'SELECT count(*) FROM projects;')"

DASH=$(curl -s -c $JAR -b $JAR "$BASE/overview")
check "newest project became active" "Northwind Coffee" "$DASH"

rpc "$ID_SETACTIVE" "[\"$P1\"]" > /dev/null
DASH=$(curl -s -c $JAR -b $JAR "$BASE/overview")
check "switched active project" "Acme Analytics" "$DASH"
check "switched project details render" "Self-serve analytics" "$DASH"

echo "===== 7. ARCHIVE ====="
rpc "$ID_ARCHIVE" "[\"$P1\"]" > /dev/null
checkeq "archivedAt set" "1" "$($PSQL "SELECT count(*) FROM projects WHERE id='$P1' AND \"archivedAt\" IS NOT NULL;")"
LIST=$(curl -s -c $JAR -b $JAR "$BASE/projects")
check "archived section shown" "Archived" "$LIST"
DASH=$(curl -s -c $JAR -b $JAR "$BASE/overview")
check "active falls back off archived project" "Northwind Coffee" "$DASH"

echo "===== 8. RESTORE ====="
rpc "$ID_RESTORE" "[\"$P1\"]" > /dev/null
checkeq "archivedAt cleared" "1" "$($PSQL "SELECT count(*) FROM projects WHERE id='$P1' AND \"archivedAt\" IS NULL;")"

echo "===== 9. DELETE GUARD ====="
OUT=$(rpc "$ID_DELETE" "[\"$P1\",\"wrong name\"]")
check "wrong confirmation rejected" "does not match" "$OUT"
checkeq "row survives" "1" "$($PSQL "SELECT count(*) FROM projects WHERE id='$P1';")"

OUT=$(rpc "$ID_DELETE" "[\"$P1\",\"Acme Analytics\"]")
checkeq "row deleted" "0" "$($PSQL "SELECT count(*) FROM projects WHERE id='$P1';")"
checkeq "other project untouched" "1" "$($PSQL "SELECT count(*) FROM projects;")"

echo "===== 10. EDIT ====="
curl -s -c $JAR -b $JAR "$BASE/projects/$P2/edit" -o /tmp/e.html
check "edit form prefilled" "Northwind Coffee" "$(cat /tmp/e.html)"
action_fields /tmp/e.html
curl -s -c $JAR -b $JAR -o /dev/null -X POST "$BASE/projects/$P2/edit" \
  -F "\$ACTION_REF_1=" -F "\$ACTION_1:0=$ACTION_REF" -F "\$ACTION_1:1=$ACTION_STATE" -F "\$ACTION_KEY=$ACTION_KEY" \
  -F "name=Northwind Coffee Co" -F "website=northwind.co.uk" -F "industry=food-beverage" -F "country=GB" \
  -F "targetMarkets=R-UK-IE" -F "targetMarkets=IE" -F "description=Speciality roaster." \
  -F "businessStage=SCALING" -F "primaryGoal=REVENUE"
checkeq "name updated"    "Northwind Coffee Co" "$($PSQL "SELECT name FROM projects WHERE id='$P2';")"
checkeq "goal updated"    "REVENUE"             "$($PSQL "SELECT \"primaryGoal\" FROM projects WHERE id='$P2';")"
checkeq "markets updated" 'R-UK-IE,IE'        "$($PSQL "SELECT \"targetMarkets\" FROM projects WHERE id='$P2';")"

echo "===== 10b. ONBOARDING GUARD (install no longer empty) ====="
ONBREDIR=$(curl -s -c $JAR -b $JAR "$BASE/onboarding")
check "onboarding redirects once a project exists" 'content="1;url=/overview"' "$ONBREDIR"
DASH=$(curl -s -c $JAR -b $JAR "$BASE/overview")
check "dashboard renders normally now" "Northwind Coffee Co" "$DASH"

echo "===== 11. NOT FOUND ====="
# Next.js returns 200 for STREAMED responses even when notFound() is thrown:
# the headers are already sent, so the status cannot be changed. It compensates
# by injecting <meta name="robots" content="noindex">. This is documented
# behaviour (see loading.js "Status Codes"), so the meaningful assertions are
# that the not-found UI renders and that the page is marked noindex.
NF=$(curl -s -c $JAR -b $JAR "$BASE/projects/does-not-exist/edit")
check   "missing project renders not-found UI" "no longer exists" "$NF"
check   "missing project marked noindex"       "noindex"          "$NF"
checkeq "unmatched route still 404s" "404" "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/definitely-not-a-route")"

echo
echo "===== RESULT: $pass passed, $fail failed ====="
[ "$fail" -eq 0 ]
