"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { clientEnv } from "@/lib/env";
import { getAuthProvider } from "@/lib/auth/providers";
import { getCurrentUser, writeActiveWorkspaceId } from "@/lib/auth/dal";
import { GENERIC_CREDENTIAL_FAILURE, type ConfirmationType } from "@/lib/auth/types";
import { LOCAL_OPERATOR_ID } from "@/lib/workspace/current";
import { TEMPLATES } from "@/config/email";
import { appUrl, sendEmail } from "@/lib/email/send";
import { checkGate, consumeInvite, pendingInviteFor } from "@/lib/beta/invites";
import { rateLimitByIpAndIdentifier, formatRetryAfter } from "@/lib/security/rate-limit";
import { recordSignupConversion } from "@/lib/acquisition/attribution";
import { RATE_LIMITS } from "@/config/rate-limits";

/**
 * Account actions.
 *
 * The provider verifies credentials; this file decides what a verified identity
 * means inside Lumen — which is: a user row, a workspace, and an owning
 * membership, created together or not at all.
 *
 * Every message returned from here is one a stranger may read. None of them
 * distinguishes "no such account" from "wrong password", because either answer
 * turns a form into a way of finding out which addresses are registered.
 */

export interface AuthFormState {
  ok: boolean;
  message?: string;
  fieldErrors?: Record<string, string[]>;
  /** Signup succeeded and the confirmation email is on its way. */
  awaitingConfirmation?: boolean;
}

const credentials = z.object({
  email: z.email("Enter a valid email address.").trim().max(320),
  password: z
    .string()
    .min(12, "Use at least 12 characters. Length matters more than symbols.")
    .max(200, "That password is too long."),
});

function fieldErrors(error: z.ZodError): Record<string, string[]> {
  const collected: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "form";
    (collected[key] ??= []).push(issue.message);
  }
  return collected;
}

const read = (formData: FormData, name: string) => String(formData.get(name) ?? "");

/**
 * Give a verified identity somewhere to work.
 *
 * A user, a workspace and an OWNER membership, in one transaction: an account
 * with no workspace has nowhere to put anything, and a workspace whose owner
 * cannot reach it is worse. Idempotent, because a confirmation link that is
 * followed twice must not produce two workspaces.
 */
async function provisionAccount(userId: string, email: string): Promise<string> {
  /**
   * Spend the invite here rather than at signup.
   *
   * Signup verified the token; this is the first moment an account actually
   * exists. A token spent on a signup that then failed would leave a real
   * person locked out holding a used link — and the person most likely to hit
   * that is the one whose email confirmation went to spam.
   *
   * Looked up by address, which signup already matched the token against, so
   * nothing here trusts an id from outside.
   */
  const invite = await pendingInviteFor(email);

  const workspaceId = await db.$transaction(async (tx) => {
    await tx.user.upsert({
      where: { id: userId },
      update: { email },
      create: { id: userId, email },
    });

    const existing = await tx.membership.findFirst({
      where: { userId },
      orderBy: { createdAt: "asc" },
      select: { workspaceId: true },
    });

    if (existing) return existing.workspaceId;

    /**
     * Adopt an imported install rather than starting empty beside it.
     *
     * `npm run db:import` puts a migrated database in a workspace owned by the
     * `local-operator` placeholder, because the old schema had no users. The
     * first real person to sign up on that install is its founder, and their
     * data should be waiting for them.
     *
     * Narrowly conditioned, because this hands someone an existing workspace:
     * the owner must be the placeholder, and no real person may already be a
     * member. Both are true only on an install that has been imported and never
     * signed into — which is exactly the founder's first login and nothing else.
     */
    const orphaned = await tx.workspace.findFirst({
      where: {
        ownerId: LOCAL_OPERATOR_ID,
        memberships: { none: { userId: { not: LOCAL_OPERATOR_ID } } },
      },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });

    if (orphaned) {
      await tx.workspace.update({
        where: { id: orphaned.id },
        data: { ownerId: userId },
      });

      await tx.membership.deleteMany({ where: { workspaceId: orphaned.id } });
      await tx.membership.create({
        data: { userId, workspaceId: orphaned.id, role: "OWNER" },
      });

      await tx.user.deleteMany({ where: { id: LOCAL_OPERATOR_ID } });

      await tx.auditEvent.create({
        data: {
          workspaceId: orphaned.id,
          actorId: userId,
          action: "workspace.adopted",
          subjectType: "workspace",
          subjectId: orphaned.id,
        },
      });

      logger.info("Imported workspace adopted", { userId, workspaceId: orphaned.id });

      return orphaned.id;
    }

    const workspace = await tx.workspace.create({
      data: { name: "My workspace", ownerId: userId },
      select: { id: true },
    });

    await tx.membership.create({
      data: { userId, workspaceId: workspace.id, role: "OWNER" },
    });

    await tx.auditEvent.create({
      data: {
        workspaceId: workspace.id,
        actorId: userId,
        action: "workspace.created",
        subjectType: "workspace",
        subjectId: workspace.id,
      },
    });

    logger.info("Workspace provisioned", { userId, workspaceId: workspace.id });

    return workspace.id;
  });

  if (invite) await consumeInvite(invite.id, userId);

  return workspaceId;
}

