import { NextResponse, type NextRequest } from "next/server";

import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { getServerEnv } from "@/lib/env";
import { applyPaddleEvent } from "@/lib/billing/subscription";
import { paddleEventSchema, verifyPaddleSignature } from "@/lib/billing/webhook";

/**
 * Paddle's webhook endpoint.
 *
 * The only thing in Lumen that grants a paid subscription, and the only public
 * route that is not behind a session. Four things happen, in this order, and
 * the order is the design:
 *
 *   1. read the raw body, before anything can reformat it
 *   2. verify the signature and the timestamp
 *   3. claim the event id without marking completion
 *   4. apply it
 *
 * A claimed row has `processedAt = null`; if the process dies before the final
 * write, a later signed delivery can reclaim it after the safety lease expires.
 *
 * Nothing is parsed as JSON until step 2 has passed, so a forged request never
 * reaches the schema, let alone the database.
 *
 * ## Why it answers 200 to things it refused to act on
 *
 * A webhook receiver's status code is a message to the provider about whether
 * to retry. An event we understood and deliberately ignored, or one we could
 * not apply because it named a workspace that does not exist, will not become
 * applicable by being sent again — so those are recorded and acknowledged. Only
 * a genuine fault on our side returns 5xx, because that is the one case where
 * retrying is the right thing for Paddle to do.
 *
 * A failed *signature* is different again: it is answered 403 and nothing is
 * recorded, because an unverified request is not evidence that anything
 * happened.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_WEBHOOK_BODY_BYTES = 1 * 1024 * 1024;
const PROCESSING_STALE_AFTER_MS = 15 * 60 * 1000;

/** The body as UTF-8 text, or null once it exceeds `limit` bytes. */
async function readBodyWithLimit(request: NextRequest, limit: number): Promise<string | null> {
  if (!request.body) return "";

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;

    received += value.byteLength;
    if (received > limit) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }

  return Buffer.concat(chunks).toString("utf8");
}

