import "server-only";

import { cookies } from "next/headers";
import { z } from "zod";

import { db } from "@/lib/db";
import { trackProductEvent, PRODUCT_EVENTS } from "@/lib/product-analytics/events";

export const ACQUISITION_COOKIE = "lumen.acquisition.v1";
export const ACQUISITION_COOKIE_MAX_AGE = 60 * 60 * 24 * 90;

const attributionSchema = z
  .object({
    source: z.string().trim().max(180).optional(),
    medium: z.string().trim().max(180).optional(),
    campaign: z.string().trim().max(180).optional(),
    term: z.string().trim().max(180).optional(),
    content: z.string().trim().max(180).optional(),
    landingPath: z.string().startsWith("/").max(180).optional(),
    referrerHost: z.string().trim().max(180).optional(),
    capturedAt: z.string().datetime().optional(),
  })
  .strict();

export type AcquisitionAttribution = z.infer<typeof attributionSchema>;

async function readAttributionCookie(): Promise<AcquisitionAttribution | null> {
  const raw = (await cookies()).get(ACQUISITION_COOKIE)?.value;
  if (!raw) return null;

  try {
    const parsed = JSON.parse(decodeURIComponent(raw));
    const result = attributionSchema.safeParse(parsed);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

async function hasEvent(workspaceId: string, eventName: string) {
  return Boolean(
    await db.productEvent.findFirst({
      where: { workspaceId, eventName },
      select: { id: true },
    }),
  );
}

/**
 * Record signup conversion and, when the browser supplied it, the last
 * non-direct acquisition touch. The attribution is analytics-only and never
 * affects access, pricing, entitlements or product behavior.
 */
export async function recordSignupConversion(workspaceId: string, userId: string): Promise<void> {
  if (!(await hasEvent(workspaceId, PRODUCT_EVENTS.SIGNUP_COMPLETED))) {
    await trackProductEvent({
      workspaceId,
      userId,
      eventName: PRODUCT_EVENTS.SIGNUP_COMPLETED,
    });
  }

  const attribution = await readAttributionCookie();
  if (!attribution || (await hasEvent(workspaceId, PRODUCT_EVENTS.SIGNUP_ATTRIBUTED))) return;

  const source = attribution.source ?? (attribution.referrerHost ? "referral" : "direct");
  const medium = attribution.medium ?? (attribution.referrerHost ? "referral" : "none");

  await trackProductEvent({
    workspaceId,
    userId,
    eventName: PRODUCT_EVENTS.SIGNUP_ATTRIBUTED,
    metadata: {
      source,
      medium,
      ...(attribution.campaign ? { campaign: attribution.campaign } : {}),
      ...(attribution.term ? { term: attribution.term } : {}),
      ...(attribution.content ? { content: attribution.content } : {}),
      ...(attribution.landingPath ? { landingPath: attribution.landingPath } : {}),
      ...(attribution.referrerHost ? { referrerHost: attribution.referrerHost } : {}),
    },
  });

  const jar = await cookies();
  jar.set(ACQUISITION_COOKIE, "", { maxAge: 0, path: "/" });
}
