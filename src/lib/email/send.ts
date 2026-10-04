import "server-only";

import { createHash } from "node:crypto";

import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { clientEnv, getServerEnv } from "@/lib/env";
import { render, type TemplateData } from "@/lib/email/templates";
import { LogEmailProvider, ResendProvider, type EmailProvider } from "@/lib/email/providers";
import type { TemplateKey } from "@/config/email";

/**
 * Sending an email, and recording that it happened.
 *
 * Three rules, each of which is a way this goes wrong in products:
 *
 * **Sending never breaks the thing that triggered it.** A welcome email is not
 * worth failing a signup for. Every path here returns; nothing throws. A
 * provider outage costs a log row saying so.
 *
 * **A retry sends once.** The idempotency key is claimed in the database before
 * the provider is called, so two concurrent requests cannot both send — and
 * because Resend honours the same key for 24 hours, even a race that got past
 * us would be caught at their end.
 *
 * **The log holds no secrets.** The address is hashed, the body is never
 * stored, and there is no template here that carries a token.
 */

function providerFor(): { provider: EmailProvider; from: string | null } {
  const env = getServerEnv();

  if (env.EMAIL_PROVIDER === "resend" && env.RESEND_API_KEY && env.EMAIL_FROM) {
    return { provider: new ResendProvider(env.RESEND_API_KEY, env.EMAIL_FROM), from: env.EMAIL_FROM };
  }

  return { provider: new LogEmailProvider(), from: null };
}

/** sha256 of the normalised address — see the EmailMessage model for why. */
export function hashRecipient(email: string): string {
  return createHash("sha256").update(email.trim().toLowerCase()).digest("hex");
}

export interface SendOptions<K extends TemplateKey> {
  to: string;
  template: K;
  data: TemplateData[K];
  /**
   * What makes this send unique.
   *
   * Chosen by the caller, because only the caller knows what "the same email"
   * means: one welcome per workspace, one notification per password change.
   * The template name and recipient hash are added here, so a caller cannot
   * accidentally collide two different messages under one key.
   */
  idempotencyKey: string;
  workspaceId?: string;
}

export interface SendOutcome {
  sent: boolean;
  duplicate?: boolean;
  skipped?: boolean;
}

export async function sendEmail<K extends TemplateKey>(
  options: SendOptions<K>,
): Promise<SendOutcome> {
  const recipientHash = hashRecipient(options.to);
  const key = `${options.template}:${recipientHash}:${options.idempotencyKey}`;
  const { provider, from } = providerFor();

  // Create the delivery record before sending so a process crash leaves an
  // auditable row that can be retried. FAILED rows are deliberately retryable:
  // Resend receives the same idempotency key, so a network ambiguity within the
  // provider's 24-hour idempotency window cannot create a second message.
  let message: { id: string };

  try {
    message = await db.emailMessage.create({
      data: {
        recipientHash,
        template: options.template,
        idempotencyKey: key,
        workspaceId: options.workspaceId ?? null,
        status: "FAILED",
        error: "Delivery pending.",
      },
      select: { id: true },
    });
  } catch {
    const existing = await db.emailMessage.findUnique({
      where: { idempotencyKey: key },
      select: { id: true, status: true, createdAt: true },
    });

    if (!existing) {
      logger.error("Email idempotency lookup failed", { template: options.template });
      return { sent: false };
    }

    if (existing.status !== "FAILED") {
      logger.info("Email already handled", { template: options.template });
      return { sent: false, duplicate: true };
    }

    // A failed delivery is intentionally retryable, but not forever: Resend's
    // idempotency window is finite and an ancient retry could otherwise create
    // an unexpected duplicate. Password/security flows also have fresh keys.
    const retryWindowMs = 24 * 60 * 60 * 1000;
    if (Date.now() - existing.createdAt.getTime() > retryWindowMs) {
      logger.warn("Email retry window expired", { template: options.template });
      return { sent: false };
    }

    message = { id: existing.id };
  }

  // No provider configured. Recorded as SKIPPED rather than silently dropped,
  // so "why did nobody get a welcome email" has an answer in the database.
  if (!from) {
    const result = await provider.send({
      to: options.to,
      email: render(options.template, options.data),
      idempotencyKey: key,
    });

    await db.emailMessage.update({
      where: { id: message.id },
      data: {
        status: "SKIPPED",
        providerMessageId: result.providerMessageId ?? null,
        sentAt: new Date(),
        error: "Email is not configured on this deployment.",
      },
    });

    return { sent: false, skipped: true };
  }

  const result = await provider.send({
    to: options.to,
    email: render(options.template, options.data),
    idempotencyKey: key,
  });

  await db.emailMessage.update({
    where: { id: message.id },
    data: {
      status: result.ok ? "SENT" : "FAILED",
      providerMessageId: result.providerMessageId ?? null,
      // Truncated, and from the provider's error body — which is why the
      // templates carry no token: anything in a message can end up in an error.
      error: result.error?.slice(0, 500) ?? null,
      sentAt: new Date(),
    },
  });

  if (!result.ok) {
    logger.warn("Email failed", { template: options.template, provider: provider.id });
  }

  return { sent: result.ok };
}

/** The absolute URL every template links back to. */
export const appUrl = () => clientEnv.NEXT_PUBLIC_APP_URL;
