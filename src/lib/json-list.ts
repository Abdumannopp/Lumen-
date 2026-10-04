/**
 * The old SQLite list encoding.
 *
 * SQLite has no array type, so list columns were stored as JSON strings and
 * converted at the data-access boundary. PostgreSQL has `text[]`, so the
 * application no longer encodes anything — Prisma hands back `string[]`.
 *
 * `decodeList` is kept because the migration script still has to read databases
 * written the old way. Nothing in the running application should call either
 * function; if you find yourself reaching for one, the column is probably typed
 * wrongly in schema.prisma.
 *
 * Decoding never throws. A corrupt or hand-edited value yields an empty list
 * rather than taking down whatever reads it.
 */

export function decodeList(value: string | null | undefined): string[] {
  if (!value) return [];

  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((entry): entry is string => typeof entry === "string");
  } catch {
    return [];
  }
}

export function encodeList(value: readonly string[] | null | undefined): string {
  return JSON.stringify(value ?? []);
}
