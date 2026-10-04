"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { PRODUCT_EVENTS, trackProductEvent } from "@/lib/product-analytics/events";
import { requireWorkspace } from "@/lib/auth/dal";
import {
  clearActiveProjectId,
  readActiveProjectId,
  writeActiveProjectId,
} from "@/lib/active-project";
import { fieldErrorsFrom, formError, type FormState } from "@/lib/forms";
import { projectFormData, projectSchema } from "@/lib/validation/project";

/**
 * Project mutations.
 *
 * Actions return a FormState rather than throwing, so a validation failure
 * re-renders the form with messages attached to the offending fields instead
 * of tripping the route's error boundary. Genuine faults (a dropped database
 * connection) still surface as a form-level error with the detail logged
 * server-side and kept out of the response.
 */

/**
 * Names are compared case-insensitively so "Acme" and "acme" collide.
 *
 * The comparison is the database's now. Under SQLite it ran in application code
 * — there was no `mode: "insensitive"` filter — which meant loading every
 * active project to compare a single name. That was defensible when the whole
 * install was one operator's handful of rows and indefensible once it is every
 * tenant's.
 *
 * Scoped to one workspace, and that is not only tidiness. A conflict check
 * across the whole install answers "does anybody, anywhere, have a project
 * called Acme?" — and it answers it to whoever typed the name. Uniqueness is a
 * property of a cabinet, not of the building.
 */
async function findNameConflict(name: string, workspaceId: string, excludeId?: string) {
  return db.project.findFirst({
    where: {
      workspaceId,
      archivedAt: null,
      name: { equals: name.trim(), mode: "insensitive" },
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    select: { id: true, name: true },
  });
}

/**
 * The project, if it belongs to the caller.
 *
 * Every action below starts here. The predicate carries the workspace, so a
 * projectId from another tenant returns null — the same answer as a project
 * that was deleted, and deliberately so: a distinguishable refusal would let
 * someone confirm which ids exist by trying them.
 *
 * This replaces a plain `findUnique({ where: { id } })`, which answered "does
 * this row exist" — a question no action was actually asking.
 */
async function ownedProject(projectId: string) {
  const { workspaceId, userId } = await requireWorkspace();

  return db.project.findFirst({ where: { id: projectId, workspaceId } });
}

export async function createProjectAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = projectSchema.safeParse(projectFormData(formData));

  if (!parsed.success) {
    return formError("Check the highlighted fields.", fieldErrorsFrom(parsed.error));
  }

  let createdId: string;

  // Every business belongs to a cabinet. Which one comes from Membership, not
  // from the form — see src/lib/auth/dal.ts. Resolved before the name check,
  // because the name check is scoped to it.
  const { workspaceId } = await requireWorkspace();

  try {
    if (await findNameConflict(parsed.data.name, workspaceId)) {
      return formError("Check the highlighted fields.", {
        name: ["A project with this name already exists."],
      });
    }

    const project = await db.project.create({
      data: { ...parsed.data, workspaceId },
    });
    createdId = project.id;

    // A newly created project becomes the one you are looking at.
    await writeActiveProjectId(createdId);
    await trackProductEvent({
      workspaceId,
      userId,
      projectId: createdId,
      eventName: PRODUCT_EVENTS.PROJECT_CREATED,
    });
    logger.info("Project created", { projectId: createdId });
  } catch (error) {
    logger.error("Failed to create project", {
      message: error instanceof Error ? error.message : String(error),
    });
    return formError("The project could not be saved. Check the database connection and try again.");
  }

  revalidatePath("/", "layout");
  redirect(`/projects/${createdId}/onboarding`);
}

