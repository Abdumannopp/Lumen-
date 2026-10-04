#!/usr/bin/env bash
# End-to-end tests for email, emailed links, and what a password change does.
#
# Nothing is delivered: EMAIL_PROVIDER defaults to `log`, which records that a
# message would have gone and sends it nowhere. That is the point — the log row
# is real, so "the notification is sent, once, and carries no token" is a test
# rather than a hope.
#
# The claim worth the most here is the smallest: the email log holds no address,
# no body and no token. A table that quietly accumulates reset links is the kind
# of thing nobody notices until it is copied.

BASE=http://localhost:3000
JAR=/tmp/lumen-email-jar.txt
JAR2=/tmp/lumen-email-jar-second.txt
PSQL="./scripts/db.sh"
. "$(dirname "$0")/lib/session.sh"

pass=0; fail=0
check() {
  if printf '%s' "$3" | grep -qF -- "$2"; then echo "  PASS  $1"; pass=$((pass+1));
  else echo "  FAIL  $1 (expected: $2 | got: $(printf '%s' "$3" | head -c 140))"; fail=$((fail+1)); fi
}
absent() {
  if printf '%s' "$3" | grep -qF -- "$2"; then echo "  FAIL  $1 (should NOT contain: $2)"; fail=$((fail+1));
  else echo "  PASS  $1"; pass=$((pass+1)); fi
}
checkeq() {
  if [ "$2" = "$3" ]; then echo "  PASS  $1"; pass=$((pass+1));
  else echo "  FAIL  $1 (expected '$2', got '$3')"; fail=$((fail+1)); fi
}

_action_fields() {
  A_REF=$(grep -o 'name="\$ACTION_[0-9]*:0" value="[^"]*"' "$1" | head -1 | sed 's/.*value="//;s/"$//' | sed 's/&quot;/"/g')
  A_STATE=$(grep -o 'name="\$ACTION_[0-9]*:1" value="[^"]*"' "$1" | head -1 | sed 's/.*value="//;s/"$//' | sed 's/&quot;/"/g')
  A_KEY=$(grep -o 'name="\$ACTION_KEY" value="[^"]*"' "$1" | head -1 | sed 's/.*value="//;s/"$//')
  # The ordinal, captured between ACTION_ and the colon. `tr -cd '0-9'` looks
  # simpler and is wrong: on $ACTION_1:0 it keeps both digits and yields 10.
  A_N=$(grep -o 'name="\$ACTION_[0-9]*:0"' "$1" | head -1 | sed 's/.*ACTION_\([0-9]*\):0.*/\1/')
}

post_form() { # post_form <jar> <path> [extra -F args...]
  local jar="$1" path="$2"; shift 2
  curl -s -c "$jar" -b "$jar" "$BASE$path" -o /tmp/email-form.html
  _action_fields /tmp/email-form.html
  curl -s -c "$jar" -b "$jar" -X POST "$BASE$path" \
    -F "\$ACTION_REF_${A_N}=" -F "\$ACTION_${A_N}:0=$A_REF" -F "\$ACTION_${A_N}:1=$A_STATE" \
    -F "\$ACTION_KEY=$A_KEY" "$@"
}

# A new address every run, and the reason is not tidiness.
#
# This suite changes its account's password twice, and the local auth provider
# keeps accounts in this server process's memory. A fixed address would mean the
# next run trying to sign in with the standard password against an account whose
# password this run changed — which fails, and fails again until the server is
# restarted. A unique address cannot collide with its own past.
#
# The account is removed at the end. Strays from a run that died in between are
# swept here, because otherwise every crash leaves a workspace behind and the
# tenancy suite's "exactly one workspace" stops being true.
FRESH="email-$(date +%s)-$$@lumen.test"

$PSQL "DELETE FROM email_messages;" > /dev/null
$PSQL "DELETE FROM workspaces WHERE \"ownerId\" IN (SELECT id FROM users WHERE email LIKE 'email-%@lumen.test');" > /dev/null
$PSQL "DELETE FROM users WHERE email LIKE 'email-%@lumen.test';" > /dev/null

LUMEN_TEST_EMAIL="$FRESH" lumen_session_start "$JAR"
WS="$LUMEN_WORKSPACE_ID"

