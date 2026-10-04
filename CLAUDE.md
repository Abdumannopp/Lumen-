# Lumen Product

Lumen is an AI marketing SaaS for businesses, projects and startups that cannot
afford an agency.

Preserve existing ATLAS, PULSE, SCOUT, MUSE, ORBIT, Analytics, Growth and AI
adapter behaviour.

@AGENTS.md

# Approved MVP Scope

Email auth; isolated workspaces; PostgreSQL; onboarding; weekly plan;
TODO/DONE/SKIPPED; AI usage limits; one Paddle plan; verification/reset email;
English UI; invite-only beta.

Do not add Ads, GA4, CRM, social publishing, multiple plans or additional UI
languages.

The Google Analytics 4 / Search Console integration that once existed was
removed on 2026-10-05 by founder decision (migration
`20261005_remove_google_integration` drops `google_connections`). Do not
re-add it. Kept on purpose: `RecordSource.EXTERNAL` (an enum value cannot be
dropped safely), `marketing_metrics.externalKey`, and old `product_events`
rows named `analytics.google_connected` / `analytics.synced`. The
`google.*` host match in `acquisition-capture.tsx` is search-engine referrer
detection, and `GOOGLE_API_KEY` is the Gemini AI provider — neither is the
integration.

# Non-negotiable Security

Authorize every Server Action and Route Handler. Never trust client `userId` or
`workspaceId`.

Every tenant-owned query must be workspace-scoped. Never expose service keys or
tokens.

Billing access comes only from verified idempotent webhooks.

# Workflow

Inspect first. Propose a file-level plan. Do not code before founder APPROVE.

Implement the smallest change. No unrelated refactor or package upgrade.

Run exact verification commands and report real pass/fail output.

One feature per commit with rollback and known limitations.

# This repository

Next.js 16 App Router, React 19, Prisma 7, Tailwind 4, Zod 4. TypeScript strict.

- `src/app` — routes. Three groups: `(marketing)`, `(onboarding)`, `(app)`.
- `src/lib/<domain>/` — each domain has `queries.ts` (reads, `server-only`),
  `actions.ts` (writes, `"use server"`) and often `agent.ts` (AI contract).
- `src/lib/ai/` — provider abstraction, agent runtime, context builder.
- `src/components/<domain>/` — UI. `src/components/ui/` is the design system.
- `prisma/schema.prisma` — source of truth. `prisma/sql/schema.postgresql.sql`
  is **generated** from it by `npm run db:sql`, for machines where the Prisma
  CLI cannot download its engine binary. Never edit it by hand.
- `scripts/e2e-*.sh` — HTTP end-to-end suites. They need a running server.

Server Actions are the only write path. There is no client-writable REST API.

## Verification commands

Run these exactly, and report the real numbers. Never claim an unrun test passed.

```bash
npm run typecheck                 # tsc --noEmit
npm run lint                      # eslint
npm run build                     # prisma generate && next build
npm start                         # required before any e2e suite
bash scripts/e2e-<name>.sh        # one suite; prints "N passed, M failed"
```

`scripts/e2e-dates.sh` is timezone-sensitive by design. Run it a second time
with the server started under `TZ=America/New_York` and it must pass identically.

Baseline (2026-10-04): typecheck clean, lint clean, build succeeds,
`npm run audit:production` PASS, **910 assertions passing across 26 suites,
0 failing**, against PostgreSQL 16 — run twice in a row on the same database,
same number. `scripts/e2e-dates.sh` also passes (22/0) under
`TZ=America/New_York`. The suites are order- and state-independent. A suite
that mutates shared state puts it back. A change that lowers that number
without an explicit reason is a regression.

The suites need `AUTH_PROVIDER=local`. `scripts/lib/session.sh` signs a test
account up, follows its confirmation link and logs it in; every suite gets its
workspace from `$LUMEN_WORKSPACE_ID`. Suites that need a *second* account sign
one in on purpose: `e2e-tenancy.sh` (`second@lumen.test`, to prove isolation),
and `e2e-beta.sh` plus the `/admin` check in `e2e-ai-learning.sh` (the first
`FOUNDER_EMAILS` address).

