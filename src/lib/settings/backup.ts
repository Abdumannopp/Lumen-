import "server-only";

import { z } from "zod";

import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { requireWorkspace } from "@/lib/auth/dal";

/**
 * Backup and restore.
 *
 * Two rules govern this file:
 *
 * 1. **A backup contains no secrets.** API keys live in the environment, never
 *    in the database, so they cannot reach an export by construction rather
 *    than by remembering to filter them. A test asserts the exported bytes
 *    contain no key-shaped string.
 *
 * 2. **A restore validates its version first.** An archive written by a future
 *    version may describe tables this build does not have, and importing it
 *    optimistically would half-restore and then fail, leaving the install in a
 *    state neither backup nor original. Version is checked before anything is
 *    touched.
 *
 * 3. **Both ends stop at the workspace.** Export reads one cabinet; restore
 *    empties one cabinet. Until this step both read and wrote the whole
 *    database — which was harmless while an install was one operator and was
 *    the recorded release blocker the moment a second account could exist: an
 *    export handed you every tenant's data, and a restore deleted it.
 */

/** Bumped whenever the archive shape changes incompatibly. */
export const BACKUP_VERSION = 1;
const MAX_BACKUP_BYTES = 10 * 1024 * 1024;

/**
 * Tables in dependency order.
 *
 * Restore inserts in this order and clears in reverse, so foreign keys are
 * always satisfied without disabling the constraint — a restore that needs
 * integrity checks switched off is a restore that can silently produce
 * orphaned rows.
 */
const TABLES = [
  "projects",
  "businessProfile",
  "strategies",
  "strategyVersions",
  "audienceSegments",
  "icps",
  "personas",
  "competitors",
  "marketInsights",
  "contentItems",
  "campaigns",
  "budgetPlans",
  "marketingMetrics",
  "recommendations",
  "experiments",
  "conversations",
  "messages",
  "agentRuns",
] as const;

export const backupSchema = z.object({
  lumenBackupVersion: z.number().int(),
  exportedAt: z.string(),
  /** Informational only — never used to decide compatibility. */
  appNote: z.string().optional(),
  settings: z.record(z.string(), z.unknown()).nullable(),
  data: z.record(z.string(), z.array(z.record(z.string(), z.unknown()))),
});

export type BackupArchive = z.infer<typeof backupSchema>;

export interface BackupSummary {
  version: number;
  exportedAt: string;
  counts: Record<string, number>;
  total: number;
}

/** Serialise the whole install. Dates become ISO strings via JSON. */
export async function exportBackup(): Promise<{ json: string; summary: BackupSummary }> {
  const { workspaceId } = await requireWorkspace();

  // Every table below projects reaches the workspace through its project, so
  // one predicate scopes all of them. Written once and reused rather than
  // repeated eighteen times, because eighteen copies is eighteen chances for
  // one of them to be missing.
  const owned = { project: { workspaceId } };

  const data: Record<string, Record<string, unknown>[]> = {};

  data.projects = await db.project.findMany({ where: { workspaceId } });
  data.businessProfile = await db.businessProfile.findMany({ where: owned });
  data.strategies = await db.strategy.findMany({ where: owned });
  data.strategyVersions = await db.strategyVersion.findMany({
    where: { strategy: owned },
  });
  data.audienceSegments = await db.audienceSegment.findMany({ where: owned });
  data.icps = await db.icp.findMany({ where: { segment: owned } });
  data.personas = await db.persona.findMany({ where: { segment: owned } });
  data.competitors = await db.competitor.findMany({ where: owned });
  data.marketInsights = await db.marketInsight.findMany({ where: owned });
  data.contentItems = await db.contentItem.findMany({ where: owned });
  data.campaigns = await db.campaign.findMany({ where: owned });
  data.budgetPlans = await db.budgetPlan.findMany({ where: owned });
  data.marketingMetrics = await db.marketingMetric.findMany({ where: owned });
  data.recommendations = await db.recommendation.findMany({ where: owned });
  data.experiments = await db.experiment.findMany({ where: owned });
  data.conversations = await db.conversation.findMany({ where: owned });
  data.messages = await db.message.findMany({ where: { conversation: owned } });
  data.agentRuns = await db.agentRun.findMany({ where: owned });

  const settings = await db.settings.findUnique({ where: { workspaceId } });

  const archive: BackupArchive = {
    lumenBackupVersion: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    appNote: "LUMEN workspace backup. Contains project data only — no API keys or credentials.",
    settings: settings ? (JSON.parse(JSON.stringify(settings)) as Record<string, unknown>) : null,
    data,
  };

  const counts = Object.fromEntries(
    TABLES.map((table) => [table, (data[table] ?? []).length]),
  ) as Record<string, number>;

  return {
    json: JSON.stringify(archive, null, 2),
    summary: {
      version: BACKUP_VERSION,
      exportedAt: archive.exportedAt,
      counts,
      total: Object.values(counts).reduce((sum, value) => sum + value, 0),
    },
  };
}

