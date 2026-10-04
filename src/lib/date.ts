/**
 * Calendar dates.
 *
 * Several columns hold a *day*, not an instant: a metric's `date`, a content
 * item's `scheduledAt`, a campaign's or experiment's `startDate`/`endDate`.
 * They arrive from `<input type="date">` as `YYYY-MM-DD`.
 *
 * A day has no timezone, so it is pinned to **UTC midnight** on the way in and
 * read back with **UTC fields** on the way out. The stored value then says
 * exactly what it means — `2026-08-15T00:00:00.000Z` is the fifteenth, on any
 * machine — and carrying a laptop across timezones, or restoring a backup on a
 * different one, cannot silently move a metric onto the day before.
 *
 * The bug this replaces was a mixture rather than either convention:
 * `new Date("2026-08-15")` wrote UTC midnight, while every reader used local
 * fields (`toLocaleDateString`, `getDate()`, `setHours(12)` then
 * `toISOString()`). West of UTC the two disagreed by a day, so one row could
 * show as the 15th in its edit dialog, as the 14th in the table beside it, and
 * be charted under the 14th as well.
 *
 * Two directions, kept apart on purpose:
 *
 * - `parseDayInput` / `toDayInput` handle *stored* days, in UTC.
 * - `localDayKey` / `todayInput` describe the operator's *wall clock*, for
 *   "what day is it here" and for the calendar grid's cells. Compare a stored
 *   day to a grid cell by turning both into a `YYYY-MM-DD` key first — never by
 *   comparing the two Date objects.
 */

const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const pad = (value: number) => String(value).padStart(2, "0");

/**
 * Parse a value from a date input into a Date at UTC midnight.
 *
 * Returns null for empty or unreadable input, so callers can distinguish "not
 * set" from "typed something wrong" instead of storing an Invalid Date — which
 * compares false against everything and so slipped silently past date-order
 * checks.
 */
export function parseDayInput(value: string | null | undefined): Date | null {
  if (!value) return null;

  const trimmed = value.trim();
  if (!trimmed) return null;

  if (DAY_PATTERN.test(trimmed)) {
    const [year, month, day] = trimmed.split("-").map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));

    // Rejects impossible days that Date would roll over (2026-02-31 → 3 March).
    return date.getUTCFullYear() === year &&
      date.getUTCMonth() === month - 1 &&
      date.getUTCDate() === day
      ? date
      : null;
  }

  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** True when the value can be read as a date. Empty is *not* a valid date. */
export function isValidDayInput(value: string | null | undefined): boolean {
  return parseDayInput(value) !== null;
}

/**
 * Format a stored day as `YYYY-MM-DD`, in UTC.
 *
 * The exact inverse of `parseDayInput`, so a day written by a form comes back
 * to that form unchanged in every timezone.
 */
export function toDayInput(value: Date | string | null | undefined): string {
  if (!value) return "";

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * A stored day as "15 Aug".
 *
 * Formatted from the UTC fields rather than through `toLocaleDateString`, which
 * renders a stored day in the reader's zone and shifts it. It also makes server
 * and browser output identical, so a date inside a client component cannot
 * cause a hydration mismatch.
 */
export function formatDayShort(value: Date | string | null | undefined): string {
  const day = toDayInput(value);
  if (!day) return "—";

  const [, month, date] = day.split("-");
  return `${date} ${MONTHS[Number(month) - 1]}`;
}

/**
 * A `YYYY-MM-DD` key for a Date that represents local wall-clock time.
 *
 * Used for "today", and for the calendar grid's cells — those are built from
 * local `new Date(...)` arithmetic, so reading them in UTC would be as wrong as
 * reading a stored day locally.
 */
export function localDayKey(value: Date): string {
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
}

/** Today where the operator is, as a date-input value. */
export function todayInput(): string {
  return localDayKey(new Date());
}

/** UTC start of a stored day — the inclusive lower bound of a range. */
export function startOfDay(value: Date): Date {
  const date = new Date(value);
  date.setUTCHours(0, 0, 0, 0);
  return date;
}

/** UTC end of a stored day — the inclusive upper bound of a range. */
export function endOfDay(value: Date): Date {
  const date = new Date(value);
  date.setUTCHours(23, 59, 59, 999);
  return date;
}