The `.env` the suites expect, besides `DATABASE_URL`:

- `AUTH_PROVIDER=local`, `AI_PROVIDER=mock`, `EMAIL_PROVIDER=log`, `APP_ENV=local`
- `FOUNDER_EMAILS` set to an address that is **not** `suite@lumen.test` —
  `e2e-beta.sh` asserts the suite account is not a founder
- `PADDLE_NOTIFICATION_SECRET` set (`e2e-billing.sh` signs events with it)
- `PADDLE_PRICE_ID` and `NEXT_PUBLIC_PADDLE_CLIENT_TOKEN` **unset** — the
  billing suite asserts "checkout not configured". They must be set together
  or not at all; `src/lib/env.ts` refuses to boot with only one.

Start the server (`npm start`) only after `npm run build`, on a database made
by `npm run setup` or `npm run db:deploy`.

`npm run audit:production` is part of verification. Among other rules it
rejects a render-time `setState` in `AppShell`
(`if (...) { setX(...) }` in the component body); `react-hooks` lint rejects
the effect-based alternative, so the drawer there derives its open state from
the path it was opened on instead.

## Release blockers found by adversarial QA (2026-08-24) — closed 2026-09-06

All three were reproduced on a running server rather than reasoned about, and
all three were re-verified closed the same way — by reproducing the original
exploit against a real build and confirming it now fails. (Full e2e suite at
the time: 23 suites, 848 assertions, 0 failures. Current baseline is above.)

1. ~~**Pre-auth account takeover when `NEXT_PUBLIC_APP_ENV` is set at runtime.**~~
   Next inlines `NEXT_PUBLIC_*` at BUILD time. Both `src/lib/env.ts` (the
   "local auth must never run in production" refusal) and
   `src/app/api/dev/confirm-link/route.ts` read that build-time value, so a
   deploy that sets env only at runtime — Docker, most PaaS — got no protection
   at all. Proven: booted with `NEXT_PUBLIC_APP_ENV=production
   AUTH_PROVIDER=local`, the process started, `/api/dev/confirm-link` returned a
   live recovery token for an arbitrary address, `/auth/confirm` turned it into
   a session, `/overview` answered 200.
   **Fixed:** replaced with a server-only `APP_ENV` variable — no
   `NEXT_PUBLIC_` prefix, so Next.js never inlines it, and it is read from
   `process.env` at actual process start like every other server secret in the
   file. Re-ran the exact same reproduction (build without `APP_ENV` set, then
   start with `APP_ENV=production AUTH_PROVIDER=local` as plain runtime env
   vars): the process now refuses every request with the "must never run in
   production" error, including `/api/dev/confirm-link`. `NEXT_PUBLIC_APP_ENV`
   is gone from the schema entirely — nothing reads it any more.

2. ~~**Cross-tenant write through backup restore.**~~ `restoreBackup` rewrote
   `workspaceId` on `projects` only; the other 17 tables took the archive's
   `projectId` verbatim. Proven: an attacker in their own workspace restored an
   archive whose `contentItems` row named the victim's project, and the row
   landed there. Escalation: `businessProfile` is one-per-project and feeds the
   victim's AI prompts — stored cross-tenant prompt injection.
   **Fixed:** before the transaction opens, `restoreBackup` now checks that
   every foreign key in the archive (`projectId`, and transitively `strategyId`
   / `segmentId` / `conversationId`) resolves to a row the archive itself
   declares — never an id that merely happens to exist somewhere in the
   database. Any mismatch refuses the whole restore (nothing is touched, not a
   partial import with bad rows dropped). `scripts/e2e-settings.sh` section 10b
   plants a real other-tenant project via direct SQL, restores an archive
   naming it, and asserts the restore is refused and nothing lands there.