export interface InspectResult {
  ok: boolean;
  message?: string;
  summary?: BackupSummary;
}

/**
 * Read an archive without touching anything.
 *
 * Separate from restore so the operator can see what a file contains — and be
 * told if it is incompatible — before deciding to overwrite their install.
 */
export function inspectBackup(raw: string): InspectResult {
  if (Buffer.byteLength(raw, "utf8") > MAX_BACKUP_BYTES) {
    return { ok: false, message: `That backup is larger than ${MAX_BACKUP_BYTES / 1024 / 1024} MB.` };
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, message: "That file is not valid JSON." };
  }

  const result = backupSchema.safeParse(parsed);

  if (!result.success) {
    return { ok: false, message: "That file is not a LUMEN backup." };
  }

  const version = result.data.lumenBackupVersion;

  if (version > BACKUP_VERSION) {
    return {
      ok: false,
      message: `This backup was written by a newer version of LUMEN (format ${version}; this build reads ${BACKUP_VERSION}). Update LUMEN before restoring it.`,
    };
  }

  if (version < BACKUP_VERSION) {
    return {
      ok: false,
      message: `This backup uses an older format (${version}) that this build cannot read.`,
    };
  }

  const counts = Object.fromEntries(
    TABLES.map((table) => [table, (result.data.data[table] ?? []).length]),
  ) as Record<string, number>;

  /**
   * An archive with no projects in it can only destroy.
   *
   * Restore's first act is to delete every project, and everything else
   * cascades from one. A file that is structurally a valid backup but carries
   * no projects therefore wipes the install and puts nothing back — and, until
   * this guard, reported `ok` with `restored: 0` while it did so. The operator
   * saw a success message for an install that no longer existed.
   *
   * This is not hypothetical: a truncated download, a half-written file, or an
   * archive whose `data` key was mangled all produce exactly this shape and all
   * pass every check above.
   *
   * Refused here rather than in `restoreBackup` so the operator is told before
   * they are asked to type REPLACE, not after the deletion.
   */
  if (counts.projects === 0) {
    return {
      ok: false,
      message:
        "This backup contains no projects, so restoring it would erase everything and put nothing back. Nothing was changed. The file may have been truncated — check its size, or export a fresh backup.",
    };
  }

  return {
    ok: true,
    summary: {
      version,
      exportedAt: result.data.exportedAt,
      counts,
      total: Object.values(counts).reduce((sum, value) => sum + value, 0),
    },
  };
}

/** Revive ISO date strings on the columns Prisma expects as Date. */
const DATE_FIELDS = new Set([
  "createdAt",
  "updatedAt",
  "archivedAt",
  "completedAt",
  "startedAt",
  "startDate",
  "endDate",
  "scheduledAt",
  "date",
]);

function reviveDates(row: Record<string, unknown>): Record<string, unknown> {
  const revived: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(row)) {
    revived[key] =
      DATE_FIELDS.has(key) && typeof value === "string" && !Number.isNaN(Date.parse(value))
        ? new Date(value)
        : value;
  }

  return revived;
}

export interface RestoreResult {
  ok: boolean;
  message?: string;
  restored?: number;
}

/**
 * Does every foreign key in the archive resolve to a row the *archive itself*
 * declares, rather than to an id that merely happens to exist somewhere in
 * the database?
 *
 * This is the release blocker adversarial QA found: `restoreBackup` forced
 * `workspaceId` on the `projects` table it inserted, but trusted the
 * `projectId` (and, transitively, `strategyId` / `segmentId` /
 * `conversationId`) on the other seventeen tables exactly as the archive
 * wrote them. A crafted archive containing one `contentItems` row whose
 * `projectId` named a real project in a *different* workspace landed that row
 * there — proven by planting one and finding it under the victim's project
 * after restoring as the attacker. Ids are not re-keyed on restore (see the
 * note on `restoreBackup`), so an id in the archive can legitimately name a
 * row that exists in this database under someone else's workspace, and
 * nothing about the JSON shape tells them apart. A database lookup could not
 * fix this by itself: "does this id exist in `projects`" is true for a real
 * project belonging to a different tenant, and that "yes" is exactly the
 * answer that caused the blocker.
 *
 * So this checks something narrower and purely structural: within the
 * archive alone, does every child row's foreign key match an id the archive
 * also declares as one of its own parent rows? A project's id is trusted the
 * moment the archive lists it under `projects` — restore forces its
 * `workspaceId` regardless of what the file said, which is what makes that
 * declaration safe to trust. Everything scoped to a project, a strategy, an
 * audience segment or a conversation is checked the same way, one level at a
 * time, in the order those tables depend on each other.
 *
 * Run before the transaction opens, and the whole restore is refused if
 * anything fails — not a partial import with the bad rows quietly dropped.
 * Silently discarding data a person cannot see missing is worse than telling
 * them up front that the file cannot be trusted, and it keeps restore doing
 * one thing rather than two: either this archive is internally consistent and
 * it all goes in, or none of it does and the existing install is never
 * touched. That also matches the version and empty-projects checks in
 * `inspectBackup`, which is where this check belongs conceptually and would
 * live, if `inspectBackup` did not need to stay a pure, side-effect-free
 * preview usable before the operator has committed to anything.
 */
