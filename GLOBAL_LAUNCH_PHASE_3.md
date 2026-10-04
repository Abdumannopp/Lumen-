# Lumen — Global Launch Phase 3

## Goal
Turn Analytics from manual-only input into a trustworthy acquisition feedback loop using read-only Google data.

## Shipped

### Google OAuth
- Server-side OAuth 2.0 flow for web applications
- `state` bound to a Lumen project and encrypted in an HttpOnly cookie
- Offline access with refresh tokens
- Read-only scopes only:
  - `https://www.googleapis.com/auth/analytics.readonly`
  - `https://www.googleapis.com/auth/webmasters.readonly`
- Refresh tokens encrypted at rest with AES-256-GCM

### Google sources
- Google Analytics Admin API property discovery with pagination
- Google Analytics Data API daily reporting
- Google Search Console property discovery
- Google Search Console daily search analytics

### Lumen analytics
- External rows are marked `EXTERNAL`
- Google rows have deterministic `externalKey` values for safe upserts
- Disconnecting Google removes only Lumen's Google-imported rows
- Partial Google-source failure does not discard successful source data
- Existing manual rows are never overwritten

## Product behavior

1. User opens Analytics.
2. Clicks Connect Google.
3. Grants read-only access in Google.
4. Lumen discovers accessible GA4 and Search Console properties.
5. User selects the correct properties.
6. Lumen can sync the last 30 completed days.
7. Imported data feeds the existing analytics summaries and growth loop.

## Deployment configuration

Set these server variables together:

```env
GOOGLE_CLIENT_ID="...apps.googleusercontent.com"
GOOGLE_CLIENT_SECRET="..."
INTEGRATION_ENCRYPTION_KEY="64 hexadecimal characters"
```

Register this exact redirect URI in the Google OAuth client:

```text
https://YOUR-LUMEN-DOMAIN/api/integrations/google/callback
```

Enable the Google Analytics Data/Admin APIs and Search Console API in the same Google Cloud project used by the OAuth client.

## Important scope decision

Lumen requests read-only access only. The product does not modify Google Analytics or Search Console configuration or publish data to either service.

## Next phase

The next major step is to turn synced data into an automatic recommendation loop:

`real traffic → diagnosis → recommendation → weekly task → measured outcome → next recommendation`

A scheduled server-side sync should be added only after deployment has a reliable job runner and secret management in place.
