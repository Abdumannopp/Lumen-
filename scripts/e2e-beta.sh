#!/usr/bin/env bash
# End-to-end tests for the invite-only beta: the signup gate, founder
# controls (invite, revoke, disable/enable), and beta feedback.
#
# Drives the real HTTP surface throughout: progressive-enhancement form posts
# for signup, and RSC action calls for the founder-only and feedback actions —
# the same two transports every other suite uses, because a Server Action is a
# public endpoint and testing it any other way would not prove what a browser
# can actually do.

BASE=http://localhost:3000
JAR=/tmp/lumen-beta-jar.txt
FOUNDER_JAR=/tmp/lumen-beta-founder-jar.txt
INVITED_JAR=/tmp/lumen-beta-invited-jar.txt
TARGET_JAR=/tmp/lumen-beta-target-jar.txt
PSQL="./scripts/db.sh"
export DB_PATH="${LUMEN_DB:-prisma/lumen.db}"
. "$(dirname "$0")/lib/session.sh"

# The founder address comes from .env rather than being hardcoded here, so
# this suite fails loudly — not silently as "not a founder" — if a deployment
# ever runs it without FOUNDER_EMAILS configured to match.
FOUNDER_EMAIL=$(grep '^FOUNDER_EMAILS=' .env | head -1 | cut -d= -f2- | tr -d '"' | cut -d, -f1 | xargs)
if [ -z "$FOUNDER_EMAIL" ]; then
  echo "FATAL  .env has no FOUNDER_EMAILS — this suite has no founder to test with." >&2
  exit 1
fi

INVITED_EMAIL=beta-invited@lumen.test
TARGET_EMAIL=beta-target@lumen.test
REVOKE_EMAIL=beta-revoke-only@lumen.test

