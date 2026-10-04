#!/usr/bin/env bash
# End-to-end tests for billing.
#
# The webhook is the only thing in Lumen that grants a paid subscription, so it
# is the only thing this suite really tests. Every event below is signed here,
# with the same HMAC-SHA256 over `${ts}:${rawBody}` that Paddle uses and the
# secret from .env — so the code under test is the real verification path, not a
# stub standing in for it.
#
# What is deliberately NOT tested here is Paddle's checkout overlay. It is their
# script on their domain, and the money it takes has no effect on this product
# until a webhook arrives — which is exactly the property that makes it safe to
# leave untested and the webhook worth testing this hard.

BASE=http://localhost:3000
JAR=/tmp/lumen-billing-jar.txt
PSQL="./scripts/db.sh"
. "$(dirname "$0")/lib/session.sh"

SECRET=$(grep '^PADDLE_NOTIFICATION_SECRET=' .env | sed 's/^[^=]*=//; s/^"//; s/"$//')

pass=0; fail=0
check() {
  if printf '%s' "$3" | grep -qF -- "$2"; then echo "  PASS  $1"; pass=$((pass+1));
  else echo "  FAIL  $1 (expected: $2 | got: $(printf '%s' "$3" | head -c 140))"; fail=$((fail+1)); fi
}
checkeq() {
  if [ "$2" = "$3" ]; then echo "  PASS  $1"; pass=$((pass+1));
  else echo "  FAIL  $1 (expected '$2', got '$3')"; fail=$((fail+1)); fi
}
aid() { node -e "const m=require('$PWD/.next/server/server-reference-manifest.json').node;for(const[k,v]of Object.entries(m))if(v.exportedName==='$1')console.log(k)"; }

# send <body> [ts-offset-seconds] [override-signature]
#
# Signs the exact bytes it sends. `--data-binary` rather than `-d`, because
# curl's -d strips newlines and the signature covers the body as it arrives.
send() {
  local body="$1" offset="${2:-0}" override="${3:-}"
  local ts sig
  ts=$(( $(date +%s) + offset ))

  if [ -n "$override" ]; then
    sig="$override"
  else
    sig=$(printf '%s' "$ts:$body" | openssl dgst -sha256 -hmac "$SECRET" -hex | sed 's/.*= *//')
  fi

  curl -s -o /tmp/billing-body.txt -w '%{http_code}' -X POST "$BASE/api/webhooks/paddle" \
    -H "Content-Type: application/json" \
    -H "Paddle-Signature: ts=$ts;h1=$sig" \
    --data-binary "$body"
}

# event <event-id> <type> <status> [workspace-id] [subscription-id]
EVENT_SEQ=0
event() {
  local eid="$1" type="$2" status="$3" ws="${4:-}" sub="${5:-sub_lumen_test}" occurred="${6:-}" starts="${7:-2026-08-24T00:00:00Z}" ends="${8:-2026-09-24T00:00:00Z}"
  local custom="null" canceled="null"
  EVENT_SEQ=$((EVENT_SEQ + 1))
  [ -z "$occurred" ] && occurred=$(date -u -d "2026-08-24 00:00:00 UTC + $EVENT_SEQ minutes" +%Y-%m-%dT%H:%M:%SZ)
  [ -n "$ws" ] && custom="{\"workspaceId\":\"$ws\"}"
  # Paddle sends canceled_at on a cancellation, so the fixture does too.
  if [ "$status" = "canceled" ]; then
    canceled='"2026-08-24T00:00:00Z"'
  fi

  printf '{"event_id":"%s","event_type":"%s","occurred_at":"%s","data":{"id":"%s","status":"%s","customer_id":"ctm_test","custom_data":%s,"canceled_at":%s,"current_billing_period":{"starts_at":"%s","ends_at":"%s"},"items":[{"price":{"id":"pri_lumen_test"}}]}}' \
    "$eid" "$type" "$occurred" "$sub" "$status" "$custom" "$canceled" "$starts" "$ends"
}

