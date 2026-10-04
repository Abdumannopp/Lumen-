import "server-only";

import { logger } from "@/lib/logger";
import type { RenderedEmail } from "@/lib/email/templates";

/**
 * Who actually delivers the mail.
 *
 * Behind an interface for the same reason identity and AI are: the application
 * should not know which vendor carries a message, and the test suites need to
 * drive the whole path without sending anything to anybody.
 *
 * The interface is one method wide. Attachments, scheduling, templates managed
 * in a vendor dashboard — all of that is a wider surface to re-implement the
 * day the vendor changes, in exchange for capabilities this product does not
 * use.
 */

export interface SendRequest {
  to: string;
  email: RenderedEmail;
  /** Passed to the provider so a retried request delivers once. */
  idempotencyKey: string;
}

export interface SendResult {
  ok: boolean;
  /** The provider's id, for matching against their dashboard. */
  providerMessageId?: string;
  /** Provider text, for the log. Never shown to a person. */
  error?: string;
  /** True when nothing was sent because email is not configured. */
  skipped?: boolean;
}

export interface EmailProvider {
  readonly id: string;
  send(request: SendRequest): Promise<SendResult>;
}

/**
 * Resend, over its HTTP API.
 *
 * A direct `fetch` rather than their SDK, deliberately: one POST with three
 * required fields is not worth a dependency, and a dependency in the path that
 * sends security notifications is a dependency that can change what those
 * notifications say.
 *
 * The API key is read from the environment at call time and never logged, never
 * returned, and never written to `EmailMessage`.
 */
export class ResendProvider implements EmailProvider {
  readonly id = "resend";

  constructor(
    private readonly apiKey: string,
    private readonly from: string,
  ) {}

  async send({ to, email, idempotencyKey }: SendRequest): Promise<SendResult> {
    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
          // Resend honours this for 24 hours, which covers every retry we
          // would make. The database constraint covers the rest.
          "Idempotency-Key": idempotencyKey.slice(0, 256),
        },
        signal: AbortSignal.timeout(15_000),
        body: JSON.stringify({
          from: this.from,
          to,
          subject: email.subject,
          text: email.text,
          html: email.html,
        }),
      });

      if (!response.ok) {
        // Read as text, not JSON: an error page from a proxy is not JSON, and
        // a parse failure here would hide the actual problem.
        const detail = (await response.text()).slice(0, 300);

        return { ok: false, error: `${response.status} ${detail}` };
      }

      const body = (await response.json()) as { id?: string };

      return { ok: true, providerMessageId: body.id };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  }
}

/**
 * The double: records that a message would have been sent, and sends nothing.
 *
 * Used in development and by the suites. It is what makes "the password-change
 * notification is sent, exactly once, and carries no token" a test rather than
 * a hope — the log row is real, the delivery is not.
 *
 * The subject is logged and the body is not, matching what `EmailMessage`
 * keeps. A double that logged more than production stores would be a double
 * that teaches the wrong lesson about where things leak.
 */
export class LogEmailProvider implements EmailProvider {
  readonly id = "log";

  async send({ to, email, idempotencyKey }: SendRequest): Promise<SendResult> {
    logger.info("Email would be sent", {
      // The local part is enough to recognise a test address in a dev log, and
      // not enough to be a mailing list.
      to: `${to.split("@")[0]}@…`,
      subject: email.subject,
      idempotencyKey,
    });

    return { ok: true, providerMessageId: `log_${idempotencyKey.slice(0, 24)}` };
  }
}