3. ~~**`testAiConnectionAction` has no authorisation**~~ (`src/lib/settings/actions.ts`).
   Proven: called with no cookie, it executed. It called the provider directly
   rather than through `runAgent`, so `claimRun` never fired — with a real
   provider that was unauthenticated, unmetered spend on the operator's key.
   **Fixed:** now calls `requireWorkspace()` first, and claims/refunds against
   the workspace's usage allowance with the same `claimRun`/`refundRun`
   primitives `runAgent` uses (it cannot route through `runAgent` itself, since
   that requires a real project and Settings is deliberately usable with zero
   projects). Re-verified: the same zero-cookie request now gets a 401 instead
   of `{ok:true}`, and an authenticated call against an exhausted allowance is
   refused with "This workspace has used its AI allowance for the month"
   before the provider is ever reached.

4. ~~**No rate limiting anywhere.**~~ 200 wrong-password sign-in attempts
   landed on the real provider in about six seconds; sign-up and password
   reset were equally unlimited, and the latter emails a stranger's inbox on
   every submission with nothing to slow that down.
   **Fixed:** a `RateLimitBucket` table (fixed-window counter, claimed by
   IP+action) backs `rateLimitByIp` (`src/lib/security/rate-limit.ts`), wired
   into `signInAction`, `signUpAction`, and `requestPasswordResetAction` with
   the limits in `src/config/rate-limits.ts` (10/5min sign-in, 5/15min each
   for sign-up and password reset). The `local` auth provider is exempt —
   `src/lib/env.ts` already refuses to run it in production, so there is no
   real credential behind it, and the e2e suites drive far more than ten
   sign-ins from one machine. Re-verified against a live server running
   `AUTH_PROVIDER=supabase`: the first 10 of 13 rapid wrong-password attempts
   got the real "wrong credentials" answer, attempts 11-13 got "Too many
   attempts. Try again in 2 minutes." — matching the configured window
   exactly — and the underlying bucket row showed `count=13`.

