/**
 * Which week a plan covers.
 *
 * Its own module because `actions.ts` carries "use server", where every export
 * must be an async Server Action — a plain helper exported from there fails the
 * build. That constraint is a good one: it keeps pure functions out of the file
 * that talks to the database.
 *
 * Weeks start on Monday and are pinned to UTC midnight, the same convention as
 * every other day-only column — see `src/lib/date.ts` for why mixing UTC writes
 * with local reads is the bug that convention exists to prevent.
 */
export function weekStartFor(today: Date): Date {
  const date = new Date(
    Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()),
  );

  // getUTCDay: 0 is Sunday. Sunday belongs to the week that is ending, so it
  // maps back six days rather than forward one.
  const offset = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - offset);

  return date;
}