pass=0; fail=0
check() { # check <label> <expected-substring> <actual>
  if printf '%s' "$3" | grep -qF -- "$2"; then echo "  PASS  $1"; pass=$((pass+1));
  else echo "  FAIL  $1 (expected: $2 | got: $(printf '%s' "$3" | head -c 200))"; fail=$((fail+1)); fi
}
not_check() { # not_check <label> <forbidden-substring> <actual>
  if printf '%s' "$3" | grep -qF -- "$2"; then echo "  FAIL  $1 (found forbidden: $2)"; fail=$((fail+1));
  else echo "  PASS  $1"; pass=$((pass+1)); fi
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

# signup_raw <jar> <email> <invite-token>
#
# The signup form itself, submitted exactly as a browser would — including
# the hidden `invite` field the signup page carries from the URL. Bypasses
# nothing: this is how every gate assertion below is actually tested.
signup_raw() {
  local jar="$1" email="$2" token="$3"
  curl -s -c "$jar" -b "$jar" "$BASE/signup?invite=$token" -o /tmp/beta-signup-form.html
  action_fields /tmp/beta-signup-form.html
  curl -s -c "$jar" -b "$jar" -X POST "$BASE/signup" \
    -F "\$ACTION_REF_1=" -F "\$ACTION_1:0=$ACTION_REF" -F "\$ACTION_1:1=$ACTION_STATE" -F "\$ACTION_KEY=$ACTION_KEY" \
    -F "email=$email" -F "password=beta-suite-password-1234" -F "terms=on" -F "invite=$token"
}

# confirm_and_signin <jar> <email>
#
# Follows the confirmation link the same way `lumen_session_start` does, and
# falls back to a direct sign-in if the account was already confirmed.
confirm_and_signin() {
  local jar="$1" email="$2"
  local confirm_token
  confirm_token=$(curl -s "$BASE/api/dev/confirm-link?email=$email" \
    | sed -n 's/.*"tokenHash":"\([^"]*\)".*/\1/p')

  if [ -n "$confirm_token" ]; then
    curl -s -c "$jar" -b "$jar" "$BASE/auth/confirm?token_hash=$confirm_token&type=signup" -o /dev/null
  else
    curl -s -c "$jar" -b "$jar" "$BASE/login" -o /tmp/beta-login-form.html
    action_fields /tmp/beta-login-form.html
    curl -s -c "$jar" -b "$jar" -X POST "$BASE/login" \
      -F "\$ACTION_REF_1=" -F "\$ACTION_1:0=$ACTION_REF" -F "\$ACTION_1:1=$ACTION_STATE" -F "\$ACTION_KEY=$ACTION_KEY" \
      -F "email=$email" -F "password=beta-suite-password-1234" -o /dev/null
  fi
}

# issue_invite_row <email> <token> <status> <expires-sql>
#
# Writes an invite directly, the way `createInviteAction` would have, so a
# specific status or expiry can be tested without waiting fourteen days or
# guessing a token. Only the hash is ever written — see `src/lib/beta/invites.ts`.
issue_invite_row() {
  local email="$1" token="$2" status="$3" expires="$4"
  local hash
  hash=$(printf '%s' "$token" | openssl dgst -sha256 -hex | sed 's/.*= *//')
  $PSQL "DELETE FROM invites WHERE \"tokenHash\"='$hash';" > /dev/null
  $PSQL "INSERT INTO invites (id,email,\"tokenHash\",status,\"expiresAt\",\"updatedAt\") VALUES ('inv-test-'||substr(md5(random()::text),1,16),'$email','$hash','$status',$expires,now());" > /dev/null
}

# Server Actions called the way the browser calls them: by id, over the RSC
# RPC path. The id comes from the build manifest, so a renamed action fails
# loudly here instead of quietly not being tested.
aid() { node -e "const m=require('$PWD/.next/server/server-reference-manifest.json').node;for(const[k,v]of Object.entries(m))if(v.exportedName==='$1')console.log(k)"; }
ID_CREATE_INVITE=$(aid createInviteAction)
ID_REVOKE_INVITE=$(aid revokeInviteAction)
ID_SET_DISABLED=$(aid setUserDisabledAction)
ID_FEEDBACK=$(aid submitFeedbackAction)

rpc() { # rpc <jar> <page> <action-id> <json-args>
  curl -s -c "$1" -b "$1" -X POST "$BASE$2" \
    -H "Next-Action: $3" -H "Content-Type: text/plain;charset=UTF-8" --data-raw "$4"
}

# --- Cleanup: only the addresses and rows this suite owns -------------------
#
# The jar files matter as much as the database rows. The local auth provider's
# accounts live in the server process's memory and outlive one run of this
# script, so a jar left over from a previous run can still carry a valid
# session cookie for an account this cleanup is about to delete from Postgres
# out from under it — every later request on that jar then finds a signed-in
# user with no workspace and no valid form to submit, and the failures that
# follow have nothing to do with whatever they claim to test. `rm -f` them
# unconditionally, the same first step `lumen_session_start` takes for $JAR.
rm -f "$FOUNDER_JAR" "$INVITED_JAR" "$TARGET_JAR"

for email in "$INVITED_EMAIL" "$TARGET_EMAIL" "$REVOKE_EMAIL"; do
  $PSQL "DELETE FROM workspaces WHERE \"ownerId\" IN (SELECT id FROM users WHERE email='$email');" > /dev/null
  $PSQL "DELETE FROM users WHERE email='$email';" > /dev/null
  $PSQL "DELETE FROM invites WHERE email='$email';" > /dev/null
done
$PSQL "DELETE FROM feedback WHERE \"onboardingFriction\" LIKE 'e2e-beta-marker%';" > /dev/null

lumen_session_start "$JAR"

echo "===== 1. SIGNUP IS INVITE-ONLY ====="

OUT=$(signup_raw "$INVITED_JAR" "$INVITED_EMAIL" "")
check "no token at all is refused"      "Lumen is invite-only" "$OUT"
checkeq "no account created"            "0" "$($PSQL "SELECT count(*) FROM users WHERE email='$INVITED_EMAIL';")"

OUT=$(signup_raw "$INVITED_JAR" "$INVITED_EMAIL" "not-a-real-token")
check "a made-up token is refused"      "Lumen is invite-only" "$OUT"

issue_invite_row "someone-else@lumen.test" "mismatched-token" "PENDING" "now() + interval '1 day'"
OUT=$(signup_raw "$INVITED_JAR" "$INVITED_EMAIL" "mismatched-token")
check "a token issued to another address is refused" "Lumen is invite-only" "$OUT"

issue_invite_row "$INVITED_EMAIL" "expired-token" "PENDING" "now() - interval '1 day'"
OUT=$(signup_raw "$INVITED_JAR" "$INVITED_EMAIL" "expired-token")
check "an expired invite is refused"    "Lumen is invite-only" "$OUT"

issue_invite_row "$INVITED_EMAIL" "revoked-token" "REVOKED" "now() + interval '1 day'"
OUT=$(signup_raw "$INVITED_JAR" "$INVITED_EMAIL" "revoked-token")
check "a revoked invite is refused"     "Lumen is invite-only" "$OUT"

issue_invite_row "$INVITED_EMAIL" "good-token" "PENDING" "now() + interval '1 day'"
OUT=$(signup_raw "$INVITED_JAR" "$INVITED_EMAIL" "good-token")
check "a valid pending invite for the right address succeeds" "Check your email" "$OUT"
checkeq "the invite is not spent by signup alone, only by an account existing" \
  "PENDING" "$($PSQL "SELECT status FROM invites WHERE email='$INVITED_EMAIL' ORDER BY \"createdAt\" DESC LIMIT 1;")"