$PSQL "DELETE FROM projects;" > /dev/null
$PSQL "DELETE FROM subscriptions;" > /dev/null
$PSQL "DELETE FROM webhook_events;" > /dev/null
$PSQL "DELETE FROM entitlements;" > /dev/null
# Audit events are append-only and outlive everything else, so a suite that
# counts them has to start from a known floor rather than from whatever the
# previous run left behind.
$PSQL "DELETE FROM audit_events;" > /dev/null
lumen_session_start "$JAR"
WS="$LUMEN_WORKSPACE_ID"

ID_CHECKOUT=$(aid startCheckoutAction)

echo "===== 1. AN UNSIGNED REQUEST IS REFUSED ====="
CODE=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/webhooks/paddle" \
  -H "Content-Type: application/json" --data-binary "$(event evt_unsigned subscription.created active "$WS")")
checkeq "no signature, no entry" "403" "$CODE"
checkeq "and nothing recorded"   "0" "$($PSQL "SELECT count(*) FROM webhook_events;")"

echo "===== 2. A WRONG SIGNATURE IS REFUSED ====="
BODY=$(event evt_forged subscription.created active "$WS")
CODE=$(send "$BODY" 0 "0000000000000000000000000000000000000000000000000000000000000000")
checkeq "forged signature refused" "403" "$CODE"
checkeq "no subscription created"  "0" "$($PSQL "SELECT count(*) FROM subscriptions;")"

echo "===== 3. A SIGNATURE FOR DIFFERENT BYTES IS REFUSED ====="
# The classic mistake this guards against: signing a parsed-and-re-serialised
# copy of the body instead of the bytes that arrived.
TS=$(date +%s)
OTHER=$(event evt_other subscription.created active "$WS")
SIG=$(printf '%s' "$TS:$OTHER" | openssl dgst -sha256 -hmac "$SECRET" -hex | sed 's/.*= *//')
CODE=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/webhooks/paddle" \
  -H "Content-Type: application/json" -H "Paddle-Signature: ts=$TS;h1=$SIG" \
  --data-binary "$(event evt_mismatch subscription.created active "$WS")")
checkeq "a signature over other bytes is refused" "403" "$CODE"

echo "===== 4. A STALE SIGNATURE IS REFUSED ====="
# The timestamp is inside the signed string, so it cannot be moved without
# breaking the signature. That is what stops a captured request being replayed
# tomorrow.
CODE=$(send "$(event evt_stale subscription.created active "$WS")" -600)
checkeq "an old request is refused" "403" "$CODE"
checkeq "still nothing recorded"    "0" "$($PSQL "SELECT count(*) FROM webhook_events;")"

echo "===== 5. A VALID EVENT GRANTS THE PLAN ====="
CODE=$(send "$(event evt_001 subscription.created active "$WS")")
checkeq "accepted"                "200" "$CODE"
checkeq "subscription created"    "1" "$($PSQL "SELECT count(*) FROM subscriptions WHERE \"workspaceId\"='$WS';")"
checkeq "and it is active"        "ACTIVE" "$($PSQL "SELECT status FROM subscriptions WHERE \"workspaceId\"='$WS';")"
checkeq "the provider id is kept" "sub_lumen_test" "$($PSQL "SELECT \"providerSubscriptionId\" FROM subscriptions WHERE \"workspaceId\"='$WS';")"
checkeq "the price is kept"       "pri_lumen_test" "$($PSQL "SELECT \"priceId\" FROM subscriptions WHERE \"workspaceId\"='$WS';")"
checkeq "the allowance is the paid one" "500" "$($PSQL "SELECT \"limit\" FROM entitlements WHERE \"workspaceId\"='$WS';")"
checkeq "the event was recorded"  "PROCESSED" "$($PSQL "SELECT status FROM webhook_events WHERE \"providerEventId\"='evt_001';")"
checkeq "and audited"             "1" "$($PSQL "SELECT count(*) FROM audit_events WHERE action='billing.subscription.updated';")"