function untrustedReferenceCount(data: BackupArchive["data"]): number {
  const projectIds = new Set<string>();
  const strategyIds = new Set<string>();
  const segmentIds = new Set<string>();
  const conversationIds = new Set<string>();
  let untrusted = 0;

  for (const row of data.projects ?? []) {
    if (typeof row.id === "string") projectIds.add(row.id);
  }

  /** Count every row whose `key` does not name an id in `validIds`. */
  const scan = (
    rows: Record<string, unknown>[] | undefined,
    key: string,
    validIds: Set<string>,
    collectId?: Set<string>,
  ) => {
    for (const row of rows ?? []) {
      const value = row[key];

      if (typeof value !== "string" || !validIds.has(value)) {
        untrusted += 1;
        continue;
      }

      if (collectId && typeof row.id === "string") collectId.add(row.id);
    }
  };

  scan(data.businessProfile, "projectId", projectIds);
  scan(data.strategies, "projectId", projectIds, strategyIds);
  // A strategy's currentVersionId is applied later, in restoreBackup, once the
  // version rows it might point at exist — but it must still name a version
  // this same archive declares, not an id from anywhere else.
  const strategyVersionIds = new Set<string>();
  scan(data.strategyVersions, "strategyId", strategyIds, strategyVersionIds);
  for (const row of data.strategies ?? []) {
    if (
      typeof row.currentVersionId === "string" &&
      !strategyVersionIds.has(row.currentVersionId)
    ) {
      untrusted += 1;
    }
  }
  scan(data.audienceSegments, "projectId", projectIds, segmentIds);
  scan(data.icps, "segmentId", segmentIds);
  scan(data.personas, "segmentId", segmentIds);
  scan(data.competitors, "projectId", projectIds);
  scan(data.marketInsights, "projectId", projectIds);
  scan(data.contentItems, "projectId", projectIds);
  scan(data.campaigns, "projectId", projectIds);
  scan(data.budgetPlans, "projectId", projectIds);
  scan(data.marketingMetrics, "projectId", projectIds);
  scan(data.recommendations, "projectId", projectIds);
  scan(data.experiments, "projectId", projectIds);
  scan(data.conversations, "projectId", projectIds, conversationIds);
  scan(data.messages, "conversationId", conversationIds);
  scan(data.agentRuns, "projectId", projectIds);

  return untrusted;
}

/**
 * Replace the install's contents with an archive.
 *
 * Runs inside a transaction: a restore that fails halfway would leave neither
 * the old data nor the new, which is the one outcome worse than a failed
 * restore.
 *
 * Known limitation, stated rather than hidden: rows keep the ids they were
 * exported with. Two workspaces restoring the *same* archive would collide on
 * those ids, and the second restore fails. It fails safely — the transaction
 * rolls back and that workspace keeps what it had — but the message it gives is
 * a generic one. Re-keying on the way in is the fix, and it is not this step's.
 */