confirm_and_signin "$INVITED_JAR" "$INVITED_EMAIL"
checkeq "confirming signed them in"     "1" "$(grep -c "lumen.local_session" "$INVITED_JAR" 2>/dev/null || echo 0)"
checkeq "account created"               "1" "$($PSQL "SELECT count(*) FROM users WHERE email='$INVITED_EMAIL';")"
checkeq "the invite is now ACCEPTED"    "ACCEPTED" "$($PSQL "SELECT status FROM invites WHERE email='$INVITED_EMAIL' ORDER BY \"createdAt\" DESC LIMIT 1;")"
checkeq "acceptedByUserId recorded"     "1" "$($PSQL "SELECT count(*) FROM invites WHERE email='$INVITED_EMAIL' AND \"acceptedByUserId\" IS NOT NULL;")"

echo "===== 2. AN INVITE IS GOOD FOR ONE ACCOUNT ====="

# A fresh, unauthenticated jar — not $INVITED_JAR, which is signed in by now.
# Reusing a signed-in jar here would hit `redirectIfSignedIn()` instead of the
# real signup form, and assert nothing about the invite at all.
REUSE_JAR=/tmp/lumen-beta-reuse-jar.txt
rm -f "$REUSE_JAR"
OUT=$(signup_raw "$REUSE_JAR" "$INVITED_EMAIL" "good-token")
check "the same spent token is refused a second time" "Lumen is invite-only" "$OUT"
checkeq "still exactly one account for that address" "1" "$($PSQL "SELECT count(*) FROM users WHERE email='$INVITED_EMAIL';")"

echo "===== 3. A FOUNDER NEEDS NO INVITE ====="

$PSQL "DELETE FROM workspaces WHERE \"ownerId\" IN (SELECT id FROM users WHERE email='$FOUNDER_EMAIL');" > /dev/null
$PSQL "DELETE FROM users WHERE email='$FOUNDER_EMAIL';" > /dev/null

