"use server";

import { revalidatePath } from "next/cache";

import { db } from "@/lib/db";
import { projectInWorkspace } from "@/lib/auth/dal";
import { logger } from "@/lib/logger";
import { runAgent } from "@/lib/ai/runtime";
import { metering } from "@/lib/usage/metering";
import { FEATURES } from "@/config/usage";
import { AIError } from "@/lib/ai/errors";
import { assistantAgent, renderAnswerText, type AssistantAnswer } from "@/lib/assistant/agent";

/**
 * Assistant conversation flow.
 *
 * The user's message is persisted before the model is called, so a provider
 * failure never loses what they typed — the thread keeps the question and shows
 * the error against it, and they can retry without retyping.
 */

export interface AskResult {
  ok: boolean;
  conversationId?: string;
  message?: string;
}

/** Only the recent turns are replayed: prompts are a budget, not an archive. */
const HISTORY_TURNS = 8;

function deriveTitle(question: string): string {
  const cleaned = question.trim().replace(/\s+/g, " ");
  return cleaned.length > 60 ? `${cleaned.slice(0, 57)}…` : cleaned;
}

export async function askAssistantAction(
  projectId: string,
  conversationId: string | null,
  question: string,
): Promise<AskResult> {
  const trimmed = question.trim();

  if (trimmed.length < 2) {
    return { ok: false, message: "Type a question first." };
  }

  if (trimmed.length > 2000) {
    return { ok: false, message: "That question is too long — try trimming it." };
  }

  const project = await projectInWorkspace(projectId);
  if (!project) return { ok: false, message: "This project no longer exists." };

  // Resolve the thread, scoped by project so an id from elsewhere cannot attach.
  let conversation = conversationId
    ? await db.conversation.findFirst({ where: { id: conversationId, projectId } })
    : null;

  if (!conversation) {
    conversation = await db.conversation.create({
      data: { projectId, title: deriveTitle(trimmed) },
    });
  }

  const priorMessages = await db.message.findMany({
    where: { conversationId: conversation.id },
    orderBy: { createdAt: "desc" },
    take: HISTORY_TURNS,
    select: { role: true, content: true },
  });

  const history = priorMessages
    .reverse()
    .map((message) => ({
      role: message.role === "USER" ? ("user" as const) : ("assistant" as const),
      content: message.content,
    }));

  await db.message.create({
    data: { conversationId: conversation.id, role: "USER", content: trimmed },
  });

  try {
    const output = await runAgent(assistantAgent, {
      projectId,
      payload: { question: trimmed, history },
    }, metering(project, FEATURES.assistant));

    const answer = output.result as AssistantAnswer;

    await db.message.create({
      data: {
        conversationId: conversation.id,
        role: "ASSISTANT",
        content: renderAnswerText(answer),
        structured: answer as never,
        agentRunId: output.runId,
      },
    });

    await db.conversation.update({
      where: { id: conversation.id },
      data: { updatedAt: new Date() },
    });

    logger.info("Assistant replied", { conversationId: conversation.id, runId: output.runId });
  } catch (error) {
    const retryable = error instanceof AIError ? error.retryable : false;

    logger.error("Assistant failed", {
      conversationId: conversation.id,
      message: error instanceof Error ? error.message : String(error),
    });

    revalidatePath("/assistant");

    return {
      ok: false,
      conversationId: conversation.id,
      // The user gets a plain explanation; the detail stays in the log and on
      // the AgentRun row.
      message: retryable
        ? "The AI provider did not respond. Your question was saved — try again."
        : "That request could not be completed. Your question was saved.",
    };
  }

  revalidatePath("/assistant");
  return { ok: true, conversationId: conversation.id };
}
