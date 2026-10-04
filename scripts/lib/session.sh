#!/usr/bin/env bash
# Shared session bootstrap for the end-to-end suites.
#
# Every page and every Server Action now goes through the Data Access Layer, so
# a suite without a signed-in user reaches nothing at all. That setup lives here
# and only here: nineteen suites carrying nineteen copies of a signup-confirm-
# login dance is nineteen chances to get it subtly wrong, at exactly the moment
# the test results matter most.
#
# What a suite has to know is unchanged from before auth existed:
#
#   . "$(dirname "$0")/lib/session.sh"
#   lumen_session_start "$JAR"      # a jar holding a signed-in session
#   $LUMEN_WORKSPACE_ID             # the workspace its fixtures belong to
#
# This requires AUTH_PROVIDER=local. That provider is a test double — see
# src/lib/auth/providers/local.ts — and `src/lib/env.ts` refuses to start with
# it in production, so nothing here can be pointed at a real deployment by
# accident.

: "${BASE:=http://localhost:3000}"

# The suite account. One address for every suite, because the local provider
# derives its user id from the address: the same account, and so the same
# workspace, survives a dev-server restart in the middle of a run.
: "${LUMEN_TEST_EMAIL:=suite@lumen.test}"
: "${LUMEN_TEST_PASSWORD:=suite-password-1234}"

# _lumen_action_fields <html-file>
#
# Next.js will not accept a form POST that omits the progressive-enhancement
# action fields — it cannot tell which Server Action was meant. Underscored and
# separately named because several suites define an `action_fields` of their
# own after sourcing this file.
_lumen_action_fields() {
  _LU_REF=$(grep -o 'name="\$ACTION_1:0" value="[^"]*"' "$1" | sed 's/.*value="//;s/"$//' | sed 's/&quot;/"/g')
  _LU_STATE=$(grep -o 'name="\$ACTION_1:1" value="[^"]*"' "$1" | sed 's/.*value="//;s/"$//' | sed 's/&quot;/"/g')
  _LU_KEY=$(grep -o 'name="\$ACTION_KEY" value="[^"]*"' "$1" | sed 's/.*value="//;s/"$//')
}

# _lumen_post_form <jar> <path> [extra -F args...]
_lumen_post_form() {
  local jar="$1" path="$2"; shift 2
  local page=/tmp/lumen-session-form.html

  curl -s -c "$jar" -b "$jar" "$BASE$path" -o "$page"
  _lumen_action_fields "$page"

  curl -s -c "$jar" -b "$jar" -X POST "$BASE$path" \
    -F "\$ACTION_REF_1=" -F "\$ACTION_1:0=$_LU_REF" -F "\$ACTION_1:1=$_LU_STATE" \
    -F "\$ACTION_KEY=$_LU_KEY" "$@" -o /dev/null
}