OUT=$(signup_raw "$FOUNDER_JAR" "$FOUNDER_EMAIL" "")
check "founder signup with no invite succeeds" "Check your email" "$OUT"
confirm_and_signin "$FOUNDER_JAR" "$FOUNDER_EMAIL"
checkeq "founder session established" "1" "$(grep -c "lumen.local_session" "$FOUNDER_JAR" 2>/dev/null || echo 0)"
checkeq "no invite was consumed for the founder" "0" "$($PSQL "SELECT count(*) FROM invites WHERE email='$FOUNDER_EMAIL';")"

echo "===== 4. THE ADMIN PAGE ANSWERS NOT-FOUND, NOT FORBIDDEN ====="

# The HTTP status on this first response is 200, not 404 — the same reason
# e2e-projects.sh checks a redirect via its meta-refresh tag rather than a raw
# 3xx: (app)/layout.tsx starts streaming the document shell before the async
# `requireFounderView()` deep in the page resolves, and a status already sent
# cannot change. What actually matters is checked instead: the response never
# carries founder-only content, and it does carry the not-found boundary React
# renders once it hydrates — confirmed by the app's own not-found copy landing
# in the RSC payload.
OUT=$(curl -s -c "$JAR" -b "$JAR" "$BASE/admin")
not_check "a non-founder's response names no founder-only heading" "Who is in" "$OUT"
not_check "and no invite in it"                                     "$INVITED_EMAIL" "$OUT"
check "the not-found boundary is what the page actually sent" "There is nothing at this address" "$OUT"

CODE=$(curl -s -o /tmp/beta-admin-founder.html -w "%{http_code}" -c "$FOUNDER_JAR" -b "$FOUNDER_JAR" "$BASE/admin")
checkeq "a founder gets 200"             "200" "$CODE"
check "the founder's page names the invited address" "$INVITED_EMAIL" "$(cat /tmp/beta-admin-founder.html)"

echo "===== 5. CREATING AND REVOKING INVITES IS FOUNDER-ONLY ====="

OUT=$(rpc "$JAR" "/admin" "$ID_CREATE_INVITE" "[\"$TARGET_EMAIL\"]")
check "a non-founder cannot create an invite" "Not found." "$OUT"
checkeq "and nothing was created"        "0" "$($PSQL "SELECT count(*) FROM invites WHERE email='$TARGET_EMAIL';")"

OUT=$(rpc "$FOUNDER_JAR" "/admin" "$ID_CREATE_INVITE" "[\"$TARGET_EMAIL\"]")
check "a founder can create an invite"   "Invite ready for" "$OUT"
checkeq "one pending invite exists"      "1" "$($PSQL "SELECT count(*) FROM invites WHERE email='$TARGET_EMAIL' AND status='PENDING';")"
checkeq "and it is audited"              "1" "$($PSQL "SELECT count(*) FROM audit_events WHERE action='beta.invite.created';")"

