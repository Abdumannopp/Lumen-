import "server-only";

import { db } from "@/lib/db";
import { requireProject } from "@/lib/auth/dal";

/**
 * Conversation reads, scoped to a project.
 *
 * Every function here begins with `requireProject`. The projectId reaching it
 * came from a page, and a page's parameters come from a URL — so "is this the
 * caller's project" is a question the query has to ask, not one it may assume
 * was asked upstream.
 */

export async function listConversations(projectId: string, take = 30) {
  await requireProject(projectId);

  return db.conversation.findMany({
    where: { projectId },
    orderBy: { updatedAt: "desc" },
    take,
    select: { id: true, title: true, updatedAt: true },
  });
}

export async function getConversation(id: string, projectId: string) {
  await requireProject(projectId);

  return db.conversation.findFirst({
    // projectId is part of the lookup, not checked afterwards, so a thread from
    // another project cannot be opened by guessing its id.
    where: { id, projectId },
    include: { messages: { orderBy: { createdAt: "asc" } } },
  });
}