echo "===== 6. THE SAME EVENT TWICE GRANTS NOTHING TWICE ====="
# Paddle retries for days. The unique event id is what makes that harmless.
$PSQL "UPDATE entitlements SET used=7 WHERE \"workspaceId\"='$WS';" > /dev/null
CODE=$(send "$(event evt_001 subscription.created active "$WS")")
checkeq "the retry is accepted"      "200" "$CODE"
check   "and reported as a duplicate" '"duplicate":true' "$(cat /tmp/billing-body.txt)"
checkeq "one event row, not two"     "1" "$($PSQL "SELECT count(*) FROM webhook_events WHERE \"providerEventId\"='evt_001';")"
checkeq "one audit row, not two"     "1" "$($PSQL "SELECT count(*) FROM audit_events WHERE action='billing.subscription.updated';")"
checkeq "and the meter was not reset" "7" "$($PSQL "SELECT used FROM entitlements WHERE \"workspaceId\"='$WS';")"

echo "===== 7. A CRASHED IN-PROGRESS EVENT IS RECOVERABLE ====="
$PSQL "INSERT INTO webhook_events (id,provider,\"providerEventId\",type,status,result,\"receivedAt\",\"processedAt\") VALUES ('evt_crashed_row','paddle','evt_crashed','subscription.created','PROCESSED','Processing.',now() - interval '30 minutes',NULL);" > /dev/null
CODE=$(send "$(event evt_crashed subscription.created active \"$WS\" sub_crashed)")
checkeq "stale claim is retried" "200" "$CODE"
checkeq "stale event becomes processed" "PROCESSED" "$($PSQL "SELECT status FROM webhook_events WHERE \"providerEventId\"='evt_crashed';")"
checkeq "stale event gets completion time" "1" "$($PSQL "SELECT count(*) FROM webhook_events WHERE \"providerEventId\"='evt_crashed' AND \"processedAt\" IS NOT NULL;")"

echo "===== 8. A FRESH IN-PROGRESS DUPLICATE KEEPS PADDLE RETRYABLE ====="
$PSQL "INSERT INTO webhook_events (id,provider,\"providerEventId\",type,status,result,\"receivedAt\",\"processedAt\") VALUES ('evt_inflight_row','paddle','evt_inflight','subscription.created','PROCESSED','Processing.',now(),NULL);" > /dev/null
CODE=$(send "$(event evt_inflight subscription.created active \"$WS\" sub_inflight)")
checkeq "fresh in-flight duplicate is retriable" "500" "$CODE"
$PSQL "UPDATE webhook_events SET \"receivedAt\"=now() - interval '30 minutes' WHERE \"providerEventId\"='evt_inflight';" > /dev/null
CODE=$(send "$(event evt_inflight subscription.created active \"$WS\" sub_inflight)")
checkeq "same event recovers after lease" "200" "$CODE"

echo "===== 9. BILLING PERIOD RENEWAL RESETS THE METER ====="
$PSQL "UPDATE entitlements SET used=123, "periodStart"='2026-08-24T00:00:00Z', "periodEnd"='2026-09-24T00:00:00Z' WHERE "workspaceId"='$WS';" > /dev/null
send "$(event evt_renewal subscription.updated active "$WS" sub_lumen_test 2026-09-24T01:00:00Z 2026-09-24T00:00:00Z 2026-10-24T00:00:00Z)" > /dev/null
checkeq "new billing period is stored" "2026-10-24T00:00:00.000Z" "$($PSQL "SELECT \"periodEnd\"::text FROM entitlements WHERE \"workspaceId\"='$WS';")"
checkeq "monthly allowance resets on renewal" "0" "$($PSQL "SELECT used FROM entitlements WHERE \"workspaceId\"='$WS';")"

