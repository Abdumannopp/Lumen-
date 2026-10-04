# Lumen — Global Launch Phase 8
## Security + Reliability Audit

### Objective
Harden Lumen for an internet-facing SaaS launch by closing high-risk authorization, abuse-protection, webhook-recovery, configuration, and external-network failure modes.

## Audit verdict

**Security posture: materially stronger.** The critical paths reviewed in this phase now fail closed on production misconfiguration, keep tenant boundaries at the data-access layer, and avoid treating a provider retry as a completed operation after a process crash.

**Release status: not yet a final production go-live.** The remaining blockers are operational verification items that cannot be honestly proven inside this container: a full dependency-backed Next build/typecheck, live `npm audit` results, deployed proxy-header configuration, real Paddle/Google/Resend transactions, and production observability/alerting.

## Findings and fixes

| Severity | Finding | Action |
| --- | --- | --- |
| High | Paddle could mark an event as processed before its business effect completed. A process crash in that window could leave a paid workspace without the entitlement update and cause a later retry to look like a duplicate. | **Fixed.** Webhook rows stay `processedAt = null` while work is in progress. Fresh concurrent duplicates return 5xx so Paddle keeps retrying. Stale in-progress claims are reclaimed after a 15-minute lease using an atomic compare-and-swap. |
| High | Local auth and development-only token/simulation endpoints could be enabled on a non-local environment. | **Fixed.** `AUTH_PROVIDER=local` is now refused outside `APP_ENV=local`. Dev confirm-link, plan-scenario, and AI self-test endpoints are local-only. |
| High | Auth rate limiting depended on client-controlled forwarding headers when deployed without a trusted proxy boundary. | **Fixed.** Non-local deployments must explicitly set `TRUST_PROXY_HEADERS=true`; deployment docs require the reverse proxy to strip incoming forwarding headers and write the real client address. Sign-in, sign-up, and reset now use both IP and stable-identity limits. Stored rate-limit keys are hashed. |
| High | Backup inspection/restore accepted arbitrary request payloads before authentication, and restore was too privileged for ordinary workspace members. | **Fixed.** Backup input is capped at 10 MB; inspect requires a signed-in workspace; restore/export are owner-only; restore itself also re-checks workspace authorization. |
| High | Production could accidentally boot with mock AI, log-only email, or mismatched Paddle environment. | **Fixed.** Production boot now rejects mock AI and log email; configured Paddle checkout requires its notification secret and production environment. Browser/server Paddle environment mismatch is rejected. |
| Medium | Google and Resend network calls had no explicit application-level timeout. | **Fixed.** 15-second abort deadlines were added to Google API/token calls and Resend email delivery. |
| Medium | OAuth confirmation redirect could be cached or carry the token URL as a same-origin referrer. | **Fixed.** Confirmation redirects now send `Cache-Control: no-store` and `Referrer-Policy: no-referrer`. |
| Medium | Integration encryption key format was not validated early. | **Fixed.** `INTEGRATION_ENCRYPTION_KEY` must be exactly 64 hexadecimal characters. |
| Low | Public health response was cacheable and indexable. | **Fixed.** Added `no-store` and `X-Robots-Tag`. Operational detail remains intentionally available for readiness probes. |
| Low | Global response headers lacked a few modern browser isolation headers. | **Fixed.** Added `Cross-Origin-Opener-Policy`, `Cross-Origin-Resource-Policy`, and `X-Permitted-Cross-Domain-Policies`. |

## Tenant and authorization checks reviewed

- Project access is resolved through `requireWorkspace()` → workspace membership → `project.workspaceId`.
- Admin/beta access is founder-gated on the server, not only hidden in navigation.
- Backup restore is now explicitly owner-only because it replaces the workspace's project-scoped data.
- OAuth callback revalidates the project after state verification.
- Checkout has no caller-supplied workspace id; it derives the current workspace server-side.
- Project deletes/archives are scoped by workspace ownership before mutation.
- Raw SQL injection sinks were scanned: no `queryRawUnsafe` / `executeRawUnsafe` found.
- Dangerous browser sinks were scanned: no `dangerouslySetInnerHTML`, `innerHTML =`, `eval()`, or `new Function()` found.

## Abuse and reliability checks

### Authentication

Rate limits now apply per IP and per normalized identifier. An attacker who rotates networks cannot continuously guess one account, and password-reset requests cannot repeatedly target one inbox from changing addresses.

### Webhooks

The important state distinction is now:

`claimed → processing → processed`

without adding a new enum: `processedAt = null` represents an active claim, and the existing `result` field acts as the compare-and-swap token. A crashed request can be recovered when the claim becomes stale.

### External APIs

Google and Resend calls have bounded time. AI providers already had bounded attempts/timeout handling before this phase.

### Backups

A restore cannot be triggered by an ordinary member, cannot accept a payload above 10 MB, and still keeps the existing archive-integrity checks and all-or-nothing transaction behavior.

## Verification performed in this container

- TypeScript parser diagnostics: **17 modified TypeScript/config files passed**.
- `bash -n scripts/e2e-billing.sh`: **passed**.
- ZIP integrity (`unzip -t`): **passed**.
- Static sink scan: no dangerous raw-SQL APIs or obvious script-injection sinks found.
- Secret-file scan: no `.env`, `.env.local`, or `.env.production` present in the release tree.
- Package-install-backed build/typecheck was **not** fully runnable because `node_modules` is absent and `npm ci --offline` failed on an uncached package (`zod-validation-error`).

## Remaining production gates

1. Run `npm ci`/`npm run typecheck`/`npm run lint`/`npm run build` in CI with registry access.
2. Run live dependency vulnerability scanning (`npm audit` or the organization's SCA tool) against the locked dependency tree.
3. Verify the production reverse proxy strips `X-Forwarded-For` / `X-Real-IP` supplied by clients before setting trusted values.
4. Execute a real sandbox Paddle checkout and webhook replay/concurrency test.
5. Execute one real Google OAuth + GA4/Search Console sync from the deployed hostname.
6. Execute one real Resend delivery and verify timeout/retry behavior.
7. Add centralized error tracking, structured log retention, alerting, and a tested incident runbook before a large public launch.
8. Revisit the current CSP `script-src 'unsafe-inline'`; a per-request nonce architecture is the stronger option when the product is ready to accept the App Router rendering trade-offs.
9. Establish an ordered Prisma migration workflow for production schema changes; the repository still has historical migration coverage gaps.

## Release principle

Security is not only “can an attacker get in?” Reliability is also “what happens when the network, database, or process stops at the worst possible millisecond?”

Phase 8 therefore focuses on fail-closed behavior, retryability, least privilege, bounded external calls, and explicit production configuration rather than adding user-facing features.
