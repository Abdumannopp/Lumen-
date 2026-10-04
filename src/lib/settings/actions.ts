"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/lib/db";
import { requireWorkspace, requireWorkspaceOwner } from "@/lib/auth/dal";
import { logger } from "@/lib/logger";
import { getProvider } from "@/lib/ai/providers";
import { claimRun, refundRun, QuotaExceededError } from "@/lib/usage/quota";
import { FAILED_RUNS_COUNT_AGAINST_QUOTA } from "@/config/usage";
import { exportBackup, inspectBackup, restoreBackup, type BackupSummary } from "@/lib/settings/backup";
import { CURRENCY_VALUES } from "@/config/business-profile";

/**
 * Settings writes.
 *
 * Nothing here reads or returns an API key. The connection test calls the
 * provider and reports only whether it answered.
 */

export interface SettingsResult {
  ok: boolean;
  message?: string;
  fieldErrors?: Record<string, string[]>;
}

const settingsSchema = z.object({
  defaultProjectId: z.string().trim().optional().transform((value) => value || null),
  currency: z.string().trim().refine((value) => CURRENCY_VALUES.includes(value), "Choose a supported currency."),
  timezone: z.string().trim().min(1).max(64).refine((value) => isSupportedTimeZone(value), "Choose a supported timezone."),
  locale: z.string().trim().min(2).max(16).refine((value) => isSupportedLocale(value), "Choose a supported locale."),
  theme: z.enum(["dark", "light"]),
});

export type SettingsInput = z.input<typeof settingsSchema>;
function isSupportedTimeZone(value: string): boolean {
  try {
    const supported = typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : [];
    return value === "UTC" || supported.includes(value) ||
      new Intl.DateTimeFormat("en", { timeZone: value }).resolvedOptions().timeZone === value;
  } catch {
    return false;
  }
}

function isSupportedLocale(value: string): boolean {
  try {
    const canonical = Intl.getCanonicalLocales(value)[0];
    return canonical === "en-US" || canonical === "en-GB";
  } catch {
    return false;
  }
}


export async function saveSettingsAction(input: SettingsInput): Promise<SettingsResult> {
  const parsed = settingsSchema.safeParse(input);

  if (!parsed.success) {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path.join(".") || "form";
      (fieldErrors[key] ??= []).push(issue.message);
    }
    return { ok: false, message: "Check the highlighted fields.", fieldErrors };
  }

  const { workspaceId } = await requireWorkspace();

  // A default pointing at a deleted project would silently fail on next start.
  // One pointing at another tenant's project would be worse. The scoped lookup
  // answers both questions at once.
  let defaultProjectId: string | null = null;
  if (parsed.data.defaultProjectId) {
    const project = await db.project.findFirst({
      where: { id: parsed.data.defaultProjectId, workspaceId },
      select: { id: true },
    });
    defaultProjectId = project?.id ?? null;
  }

  const data = { ...parsed.data, defaultProjectId };

  await db.settings.upsert({
    where: { workspaceId },
    create: { workspaceId, ...data },
    update: data,
  });

  revalidatePath("/", "layout");
  return { ok: true };
}

export interface ConnectionTestResult {
  ok: boolean;
  provider: string;
  model?: string;
  latencyMs?: number;
  message: string;
}

/**
 * Ask the configured provider for one trivial completion.
 *
 * Deliberately tiny — 16 tokens — because this runs against the real provider
 * when one is configured, and a diagnostic should not cost anything noticeable.
 *
 * Found by adversarial QA calling `provider.complete()` directly, with no
 * `requireWorkspace()` and no `runAgent` — reachable with zero cookies, and
 * spending against the operator's real key with nothing to meter or stop it.
 * `src/lib/ai/runtime.ts` is supposed to be the one path to any provider
 * precisely so a gap like that cannot exist; this was the second path.
 *
 * It still cannot go through `runAgent` itself: that function writes an
 * `AgentRun` row with a required, foreign-keyed `projectId`, and Settings is
 * deliberately usable with zero projects (see the page it lives on) — a
 * connectivity check for "did I set the key right" has to work before the
 * first project exists. So the fix takes the two guarantees `runAgent` gives
 * every other call — authorised, and claimed against the workspace's
 * allowance before the vendor is reached — without the parts that assume a
 * project: `requireWorkspace()` for the first, and the same `claimRun` /
 * `refundRun` pair `runAgent` itself calls for the second.
 */
