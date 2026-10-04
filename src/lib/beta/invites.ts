import "server-only";

import { createHash, randomBytes } from "node:crypto";

import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { getServerEnv } from "@/lib/env";

/**
 * Who may create an account.
 *
 * During the beta, two kinds of person: a founder, and someone holding an
 * unused invite issued to their address.
 *
 * The gate is here rather than in the signup action so there is one answer to
 * "may this address sign up", and one place to read when that answer is
 * surprising.
 */

/**
 * Founders come from the environment, not from a column.
 *
 * A role column needs a first row, and creating that first row needs someone
 * who already has the role — so the bootstrap has to live outside the database.
 * An env list is honest about that instead of hiding it behind a seed script
 * that everybody forgets to run.
 *
 * The consequence, stated plainly: whoever controls the deployment's
 * environment controls who is a founder. That is already true of the database
 * URL, so it is not a new exposure.
 */
export function founderEmails(): string[] {
  return getServerEnv()
    .FOUNDER_EMAILS.split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
}

export function isFounderEmail(email: string): boolean {
  return founderEmails().includes(email.trim().toLowerCase());
}

/** How long an invite is good for. Long enough to reach an inbox and be read. */
const INVITE_DAYS = 14;

/** The token is compared by hash, so this is the only place it exists in code. */
export const hashToken = (token: string) =>
  createHash("sha256").update(token).digest("hex");

const normalise = (email: string) => email.trim().toLowerCase();

export interface IssuedInvite {
  id: string;
  email: string;
  /**
   * The one time this is ever available.
   *
   * Returned to the founder who created it and never stored. If it is lost, the
   * invite is revoked and a new one issued — which is the correct workflow for
   * a credential, and the reason it is not merely inconvenient.
   */
  token: string;
  expiresAt: Date;
}

/**
 * Issue an invite for one address.
 *
 * Any earlier pending invite for the same address is revoked first. Two live
 * invites for one person is two ways in, and the second one is always the one
 * nobody remembers issuing.
 */
export async function createInvite(options: {
  email: string;
  invitedById: string;
  workspaceId?: string | null;
}): Promise<IssuedInvite> {
  const email = normalise(options.email);
  const token = randomBytes(24).toString("base64url");
  const expiresAt = new Date(Date.now() + INVITE_DAYS * 24 * 60 * 60 * 1000);

  const invite = await db.$transaction(async (tx) => {
    await tx.invite.updateMany({
      where: { email, status: "PENDING" },
      data: { status: "REVOKED", revokedAt: new Date() },
    });

    return tx.invite.create({
      data: {
        email,
        tokenHash: hashToken(token),
        workspaceId: options.workspaceId ?? null,
        invitedById: options.invitedById,
        expiresAt,
      },
      select: { id: true },
    });
  });

  logger.info("Invite issued", { inviteId: invite.id, expiresAt });

  return { id: invite.id, email, token, expiresAt };
}

export type GateResult =
  | { allowed: true; reason: "founder" }
  | { allowed: true; reason: "open" }
  | { allowed: true; reason: "invite"; inviteId: string; workspaceId: string | null }
  | { allowed: false };

/**
 * May this address create an account with this token?
 *
 * Deliberately returns one shape for every refusal. An expired invite, a
 * revoked one, a token for a different address and no invite at all are the
 * same answer, because the differences between them are precisely what someone
 * probing the gate would like to learn.
 *
 * Nothing is consumed here. The invite is marked accepted when an account
 * actually exists — see `consumeInvite` — because a token spent on a signup
 * that then failed would leave a real person locked out holding a used link.
 */
export async function checkGate(email: string, token: string | null): Promise<GateResult> {
  const normalised = normalise(email);

  if (isFounderEmail(normalised)) return { allowed: true, reason: "founder" };

  // The public-launch flip. Checked after the founder check, not before it,
  // so a founder signing up is still recorded as "founder" rather than
  // "open" — the two are handled identically by `provisionAccount`, but the
  // distinction is what a log or an audit trail would want later.
  if (getServerEnv().BETA_SIGNUP === "open") return { allowed: true, reason: "open" };

  if (!token) return { allowed: false };

  const invite = await db.invite.findUnique({
    where: { tokenHash: hashToken(token) },
    select: { id: true, email: true, status: true, expiresAt: true, workspaceId: true },
  });

  if (!invite) return { allowed: false };
  if (invite.status !== "PENDING") return { allowed: false };
  if (invite.expiresAt <= new Date()) return { allowed: false };

  // The address is part of the credential. A forwarded link does not become a
  // second account.
  if (invite.email !== normalised) {
    logger.warn("Invite presented with a different address", { inviteId: invite.id });
    return { allowed: false };
  }

  return { allowed: true, reason: "invite", inviteId: invite.id, workspaceId: invite.workspaceId };
}

/**
 * Spend an invite, once.
 *
 * Conditional on the invite still being PENDING, so two requests racing to
 * accept the same invite cannot both succeed — `updateMany` reports how many
 * rows it changed, and the loser sees zero.
 */
export async function consumeInvite(
  inviteId: string,
  userId: string,
): Promise<boolean> {
  const claimed = await db.invite.updateMany({
    where: { id: inviteId, status: "PENDING" },
    data: { status: "ACCEPTED", acceptedAt: new Date(), acceptedByUserId: userId },
  });

  if (claimed.count === 0) {
    logger.warn("Invite was already spent", { inviteId });
    return false;
  }

  logger.info("Invite accepted", { inviteId, userId });
  return true;
}

/**
 * The pending invite for an address, if any.
 *
 * Used at provisioning time, where the token is no longer in hand — signup
 * verified it, and the account is being created on a later request. Narrow by
 * construction: it can only find an invite that signup already matched against
 * this exact address.
 */
export async function pendingInviteFor(email: string) {
  return db.invite.findFirst({
    where: { email: normalise(email), status: "PENDING", expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
    select: { id: true, workspaceId: true },
  });
}
