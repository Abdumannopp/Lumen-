"use server";

import { revalidatePath } from "next/cache";

import { db } from "@/lib/db";
import { projectInWorkspace } from "@/lib/auth/dal";
import { logger } from "@/lib/logger";
import { runAgent } from "@/lib/ai/runtime";
import { metering } from "@/lib/usage/metering";
import { FEATURES } from "@/config/usage";
import { AIError } from "@/lib/ai/errors";
import {
  manualSegmentSchema,
  pulseAgent,
  type GeneratedSegment,
} from "@/lib/audience/agent";

/**
 * Audience writes.
 *
 * The protection rule differs from ATLAS but serves the same principle: PULSE
 * regeneration replaces only the segments PULSE itself produced. Anything a
 * person created or edited is left alone, because editing a segment marks it
 * EDITED and that is treated as adoption. So "Regenerate" can never delete work
 * someone did by hand, and no confirmation dialog has to be trusted to prevent it.
 */

export interface AudienceResult {
  ok: boolean;
  message?: string;
  segmentId?: string;
}

function aiErrorMessage(error: unknown) {
  const retryable = error instanceof AIError ? error.retryable : false;

  return retryable
    ? "The AI provider did not respond. Nothing was changed — try again."
    : "That request could not be completed. Nothing was changed.";
}

async function writeSegment(
  projectId: string,
  segment: GeneratedSegment,
  priority: number,
  agentRunId: string,
) {
  await db.audienceSegment.create({
    data: {
      projectId,
      name: segment.name,
      description: segment.description,
      kind: segment.kind,
      priority,
      painPoints: segment.painPoints as never,
      motivations: segment.motivations as never,
      buyingTriggers: segment.buyingTriggers as never,
      objections: segment.objections as never,
      preferredChannels: segment.preferredChannels as never,
      messagingAngles: segment.messagingAngles as never,
      source: "AI",
      evidenceNote: segment.evidenceNote,
      agentRunId,
      icp: {
        create: {
          kind: segment.kind,
          attributes: segment.icp.attributes as never,
          qualifyingSignals: segment.icp.qualifyingSignals as never,
          disqualifiers: segment.icp.disqualifiers as never,
          source: "AI",
        },
      },
      personas: {
        create: segment.personas.map((persona) => ({
          name: persona.name,
          role: persona.role,
          snapshot: persona.snapshot,
          goals: persona.goals as never,
          painPoints: persona.painPoints as never,
          objections: persona.objections as never,
          channels: persona.channels as never,
          source: "AI" as const,
        })),
      },
    },
  });
}

export async function generateAudienceAction(
  projectId: string,
  guidance?: string,
): Promise<AudienceResult> {
  const project = await projectInWorkspace(projectId);
  if (!project) return { ok: false, message: "This project no longer exists." };

  try {
    const output = await runAgent(pulseAgent, { projectId, payload: { guidance } }, metering(project, FEATURES.audience));

    // Replace only what PULSE produced. MANUAL and EDITED segments survive, and
    // their cascade takes their ICP and personas with them either way.
    const removed = await db.audienceSegment.deleteMany({
      where: { projectId, source: "AI" },
    });

    const kept = await db.audienceSegment.count({ where: { projectId } });

    let priority = kept;
    for (const segment of output.result.segments) {
      await writeSegment(projectId, segment, priority, output.runId);
      priority += 1;
    }

    logger.info("Audience generated", {
      projectId,
      created: output.result.segments.length,
      replaced: removed.count,
      preserved: kept,
    });

    revalidatePath("/audience");
    return { ok: true };
  } catch (error) {
    logger.error("Audience generation failed", {
      projectId,
      message: error instanceof Error ? error.message : String(error),
    });
    return { ok: false, message: aiErrorMessage(error) };
  }
}

/**
 * Create or update a segment by hand.
 *
 * Takes a typed object rather than FormData: the editor lives inside a dialog,
 * so it is a controlled client form either way, and a plain object keeps the
 * action callable — and testable — without reconstructing a multipart body.
 */
export interface SaveSegmentInput {
  segmentId?: string;
  name: string;
  description: string;
  kind: string;
  painPoints: string[];
  motivations: string[];
  buyingTriggers: string[];
  objections: string[];
  preferredChannels: string[];
  messagingAngles: string[];
}

export interface SaveSegmentResult extends AudienceResult {
  fieldErrors?: Record<string, string[]>;
}

export async function saveSegmentAction(
  projectId: string,
  input: SaveSegmentInput,
): Promise<SaveSegmentResult> {
  // Ownership before anything else: `projectId` arrives from the browser.
  const owned = await projectInWorkspace(projectId);
  if (!owned) return { ok: false, message: "This project no longer exists." };

  const parsed = manualSegmentSchema.safeParse(input);

  if (!parsed.success) {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path.join(".") || "form";
      (fieldErrors[key] ??= []).push(issue.message);
    }
    return { ok: false, message: "Check the highlighted fields.", fieldErrors };
  }

  const data = {
    name: parsed.data.name,
    description: parsed.data.description,
    kind: parsed.data.kind,
    painPoints: parsed.data.painPoints as never,
    motivations: parsed.data.motivations as never,
    buyingTriggers: parsed.data.buyingTriggers as never,
    objections: parsed.data.objections as never,
    preferredChannels: parsed.data.preferredChannels as never,
    messagingAngles: parsed.data.messagingAngles as never,
  };

  try {
    if (input.segmentId) {
      // Editing marks the record EDITED, which is what protects it from being
      // replaced the next time PULSE runs.
      const updated = await db.audienceSegment.updateMany({
        where: { id: input.segmentId, projectId },
        data: { ...data, source: "EDITED" },
      });

      if (updated.count === 0) return { ok: false, message: "That segment no longer exists." };
    } else {
      await db.audienceSegment.create({
        data: {
          projectId,
          ...data,
          source: "MANUAL",
          evidenceNote: "Written by the operator.",
          priority: await db.audienceSegment.count({ where: { projectId } }),
          icp: {
            create: {
              kind: parsed.data.kind,
              attributes: [] as never,
              qualifyingSignals: [] as never,
              disqualifiers: [] as never,
              source: "MANUAL",
            },
          },
        },
      });
    }
  } catch (error) {
    logger.error("Segment write failed", {
      projectId,
      message: error instanceof Error ? error.message : String(error),
    });
    return { ok: false, message: "The segment could not be saved." };
  }

  revalidatePath("/audience");
  return { ok: true };
}

export async function deleteSegmentAction(
  projectId: string,
  segmentId: string,
): Promise<AudienceResult> {
  // Ownership before anything else: `projectId` arrives from the browser.
  const owned = await projectInWorkspace(projectId);
  if (!owned) return { ok: false, message: "This project no longer exists." };

  // Scoped by project in the same statement, so a foreign id deletes nothing.
  const removed = await db.audienceSegment.deleteMany({ where: { id: segmentId, projectId } });

  if (removed.count === 0) return { ok: false, message: "That segment does not exist." };

  revalidatePath("/audience");
  return { ok: true };
}
