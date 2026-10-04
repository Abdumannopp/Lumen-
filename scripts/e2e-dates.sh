#!/usr/bin/env bash
# End-to-end tests for calendar-date handling.
#
# Several columns hold a *day*, not an instant. `new Date("2026-08-15")` parses
# that as UTC midnight while every reader in the app works in local time, so
# west of UTC the two disagreed by a day: a metric entered as the 15th was
# bucketed and displayed as the 14th, and the content calendar put a piece on
# the wrong cell.
#
# These assertions are timezone-sensitive by design. Run the suite twice —
# once normally, and once with the server started under a negative-offset
# timezone (TZ=America/New_York npm start) — and it must pass both times.

BASE=http://localhost:3000
JAR=/tmp/lumen-dates-jar.txt
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
call() { # call <path> <action-id> <json-args>
  curl -s -c $JAR -b $JAR -X POST "$BASE$1" \
    -H "Next-Action: $2" -H "Content-Type: text/plain;charset=UTF-8" --data-raw "$3"
}

rm -f $JAR
$PSQL "DELETE FROM projects;" > /dev/null
PID=date-test-1
$PSQL "INSERT INTO projects (id,\"workspaceId\",name,industry,country,\"businessStage\",\"primaryGoal\",\"updatedAt\") VALUES ('$PID','$LUMEN_WORKSPACE_ID','Date Testbed','saas','US','SCALING','ACQUISITION',now());" > /dev/null
$PSQL "INSERT INTO business_profiles (id,\"projectId\",\"productOrService\",\"businessModel\",\"targetCustomers\",\"lastStep\",\"completedAt\",\"updatedAt\") VALUES ('bp-date-1','$PID','A harness','SUBSCRIPTION','Teams',6,now(),now());" > /dev/null
lumen_session_start "$JAR"

ID_METRIC=$(aid saveMetricAction)
ID_CONTENT=$(aid saveContentItemAction)
ID_SCHED=$(aid setContentScheduleAction)
ID_EXPERIMENT=$(aid saveExperimentAction)

DAY=2026-08-15
BEFORE=2026-08-14
AFTER=2026-08-16

echo "===== 1. A METRIC KEEPS THE DAY IT WAS ENTERED FOR ====="
OUT=$(call /analytics "$ID_METRIC" "[\"$PID\",{\"date\":\"$DAY\",\"channel\":\"SEO\",\"clicks\":\"120\",\"impressions\":\"1000\"}]")
check "row saved" '"ok":true' "$OUT"

A=$(curl -s -c $JAR -b $JAR "$BASE/analytics?from=$DAY&to=$DAY")
check "row is inside a single-day range" "Recorded rows · 1" "$A"
check "the day bucket is the day entered" "$DAY" "$A"
check "the table shows that day"          "15 Aug" "$A"
absent "and not the day before"           "14 Aug" "$A"

echo "===== 2. RANGES EXCLUDE THE DAYS EITHER SIDE ====="
B=$(curl -s -c $JAR -b $JAR "$BASE/analytics?from=$BEFORE&to=$BEFORE")
check "the day before holds nothing" "none in this date range" "$B"
C=$(curl -s -c $JAR -b $JAR "$BASE/analytics?from=$AFTER&to=$AFTER")
check "the day after holds nothing"  "none in this date range" "$C"
D=$(curl -s -c $JAR -b $JAR "$BASE/analytics?from=$BEFORE&to=$AFTER")
check "a range spanning it includes it" "Recorded rows · 1" "$D"

echo "===== 3. A REVERSED RANGE IS READ AS A TYPO, NOT AS EMPTY ====="
E=$(curl -s -c $JAR -b $JAR "$BASE/analytics?from=$AFTER&to=$BEFORE")
check "reversed range still finds the row" "Recorded rows · 1" "$E"

echo "===== 4. AN IMPOSSIBLE DATE IS REJECTED, NOT ROLLED OVER ====="
OUT=$(call /analytics "$ID_METRIC" "[\"$PID\",{\"date\":\"2026-02-31\",\"channel\":\"SEO\",\"clicks\":\"5\"}]")
check "31 February is refused" '"ok":false' "$OUT"
checkeq "and nothing was written" "1" "$($PSQL "SELECT count(*) FROM marketing_metrics WHERE \"projectId\"='$PID';")"

echo "===== 5. SCHEDULED CONTENT LANDS ON THE DAY THAT WAS PICKED ====="
# Read back through the overview, which renders the stored date server-side —
# that is the exact write-then-read path the timezone bug ran through.
FUTURE=2027-03-15
FUTURE_NEXT=2027-03-16
OUT=$(call /content "$ID_CONTENT" "[\"$PID\",{\"platform\":\"LINKEDIN\",\"type\":\"POST\",\"status\":\"SCHEDULED\",\"objective\":\"Test\",\"hook\":\"A dated hook\",\"body\":\"Body\",\"cta\":\"Click\",\"scheduledAt\":\"$FUTURE\"}]")
check "item saved" '"ok":true' "$OUT"
ITEM=$($PSQL "SELECT id FROM content_items WHERE \"projectId\"='$PID' LIMIT 1;")

O=$(curl -s -c $JAR -b $JAR "$BASE/overview")
check "the overview lists it"           "A dated hook" "$O"
check "on the day that was picked"      "$FUTURE"      "$O"
absent "not the day before"             "2027-03-14"   "$O"

echo "===== 6. RESCHEDULING ROUND-TRIPS ====="
call /content/calendar "$ID_SCHED" "[\"$PID\",\"$ITEM\",\"$FUTURE_NEXT\"]" > /dev/null
O2=$(curl -s -c $JAR -b $JAR "$BASE/overview")
check "the new day is shown" "$FUTURE_NEXT" "$O2"
absent "the old day is gone" "$FUTURE"      "$O2"

echo "===== 7. EXPERIMENT DATES ROUND-TRIP AND ARE ORDER-CHECKED ====="
OUT=$(call /growth/experiments "$ID_EXPERIMENT" "[\"$PID\",{\"name\":\"Test\",\"hypothesis\":\"Shorter posts will lift replies.\",\"targetMetric\":\"Replies\",\"action\":\"Cut every post in half.\",\"startDate\":\"$AFTER\",\"endDate\":\"$BEFORE\",\"status\":\"PLANNED\"}]")
check "end before start is refused" "end date is before the start date" "$OUT"

OUT=$(call /growth/experiments "$ID_EXPERIMENT" "[\"$PID\",{\"name\":\"Test\",\"hypothesis\":\"Shorter posts will lift replies.\",\"targetMetric\":\"Replies\",\"action\":\"Cut every post in half.\",\"startDate\":\"not-a-date\",\"endDate\":\"$AFTER\",\"status\":\"PLANNED\"}]")
check "an unreadable start date is refused" '"ok":false' "$OUT"

OUT=$(call /growth/experiments "$ID_EXPERIMENT" "[\"$PID\",{\"name\":\"Test\",\"hypothesis\":\"Shorter posts will lift replies.\",\"targetMetric\":\"Replies\",\"action\":\"Cut every post in half.\",\"startDate\":\"$BEFORE\",\"endDate\":\"$AFTER\",\"status\":\"PLANNED\"}]")
check "a valid pair is accepted" '"ok":true' "$OUT"

X=$(curl -s -c $JAR -b $JAR "$BASE/growth/experiments")
check "start date is offered back unchanged" "$BEFORE" "$X"
check "end date is offered back unchanged"   "$AFTER"  "$X"

echo
echo "===== RESULT: $pass passed, $fail failed ====="
[ "$fail" -eq 0 ]
