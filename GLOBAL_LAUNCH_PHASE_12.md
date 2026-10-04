# Lumen — Global Launch Readiness (Phase 12)

**Objective:** turn the accumulated product, reliability, billing, analytics, AI-learning, and SEO work into a final release gate that separates code readiness from external launch approvals.

## Shipped in Phase 12

### Trust and legal surface

- Added public `/privacy`, `/terms`, and `/security` pages.
- Added footer links to the three trust pages.
- Signup terms language now links directly to Terms and Privacy.
- Added `/.well-known/security.txt` using the configured support/security contact.
- Marked Privacy/Terms content as launch drafts requiring qualified legal/privacy review before publication as final legal terms.

### Consent-aware acquisition

- Added a first-party consent preference cookie.
- Acquisition attribution is disabled until the visitor opts in.
- Declining consent removes the attribution cookie and does not affect product access.
- Existing UTM/referrer capture can resume immediately after opt-in.

### Production preflight

`npm run launch:preflight` now fails closed unless production configuration has:

- HTTPS public app URL
- PostgreSQL database
- sanitized proxy headers
- Supabase authentication
- real AI provider and key
- Resend transactional email
- live Paddle checkout + production webhook verification
- real support and founder addresses

It emits warnings for non-blocking rollout choices such as invite-only signup or an unavailable Customer Portal key.

`npm run launch:smoke -- https://your-domain.example` checks the deployed public surface, health endpoint, sitemap, robots, trust pages, and security.txt over HTTPS.

### CI release gate

Added GitHub Actions CI for `npm ci`, lint, typecheck, and production build using safe non-production test configuration.

## Final launch gates

### Code

- [x] Authentication cannot use the local provider in production.
- [x] Paddle webhook replay/retry and ordering protections exist.
- [x] AI/email development providers are blocked in production.
- [x] Private routes are excluded from search indexing.
- [x] Public sitemap/robots exist.
- [x] Product analytics and retention instrumentation exist.
- [x] Outcome/learning loop exists.
- [x] Production preflight exists.

### External configuration still required

These are intentionally not claimed as completed because they depend on the real deployment/provider accounts:

- [ ] Production domain and DNS/TLS verified.
- [ ] Supabase production project configured and redirect URLs verified.
- [ ] Paddle production seller, price, notifications endpoint, tax settings, and Customer Portal verified with a real test transaction.
- [ ] Resend sending domain and sender identity verified.
- [ ] Google Analytics 4 + Search Console production property verified.
- [ ] Production database backup schedule and restore drill completed.
- [ ] Error/uptime monitoring and alert routing connected to an operational channel.
- [ ] Privacy policy, Terms, DPA/subprocessor disclosures, AI-provider disclosures, and cookie/marketing-consent posture reviewed by qualified counsel for launch jurisdictions.
- [ ] At least one real production signup → onboarding → AI plan → Paddle payment → webhook → task → outcome journey executed end-to-end.
- [ ] Rollback owner, deployment rollback procedure, and database migration recovery procedure documented and rehearsed.

## Launch decision

**Status: READY FOR CONTROLLED GLOBAL BETA, NOT YET CLAIMED AS FULL PUBLIC LAUNCH.**

The application code has the launch-gate structures needed for a controlled rollout. A full public launch remains blocked until the external provider, legal, domain, monitoring, backup/restore, and real-payment checks above are completed in the production environment.

## Recommended rollout

1. Configure production environment and run `npm run launch:preflight`.
2. Deploy the exact release artifact.
3. Run the real end-to-end smoke journey with a controlled account/payment.
4. Verify monitoring, email, Paddle webhook, analytics attribution, and rollback.
5. Open signup gradually, keeping the invite gate available as the rollback lever.

## Important distinction

This phase does **not** claim SOC 2, ISO 27001, GDPR compliance, legal approval, zero-downtime operation, or a production payment test. Those are external or assurance outcomes and must be evidenced separately.