5. ~~**No CSP, no HSTS.**~~ Closed, then tightened 2026-10-04. The first draft
   shipped `script-src 'unsafe-inline'` because a strict static policy broke
   Next.js's inline hydration scripts (proven with Playwright: `Refused to
   execute inline script...` plus React #412). The strict alternative is a
   per-request nonce, and every HTML route here already renders dynamically, so
   it costs nothing: `src/proxy.ts` generates a nonce per request and
   `src/config/csp.ts` builds the policy for both the proxy and `next.config.ts`
   (API routes). `script-src` is `'self' 'nonce-…' 'strict-dynamic'` plus the
   Paddle host as a fallback; no `'unsafe-inline'`.
   Styles are split: `style-src-elem` allows only `'self'`, the nonce and
   content hashes of CSS a library injects itself
   (`src/config/csp-hashes.json`, regenerated by `scripts/csp-hashes.mjs` on
   every `npm run build`, so a library upgrade cannot leave a stale hash);
   `style-src-attr` keeps `'unsafe-inline'` because React server-renders the
   `style` prop as an attribute and Radix positions menus that way — an
   attribute cannot carry selectors. `src/instrumentation-client.ts` hands the
   nonce to `get-nonce` (Radix scroll-lock `<style>`) and runs zod `jitless` in
   the browser so its `Function("")` probe does not report a violation.
   `frame-ancestors 'none'`, `object-src 'none'`, `base-uri 'self'`,
   `form-action 'self'` and the Paddle/Supabase allowlists hold.
   Re-verified in Chromium: 0 CSP violations and 0 console errors across 20
   pages, Radix menus and the mobile drawer. **Adding a script, an injected
   `<style>`, or a library that calls `document.createElement("style")` can
   break this silently in tests that never run JS — check a real browser.**

6. ~~**`/api/ai/selftest` unauthenticated, and worse than it looked.**~~ It
   was gated to the mock AI provider so it could never spend money, but
   nothing checked who was asking or whose `projectId` they supplied.
   `runAgent` builds real project context regardless of caller — every other
   caller reaches it only after a Server Action or query module has already
   called `requireProject` — and the mock provider's probe response echoes
   back the first 120 characters of that rendered context verbatim. Proven
   live: before the fix, a request with no cookie and another workspace's real
   `projectId` got back `"echo":"Project context (generated ...)..."` —
   another tenant's actual business-profile/campaign data, to an anonymous
   caller. **Fixed:** added `await requireProject(body.projectId)` before the
   agent runs. Re-verified: no cookie now gets 401 `UNAUTHORIZED`; a signed-in
   user given the exact same real `projectId` belonging to a different
   workspace now gets 404 `NOT_FOUND`; the project's own owner still gets the
   normal `{ok:true, ...}` envelope.

~~Smaller, not blocking: step 11 (invite-only beta) is written but
uncommitted and has zero tests.~~ Closed 2026-09-06 — see "Known state" below
for what was tested and what it found.

Known pre-existing flake, not caused by anything above: `scripts/e2e-ai.sh`
section 6 ("TIMEOUT") fails intermittently — reproduced identically across
three independent full-suite runs on 2026-09-06, including one taken before
any of items 4-6 existed, so it predates this pass. Not investigated further
yet; every other section of every suite passes clean.

Checked and closed as false positives (2026-09-06): a subagent report flagged
one "unscoped lookup" each in `src/lib/dashboard/queries.ts`
(`db.strategyVersion.findFirst({ where: { id: row.currentVersionId } })`, no
explicit `projectId`) and `src/lib/experiments/queries.ts` (the
`recommendation` relation included on an experiment row, likewise no explicit
`projectId` in that join). Neither reads an id a request supplied — both read
`currentVersionId` / `recommendationId` columns that are only ever written
after an explicit ownership check: `appendVersion` in
`src/lib/strategy/actions.ts` sets `currentVersionId` to a row it just created
itself; `restoreVersionAction` sets it only after
`db.strategyVersion.findFirst({ where: { id: versionId, strategy: { projectId
} } })` confirms the caller-supplied `versionId` belongs to the caller's own
project (`scripts/e2e-strategy.sh`'s "cannot restore another project's
version" proves this live); and `recommendationId` on an experiment is set
only after the same shape of check in `src/lib/experiments/actions.ts`. A
value that can never be attacker-influenced does not need a second scope
check at read time — pattern-matching "no projectId in this `where`" without
tracing where the value came from is what produced the false positive. Not
re-opening unless a new write path to either column skips its ownership
check.

What held under attack, and is worth not breaking: 12 concurrent generations
against a limit of 3 consumed exactly 3 and left exactly one ACTIVE plan; no
secret appears anywhere in `.next/static`; the Paddle webhook refuses forged,
mismatched and stale signatures.

## Known state

- Baseline commit on `main` is the rollback point; SaaS work is on
  `saas-foundation`.
- The database is **PostgreSQL**. `prisma/migrations/20261001000000_baseline`
  creates the whole schema, so `npm run db:deploy` works on an empty database;
  the two `20261004_*` migrations after it are idempotent. A database created
  earlier with `npm run setup` or `db:push` must be marked once with
  `npx prisma migrate resolve --applied 20261001000000_baseline` before
  deploying. `npm run setup` applies the generated DDL instead, for machines
  that cannot reach the Prisma engine download; `scripts/generate-sql.mjs`
  emits tables in foreign-key dependency order (declaration order in
  `schema.prisma` broke a fresh setup once). A new model needs both a
  migration (`npm run db:migrate`) and `npm run db:sql`.
- `npm run db:drift` reads a live database back and compares it to
  schema.prisma. Run it after any migration; it exits non-zero on disagreement.
- `npm run db:import` copies an old SQLite database in. It reads a copy of the
  file, runs in one transaction, is idempotent, and verifies row counts and
  orphans afterwards.
- `AUDIT.md` section 2b lists defects already found and fixed. Section 3 lists
  known limitations. Read both before assuming something is a new bug.
- `Settings` is one row per workspace (`workspaceId` unique, cascading). It was
  a single row pinned to `id: "singleton"`, which was correct for one operator
  and wrong for two: currency, timezone and the default project are answers to
  "whose?".
- **Authentication is in.** Email and password, behind `AuthProvider` — Supabase
  in real deployments, a memory-backed double for the suites. Every question of
  access is answered in `src/lib/auth/dal.ts`: `requireUser`, `requireWorkspace`,
  `requireProject`. Nothing above it may decide access, and nothing below it may
  skip it.
- **A layout is not a guard.** Next.js renders a layout and the page beneath it
  concurrently and streams both, so a `redirect()` in a layout stops the
  navigation while the page's data has already gone into the response. This was
  real: a signed-out request to /projects returned a 307 with the project list
  inside it. `scripts/e2e-tenancy.sh` section 4b holds that ground. Put the
  check in the query, not in the layout.
- **Server Actions are numbered per page in render order.** Adding one to the
  application chrome renumbers the `$ACTION_n` fields of every form below it,
  which is invisible in a browser and breaks anything driving the forms
  directly. Sign-out is a route handler for that reason, not an action.
- `src/lib/projects/queries.ts` is workspace-scoped: it is the module the whole
  interface resolves its project through, so it was scoped with authentication
  rather than left for the sweep below.
- **Every query and every action now narrows to a workspace.** Reads start with
  `requireProject(projectId)`; actions start with `projectInWorkspace(projectId)`
  and report failure rather than throwing, because an action's message goes back
  into the form the person is looking at. Both are request-cached, so a page that
  asks thirty times pays for one membership lookup.
- Backup and restore stop at the workspace on both ends — export reads one
  cabinet, restore empties one cabinet. This was the release blocker; it is
  closed, and `scripts/e2e-tenancy.sh` sections 10-12 hold it closed.
- Known limitation, not a defect to rediscover: restored rows keep the ids they
  were exported with, so two workspaces restoring the *same* archive collide on
  the second restore. It fails safely (the transaction rolls back) but the
  message is generic. Re-keying on the way in is the fix when it matters.
- A "project not found" and a "project belongs to someone else" are deliberately
  the same answer everywhere. A distinguishable refusal is a way to confirm ids
  by guessing at them.
- Active project lives in an httpOnly cookie. It is a hint: `requireProject()`
  validates it against the workspace on every request.
- **The weekly plan is the product.** `src/lib/weekly-plan/` — CADENCE generates
  it, `guardrails.ts` decides what survives, `generate.ts` writes it in one
  transaction, `task-actions.ts` marks work DONE or SKIPPED.
- **The guardrails are not the prompt.** The prompt asks the model not to
  propose paid work to a business with no budget; `guardrails.ts` enforces it.
  Both exist on purpose: the prompt so the output is usable, the code so the
  guarantee holds when the model ignores it. Never move a rule from the second
  into the first.
- Regenerating a plan never overwrites. The previous plan becomes SUPERSEDED and
  keeps its tasks, DONE marks and skip reasons — that history is what the next
  plan reads, and deleting it would delete the product's memory.
- A plan is written whole or not at all. Nothing touches the database until the
  output has passed the schema and the guardrails.
- **Every AI call goes through `runAgent`, and that is what makes the limit a
  limit.** It claims allowance before the provider is contacted, records who and
  what for, prices the tokens, and enforces the idempotency key. There must
  never be a second path to a provider.
- The allowance is claimed *before* the call and refunded only when the provider
  was never reached. A failure that reached the vendor still counts — the tokens
  were billed. Stated in `src/config/usage.ts`, not implied in a branch.
- `Entitlement.used` is a counter, not a count of AgentRun rows. Deriving it
  would let the limit be reset by deleting history, which the product has a
  button for.
- The usage period rolls forward on first use after it ends. No cron: a limit
  that depends on a scheduled job stops existing when the job does, and in the
  direction that costs money.
- Costs in `src/lib/usage/pricing.ts` are real rates read from vendor pages on
  the date recorded beside each one, and they go stale silently. Everything
  computed from them is labelled an estimate. Re-check before pricing anything.
- **A webhook is the only thing that grants a subscription.** A browser
  returning from a successful checkout is a URL, and URLs can be typed. The
  redirect updates nothing.
- Webhook verification is HMAC-SHA256 over `${ts}:${rawBody}` with the
  notification secret, timing-safe, with a replay window. The body must be the
  raw bytes — `JSON.parse` then `JSON.stringify` produces a different string and
  a signature that never matches. Read `request.text()` first and once.
- `WebhookEvent.providerEventId` is unique, and that one constraint is what
  makes billing idempotent. Paddle retries for days. Claim the id *before*
  applying, not after.
- A verified signature proves the event came from Paddle, not that it is for
  *this* product: a seller account can sell other things to the same endpoint.
  When `PADDLE_PRICE_ID` is set, `applyPaddleEvent` ignores any paid-status
  event whose price is a different one (cancel/pause/past-due still apply, so
  access can only shrink). The webhook body is read as a stream with a 1 MB cap.
- Billing's entire effect on the product is one number: `Entitlement.limit`.
  Nothing else knows billing exists. Keep it that way.
- Once a subscription id is known, our own record decides whose it is —
  `custom_data` is consulted only for a subscription never seen before.
  Otherwise anyone who learned a subscription id could point it at their
  account.
- `startCheckoutAction` takes no arguments on purpose. A checkout that accepted
  a workspace id is a checkout that can be pointed at someone else's.
- The suites share one account, so `scripts/lib/session.sh` resets its
  allowance. Do not raise `TRIAL_AI_RUNS` to make a test pass — the allowance is
  a product decision.
- **`EmailMessage` holds no address, no body and no token.** Only a hash of the
  recipient, the template name and the provider's id. A log that keeps bodies is
  a second place every reset link can leak from, and it is the one nobody
  secures. Never add a column that carries message content.
- Email never breaks what triggered it. A welcome email is not worth failing a
  signup for; `sendEmail` returns on every path and records what happened.
- **Links in emails resolve against an allowlist**, not against "any path on our
  own domain". The permissive version really did send browsers to
  `//evil.example` — `scripts/e2e-email.sh` section 8 proves it, using a *valid*
  token, because an invalid one short-circuits before `next` is read and would
  pass whatever the rule did.