TARGET_TOKEN=$(printf '%s' "$OUT" | sed -n 's#.*invite=\([A-Za-z0-9_-]*\).*#\1#p' | head -1)
if [ ${#TARGET_TOKEN} -ge 16 ]; then
  echo "  PASS  the invite link carries a real-looking token"; pass=$((pass+1));
else
  echo "  FAIL  the invite link carries a real-looking token (got: '$TARGET_TOKEN')"; fail=$((fail+1));
fi

OUT=$(rpc "$FOUNDER_JAR" "/admin" "$ID_CREATE_INVITE" "[\"not-an-email\"]")
check "a malformed address is rejected"  "valid email" "$OUT"

$PSQL "DELETE FROM invites WHERE email='$REVOKE_EMAIL';" > /dev/null
OUT=$(rpc "$FOUNDER_JAR" "/admin" "$ID_CREATE_INVITE" "[\"$REVOKE_EMAIL\"]")
REVOKE_ID=$($PSQL "SELECT id FROM invites WHERE email='$REVOKE_EMAIL' AND status='PENDING' ORDER BY \"createdAt\" DESC LIMIT 1;")

OUT=$(rpc "$JAR" "/admin" "$ID_REVOKE_INVITE" "[\"$REVOKE_ID\"]")
check "a non-founder cannot revoke"       "Not found." "$OUT"

OUT=$(rpc "$FOUNDER_JAR" "/admin" "$ID_REVOKE_INVITE" "[\"$REVOKE_ID\"]")
check "a founder can revoke a pending invite" "Invite revoked." "$OUT"
checkeq "it is REVOKED"                   "REVOKED" "$($PSQL "SELECT status FROM invites WHERE id='$REVOKE_ID';")"
checkeq "and audited"                     "1" "$($PSQL "SELECT count(*) FROM audit_events WHERE action='beta.invite.revoked' AND \"subjectId\"='$REVOKE_ID';")"

OUT=$(rpc "$FOUNDER_JAR" "/admin" "$ID_REVOKE_INVITE" "[\"$REVOKE_ID\"]")
check "revoking it twice fails the second time" "already been used or revoked" "$OUT"

echo "===== 6. DISABLING AND RE-ENABLING ACCOUNTS ====="

signup_raw "$TARGET_JAR" "$TARGET_EMAIL" "$TARGET_TOKEN" > /dev/null
confirm_and_signin "$TARGET_JAR" "$TARGET_EMAIL"
checkeq "the invited target actually has an account" "1" "$($PSQL "SELECT count(*) FROM users WHERE email='$TARGET_EMAIL';")"
TARGET_ID=$($PSQL "SELECT id FROM users WHERE email='$TARGET_EMAIL';")

LANDING=$(curl -s -o /dev/null -w "%{http_code}" -c "$TARGET_JAR" -b "$TARGET_JAR" "$BASE/overview")
checkeq "the target can reach the app before being disabled" "200" "$LANDING"

FOUNDER_ID=$($PSQL "SELECT id FROM users WHERE email='$FOUNDER_EMAIL';")
OUT=$(rpc "$FOUNDER_JAR" "/admin" "$ID_SET_DISABLED" "[\"$FOUNDER_ID\",true]")
check "a founder cannot disable their own account" "cannot disable your own account" "$OUT"
checkeq "and remains enabled"             "" "$($PSQL "SELECT \"disabledAt\" FROM users WHERE id='$FOUNDER_ID';")"

OUT=$(rpc "$JAR" "/admin" "$ID_SET_DISABLED" "[\"$TARGET_ID\",true]")
check "a non-founder cannot disable anyone" "Not found." "$OUT"

OUT=$(rpc "$FOUNDER_JAR" "/admin" "$ID_SET_DISABLED" "[\"$TARGET_ID\",true]")
check "a founder can disable another account" "Account disabled." "$OUT"
checkeq "disabledAt is set"               "1" "$($PSQL "SELECT count(*) FROM users WHERE id='$TARGET_ID' AND \"disabledAt\" IS NOT NULL;")"
checkeq "and audited"                     "1" "$($PSQL "SELECT count(*) FROM audit_events WHERE action='beta.user.disabled' AND \"subjectId\"='$TARGET_ID';")"

CODE=$(curl -s -o /tmp/beta-target-after-disable.html -w "%{http_code}" -c "$TARGET_JAR" -b "$TARGET_JAR" "$BASE/overview")
check "a disabled account's next request is sent to sign in" "/login" "$(cat /tmp/beta-target-after-disable.html)$CODE"

OUT=$(rpc "$FOUNDER_JAR" "/admin" "$ID_SET_DISABLED" "[\"$TARGET_ID\",false]")
check "a founder can re-enable"           "Account re-enabled." "$OUT"
checkeq "disabledAt is cleared"           "" "$($PSQL "SELECT \"disabledAt\" FROM users WHERE id='$TARGET_ID';")"
checkeq "and audited"                     "1" "$($PSQL "SELECT count(*) FROM audit_events WHERE action='beta.user.enabled' AND \"subjectId\"='$TARGET_ID';")"

