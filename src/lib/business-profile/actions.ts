"use server";

import { revalidatePath } from "next/cache";

import { db } from "@/lib/db";
import { projectInWorkspace } from "@/lib/auth/dal";
import { logger } from "@/lib/logger";
import { fieldErrorsFrom, formError, type FormState } from "@/lib/forms";
import {
  ONBOARDING_STEPS,
  REVIEW_STEP,
  draftSchema,
  profileFormData,
} from "@/lib/validation/business-profile";
import { computeCompletion, toBusinessProfileRecord } from "@/lib/business-profile/queries";
import { toProjectRecord } from "@/lib/projects/queries";
import { PRODUCT_EVENTS, trackProductEvent } from "@/lib/product-analytics/events";

/**
 * Business onboarding writes.
 *
 * Every save splits the payload in two: the fields Project owns go to the
 * project row, the interview answers go to the profile row. That split lives
 * here alone, so no caller has to know which table a field belongs to.
 */

type Draft = ReturnType<typeof draftSchema.parse>;

function splitDraft(draft: Draft) {
  const projectData = {
    ...(draft.name ? { name: draft.name } : {}),
    website: draft.website ?? null,
    ...(draft.industry ? { industry: draft.industry } : {}),
    ...(draft.country ? { country: draft.country } : {}),
    targetMarkets: draft.targetMarkets,
    description: draft.description ?? null,
    ...(draft.businessStage ? { businessStage: draft.businessStage } : {}),
    ...(draft.primaryGoal ? { primaryGoal: draft.primaryGoal } : {}),
  };

  const profileData = {
    productOrService: draft.productOrService ?? null,
    businessModel: draft.businessModel ?? null,
    targetCustomers: draft.targetCustomers ?? null,
    currentMarketingChannels: draft.currentMarketingChannels,
    monthlyBudgetAmount: draft.monthlyBudgetAmount ?? null,
    monthlyBudgetCurrency: draft.monthlyBudgetCurrency ?? null,
    currentChallenges: draft.currentChallenges,
    knownCompetitors: draft.knownCompetitors,
    linkedinUrl: draft.linkedinUrl ?? null,
    xUrl: draft.xUrl ?? null,
    instagramUrl: draft.instagramUrl ?? null,
    facebookUrl: draft.facebookUrl ?? null,
    youtubeUrl: draft.youtubeUrl ?? null,
    tiktokUrl: draft.tiktokUrl ?? null,
    brandVoice: draft.brandVoice,
    notes: draft.notes ?? null,
  };

  return { projectData, profileData };
}

/**
 * Duplicate names are rejected on the project form, so the same rule has to
 * hold here — otherwise onboarding would be a way around it.
 */
async function nameTaken(name: string, projectId: string, workspaceId: string) {
  const conflict = await db.project.findFirst({
    where: {
      workspaceId,
      archivedAt: null,
      id: { not: projectId },
      name: { equals: name.trim(), mode: "insensitive" },
    },
    select: { id: true },
  });

  return conflict !== null;
}

export interface SaveResult {
  ok: boolean;
  savedAt?: string;
  message?: string;
}

/**
 * State returned to the onboarding form.
 *
 * `step` lives on the server's response rather than in client state: the flow
 * is resumable and every transition is validated server-side, so having one
 * authority for "which step are we on" removes a whole class of divergence.
 */
export interface OnboardingState extends FormState {
  step: number;
  savedAt?: string;
  done?: boolean;
}

/**
 * Autosave. Never rejects on incomplete input — `draftSchema` drops anything
 * malformed rather than raising, because this fires while the person is still
 * typing and losing their work to a validation error would be worse than
 * storing a partial answer.
 */
async function saveDraft(
  projectId: string,
  step: number,
  formData: FormData,
): Promise<SaveResult> {
  const parsed = draftSchema.safeParse(profileFormData(formData));

  if (!parsed.success) {
    logger.warn("Draft rejected by lenient schema", { projectId });
    return { ok: false, message: "Could not save your progress." };
  }

  const { projectData, profileData } = splitDraft(parsed.data);

  try {
    const context = await projectInWorkspace(projectId);
    if (!context) return { ok: false, message: "This project no longer exists." };

    // Silently keep the existing name on a clash: autosave must not block, and
    // the strict check on the step transition will surface the real error.
    if (projectData.name && (await nameTaken(projectData.name, projectId, context.workspaceId))) {
      delete (projectData as { name?: string }).name;
    }

    const boundedStep = Math.max(0, Math.min(step, REVIEW_STEP));
    // Resolved before the transaction so the furthest-reached step is known
    // without awaiting inside the statement list.
    const reached = (await currentStep(projectId)) ?? 0;

    await db.$transaction([
      db.project.update({ where: { id: projectId }, data: projectData }),
      db.businessProfile.upsert({
        where: { projectId },
        create: { projectId, ...profileData, lastStep: boundedStep },
        // lastStep only moves forward, so navigating back and refreshing
        // mid-flow cannot rewind where the person had got to.
        update: { ...profileData, lastStep: Math.max(boundedStep, reached) },
      }),
    ]);

    return { ok: true, savedAt: new Date().toISOString() };
  } catch (error) {
    logger.error("Failed to save profile draft", {
      projectId,
      message: error instanceof Error ? error.message : String(error),
    });
    return { ok: false, message: "Could not save your progress." };
  }
}