- A password change ends every other session and emails the address on the
  account. Both matter for the same reason: a password change is what someone
  does when they think an intruder is in their account.
- `/api/dev/plan-scenario` and `/api/dev/confirm-link` are development-only
  routes: both 404 unless the mock provider / local auth provider is in use and
  `APP_ENV` is not production. **`APP_ENV`, never `NEXT_PUBLIC_APP_ENV`** — the
  latter is inlined into the compiled output at build time by Next.js, so a
  deploy that sets it only when the container starts gets no protection at
  all. That was a release blocker; see the section above. They exist so
  failure paths are tested against the real code rather than a copy of it. Do
  not add a third
  without the same two guards.
- **The invite-only beta is in, tested, and committed** (2026-09-06). Signup
  requires either a founder address (`FOUNDER_EMAILS`) or an unused, unexpired
  invite issued to the exact address signing up — `src/lib/beta/invites.ts`
  is the one place that answers "may this address create an account", and
  `signUpAction` refuses before ever reaching the auth provider if it says no.
  Founders manage invites and can disable/re-enable any account from `/admin`
  (`src/lib/beta/actions.ts`); every beta user can send feedback through the
  bar on every page (`src/components/beta/beta-bar.tsx`). `scripts/e2e-beta.sh`
  drives all of it over real HTTP — the signup gate (no token, wrong address,
  expired, revoked, already-spent, all refused identically), founder-only
  actions, disable/re-enable, and feedback — 54 assertions, and it tears down
  every account it creates so it does not leave extra workspaces for
  `scripts/e2e-tenancy.sh` to trip over (it did, once, before this suite
  cleaned up after itself). A second adversarial pass after committing (also
  2026-09-06) found nothing new; one thing worth knowing rather than fixing:
  `Invite.workspaceId` ("join this one" per the schema comment) is written
  by the schema but never read — `provisionAccount` always gives a signup a
  brand-new workspace regardless of what an invite names. Fails safe today
  because nothing sets a non-null `workspaceId` on an invite (`createInviteAction`
  never passes one), so this is dead code rather than a live bug — but it means
  the "invite a teammate into my workspace" flow the schema comment describes
  does not actually exist yet. Wire `provisionAccount` to honor it before
  building a UI that implies it already works.