export async function restoreBackup(raw: string): Promise<RestoreResult> {
  await requireWorkspace();

  const inspection = inspectBackup(raw);

  if (!inspection.ok) return { ok: false, message: inspection.message };

  const archive = backupSchema.parse(JSON.parse(raw));

  // See `untrustedReferenceCount` for what this refuses and why: a foreign
  // key naming a row the archive does not declare as its own, which is what a
  // planted cross-tenant row looks like from the inside. Checked, and refused
  // whole, before the workspace is even resolved — nothing about this restore
  // has started yet.
  const untrusted = untrustedReferenceCount(archive.data);

  if (untrusted > 0) {
    return {
      ok: false,
      message: `This backup contains ${untrusted} row${untrusted === 1 ? "" : "s"} that reference data the file itself does not include, so it cannot be verified. Nothing was changed. Export a fresh backup and try again.`,
    };
  }

  // Resolved before the transaction opens: it runs on the pool's connection,
  // and asking for one from inside the transaction would be a second connection
  // waiting on rows the first one holds.
  const { workspaceId } = await requireWorkspace();

  try {
    let restored = 0;

    await db.$transaction(async (tx) => {
      // One cabinet, not the building. `deleteMany()` with no predicate was
      // the release blocker: a valid archive restored by one tenant emptied
      // every other tenant's projects on its way in.
      //
      // Clearing this workspace's projects cascades to everything
      // project-scoped; conversations, runs and the rest follow their own
      // cascades from there.
      await tx.project.deleteMany({ where: { workspaceId } });
      await tx.settings.deleteMany({ where: { workspaceId } });

      const insert = async (
        rows: Record<string, unknown>[] | undefined,
        create: (data: Record<string, unknown>) => Promise<unknown>,
      ) => {
        for (const row of rows ?? []) {
          await create(reviveDates(row));
          restored += 1;
        }
      };

      // An archive written before workspaces existed carries no workspaceId, and
      // one written by another install carries one this database does not have.
      // Either way the restored data belongs to the workspace doing the restore.
      // Every other table's projectId (or strategyId / segmentId /
      // conversationId) was already checked above to name one of this
      // archive's own rows, so once the parent is inserted here with this
      // workspace forced onto it, the reference is safe to insert as written.
      await insert(archive.data.projects, (data) =>
        tx.project.create({ data: { ...data, workspaceId } as never }),
      );
      await insert(archive.data.businessProfile, (data) =>
        tx.businessProfile.create({ data: data as never }),
      );
      await insert(archive.data.strategies, (data) =>
        // The current-version pointer is set after the versions exist.
        tx.strategy.create({ data: { ...data, currentVersionId: null } as never }),
      );
      await insert(archive.data.strategyVersions, (data) =>
        tx.strategyVersion.create({ data: data as never }),
      );

      for (const row of archive.data.strategies ?? []) {
        if (typeof row.currentVersionId === "string") {
          await tx.strategy.update({
            where: { id: row.id as string },
            data: { currentVersionId: row.currentVersionId },
          });
        }
      }

      await insert(archive.data.audienceSegments, (data) =>
        tx.audienceSegment.create({ data: data as never }),
      );
      await insert(archive.data.icps, (data) => tx.icp.create({ data: data as never }));
      await insert(archive.data.personas, (data) => tx.persona.create({ data: data as never }));
      await insert(archive.data.competitors, (data) =>
        tx.competitor.create({ data: data as never }),
      );
      await insert(archive.data.marketInsights, (data) =>
        tx.marketInsight.create({ data: data as never }),
      );
      await insert(archive.data.contentItems, (data) =>
        tx.contentItem.create({ data: data as never }),
      );
      await insert(archive.data.campaigns, (data) => tx.campaign.create({ data: data as never }));
      await insert(archive.data.budgetPlans, (data) =>
        tx.budgetPlan.create({ data: data as never }),
      );
      await insert(archive.data.marketingMetrics, (data) =>
        tx.marketingMetric.create({ data: data as never }),
      );
      await insert(archive.data.recommendations, (data) =>
        tx.recommendation.create({ data: data as never }),
      );
      await insert(archive.data.experiments, (data) =>
        tx.experiment.create({ data: data as never }),
      );
      await insert(archive.data.conversations, (data) =>
        tx.conversation.create({ data: data as never }),
      );
      await insert(archive.data.messages, (data) => tx.message.create({ data: data as never }));
      await insert(archive.data.agentRuns, (data) => tx.agentRun.create({ data: data as never }));

      if (archive.settings) {
        // The archive carries the id and workspace it was written with. Both
        // are replaced: restored settings belong to the workspace restoring
        // them, and a kept id would collide with another tenant's row.
        const rest = { ...archive.settings };
        delete rest.id;
        delete rest.workspaceId;

        await tx.settings.create({
          data: { ...reviveDates(rest), workspaceId } as never,
        });
      }
    });

    logger.info("Backup restored", { total: restored });

    return { ok: true, restored };
  } catch (error) {
    logger.error("Restore failed", {
      message: error instanceof Error ? error.message : String(error),
    });
    return {
      ok: false,
      message:
        "The restore failed and was rolled back — your existing data is unchanged. The backup file may be corrupt.",
    };
  }
}