export async function testAiConnectionAction(): Promise<ConnectionTestResult> {
  const { workspaceId } = await requireWorkspace();

  const provider = getProvider();
  const startedAt = Date.now();

  try {
    await claimRun(workspaceId);
  } catch (error) {
    if (error instanceof QuotaExceededError) {
      return { ok: false, provider: provider.id, message: error.message };
    }
    throw error;
  }

  try {
    const response = await provider.complete({
      system: "Reply with the single word: ok",
      messages: [{ role: "user", content: "ok" }],
      model: provider.defaultModel,
      maxTokens: 16,
      temperature: 0,
    });

    const latencyMs = Date.now() - startedAt;

    logger.info("AI connection test", { workspaceId, provider: provider.id, latencyMs });

    return {
      ok: true,
      provider: provider.id,
      model: response.model,
      latencyMs,
      message:
        provider.id === "mock"
          ? "The mock provider answered. Set AI_PROVIDER to gemini, groq, openrouter or anthropic with a key for real analysis."
          : "The provider answered.",
    };
  } catch (error) {
    logger.error("AI connection test failed", {
      workspaceId,
      provider: provider.id,
      message: error instanceof Error ? error.message : String(error),
    });

    // The call reached the vendor and failed there, which is the same shape as
    // a failed agent run — so it is refunded on the same policy, not always:
    // see FAILED_RUNS_COUNT_AGAINST_QUOTA in src/config/usage.ts.
    if (!FAILED_RUNS_COUNT_AGAINST_QUOTA) await refundRun(workspaceId);

    return {
      ok: false,
      provider: provider.id,
      // The provider's own message can carry request detail, so it is logged
      // rather than returned.
      message: "The provider did not answer. Check the key and model in your environment file.",
    };
  }
}

/** Wipe one project's data, keeping the rest of the install. */
export async function clearProjectDataAction(
  projectId: string,
  confirmation: string,
): Promise<SettingsResult> {
  const { workspaceId } = await requireWorkspace();

  const project = await db.project.findFirst({ where: { id: projectId, workspaceId } });

  if (!project) return { ok: false, message: "That project does not exist." };

  if (confirmation.trim().toLowerCase() !== project.name.toLowerCase()) {
    return { ok: false, message: "The name you typed does not match. Nothing was deleted." };
  }

  // Delete the project itself; every child table cascades from it.
  await db.project.delete({ where: { id: projectId } });

  logger.info("Project data cleared", { projectId });

  revalidatePath("/", "layout");
  return { ok: true };
}

export interface ExportResult {
  ok: boolean;
  json?: string;
  summary?: BackupSummary;
  filename?: string;
  message?: string;
}

export async function exportBackupAction(): Promise<ExportResult> {
  try {
    await requireWorkspaceOwner();
    const { json, summary } = await exportBackup();
    const stamp = new Date().toISOString().slice(0, 10);

    return { ok: true, json, summary, filename: `lumen-backup-${stamp}.json` };
  } catch (error) {
    logger.error("Backup export failed", {
      message: error instanceof Error ? error.message : String(error),
    });
    return { ok: false, message: "The backup could not be created." };
  }
}

export interface InspectActionResult {
  ok: boolean;
  summary?: BackupSummary;
  message?: string;
}

export async function inspectBackupAction(raw: string): Promise<InspectActionResult> {
  await requireWorkspace();
  const result = inspectBackup(raw);
  return { ok: result.ok, summary: result.summary, message: result.message };
}

export async function restoreBackupAction(
  raw: string,
  confirmation: string,
): Promise<SettingsResult & { restored?: number }> {
  await requireWorkspaceOwner();

  // Typed confirmation, re-checked server-side, because this replaces everything.
  if (confirmation.trim().toUpperCase() !== "REPLACE") {
    return { ok: false, message: 'Type REPLACE to confirm. Nothing was changed.' };
  }

  const result = await restoreBackup(raw);

  if (result.ok) revalidatePath("/", "layout");

  return result;
}