- **`BETA_SIGNUP` (`invite` default, `open` for a public launch)** switches
  off the invite gate without touching code — set it in the deployment's
  environment, not by editing `checkGate`. `open` still leaves founders,
  `/admin`, and disable/enable working exactly as before; it only changes
  whether `checkGate` requires a token at all. Verified live: with
  `BETA_SIGNUP=open` a fresh signup with no invite and no founder address
  succeeded ("Check your email for a confirmation link."); with the default
  restored, the same request is refused again. `scripts/e2e-beta.sh` still
  tests the `invite` behaviour, since that is the default it runs against.
- **`notFound()` deep in a page does not produce an HTTP 404** once anything
  above it can stream. `/admin` calls `notFound()` for a non-founder, and the
  code comment there says the point is to look like a route that does not
  exist — but `(app)/layout.tsx` starts sending the document shell before the
  page's own `await requireFounderView()` resolves, so the status already sent
  is 200. The founder-only content is genuinely never in that response (proven
  in `scripts/e2e-beta.sh` section 4), and a real browser hydrates and shows
  the not-found page correctly — but a client that never runs JS sees a 200,
  which is one more bit of signal than a true 404 would give a script probing
  routes by status code alone. Same root cause as "a layout is not a guard"
  above, different symptom. Not fixed here — matching redirect()'s own
  accepted streaming limitation elsewhere in this file — but worth knowing
  before relying on the status code specifically, anywhere in the app.