LANDING=$(curl -s -o /dev/null -w "%{http_code}" -c "$TARGET_JAR" -b "$TARGET_JAR" "$BASE/overview")
checkeq "re-enabled account reaches the app again" "200" "$LANDING"

echo "===== 7. FEEDBACK ====="

$PSQL "DELETE FROM feedback WHERE \"workspaceId\"='$LUMEN_WORKSPACE_ID';" > /dev/null

OUT=$(rpc "$JAR" "/settings" "$ID_FEEDBACK" '[{}]')
check "answering nothing is refused"      "Answer at least one question." "$OUT"
checkeq "nothing written"                 "0" "$($PSQL "SELECT count(*) FROM feedback WHERE \"workspaceId\"='$LUMEN_WORKSPACE_ID';")"

LONG=$(printf 'x%.0s' $(seq 1 2001))
OUT=$(rpc "$JAR" "/settings" "$ID_FEEDBACK" "[{\"overall\":\"$LONG\"}]")
check "an answer over 2000 characters is refused" "too long" "$OUT"

OUT=$(rpc "$JAR" "/settings" "$ID_FEEDBACK" '[{"overall":"e2e-beta-marker: it made marketing less confusing"}]')
check "one answer is enough"              "Thank you" "$OUT"
checkeq "one feedback row landed"         "1" "$($PSQL "SELECT count(*) FROM feedback WHERE \"workspaceId\"='$LUMEN_WORKSPACE_ID';")"

FOUNDERPAGE=$(curl -s -c "$FOUNDER_JAR" -b "$FOUNDER_JAR" "$BASE/admin")
check "the founder sees the feedback"     "e2e-beta-marker" "$FOUNDERPAGE"

echo "===== 8. THE FOUNDER VIEW NAMES ACCOUNTS, NOT THEIR BUSINESS DATA ====="

$PSQL "DELETE FROM projects WHERE id='beta-isolation-marker';" > /dev/null
$PSQL "INSERT INTO projects (id,\"workspaceId\",name,industry,country,\"businessStage\",\"primaryGoal\",\"updatedAt\") VALUES ('beta-isolation-marker','$LUMEN_WORKSPACE_ID','e2e-beta-marker-project','saas','US','SCALING','ACQUISITION',now());" > /dev/null

FOUNDERPAGE=$(curl -s -c "$FOUNDER_JAR" -b "$FOUNDER_JAR" "$BASE/admin")
not_check "the admin page never names a project" "e2e-beta-marker-project" "$FOUNDERPAGE"

$PSQL "DELETE FROM projects WHERE id='beta-isolation-marker';" > /dev/null

# --- Teardown: this suite's accounts leave nothing behind for the next one --
#
# Every other suite that starts from `lumen_session_start` assumes exactly one
# workspace exists once it has run — e2e-tenancy.sh asserts that literally.
# Three more accounts signed up here, so three more workspaces exist unless
# this cleans them up itself, the same way e2e-tenancy.sh's own second account
# cleans up after its section 9.
for email in "$FOUNDER_EMAIL" "$INVITED_EMAIL" "$TARGET_EMAIL"; do
  $PSQL "DELETE FROM workspaces WHERE \"ownerId\" IN (SELECT id FROM users WHERE email='$email');" > /dev/null
  $PSQL "DELETE FROM users WHERE email='$email';" > /dev/null
  $PSQL "DELETE FROM invites WHERE email='$email';" > /dev/null
done
$PSQL "DELETE FROM invites WHERE email IN ('someone-else@lumen.test','$REVOKE_EMAIL');" > /dev/null
$PSQL "DELETE FROM feedback WHERE \"onboardingFriction\" LIKE 'e2e-beta-marker%' OR overall LIKE 'e2e-beta-marker%';" > /dev/null
rm -f "$FOUNDER_JAR" "$INVITED_JAR" "$TARGET_JAR" "$REUSE_JAR"

echo
echo "===== RESULT: $pass passed, $fail failed ====="
[ "$fail" -eq 0 ]