echo "===== 1. A NEW ACCOUNT IS WELCOMED, ONCE ====="
checkeq "one welcome"           "1" "$($PSQL "SELECT count(*) FROM email_messages WHERE template='welcome';")"
checkeq "tied to the workspace" "$WS" "$($PSQL "SELECT \"workspaceId\" FROM email_messages WHERE template='welcome';")"

# Signing in again provisions again. It must not welcome again.
LUMEN_TEST_EMAIL="$FRESH" lumen_session_start "$JAR"
checkeq "still one welcome" "1" "$($PSQL "SELECT count(*) FROM email_messages WHERE template='welcome';")"

echo "===== 2. THE LOG HOLDS NO ADDRESS ====="
# The whole design of the table. A copy of it is not a mailing list.
ROW=$($PSQL "SELECT \"recipientHash\" FROM email_messages WHERE template='welcome';")
absent  "the address is not stored"  "$FRESH" "$ROW"
absent  "nor the local part"         "${FRESH%%@*}" "$ROW"
checkeq "a sha256 hash is"           "64" "${#ROW}"
checkeq "and it is the right hash"   "$ROW" \
  "$(printf '%s' "$FRESH" | tr 'A-Z' 'a-z' | openssl dgst -sha256 -hex | sed 's/.*= *//')"

echo "===== 3. THE LOG HOLDS NO BODY AND NO TOKEN ====="
# Asserted against every column, not against the ones we remember, so a column
# added later that carries a body fails this test rather than passing quietly.
ALL=$($PSQL "SELECT row_to_json(e)::text FROM email_messages e;")
absent "no subject line"       "workspace is ready" "$ALL"
absent "no body text"          "Set up your business" "$ALL"
absent "no link"               "/onboarding"        "$ALL"
absent "no token-shaped value" "token"              "$ALL"

echo "===== 4. NOT CONFIGURED IS RECORDED, NOT SWALLOWED ====="
# This deployment has no email provider. "Why did nobody get a welcome email"
# has an answer in the database rather than in someone's memory.
checkeq "recorded as skipped" "SKIPPED" "$($PSQL "SELECT status FROM email_messages WHERE template='welcome';")"
check   "and says why"        "not configured" "$($PSQL "SELECT error FROM email_messages WHERE template='welcome';")"

echo "===== 5. CHANGING A PASSWORD NOTIFIES THE ADDRESS ON THE ACCOUNT ====="
# The one email that catches a takeover: whoever changed the password has not
# necessarily changed the address, so the real owner still hears about it.
post_form "$JAR" /update-password -F "password=a-second-long-password" > /dev/null
checkeq "a notification was sent" "1" \
  "$($PSQL "SELECT count(*) FROM email_messages WHERE template='password-changed';")"
absent  "and it carries no password" "a-second-long-password" \
  "$($PSQL "SELECT row_to_json(e)::text FROM email_messages e WHERE template='password-changed';")"

echo "===== 6. CHANGING IT ENDS EVERY OTHER SESSION ====="
# A password change is what someone does when they think an intruder is in
# their account. It means nothing if the intruder's session survives it.
cp "$JAR" "$JAR2"   # a second browser, signed in as the same person
checkeq "the second session worked before" "200" \
  "$(curl -s -o /dev/null -w '%{http_code}' -c $JAR2 -b $JAR2 "$BASE/overview")"

post_form "$JAR" /update-password -F "password=a-third-long-password-x" > /dev/null

checkeq "the other session is gone" "307" \
  "$(curl -s -o /dev/null -w '%{http_code}' -b /tmp/lumen-email-jar-second.txt "$BASE/overview")"
checkeq "this one still works"      "200" \
  "$(curl -s -o /dev/null -w '%{http_code}' -c $JAR -b $JAR "$BASE/overview")"

echo "===== 7. EACH CHANGE IS ITS OWN NOTIFICATION ====="
checkeq "two changes, two notifications" "2" \
  "$($PSQL "SELECT count(*) FROM email_messages WHERE template='password-changed';")"