export async function POST(request: NextRequest) {
  const env = getServerEnv();

  // Paddle payloads are small. Rejecting oversized bodies before JSON parsing
  // limits memory/CPU exposure on this anonymous endpoint while keeping the
  // signed-body verification exact.
  const contentLength = request.headers.get("content-length");
  if (contentLength && Number(contentLength) > MAX_WEBHOOK_BODY_BYTES) {
    return new NextResponse("Payload too large", { status: 413 });
  }

  // Read first, and once. The signature covers these exact bytes. Streamed
  // with a cap, because Content-Length is optional (chunked uploads omit it)
  // and request.text() would buffer an arbitrarily large body before any
  // size check could run.
  const rawBody = await readBodyWithLimit(request, MAX_WEBHOOK_BODY_BYTES);
  if (rawBody === null) {
    return new NextResponse("Payload too large", { status: 413 });
  }

  const verification = verifyPaddleSignature(
    rawBody,
    request.headers.get("paddle-signature"),
    env.PADDLE_NOTIFICATION_SECRET,
  );

  if (!verification.ok) {
    // The reason is logged and not returned. Telling an attacker whether their
    // signature was stale or merely wrong is telling them which half to fix.
    logger.warn("Paddle webhook rejected", { reason: verification.reason });
    return new NextResponse("Forbidden", { status: 403 });
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(rawBody);
  } catch {
    logger.warn("Paddle webhook was verified but not JSON");
    return new NextResponse("Bad request", { status: 400 });
  }

  const event = paddleEventSchema.safeParse(parsed);

  if (!event.success) {
    logger.warn("Paddle webhook did not match the expected shape", {
      issue: event.error.issues[0]?.path.join("."),
    });
    return new NextResponse("Bad request", { status: 400 });
  }

  /**
   * Claim the event id before applying anything.
   *
   * The unique index is the idempotency guarantee: a retry — and Paddle retries
   * for days — loses this insert and never reaches the code that grants
   * entitlement. Claiming first rather than last matters, because two retries
   * arriving at once would otherwise both find "not yet processed" and both
   * apply.
   */
  let shouldProcess = false;

  try {
    await db.webhookEvent.create({
      data: {
        provider: "paddle",
        providerEventId: event.data.event_id,
        type: event.data.event_type,
        status: "PROCESSED",
        result: "Processing.",
        occurredAt: event.data.occurred_at && !Number.isNaN(Date.parse(event.data.occurred_at)) ? new Date(event.data.occurred_at) : null,
        processedAt: null,
      },
    });
    shouldProcess = true;
  } catch {
    const existing = await db.webhookEvent.findUnique({
      where: { providerEventId: event.data.event_id },
      select: { status: true, processedAt: true, receivedAt: true, result: true },
    });

    if (!existing) {
      logger.error("Paddle webhook claim raced with a missing event", {
        eventId: event.data.event_id,
      });
      return new NextResponse("Internal error", { status: 500 });
    }

    if (existing.status === "FAILED") {
      // Recover a previously failed delivery. The atomic transition means only
      // one concurrent retry is allowed to take ownership of the event.
      const claimed = await db.webhookEvent.updateMany({
        where: {
          providerEventId: event.data.event_id,
          status: "FAILED",
        },
        data: {
          status: "PROCESSED",
          result: "Retrying.",
          processedAt: null,
        },
      });
      shouldProcess = claimed.count === 1;

      if (!shouldProcess) {
        return NextResponse.json({ ok: true, duplicate: true });
      }
    } else if (existing.status === "PROCESSED" && existing.processedAt === null) {
      const stale = Date.now() - existing.receivedAt.getTime() >= PROCESSING_STALE_AFTER_MS;

      if (!stale) {
        // A fresh in-progress claim is being handled by another request. Return
        // 5xx rather than 200 so Paddle keeps a retry in its delivery queue if
        // the first handler later crashes.
        return new NextResponse("Event is already being processed", { status: 500 });
      }

      // Recover the crash window between claiming an event and finishing its
      // application. The old result is part of the compare-and-swap, so only
      // one concurrent retry can move the stale claim into its retry state.
      const claimed = await db.webhookEvent.updateMany({
        where: {
          providerEventId: event.data.event_id,
          status: "PROCESSED",
          processedAt: null,
          result: existing.result,
        },
        data: { result: "Retrying." },
      });
      shouldProcess = claimed.count === 1;

      if (!shouldProcess) {
        return NextResponse.json({ ok: true, duplicate: true });
      }
    } else {
      logger.info("Paddle webhook already handled", { eventId: event.data.event_id });
      return NextResponse.json({ ok: true, duplicate: true });
    }
  }

  if (!shouldProcess) {
    return NextResponse.json({ ok: true, duplicate: true });
  }

  try {
    const outcome = await applyPaddleEvent(event.data);

    await db.webhookEvent.update({
      where: { providerEventId: event.data.event_id },
      data: {
        status: outcome.status,
        result: outcome.result,
        workspaceId: outcome.workspaceId,
        processedAt: new Date(),
      },
    });

    if (outcome.status === "FAILED") {
      // The event was verified but our application could not process it.
      // Returning 5xx tells Paddle to retry rather than silently acknowledging
      // a state we failed to apply.
      return new NextResponse("Internal error", { status: 500 });
    }

    return NextResponse.json({ ok: true, status: outcome.status });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    logger.error("Paddle webhook failed to apply", {
      eventId: event.data.event_id,
      type: event.data.event_type,
      message,
    });

    await db.webhookEvent.update({
      where: { providerEventId: event.data.event_id },
      data: { status: "FAILED", result: message.slice(0, 500), processedAt: new Date() },
    });

    // Our fault, so Paddle should try again. FAILED stays explicitly retryable;
    // a retry atomically moves it back into the in-progress state above.
    return new NextResponse("Internal error", { status: 500 });
  }
}