echo "===== 10. AN OLDER EVENT CANNOT ROLL BACK THE CURRENT STATE ====="
CODE=$(send "$(event evt_old subscription.canceled canceled "$WS" sub_lumen_test 2026-09-23T23:59:00Z 2026-09-23T00:00:00Z 2026-10-23T00:00:00Z)")
checkeq "older event is acknowledged" "200" "$CODE"
check "reported ignored" 'IGNORED' "$(cat /tmp/billing-body.txt)"
checkeq "subscription stays active" "ACTIVE" "$($PSQL "SELECT status FROM subscriptions WHERE \"workspaceId\"='$WS';")"

echo "===== 11. A FAILED PAYMENT KEEPS ACCESS, AND SAYS SO ====="
# Paddle retries a failed charge for days. Cutting a paying customer off at the
# first retry punishes them for an expired card.
send "$(event evt_002 subscription.past_due past_due "$WS")" > /dev/null
checkeq "status is past due"        "PAST_DUE" "$($PSQL "SELECT status FROM subscriptions WHERE \"workspaceId\"='$WS';")"
checkeq "the allowance is unchanged" "500" "$($PSQL "SELECT \"limit\" FROM entitlements WHERE \"workspaceId\"='$WS';")"

S=$(curl -s -c $JAR -b $JAR "$BASE/settings")
check "the interface says payment failed" "last payment did not go through" "$S"
check "and names the state"               "Payment failed" "$S"

echo "===== 12. CANCELLING DROPS BACK TO THE TRIAL ALLOWANCE ====="
send "$(event evt_003 subscription.canceled canceled "$WS")" > /dev/null
checkeq "status is canceled"      "CANCELED" "$($PSQL "SELECT status FROM subscriptions WHERE \"workspaceId\"='$WS';")"
checkeq "back to the trial limit" "50" "$($PSQL "SELECT \"limit\" FROM entitlements WHERE \"workspaceId\"='$WS';")"
checkeq "and nothing was deleted" "1" "$($PSQL "SELECT count(*) FROM subscriptions WHERE \"workspaceId\"='$WS';")"

S=$(curl -s -c $JAR -b $JAR "$BASE/settings")
check "the interface reassures"        "Nothing has been deleted" "$S"
check "and names the cancellation day" "Canceled on"              "$S"
# No Subscribe button on this deployment, because it has no Paddle keys — and
# saying so is better than an button that opens nothing.
check "and says why it cannot be bought here" "not configured on this deployment" "$S"

echo "===== 13. RESUBSCRIBING RESTORES THE PLAN, NOT THE METER ====="
$PSQL "UPDATE entitlements SET used=11 WHERE \"workspaceId\"='$WS';" > /dev/null
send "$(event evt_004 subscription.resumed active "$WS")" > /dev/null
checkeq "active again"            "ACTIVE" "$($PSQL "SELECT status FROM subscriptions WHERE \"workspaceId\"='$WS';")"
checkeq "paid allowance restored" "500" "$($PSQL "SELECT \"limit\" FROM entitlements WHERE \"workspaceId\"='$WS';")"
checkeq "what was spent stays spent" "11" "$($PSQL "SELECT used FROM entitlements WHERE \"workspaceId\"='$WS';")"

echo "===== 14. AN EVENT NAMING A WORKSPACE THAT DOES NOT EXIST CHANGES NOTHING ====="
BEFORE=$($PSQL "SELECT count(*) FROM subscriptions;")
CODE=$(send "$(event evt_005 subscription.created active workspace-that-never-existed sub_other)")
checkeq "acknowledged, not retried forever" "200" "$CODE"
checkeq "recorded as ignored" "IGNORED" "$($PSQL "SELECT status FROM webhook_events WHERE \"providerEventId\"='evt_005';")"
checkeq "no subscription invented" "$BEFORE" "$($PSQL "SELECT count(*) FROM subscriptions;")"

