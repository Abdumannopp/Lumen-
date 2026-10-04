# Lumen — Global Launch Strategy

**Objective:** turn Lumen from a strong beta/MVP into a globally sellable SaaS for owner-led small businesses and lean marketing teams.

## Positioning

**Primary promise**

> Lumen turns your business context into a focused weekly growth plan — what to do, why it matters, and what to measure next.

Do not position Lumen as a generic AI writer. Large platforms already compete aggressively on AI-assisted campaign creation, agents, workflows and integrations. Lumen should win on a narrower outcome: **turning messy business context into a prioritized weekly growth loop.**

## Initial ICP

Start with businesses that have a real offer, some existing marketing activity, and no large marketing operations team:

- 1–20 person businesses
- Founder-led or lean marketing teams
- SaaS, agencies/consultancies, professional services, e-commerce
- English-speaking launch markets first

Avoid enterprise positioning until the product has deep integrations, governance and team workflows.

## Product loop to protect

`Business context → diagnosis → weekly priorities → execution → measurement → learning → next plan`

The weekly plan is the product. Strategy, audience, content, campaigns, analytics and experiments should feed this loop rather than feel like separate tools.

## Global launch gates

### Gate 1 — Trust

1. Billing webhook failures are retryable and never silently acknowledged.
2. Failed transactional emails are retryable within the provider idempotency window.
3. Production deploys use versioned database migrations.
4. Authentication, workspace isolation and destructive restore flows have adversarial tests.
5. Centralized error monitoring and alerting exist for billing, AI, email and auth.

### Gate 2 — Proof of value

1. A new user reaches a useful weekly plan in under 10 minutes.
2. Every recommendation has a reason, expected impact, effort and measurement step.
3. Users can mark work done/skipped and record results.
4. The next plan reads prior outcomes.
5. Product analytics measure activation, weekly retention and completion of recommended actions.

### Gate 3 — Data connectivity

Prioritize integrations by frequency and decision value, not by a large checklist:

1. Google Analytics 4
2. Google Search Console
3. Meta Ads / Meta business data
4. Shopify for e-commerce
5. HubSpot for B2B

The goal is not to import everything. The goal is to let Lumen explain a change and turn it into a next action without manual data entry.

### Gate 4 — Global commercial readiness

- English-first product and support
- USD base pricing with localized checkout presentation
- Privacy policy, terms, cookie/consent controls where required
- Transactional email separated from marketing email
- GDPR/UK direct-marketing requirements reviewed before outbound campaigns
- Clear AI-data handling disclosure and vendor policy
- Paddle configured as Merchant of Record and tax settings verified

Paddle states that its Merchant of Record service can calculate, collect and remit VAT/sales tax across supported jurisdictions, which materially reduces the tax-compliance burden of an international SaaS launch.

## Pricing strategy

Keep the current **$19/month** as a beta/early-adopter anchor rather than immediately adding a complex pricing matrix.

After product-market evidence, test:

- Starter — $19–29/month
- Growth — $49–79/month
- Team/Business — custom or higher tier

The upgrade trigger should be business value (projects, connected data, team collaboration, higher usage), not arbitrary AI token units shown to the customer.

## 90-day execution order

### Days 1–14 — Production hardening

- Fix billing replay/retry.
- Fix email retry.
- Establish migration discipline.
- Add CI and critical-path automated tests.
- Add production monitoring and alerting.
- Remove/disable development-only endpoints in production.

### Days 15–45 — Make the weekly loop measurable

- Connect GA4 + Search Console first.
- Add automatic weekly performance snapshot.
- Make Lumen produce a diagnosis with evidence.
- Tie every recommendation to a measurable KPI.
- Add activation, retention and plan-completion analytics.

### Days 46–75 — Make execution real

- Add one or two high-value publishing/execution integrations.
- Add content export/publishing where it saves obvious manual work.
- Improve onboarding with a fast-path “first plan in 10 minutes”.
- Introduce referral/customer-feedback loops.

### Days 76–90 — International expansion

- Launch English-speaking markets first: US, UK, Canada, Australia and Ireland.
- Add locale-aware dates, currencies and timezone handling.
- Prepare German, French and Spanish translation architecture.
- Create localized landing pages only after the English funnel converts.

## Competitive strategy

HubSpot and Jasper already offer AI assistants/agents, campaign creation, context, workflows and extensive execution capabilities. Lumen should therefore avoid feature-count competition. Its competitive moat should be **persistent business context + weekly prioritization + evidence-backed recommendations + learning from completed experiments.**

## North-star metrics

**Activation:** % of new users who generate a first weekly plan within 10 minutes.

**Weekly value:** % of active users who complete at least one recommended action each week.

**Retention:** Week-4 retained workspaces.

**Outcome:** % of recommendations with an observed result.

**Expansion:** % of workspaces connecting at least one live data source.

## Launch message

**Headline:** Your AI growth plan, every week.

**Subheadline:** Tell Lumen what you sell, who you serve, what you have tried and what you can spend. Lumen turns that context into a focused plan, helps you act on it, and learns from the results.

## Current implementation note

This branch begins the global-launch work by removing local-MVP language from the public positioning and hardening two important reliability paths: Paddle webhook failures can be replayed, and failed email deliveries can be retried within the provider idempotency window.

## Phase 2 — activation and commercial funnel

Completed in the current global-launch branch:

- Public landing page now leads directly to signup and explains the weekly growth loop.
- Pricing is visible on the public page using the single source of truth from `src/config/billing.ts`.
- New projects now redirect directly into business onboarding instead of stopping at the project list.
- Overview now shows a `First win` activation card: business context → weekly plan → first completed action.
- The activation card always exposes the next highest-value step, so the product does not leave a new customer wondering what to do next.

This phase is intentionally focused on time-to-value before adding a larger integration surface.
