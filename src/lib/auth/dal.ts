import "server-only";

import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { errors } from "@/lib/errors";
import { getAuthProvider } from "@/lib/auth/providers";
import { getServerEnv } from "@/lib/env";
import type { AuthUser } from "@/lib/auth/types";

/**
 * The Data Access Layer.
 *
 * Every Server Action and Route Handler that touches tenant data starts here.
 * Not the layout, not a proxy, not the UI — those decide what is *rendered*,
 * and rendering is not access control. A request that reaches a Server Action
 * has already gone past all of them.
 *
 * Three questions, in order, each refusing rather than guessing:
 *
 *   requireUser()             who is this, verified by the provider
 *   requireWorkspace()        which cabinet, verified against Membership
 *   requireProject(id)        is this business in that cabinet
 *
 * Nothing here reads an id the browser supplied as an authority. The active
 * workspace cookie is a preference; it is checked against Membership on every
 * request, and a cookie naming a workspace the person is not a member of is
 * treated as if it were absent.
 */

export const ACTIVE_WORKSPACE_COOKIE = "lumen.active_workspace";

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

export interface SessionUser {
  id: string;
  email: string;
}

export interface WorkspaceContext {
  userId: string;
  email: string;
  workspaceId: string;
  role: "OWNER" | "MEMBER";
}

/**
 * The signed-in user, mirrored into our own `users` table.
 *
 * The provider owns identity; this database owns everything that points at a
 * user, and a foreign key cannot reference a row that is not there. The upsert
 * keeps the two in step without a webhook — the first request after a signup
 * creates the row, and an address changed at the provider is picked up on the
 * next request rather than drifting.
 *
 * Wrapped in React's `cache` so a page that asks four times in one render costs
 * one verification, not four.
 */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const authUser: AuthUser | null = await getAuthProvider().currentUser();

  if (!authUser || !authUser.emailVerified) return null;

  const user = await db.user.upsert({
    where: { id: authUser.id },
    update: { email: authUser.email },
    create: { id: authUser.id, email: authUser.email },
    select: { id: true, email: true, disabledAt: true },
  });

  /**
   * A disabled account is nobody.
   *
   * Checked here rather than at sign-in, and that is the whole point: a flag
   * read only at login leaves every session opened before it was set still
   * working. Every request comes through this function, so disabling takes
   * effect on the next page load rather than whenever the person next signs in.
   */
  if (user.disabledAt) {
    logger.info("Disabled account refused", { userId: user.id });
    return null;
  }

  return { id: user.id, email: user.email };
});

/** The signed-in user, or a 401. */
export async function requireWorkspaceOwner(): Promise<WorkspaceContext> {
  const context = await requireWorkspace();
  if (context.role !== "OWNER") throw errors.forbidden("Workspace owner access is required.");
  return context;
}

export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();

  if (!user) throw errors.unauthorized("Sign in to continue.");

  return user;
}

/**
 * The workspace this request is acting in.
 *
 * The cookie chooses between the workspaces the person belongs to; it never
 * grants access to one. A cookie naming a workspace they are not a member of
 * resolves to their first membership instead of being honoured, because an
 * attacker who can set a cookie must not be able to set a workspace.
 *
 * Cached per request. Every query module now begins here, and a dashboard that
 * asks thirty times in one render should pay for one membership lookup, not
 * thirty. React's `cache` is per-request by construction — there is no window
 * in which one request could read another's answer.
 */
export const requireWorkspace = cache(async (): Promise<WorkspaceContext> => {
  const user = await requireUser();

  const memberships = await db.membership.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "asc" },
    select: { workspaceId: true, role: true },
  });

  if (memberships.length === 0) {
    // Signup creates a workspace, so this means the account was made some other
    // way. Refusing is right: there is nothing to show and nowhere safe to put
    // anything they create.
    throw errors.forbidden("This account does not belong to a workspace yet.");
  }

  const jar = await cookies();
  const preferred = jar.get(ACTIVE_WORKSPACE_COOKIE)?.value;

  const chosen =
    memberships.find((membership) => membership.workspaceId === preferred) ?? memberships[0];

  return {
    userId: user.id,
    email: user.email,
    workspaceId: chosen.workspaceId,
    role: chosen.role,
  };
});

/**
 * Send an unauthenticated visitor to the sign-in page.
 *
 * For layouts and pages, where a thrown 401 would render an error screen at
 * someone who simply is not signed in yet. Actions keep using `requireUser()`,
 * which refuses — a Server Action has no page to redirect.
 *
 * This is navigation, not protection. It decides what is *rendered*; the calls
 * below it still ask the DAL before touching anything.
 */
export async function requireUserOrRedirect(): Promise<SessionUser> {
  const user = await getCurrentUser();

  if (!user) redirect("/login");

  return user;
}

/** The mirror image: keep a signed-in person off the sign-in and sign-up forms. */
export async function redirectIfSignedIn(): Promise<void> {
  if (await getCurrentUser()) redirect("/overview");
}

/**
 * Confirm a project belongs to the caller's workspace.
 *
 * Returns not-found rather than forbidden for a project in someone else's
 * workspace. "You may not see this" confirms the id exists, which is enough to
 * map another tenant's data by guessing; "there is no such project" is both
 * true from where the caller stands and tells them nothing.
 */
export async function requireProject(projectId: string): Promise<WorkspaceContext> {
  const context = await projectInWorkspace(projectId);

  if (!context) throw errors.notFound("That project does not exist.");

  return context;
}

/**
 * The same question, answered with null instead of a throw.
 *
 * Server Actions report failure by returning `{ ok: false, message }` — the
 * message goes back into the form the person is looking at. Throwing there
 * would replace their page with an error screen and lose what they had typed,
 * so actions ask this and queries ask `requireProject`.
 *
 * Cached per request, so an action that checks the project and then reads
 * through a query module pays for one lookup rather than two.
 *
 * The answer for another tenant's project is null — indistinguishable from a
 * project that was deleted, which is the only answer that does not let someone
 * confirm an id by guessing at it.
 */
export const projectInWorkspace = cache(
  async (projectId: string): Promise<WorkspaceContext | null> => {
    const context = await requireWorkspace();

    const project = await db.project.findFirst({
      where: { id: projectId, workspaceId: context.workspaceId },
      select: { id: true },
    });

    return project ? context : null;
  },
);

/**
 * Remember which workspace the person is looking at.
 *
 * Only callable from a Server Action or Route Handler — Next.js forbids setting
 * cookies while rendering.
 */
export async function writeActiveWorkspaceId(workspaceId: string): Promise<void> {
  const jar = await cookies();

  jar.set(ACTIVE_WORKSPACE_COOKIE, workspaceId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: ONE_YEAR_SECONDS,
    secure: getServerEnv().APP_ENV !== "local",
  });
}

export async function clearActiveWorkspaceId(): Promise<void> {
  const jar = await cookies();
  jar.delete(ACTIVE_WORKSPACE_COOKIE);
}
