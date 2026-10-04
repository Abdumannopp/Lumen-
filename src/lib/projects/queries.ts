import "server-only";

import { cache } from "react";

import { db } from "@/lib/db";
import { readActiveProjectId } from "@/lib/active-project";
import { requireWorkspace } from "@/lib/auth/dal";
import type { Project as ProjectRow } from "@/generated/prisma/client";

/**
 * Project reads.
 *
 * Every query lives here so that project scoping is enforced in one place
 * rather than re-derived at each call site.
 *
 * **Every function below starts at the Data Access Layer**, and this is the
 * module where that matters most: the application shell resolves the active
 * project on every page, so whatever this file is willing to return is what the
 * whole product is willing to show.
 *
 * Doing the check in a layout instead is not equivalent, and the tenancy suite
 * proves it. Next.js renders a layout and the page beneath it concurrently and
 * streams the result: a `redirect()` in the layout stops the *navigation*, but
 * the page's data has already been rendered into the flight payload by then and
 * goes out with the response. A signed-out request to /projects came back as a
 * 307 with the project list inside it. The queries themselves have to refuse.
 */

/**
 * A project as the application sees it: list columns decoded to `string[]`.
 * Nothing above this layer knows they are JSON on disk.
 */
export type ProjectRecord = Omit<ProjectRow, "targetMarkets"> & {
  targetMarkets: string[];
};

export function toProjectRecord(row: ProjectRow): ProjectRecord {
  return { ...row };
}

export async function listProjects({
  includeArchived = false,
}: { includeArchived?: boolean } = {}): Promise<ProjectRecord[]> {
  const { workspaceId } = await requireWorkspace();

  const rows = await db.project.findMany({
    where: { workspaceId, ...(includeArchived ? {} : { archivedAt: null }) },
    orderBy: [{ archivedAt: "asc" }, { updatedAt: "desc" }],
  });

  return rows.map(toProjectRecord);
}

export async function countProjects() {
  const { workspaceId } = await requireWorkspace();

  const [active, archived] = await Promise.all([
    db.project.count({ where: { workspaceId, archivedAt: null } }),
    db.project.count({ where: { workspaceId, archivedAt: { not: null } } }),
  ]);

  return { active, archived, total: active + archived };
}

/**
 * Request-deduped single project lookup.
 *
 * Wrapped in React's `cache` so a route can resolve the project in
 * `generateMetadata` — which runs before the response starts streaming, and so
 * can still set a 404 status — and again in the component, at the cost of one
 * query rather than two.
 */
export const getProject = cache(async (id: string): Promise<ProjectRecord | null> => {
  const { workspaceId } = await requireWorkspace();

  // findFirst with the workspace in the predicate, not findUnique on the id.
  // A project in someone else's workspace comes back as null — the same answer
  // as a project that was never there, which is the only honest one to give: a
  // distinguishable "you may not see this" is a way to confirm ids by guessing.
  const row = await db.project.findFirst({ where: { id, workspaceId } });

  return row ? toProjectRecord(row) : null;
});

/**
 * Resolve the project the interface should be showing.
 *
 * Falls back to the most recently updated unarchived project when the cookie
 * is missing or points at something archived or deleted. The stale cookie is
 * deliberately not rewritten here: this runs during render, where Next.js
 * forbids setting cookies. It is corrected the next time the user switches.
 *
 * The fallback used to be "the most recent project anywhere", which was
 * harmless with one install and one operator and is not harmless now: it is a
 * path from a cookie pointing nowhere to a stranger's business. Both queries
 * carry the workspace, so a cookie naming another tenant's project resolves the
 * same way as a cookie naming nothing at all.
 */
export async function getActiveProject(): Promise<ProjectRecord | null> {
  const { workspaceId } = await requireWorkspace();
  const activeId = await readActiveProjectId();

  if (activeId) {
    const selected = await db.project.findFirst({
      where: { id: activeId, workspaceId, archivedAt: null },
    });
    if (selected) return toProjectRecord(selected);
  }

  const fallback = await db.project.findFirst({
    where: { workspaceId, archivedAt: null },
    orderBy: { updatedAt: "desc" },
  });

  return fallback ? toProjectRecord(fallback) : null;
}

/**
 * For later phases: any feature that writes project-scoped data should call
 * this so it fails loudly rather than silently writing orphaned records.
 */
export async function requireActiveProject(): Promise<ProjectRecord> {
  const project = await getActiveProject();

  if (!project) {
    throw new Error("No active project. Create a project before using this feature.");
  }

  return project;
}
