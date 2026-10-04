-- Lumen Phase 9: billing/global SaaS hardening.
-- The subscription timestamp makes Paddle's occurred_at ordering durable.
ALTER TABLE "subscriptions"
  ADD COLUMN IF NOT EXISTS "lastEventOccurredAt" TIMESTAMP(3);

-- Keep the provider event source timestamp so an operator can reconcile
-- arrival order versus Paddle's actual event order without storing the payload.
ALTER TABLE "webhook_events"
  ADD COLUMN IF NOT EXISTS "occurredAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "webhook_events_occurredAt_idx"
  ON "webhook_events"("occurredAt");
