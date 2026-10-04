import { AppError, normalizeError, toPublicError, type PublicError } from "@/lib/errors";

/**
 * Result type for server actions.
 *
 * Server actions cannot throw across the network boundary without losing
 * their shape, so they return a discriminated union instead. Client code
 * narrows on `ok` and gets a fully typed value or a displayable error.
 */
export type Result<T> = { ok: true; data: T } | { ok: false; error: PublicError };

export function ok<T>(data: T): Result<T> {
  return { ok: true, data };
}

export function fail(error: unknown): Result<never> {
  return { ok: false, error: toPublicError(normalizeError(error)) };
}

/** Run an action and convert any thrown error into a Result. */
export async function attempt<T>(fn: () => Promise<T>): Promise<Result<T>> {
  try {
    return ok(await fn());
  } catch (error) {
    return fail(error);
  }
}

export type { AppError, PublicError };
