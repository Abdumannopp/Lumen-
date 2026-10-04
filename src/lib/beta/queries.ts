import "server-only";

import { db } from "@/lib/db";
import { requireWorkspace } from "@/lib/auth/dal";
import { isFounderEmail } from "@/lib/beta/invites";

/**
 * Beta reads.
 *
 * The founder view is the one place in Lumen that deliberately looks across
 * workspaces — it exists to run the beta, and running a beta means knowing who
 * is in it. It shows who accepted an invite and when. It does not show their
 * projects, their plans or their data, and there is no code path here that
 * could: everything else in the product is workspace-scoped, and this file adds
 * no way around that.
 */

export async function isFounder(): Promise<boolean> {
  const { email } = await requireWorkspace();
  return isFounderEmail(email);
}

/** Throws unless the caller is a founder. Used by the admin page. */
export async function requireFounderView() {
  const context = await requireWorkspace();

  if (!isFounderEmail(context.email)) return null;

  const [invites, users, feedback] = await Promise.all([
    db.invite.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        id: true,
        email: true,
        status: true,
        expiresAt: true,
        acceptedAt: true,
        createdAt: true,
      },
    }),
    db.user.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        id: true,
        email: true,
        disabledAt: true,
        createdAt: true,
        _count: { select: { memberships: true } },
      },
    }),
    db.feedback.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        createdAt: true,
        onboardingFriction: true,
        mostUseful: true,
        leastUseful: true,
        statusEase: true,
        overall: true,
      },
    }),
  ]);

  return { context, invites, users, feedback };
}