export async function updateProjectAction(
  projectId: string,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = projectSchema.safeParse(projectFormData(formData));

  if (!parsed.success) {
    return formError("Check the highlighted fields.", fieldErrorsFrom(parsed.error));
  }

  try {
    const existing = await ownedProject(projectId);

    if (!existing) {
      return formError("This project no longer exists. It may have been deleted in another tab.");
    }

    if (await findNameConflict(parsed.data.name, existing.workspaceId, projectId)) {
      return formError("Check the highlighted fields.", {
        name: ["A project with this name already exists."],
      });
    }

    await db.project.update({
      where: { id: projectId },
      data: { ...parsed.data },
    });
    logger.info("Project updated", { projectId });
  } catch (error) {
    logger.error("Failed to update project", {
      projectId,
      message: error instanceof Error ? error.message : String(error),
    });
    return formError("The changes could not be saved. Check the database connection and try again.");
  }

  revalidatePath("/", "layout");
  redirect("/projects");
}

export async function archiveProjectAction(projectId: string): Promise<FormState> {
  try {
    // Was a bare update on the id, with nothing asking whose project it was.
    if (!(await ownedProject(projectId))) {
      return formError("This project no longer exists.");
    }

    await db.project.update({
      where: { id: projectId },
      data: { archivedAt: new Date() },
    });

    // An archived project must not stay selected.
    if ((await readActiveProjectId()) === projectId) {
      await clearActiveProjectId();
    }

    logger.info("Project archived", { projectId });
  } catch (error) {
    logger.error("Failed to archive project", {
      projectId,
      message: error instanceof Error ? error.message : String(error),
    });
    return formError("The project could not be archived.");
  }

  revalidatePath("/", "layout");
  return { status: "success", message: "Project archived." };
}

export async function restoreProjectAction(projectId: string): Promise<FormState> {
  try {
    const project = await ownedProject(projectId);

    if (!project) {
      return formError("This project no longer exists.");
    }

    if (await findNameConflict(project.name, project.workspaceId, projectId)) {
      return formError(
        `Another active project is already called "${project.name}". Rename it before restoring this one.`,
      );
    }

    await db.project.update({ where: { id: projectId }, data: { archivedAt: null } });
    logger.info("Project restored", { projectId });
  } catch (error) {
    logger.error("Failed to restore project", {
      projectId,
      message: error instanceof Error ? error.message : String(error),
    });
    return formError("The project could not be restored.");
  }

  revalidatePath("/", "layout");
  return { status: "success", message: "Project restored." };
}

/**
 * Permanent deletion. The caller is responsible for confirming intent; this
 * re-checks the typed name server-side so the guard cannot be skipped by
 * calling the action directly.
 */
export async function deleteProjectAction(
  projectId: string,
  confirmation: string,
): Promise<FormState> {
  try {
    const project = await ownedProject(projectId);

    if (!project) {
      return formError("This project no longer exists.");
    }

    if (confirmation.trim().toLowerCase() !== project.name.toLowerCase()) {
      return formError("The name you typed does not match. Nothing was deleted.");
    }

    await db.project.delete({ where: { id: projectId } });

    if ((await readActiveProjectId()) === projectId) {
      await clearActiveProjectId();
    }

    logger.info("Project deleted", { projectId });
  } catch (error) {
    logger.error("Failed to delete project", {
      projectId,
      message: error instanceof Error ? error.message : String(error),
    });
    return formError("The project could not be deleted.");
  }

  revalidatePath("/", "layout");
  return { status: "success", message: "Project deleted." };
}

/** Switch which project the interface is scoped to. */
export async function setActiveProjectAction(projectId: string): Promise<FormState> {
  try {
    const { workspaceId } = await requireWorkspace();

    const project = await db.project.findFirst({
      where: { id: projectId, workspaceId, archivedAt: null },
      select: { id: true },
    });

    if (!project) {
      return formError("That project is not available.");
    }

    await writeActiveProjectId(project.id);
  } catch (error) {
    logger.error("Failed to switch project", {
      projectId,
      message: error instanceof Error ? error.message : String(error),
    });
    return formError("The project could not be selected.");
  }

  revalidatePath("/", "layout");
  return { status: "success" };
}