# lumen_session_start <jar-path>
#
# Discards any previous session and leaves the caller holding a jar with a
# verified, signed-in account behind it.
#
# The whole flow runs every time rather than being cached, because it is also
# the only thing that re-creates a workspace: a suite that deletes one — the
# tenancy suite does, deliberately — must not leave the next suite homeless.
# Signing in calls provisionAccount, which creates a workspace when the account
# has none.
#
# Three steps, in the order a person would take them:
#
#   1. sign up. Idempotent, because an address that already has an account gets
#      the same answer as a new one, by design.
#   2. follow the confirmation link, if one is pending. The local provider has
#      no mailbox, so /api/dev/confirm-link reads back the token it would have
#      emailed; that route 404s unless the local provider is in use.
#   3. sign in, if the account was already confirmed by an earlier suite.
#
# Step 2 leaves a session behind on its own — confirming a signup signs you in,
# exactly as it does for a real person — so step 3 only runs when it did not.
lumen_session_start() {
  local jar="${1:?lumen_session_start requires a jar path}"

  rm -f "$jar"

  # Lumen is invite-only. The suite goes through the gate rather than around it:
  # an invite is issued for this address, and the token is presented on the
  # signup form exactly as a real person's would be. Bypassing the gate for the
  # tests would leave the one thing standing between a stranger and an account
  # exercised by nothing.
  #
  # Only the hash is stored, so the row is written with the hash of a token this
  # script knows — which is the same shape the application writes.
  # Named apart from the confirmation token below. Both are "the token" in
  # conversation and reusing one variable for the two would work today and
  # break the first time the order changed.
  local invite_token="suite-invite-token-$LUMEN_TEST_EMAIL"
  local hash
  hash=$(printf '%s' "$invite_token" | openssl dgst -sha256 -hex | sed 's/.*= *//')

  ./scripts/db.sh "DELETE FROM invites WHERE \"tokenHash\"='$hash';" > /dev/null
  ./scripts/db.sh "INSERT INTO invites (id,email,\"tokenHash\",status,\"expiresAt\",\"updatedAt\") VALUES ('inv-' || substr(md5(random()::text),1,20),'$LUMEN_TEST_EMAIL','$hash','PENDING',now() + interval '1 day',now());" > /dev/null

  _lumen_post_form "$jar" /signup \
    -F "email=$LUMEN_TEST_EMAIL" -F "password=$LUMEN_TEST_PASSWORD" -F "terms=on" \
    -F "invite=$invite_token"

  local confirm_token
  confirm_token=$(curl -s "$BASE/api/dev/confirm-link?email=$LUMEN_TEST_EMAIL" \
    | sed -n 's/.*"tokenHash":"\([^"]*\)".*/\1/p')

  if [ -n "$confirm_token" ]; then
    curl -s -c "$jar" -b "$jar" "$BASE/auth/confirm?token_hash=$confirm_token&type=signup" -o /dev/null
  else
    _lumen_post_form "$jar" /login \
      -F "email=$LUMEN_TEST_EMAIL" -F "password=$LUMEN_TEST_PASSWORD"
  fi

  if ! grep -q "lumen.local_session" "$jar"; then
    echo "FATAL  lumen_session_start could not sign in as $LUMEN_TEST_EMAIL." >&2
    echo "       Check the server is running with AUTH_PROVIDER=local." >&2
    exit 1
  fi

  lumen_workspace_id
}

# lumen_workspace_id
#
# The workspace the suite's fixtures belong to, exported as LUMEN_WORKSPACE_ID.
# Inserting a fixture with a raw SQL INSERT means supplying the column, so it
# comes from here rather than from nineteen copies of the same lookup.
#
# Found by joining through the account rather than by taking the first row of
# the table: a suite that creates a second workspace to test isolation would
# otherwise be able to change which one the rest of its fixtures land in.
lumen_workspace_id() {
  local found
  found=$(./scripts/db.sh "SELECT m.\"workspaceId\" FROM memberships m JOIN users u ON u.id=m.\"userId\" WHERE u.email='$LUMEN_TEST_EMAIL' ORDER BY m.\"createdAt\" LIMIT 1;")

  if [ -z "$found" ]; then
    echo "FATAL  signed in as $LUMEN_TEST_EMAIL but the account has no workspace." >&2
    exit 1
  fi

  export LUMEN_WORKSPACE_ID="$found"

  # Give the suite account its allowance back.
  #
  # Every suite shares one account, and most of them generate several times, so
  # a full run exhausts the monthly AI allowance somewhere around the middle of
  # the alphabet — after which the remaining suites fail for a reason that has
  # nothing to do with what they test. That is the limit working, not a bug, and
  # it was found by exactly this collision.
  #
  # Reset here rather than raised in configuration: the allowance is a product
  # decision and must not be sized to suit a test harness. scripts/e2e-usage.sh
  # is where the limit itself is asserted, and it sets the numbers it needs.
  ./scripts/db.sh "UPDATE entitlements SET used=0 WHERE \"workspaceId\"='$found';" > /dev/null
}

# Run once at source time as well, because suites insert their fixtures near the
# top of the file and call lumen_session_start after — the workspace has to
# exist before the first INSERT rather than after it.
lumen_session_start "${JAR:-/tmp/lumen-bootstrap-jar.txt}"
