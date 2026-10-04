"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { requireWorkspace } from "@/lib/auth/dal";
import { clientEnv } from "@/lib/env";
import { createInvite, isFounderEmail } from "@/lib/beta/invites";
import { PRODUCT_EVENTS, trackProductEvent } from "@/lib/product-analytics/events";

/**
 * Founder controls.
 *
 * Every action here begins with `requireFounder()`, and that call is the only
 * thing separating these from an anonymous stranger with a browser. A Server
 * Action is a public HTTP endpoint: being rendered on a page nobody else can
 * open protects nothing at all.
 */

export interface AdminResult {
  ok: boolean;
  message?: string;
  /** The invite link, returned once and never stored. */
  inviteUrl?: string;
}

/**
 * The caller, if they are a founder.
 *
 * Checked against the address on the verified session, not against anything the
 * request carried. Returns null rather than throwing, because these actions
 * report failure into a page the founder is looking at.
 */
async function requireFounder() {
  const context = await requireWorkspace();

  return isFounderEmail(context.email) ? context : null;
}

const emailInput = z.email("Enter a valid email address.").trim().max(320);

export async function createInviteAction(email: string): Promise<AdminResult> {
  const founder = await requireFounder();
  if (!founder) return { ok: false, message: "Not found." };

  const parsed = emailInput.safeParse(email);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Enter a valid address." };
  }

  const invite = await createInvite({ email: parsed.data, invitedById: founder.userId });

  await db.auditEvent.create({
    data: {
      workspaceId: founder.workspaceId,
      actorId: founder.userId,
      action: "beta.invite.created",
      subjectType: "invite",
      subjectId: invite.id,
      // The address is here and the token is not. This table is read by
      // support; the token is a credential.
      detail: { email: invite.email, expiresAt: invite.expiresAt.toISOString() },
    },
  });

  revalidatePath("/admin");

  return {
    ok: true,
    // The one time it exists. Shown once, never stored, and re-issued rather
    // than recovered if it is lost.
    inviteUrl: `${clientEnv.NEXT_PUBLIC_APP_URL}/signup?invite=${invite.token}`,
    message: `Invite ready for ${invite.email}. Copy the link now — it is not shown again.`,
  };
}

export async function revokeInviteAction(inviteId: string): Promise<AdminResult> {
  const founder = await requireFounder();
  if (!founder) return { ok: false, message: "Not found." };

  const revoked = await db.invite.updateMany({
    where: { id: inviteId, status: "PENDING" },
    data: { status: "REVOKED", revokedAt: new Date() },
  });

  if (revoked.count === 0) {
    return { ok: false, message: "That invite has already been used or revoked." };
  }

  await db.auditEvent.create({
    data: {
      workspaceId: founder.workspaceId,
      actorId: founder.userId,
      action: "beta.invite.revoked",
      subjectType: "invite",
      subjectId: inviteId,
    },
  });

  logger.info("Invite revoked", { inviteId });
  revalidatePath("/admin");

  return { ok: true, message: "Invite revoked." };
}

/**
 * Lock an account out, or let it back in.
 *
 * Takes effect on the person's next request rather than their next sign-in,
 * because the Data Access Layer checks `disabledAt` on every one — see
 * `getCurrentUser`.
 *
 * Nothing is deleted. A disabled account keeps its workspace, its projects and
 * its history: this is "stop for now", and the product already has a separate,
 * louder answer for "this should never have existed".
 */
export async function setUserDisabledAction(
  userId: string,
  disabled: boolean,
): Promise<AdminResult> {
  const founder = await requireFounder();
  if (!founder) return { ok: false, message: "Not found." };

  const target = await db.user.findUnique({ where: { id: userId }, select: { email: true } });
  if (!target) return { ok: false, message: "That account does not exist." };

  // A founder locking themselves out would leave nobody able to unlock them,
  // because unlocking is a founder action.
  if (userId === founder.userId) {
    return { ok: false, message: "You cannot disable your own account." };
  }

  await db.user.update({
    where: { id: userId },
    data: { disabledAt: disabled ? new Date() : null },
  });

  await db.auditEvent.create({
    data: {
      workspaceId: founder.workspaceId,
      actorId: founder.userId,
      action: disabled ? "beta.user.disabled" : "beta.user.enabled",
      subjectType: "user",
      subjectId: userId,
    },
  });

  logger.info("Account access changed", { userId, disabled });
  revalidatePath("/admin");

  return { ok: true, message: disabled ? "Account disabled." : "Account re-enabled." };
}

const feedbackInput = z.object({
  onboardingFriction: z.string().trim().max(2000).optional(),
  mostUseful: z.string().trim().max(2000).optional(),
  leastUseful: z.string().trim().max(2000).optional(),
  statusEase: z.string().trim().max(2000).optional(),
  overall: z.string().trim().max(2000).optional(),
});

export type FeedbackInput = z.infer<typeof feedbackInput>;

/**
 * Send feedback.
 *
 * Not a founder action — every beta user may. Scoped to their own workspace,
 * which they do not supply: it comes from the session like every other write.
 */
export async function submitFeedbackAction(input: FeedbackInput): Promise<AdminResult> {
  const context = await requireWorkspace();
  const parsed = feedbackInput.safeParse(input);

  if (!parsed.success) return { ok: false, message: "That answer is too long." };

  const answered = Object.values(parsed.data).some((value) => value && value.length > 0);

  if (!answered) return { ok: false, message: "Answer at least one question." };

  await db.feedback.create({
    data: { workspaceId: context.workspaceId, userId: context.userId, ...parsed.data },
  });

  await trackProductEvent({
    workspaceId: context.workspaceId,
    userId: context.userId,
    eventName: PRODUCT_EVENTS.FEEDBACK_SUBMITTED,
  });

  logger.info("Feedback received", { workspaceId: context.workspaceId });

  return { ok: true, message: "Thank you — this is read." };
}
