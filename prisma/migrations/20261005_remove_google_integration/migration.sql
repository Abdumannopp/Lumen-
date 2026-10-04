-- Remove the Google Analytics 4 / Search Console integration (out of the
-- approved MVP scope). Stored OAuth refresh tokens go with the table.
--
-- Deliberately kept: RecordSource 'EXTERNAL' (PostgreSQL cannot drop an enum
-- value without rewriting every column that uses it, and the value is
-- harmless), marketing_metrics.externalKey, and every existing product_events
-- row, including 'analytics.google_connected' and 'analytics.synced'.
DROP TABLE IF EXISTS "google_connections";
DROP TYPE IF EXISTS "GoogleConnectionStatus";