- **`AI_PROVIDER="openrouter"` is in** (`src/lib/ai/providers/openrouter.ts`),
  a fifth option alongside mock/gemini/groq/anthropic, wired through
  `getServerEnv()`'s required-key check and `getProvider()` the same way the
  other three are — one file, one registry line, nothing else touched. It is
  not just another vendor: `AI_MODEL` is optional pinning for every other
  provider, but for OpenRouter it *is* the model choice, since one key reaches
  hundreds of models from dozens of backends. Two consequences follow from
  that difference, both deliberate: (1) `response_format: json_object` is NOT
  forced, unlike Groq and Gemini — OpenRouter's own docs say structured-output
  support "depends on individual model support" rather than being universal,
  so forcing it would 400 on whichever underlying model doesn't support it;
  it relies on the same prompt instruction + salvage-then-validate parsing
  Anthropic does. (2) `src/lib/usage/pricing.ts` deliberately carries NO rate
  for any OpenRouter model — the same model id can be served by a different
  backend at a different price on OpenRouter, its own pricing page shows a
  range rather than a number, and guessing a single rate would be exactly the
  wrong-is-worse-than-missing number that file's docstring warns against; an
  OpenRouter run just shows as unpriced (`known: false`). Default model is
  `openai/gpt-oss-120b:free` — free, no card, matching why Gemini/Groq get the
  defaults they do — with its own small daily/per-minute cap; set `AI_MODEL`
  to any paid model on the same key to lift that. Verification here is
  necessarily partial: this sandbox's egress proxy returns 403 on
  `openrouter.ai` (confirmed with a direct `curl`, same as `vercel.com`), so —
  same caveat `AUDIT.md` already carries for Gemini and Groq — only
  `tsc`/`eslint` (clean), the env-validation boot check (refuses with no key,
  boots with one), a full `npm run build`, and the existing `e2e-ai.sh` (26/26)
  and `e2e-settings.sh` (48/48) against the untouched `mock` default were run
  here. The live happy path needs a real `OPENROUTER_API_KEY` tested from
  somewhere this proxy doesn't sit in front of — a local machine, or the
  deployed app.
- `Invite.workspaceId` / `invitedById` / `acceptedByUserId` and
  `Feedback.workspaceId` / `userId` are plain columns with no `@relation` and
  no `onDelete`, unlike `AuditEvent`, which cascades. Currently unreachable —
  nothing in the product deletes a workspace or a user outside the
  local-operator-adoption path, which predates both tables — but the day
  either becomes deletable, these will be silently orphaned rather than
  cascaded or nulled. Worth a relation when that day comes, not urgent before.

# Important

CLAUDE.md is not a place to store secrets. Never write an API key, token or
password here.