/**
 * Welcome someone, once.
 *
 * Keyed on the workspace rather than the moment, so the first sign-in and the
 * confirmation link — which both provision — cannot produce two welcomes. The
 * second call finds the key taken and does nothing.
 *
 * Failure is swallowed on purpose: a welcome email is not worth failing a
 * sign-in for, and `sendEmail` records what happened either way.
 */
async function sendWelcome(email: string, workspaceId: string): Promise<void> {
  await sendEmail({
    to: email,
    template: TEMPLATES.welcome,
    data: { appUrl: appUrl() },
    idempotencyKey: `workspace:${workspaceId}`,
    workspaceId,
  });
}

export async function signUpAction(
  _previous: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = credentials.safeParse({
    email: read(formData, "email"),
    password: read(formData, "password"),
  });

  if (!parsed.success) {
    return { ok: false, message: "Check the highlighted fields.", fieldErrors: fieldErrors(parsed.error) };
  }

  if (read(formData, "terms") !== "on") {
    return { ok: false, message: "Accept the terms to create an account." };
  }

  const rateLimit = await rateLimitByIpAndIdentifier("signup", parsed.data.email, RATE_LIMITS.signUp);
  if (rateLimit.limited) {
    return {
      ok: false,
      message: `Too many attempts. Try again in ${formatRetryAfter(rateLimit.retryAfterSeconds)}.`,
    };
  }

  /**
   * Invite-only, and one refusal for every reason.
   *
   * No invite, an expired one, a revoked one, and a token issued to a different
   * address all produce this sentence. The differences between them are exactly
   * what someone probing the gate would like to learn, and none of them is
   * something the person in front of the form can act on differently.
   */
  const gate = await checkGate(parsed.data.email, read(formData, "invite") || null);

  if (!gate.allowed) {
    logger.warn("Signup refused: no valid invite");

    return {
      ok: false,
      message:
        "Lumen is invite-only at the moment. Use the link from your invitation, or ask for one.",
    };
  }

  const result = await getAuthProvider().signUp(parsed.data.email, parsed.data.password);

  if (!result.ok) return { ok: false, message: result.message ?? "That did not work. Try again." };

  // Reported identically whether the address was new or already registered.
  return {
    ok: true,
    awaitingConfirmation: true,
    message: "Check your email for a confirmation link.",
  };
}

export async function signInAction(
  _previous: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const email = read(formData, "email").trim();
  const password = read(formData, "password");

  if (!email || !password) {
    return { ok: false, message: GENERIC_CREDENTIAL_FAILURE };
  }

  /**
   * Checked before the provider is asked anything, same as every other
   * refusal ordering in this file: 200 wrong-password attempts landed on the
   * real provider in about six seconds before this existed.
   */
  const rateLimit = await rateLimitByIpAndIdentifier("signin", email, RATE_LIMITS.signIn);
  if (rateLimit.limited) {
    return {
      ok: false,
      message: `Too many attempts. Try again in ${formatRetryAfter(rateLimit.retryAfterSeconds)}.`,
    };
  }

  const result = await getAuthProvider().signIn(email, password);

  if (!result.ok || !result.user) {
    return {
      ok: false,
      message: result.message ?? GENERIC_CREDENTIAL_FAILURE,
      ...(result.needsConfirmation ? { awaitingConfirmation: true } : {}),
    };
  }

  const workspaceId = await provisionAccount(result.user.id, result.user.email);
  await writeActiveWorkspaceId(workspaceId);
  await sendWelcome(result.user.email, workspaceId);
  await recordSignupConversion(workspaceId, result.user.id);

  logger.info("Signed in", { userId: result.user.id });

  redirect("/overview");
}

