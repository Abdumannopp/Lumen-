import { NextResponse } from "next/server";
import { normalizeError, toPublicError, type PublicError } from "@/lib/errors";
import { logger } from "@/lib/logger";

/**
 * Route handler helpers.
 *
 * Every API response uses one envelope, so clients can branch on `ok` without
 * inspecting status codes, and unexpected errors are logged with their cause
 * before a sanitised version is returned.
 */

export interface ApiSuccess<T> {
  ok: true;
  data: T;
  requestId: string;
}

export interface ApiFailure {
  ok: false;
  error: PublicError;
  requestId: string;
}

export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

export function jsonOk<T>(data: T, init?: ResponseInit) {
  return NextResponse.json<ApiSuccess<T>>(
    { ok: true, data, requestId: crypto.randomUUID() },
    init,
  );
}

/**
 * Run a route handler body, returning the JSON envelope on success and a
 * sanitised error envelope on failure.
 */
export async function handleRoute<T>(fn: () => Promise<T>): Promise<NextResponse<ApiResponse<T>>> {
  const requestId = crypto.randomUUID();

  try {
    return NextResponse.json<ApiSuccess<T>>({ ok: true, data: await fn(), requestId });
  } catch (caught) {
    const error = normalizeError(caught);

    logger.error("Route handler failed", {
      requestId,
      code: error.code,
      status: error.status,
      message: error.message,
      cause: error.cause instanceof Error ? error.cause.message : undefined,
    });

    return NextResponse.json<ApiFailure>(
      { ok: false, error: toPublicError(error), requestId },
      { status: error.status },
    );
  }
}
