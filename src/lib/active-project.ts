import "server-only";

import { cookies } from "next/headers";

/**
 * Active project persistence.
 *
 * "Which business am I looking at" is a preference, not a permission: it says
 * where to point, never what may be reached. The workspace decides that, and
 * `requireProject()` in the Data Access Layer checks this id against it.
 *
 * A cookie rather than localStorage so server components can scope their
 * queries during render — with localStorage the server would render blind and
 * every page would need a client round-trip.
 */

export const ACTIVE_PROJECT_COOKIE = "lumen.active_project";

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

export async function readActiveProjectId(): Promise<string | null> {
  const store = await cookies();
  return store.get(ACTIVE_PROJECT_COOKIE)?.value ?? null;
}

/**
 * Only callable from a server action or route handler — Next.js forbids
 * setting cookies while rendering.
 */
export async function writeActiveProjectId(projectId: string): Promise<void> {
  const store = await cookies();

  store.set(ACTIVE_PROJECT_COOKIE, projectId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: ONE_YEAR_SECONDS,
    secure: process.env.NODE_ENV === "production",
  });
}

export async function clearActiveProjectId(): Promise<void> {
  const store = await cookies();
  store.delete(ACTIVE_PROJECT_COOKIE);
}