echo "===== 8. AN EMAILED LINK CANNOT SEND SOMEONE OFF-SITE ====="
# The email that carries a reset link is exactly what a phisher would copy, so
# an open redirect on this route is a phishing kit with our name on it.
#
# Each attempt uses a REAL, freshly-issued recovery token. An invalid token
# short-circuits to /login before `next` is ever read, so testing with one would
# pass whatever the allowlist did — which is how this section passed against a
# deliberately broken allowlist the first time it was written.
fresh_token() {
  rm -f /tmp/email-anon.txt
  post_form /tmp/email-anon.txt /forgot-password -F "email=$FRESH" > /dev/null
  curl -s "$BASE/api/dev/confirm-link?email=$FRESH" | sed -n 's/.*"tokenHash":"\([^"]*\)".*/\1/p'
}

for target in "https://evil.example" "//evil.example" "/\\evil.example" "/settings/../../evil" "/api/dev/confirm-link"; do
  T=$(fresh_token)
  rm -f /tmp/email-redirect.txt
  LOC=$(curl -s -o /dev/null -w '%{redirect_url}' -c /tmp/email-redirect.txt \
    --get --data-urlencode "token_hash=$T" --data-urlencode "type=recovery" \
    --data-urlencode "next=$target" "$BASE/auth/confirm")
  case "$LOC" in
    *evil*|*confirm-link*) echo "  FAIL  refuses $target (sent to $LOC)"; fail=$((fail+1));;
    *)                     echo "  PASS  refuses $target"; pass=$((pass+1));;
  esac
done

echo "===== 9. AND STILL SENDS SOMEONE WHERE WE MEANT TO ====="
# A reset link's whole purpose is /update-password. An allowlist that broke it
# would be a safe route to nowhere.
T=$(fresh_token)
checkeq "a recovery token was issued" "1" "$([ -n "$T" ] && echo 1 || echo 0)"

LOC=$(curl -s -o /dev/null -w '%{redirect_url}' -c /tmp/email-confirm.txt \
  "$BASE/auth/confirm?token_hash=$T&type=recovery&next=/update-password")
check "an allowed destination is honoured" "/update-password" "$LOC"

echo "===== 10. A BAD LINK FAILS SAFELY AND SAYS SO ====="
LOC=$(curl -s -o /dev/null -w '%{redirect_url}' "$BASE/auth/confirm?token_hash=not-a-real-token&type=signup")
check "sent to sign in"    "/login" "$LOC"
check "and told it expired" "notice=expired" "$LOC"

P=$(curl -s "$BASE/login?notice=expired")
check  "the page explains it"  "expired or has already been used" "$P"
# Says what happened and what to do, rather than calling the person wrong.
check  "and says what to do"   "Sign in, or ask for a new one"    "$P"

echo "===== 11. FORGOT-PASSWORD REVEALS NOTHING ====="
# The same answer for a registered address and an unregistered one, because the
# difference is exactly what an attacker is asking for.
rm -f /tmp/email-anon.txt
KNOWN=$(post_form /tmp/email-anon.txt /forgot-password -F "email=$FRESH")
rm -f /tmp/email-anon.txt
UNKNOWN=$(post_form /tmp/email-anon.txt /forgot-password -F "email=nobody-at-all@lumen.test")
check "a registered address gets the generic answer"   "If that address has an account" "$KNOWN"
check "an unregistered address gets the same one"      "If that address has an account" "$UNKNOWN"

echo "===== 12. THE API KEY NEVER REACHES A PAGE ====="
S=$(curl -s -c $JAR -b $JAR "$BASE/settings")
absent "no Resend key"      "re_"              "$S"
absent "no key name either" "RESEND_API_KEY"   "$S"

echo "===== 13. THE SUITE LEAVES NOTHING BEHIND ====="
# Its account is not a customer, and a workspace left lying around is a workspace
# the next suite has to reason about.

$PSQL "DELETE FROM workspaces WHERE id='$WS';" > /dev/null
$PSQL "DELETE FROM users WHERE email='$FRESH';" > /dev/null
checkeq "the suite account is gone" "0" "$($PSQL "SELECT count(*) FROM users WHERE email='$FRESH';")"

echo
echo "===== RESULT: $pass passed, $fail failed ====="
[ "$fail" -eq 0 ]