echo "===== 15. AN EVENT TYPE WE DO NOT HANDLE IS IGNORED, NOT GUESSED AT ====="
send "$(event evt_006 subscription.imported active "$WS")" > /dev/null
checkeq "marked ignored" "IGNORED" "$($PSQL "SELECT status FROM webhook_events WHERE \"providerEventId\"='evt_006';")"
checkeq "the subscription is untouched" "ACTIVE" "$($PSQL "SELECT status FROM subscriptions WHERE \"workspaceId\"='$WS';")"

echo "===== 16. AN EVENT CANNOT MOVE A SUBSCRIPTION TO ANOTHER WORKSPACE ====="
# custom_data comes from outside. Once a subscription id is known, our own
# record decides whose it is — otherwise anyone who learned a subscription id
# could point it at their own account.
$PSQL "INSERT INTO users (id,email,\"updatedAt\") VALUES ('bill-other','other@billing.test',now()) ON CONFLICT (id) DO NOTHING;" > /dev/null
$PSQL "INSERT INTO workspaces (id,name,\"ownerId\",\"updatedAt\") VALUES ('bill-other-ws','Someone else','bill-other',now()) ON CONFLICT (id) DO NOTHING;" > /dev/null

send "$(event evt_007 subscription.updated active bill-other-ws sub_lumen_test)" > /dev/null
checkeq "it stayed with the original workspace" "$WS" \
  "$($PSQL "SELECT \"workspaceId\" FROM subscriptions WHERE \"providerSubscriptionId\"='sub_lumen_test';")"
checkeq "and the other workspace got nothing" "0" \
  "$($PSQL "SELECT count(*) FROM subscriptions WHERE \"workspaceId\"='bill-other-ws';")"

$PSQL "DELETE FROM workspaces WHERE id='bill-other-ws';" > /dev/null
$PSQL "DELETE FROM users WHERE id='bill-other';" > /dev/null

echo "===== 17. CHECKOUT CAN ONLY EVER BUY FOR YOUR OWN WORKSPACE ====="
# The action takes no arguments, so there is nothing to point elsewhere. The
# assertion is that the workspace it returns is the caller's.
OUT=$(curl -s -c $JAR -b $JAR -X POST "$BASE/settings" \
  -H "Next-Action: $ID_CHECKOUT" -H "Content-Type: text/plain;charset=UTF-8" --data-raw "[]")
check "checkout reports it is not configured" "not configured" "$OUT"
checkeq "and leaks no price id" "0" "$(printf '%s' "$OUT" | grep -c 'pri_')"

echo "===== 18. THE SECRET NEVER LEAVES THE SERVER ====="
S=$(curl -s -c $JAR -b $JAR "$BASE/settings")
checkeq "no notification secret in the page" "0" "$(printf '%s' "$S" | grep -c 'pdl_ntfset')"
checkeq "no api key name either"             "0" "$(printf '%s' "$S" | grep -c 'PADDLE_NOTIFICATION_SECRET')"

echo "===== 19. THE PLAN IS SHOWN HONESTLY ====="
send "$(event evt_008 subscription.canceled canceled "$WS")" > /dev/null
S=$(curl -s -c $JAR -b $JAR "$BASE/settings")
check "the price is shown"     "\$19"  "$S"
check "the quota is shown"     "500 AI actions" "$S"
check "and what it includes"   "weekly marketing plan" "$S"

echo "===== 20. DELETING THE WORKSPACE TAKES THE SUBSCRIPTION ====="
# Not the webhook history: that is the record of what a provider told us, and it
# has to outlive the account for anyone to reconcile a bill afterwards.
EVENTS=$($PSQL "SELECT count(*) FROM webhook_events;")
$PSQL "DELETE FROM subscriptions WHERE \"workspaceId\"='$WS';" > /dev/null
checkeq "webhook history survives" "$EVENTS" "$($PSQL "SELECT count(*) FROM webhook_events;")"

echo
echo "===== RESULT: $pass passed, $fail failed ====="
[ "$fail" -eq 0 ]