/**
 * Signing out is not here: it lives in `src/app/logout/route.ts`.
 *
 * A Server Action rendered into the application chrome would take an ordinal in
 * every page's action numbering and shift the forms below it. A route handler
 * takes none, and can enforce POST-and-same-origin itself.
 */

export async function requestPasswordResetAction(
  _previous: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const email = read(formData, "email").trim();

  /**
   * Checked even though the response below never varies: without it, the
   * refusal only a rate limit would produce is unavailable, and this is the
   * one endpoint that emails a stranger's inbox on every submission —
   * unmetered, it is a way to bomb an address with mail, not to learn
   * anything about the account.
   */
  const rateLimit = await rateLimitByIpAndIdentifier("password-reset", email, RATE_LIMITS.passwordReset);

  if (email && !rateLimit.limited) {
    await getAuthProvider().requestPasswordReset(
      email,
      `${clientEnv.NEXT_PUBLIC_APP_URL}/auth/confirm?next=/update-password`,
    );
  }

  // The same answer for a registered address, an unregistered one, and a
  // rate-limited request — a distinguishable message here is a way to find
  // out which addresses exist by watching which ones ever get limited
  // differently, which defeats the point of answering identically above.
  return {
    ok: true,
    message: "If that address has an account, a reset link is on its way.",
  };
}

export async function updatePasswordAction(
  _previous: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const password = read(formData, "password");
  const parsed = credentials.shape.password.safeParse(password);

  if (!parsed.success) {
    return {
      ok: false,
      message: "Check the highlighted fields.",
      fieldErrors: { password: parsed.error.issues.map((issue) => issue.message) },
    };
  }

  const user = await getCurrentUser();
  if (!user) {
    return { ok: false, message: "That link has expired. Ask for a new one." };
  }

  const result = await getAuthProvider().updatePassword(parsed.data);

  if (!result.ok) return { ok: false, message: result.message ?? "That did not work." };

  /**
   * Every other session is ended.
   *
   * A password change is what someone does after "I think somebody is in my
   * account", and it means nothing if the intruder's session survives it. The
   * one exception is this session — ending it would sign the person out of the
   * page where they just fixed the problem.
   */
  await getAuthProvider().signOutOtherSessions();

  /**
   * And the address on the account is told.
   *
   * This is the one email that catches a takeover. Somebody who changed a
   * password they should not have has not necessarily changed the address yet,
   * so the real owner still gets a message saying what happened and how to undo
   * it. Sent after the change rather than before, so it describes something
   * that actually occurred.
   */
  await sendEmail({
    to: user.email,
    template: TEMPLATES.passwordChanged,
    data: { appUrl: appUrl(), when: new Date().toISOString().slice(0, 16).replace("T", " ") + " UTC" },
    // One notification per change, not one per account: a second change is a
    // second thing worth telling somebody about.
    idempotencyKey: `password:${user.id}:${Date.now()}`,
  });

  logger.info("Password updated", { userId: user.id });

  return { ok: true, message: "Your password has been changed." };
}

/**
 * Follow a link from a confirmation or recovery email.
 *
 * Called from the route handler rather than a form, because the browser arrives
 * here by navigation with the token in the query string.
 */
export async function confirmTokenAction(
  tokenHash: string,
  type: ConfirmationType,
): Promise<{ ok: boolean; message?: string }> {
  const result = await getAuthProvider().confirm(tokenHash, type);

  if (!result.ok || !result.user) {
    return { ok: false, message: result.message ?? "That link is no longer valid." };
  }

  const workspaceId = await provisionAccount(result.user.id, result.user.email);
  await writeActiveWorkspaceId(workspaceId);
  await sendWelcome(result.user.email, workspaceId);
  await recordSignupConversion(workspaceId, result.user.id);

  return { ok: true };
}