async function currentStep(projectId: string): Promise<number | null> {
  const existing = await db.businessProfile.findUnique({
    where: { projectId },
    select: { lastStep: true },
  });
  return existing?.lastStep ?? null;
}

/**
 * Strict validation for a single step, run when moving forward. Returns field
 * errors instead of throwing so the flow can highlight the offending inputs.
 */
async function validateStep(
  projectId: string,
  step: number,
  formData: FormData,
): Promise<FormState> {
  const definition = ONBOARDING_STEPS[step];
  if (!definition) return formError("Unknown step.");

  const result = definition.schema.safeParse(profileFormData(formData));

  if (!result.success) {
    return formError("Check the highlighted fields.", fieldErrorsFrom(result.error));
  }

  if (step === 0) {
    const name = (result.data as { name?: string }).name;

    if (name) {
      const context = await projectInWorkspace(projectId);
      if (!context) return formError("This project no longer exists.");

      if (await nameTaken(name, projectId, context.workspaceId)) {
        return formError("Check the highlighted fields.", {
          name: ["A project with this name already exists."],
        });
      }
    }
  }

  return { status: "success" };
}

/**
 * Finish onboarding. Re-validates every step server-side rather than trusting
 * that the client walked them in order — the flow can be re-entered at any step
 * from a resumed session, so the final gate cannot assume the earlier ones ran.
 */
async function completeProfile(projectId: string, formData: FormData): Promise<FormState> {
  const values = profileFormData(formData);

  for (let step = 0; step < REVIEW_STEP; step += 1) {
    const result = ONBOARDING_STEPS[step].schema.safeParse(values);

    if (!result.success) {
      return formError(
        `Something is missing in "${ONBOARDING_STEPS[step].label}". Go back and complete it.`,
        fieldErrorsFrom(result.error),
      );
    }
  }

  const saved = await saveDraft(projectId, REVIEW_STEP, formData);
  if (!saved.ok) return formError(saved.message ?? "Could not save the profile.");

  try {
    const context = await projectInWorkspace(projectId);
    if (!context) return formError("This project no longer exists.");

    const projectRow = await db.project.findUnique({ where: { id: projectId } });
    const profileRow = await db.businessProfile.findUnique({ where: { projectId } });
    if (!projectRow) return formError("This project no longer exists.");

    const completion = computeCompletion(
      toProjectRecord(projectRow),
      profileRow ? toBusinessProfileRecord(profileRow) : null,
    );

    if (completion.missing.length > 0) {
      return formError(`Still missing: ${completion.missing.join(", ")}.`);
    }

    await db.businessProfile.update({
      where: { projectId },
      data: { completedAt: new Date() },
    });

    await trackProductEvent({
      workspaceId: context.workspaceId,
      userId: context.userId,
      projectId,
      eventName: PRODUCT_EVENTS.ONBOARDING_COMPLETED,
    });

    logger.info("Business profile completed", { projectId });
  } catch (error) {
    logger.error("Failed to complete profile", {
      projectId,
      message: error instanceof Error ? error.message : String(error),
    });
    return formError("The profile could not be completed.");
  }

  revalidatePath("/", "layout");
  return { status: "success", message: "Profile complete." };
}

/** Reopen a completed profile for editing. */
export async function reopenProfileAction(projectId: string): Promise<FormState> {
  try {
    // The profile is keyed by projectId, so without this the update reached any
    // project whose id the caller could name.
    if (!(await projectInWorkspace(projectId))) {
      return formError("This project no longer exists.");
    }

    await db.businessProfile.update({
      where: { projectId },
      data: { completedAt: null },
    });
    revalidatePath("/", "layout");
    return { status: "success" };
  } catch {
    return formError("Could not reopen the profile.");
  }
}


/**
 * The single entry point for the onboarding form.
 *
 * Everything the flow does — autosave, moving between steps, finishing — is one
 * form submission distinguished by an `intent` field. That keeps the whole flow
 * on the progressive-enhancement path: it works without client JavaScript, and
 * it can be driven end-to-end over plain HTTP, which is how it is tested.
 */
export async function onboardingStepAction(
  _previous: OnboardingState,
  formData: FormData,
): Promise<OnboardingState> {
  const projectId = String(formData.get("projectId") ?? "");
  const intent = String(formData.get("intent") ?? "save");
  const step = Number(formData.get("step") ?? 0) || 0;

  if (!projectId) return { status: "error", message: "Missing project.", step };

  if (intent === "back") {
    const previousStep = Math.max(step - 1, 0);
    await saveDraft(projectId, previousStep, formData);
    return { status: "idle", step: previousStep };
  }

  if (intent === "save") {
    const saved = await saveDraft(projectId, step, formData);
    return saved.ok
      ? { status: "idle", step, savedAt: saved.savedAt }
      : { status: "error", message: saved.message, step };
  }

  if (intent === "complete") {
    const result = await completeProfile(projectId, formData);
    if (result.status === "error") {
      return { ...result, step };
    }
    return { status: "success", step, done: true };
  }

  // intent === "next"
  const validation = await validateStep(projectId, step, formData);

  if (validation.status === "error") {
    return { ...validation, step };
  }

  const nextStep = Math.min(step + 1, REVIEW_STEP);
  const saved = await saveDraft(projectId, nextStep, formData);

  return { status: "idle", step: nextStep, savedAt: saved.savedAt };
}
