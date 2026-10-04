import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

import { WEBHOOK_TOLERANCE_SECONDS } from "@/config/billing";

/**
 * Proving a webhook came from Paddle.
 *
 * This file is the only thing standing between an anonymous HTTP request and a
 * paid subscription, so it is written to be read rather than to be short.
 *
 * Paddle signs each request with a `Paddle-Signature` header of the form
 * `ts=<unix seconds>;h1=<hex>`, where the hex is HMAC-SHA256 over the exact
 * string `${ts}:${rawBody}`, keyed with the endpoint's notification secret.
 *
 * Three rules follow, and each of them is a way people get this wrong:
 *
 * **The body must be the raw bytes.** Not a parsed object re-serialised, not a
 * pretty-printed copy — the signature covers the exact characters that arrived,
 * so `JSON.parse` followed by `JSON.stringify` produces a different string and
 * a signature that never matches. The route handler reads `request.text()`
 * before anything else touches it.
 *
 * **The comparison must be timing-safe.** A byte-by-byte `===` leaks how much
 * of a guessed signature was right, which is enough to construct one.
 *
 * **The timestamp must be checked.** The signature alone makes a captured
 * request replayable forever; the timestamp is inside the signed string, so an
 * attacker cannot move it without invalidating the signature.
 */

export type VerifyFailure =
  | "missing-secret"
  | "missing-header"
  | "malformed-header"
  | "stale"
  | "bad-signature";

export interface VerifyResult {
  ok: boolean;
  reason?: VerifyFailure;
}

/** Parse `ts=...;h1=...` without assuming order or extra parts. */
function parseSignatureHeader(header: string): { ts: string; h1: string } | null {
  const parts = header.split(";");
  let ts: string | undefined;
  let h1: string | undefined;

  for (const part of parts) {
    const index = part.indexOf("=");
    if (index <= 0) continue;

    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();

    if (key === "ts") ts = value;
    if (key === "h1") h1 = value;
  }

  if (!ts || !h1) return null;
  if (!/^\d+$/.test(ts)) return null;
  if (!/^[0-9a-f]+$/i.test(h1)) return null;

  return { ts, h1 };
}

/**
 * Verify a request, given the exact bytes that arrived.
 *
 * `nowSeconds` is a parameter rather than a call to `Date.now()` so the replay
 * window can be tested for what it is — a window — instead of by waiting.
 */
export function verifyPaddleSignature(
  rawBody: string,
  signatureHeader: string | null,
  secret: string | undefined,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): VerifyResult {
  // No secret configured means no way to tell a real event from an invented
  // one. Refusing is the only safe answer: accepting unverified events "until
  // billing is set up" is how a test endpoint grants a real subscription.
  if (!secret) return { ok: false, reason: "missing-secret" };
  if (!signatureHeader) return { ok: false, reason: "missing-header" };

  const parsed = parseSignatureHeader(signatureHeader);
  if (!parsed) return { ok: false, reason: "malformed-header" };

  const age = Math.abs(nowSeconds - Number(parsed.ts));
  if (age > WEBHOOK_TOLERANCE_SECONDS) return { ok: false, reason: "stale" };

  const expected = createHmac("sha256", secret).update(`${parsed.ts}:${rawBody}`).digest("hex");

  // Same length is checked first, because timingSafeEqual throws on a length
  // mismatch — and a thrown error would itself be a timing signal.
  if (expected.length !== parsed.h1.length) return { ok: false, reason: "bad-signature" };

  const matches = timingSafeEqual(
    Buffer.from(expected, "hex"),
    Buffer.from(parsed.h1.toLowerCase(), "hex"),
  );

  return matches ? { ok: true } : { ok: false, reason: "bad-signature" };
}

/**
 * The shape of an event, as far as we rely on it.
 *
 * Deliberately narrow. Paddle sends a great deal more, and validating all of it
 * would mean this schema breaking every time they add a field. What is required
 * here is exactly what the application reads — anything else is passed over.
 */
export const paddleEventSchema = z.object({
  event_id: z.string().min(1),
  event_type: z.string().min(1),
  occurred_at: z.string().optional(),
  data: z.object({
    id: z.string().optional(),
    status: z.string().optional(),
    customer_id: z.string().nullable().optional(),
    /** Where the workspace id travels. Set when checkout is started. */
    custom_data: z.record(z.string(), z.unknown()).nullable().optional(),
    current_billing_period: z
      .object({
        starts_at: z.string().nullable().optional(),
        ends_at: z.string().nullable().optional(),
      })
      .nullable()
      .optional(),
    canceled_at: z.string().nullable().optional(),
    items: z
      .array(z.object({ price: z.object({ id: z.string().optional() }).optional() }))
      .optional(),
    /** Present on transaction events, which carry the subscription id. */
    subscription_id: z.string().nullable().optional(),
  }),
});

export type PaddleEvent = z.infer<typeof paddleEventSchema>;

/**
 * Which workspace an event is about.
 *
 * `custom_data.workspaceId` is set by us when checkout starts, so it is the
 * primary route. It is still only a hint from outside — the caller looks the
 * workspace up rather than trusting that a workspace by that id is the right
 * one to charge.
 */
export function workspaceIdFromEvent(event: PaddleEvent): string | null {
  const raw = event.data.custom_data?.workspaceId;
  return typeof raw === "string" && raw.length > 0 ? raw : null;
}

/** The price the subscription is on, if the event says. */
export function priceIdFromEvent(event: PaddleEvent): string | null {
  return event.data.items?.[0]?.price?.id ?? null;
}
