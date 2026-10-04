# Lumen

**Growth & Marketing Intelligence** — a local, single-user tool for managing the
growth of several businesses from one machine.

**Status: local MVP complete** (20 of 20 phases). See [AUDIT.md](./AUDIT.md) for
the production readiness report, known limitations, and what changes for SaaS.

LUMEN has no accounts, sign-in or workspaces: a local install has exactly one
operator. A **Project** is a business, and it is the only scoping boundary in the
system — every record added in a later phase belongs to one.

---

## Stack

| Layer     | Choice                                            |
| --------- | ------------------------------------------------- |
| Framework | Next.js 16 (App Router, Turbopack)                |
| Language  | TypeScript (strict)                               |
| UI        | React 19, Tailwind CSS v4, shadcn/ui conventions  |
| Database  | PostgreSQL                                        |
| ORM       | Prisma 7 via the `@prisma/adapter-pg` driver adapter |

---

## Getting started

**Requirements:** Node.js 20.9+ and a PostgreSQL database.

Both of these give you one free, with no card:

| | Free tier | Worth knowing |
| --- | --- | --- |
| [Supabase](https://supabase.com) | 500 MB, 50k auth users | Pauses after a week with no traffic; you unpause it by hand |
| [Neon](https://neon.com) | 0.5 GB, 100 compute-hours | Sleeps after 5 minutes idle and wakes on the next request |

```bash
# 1. Install dependencies (runs `prisma generate` via postinstall)
npm install

# 2. Write .env, then put your DATABASE_URL in it and run this again
npm run setup

# 3. Run
npm run dev
```

Open <http://localhost:3000>. `npm run setup` is safe to re-run: an existing
`.env` is left alone.

It defaults to `AI_PROVIDER="mock"`, so every screen works and every agent
returns placeholder text with no key and no cost. Swap in a real provider when
you want real analysis — see **Choosing an AI provider** below — and restart.

<details>
<summary>Doing it by hand instead</summary>

```bash
cp .env.example .env   # then edit it
npm run db:migrate     # creates the baseline migration and applies it
```

`npm run setup` exists because it needs nothing but Node and a reachable
database: it applies `prisma/sql/schema.postgresql.sql`, which is generated from
`schema.prisma`, so it still works where the Prisma CLI cannot download its
engine binary. On a normal machine `schema.prisma` is the source of truth and
Prisma Migrate is what production applies.

</details>

Then confirm the database is actually wired up:

```bash
curl http://localhost:3000/api/health
```

A healthy response reports `"status": "healthy"` with a measured database
latency. `"degraded"` means the app is running but the database did not answer.

### Coming from the SQLite version

```bash
npm run db:import            # add --dry-run first to see what it would copy
```

It reads a *copy* of `prisma/lumen.db`, so the original is never opened. The
whole copy runs in one transaction, it is safe to re-run, and it compares row
counts and checks for orphans afterwards. Your old file is left where it is.

### Scripts

| Script                | Purpose                                          |
| --------------------- | ------------------------------------------------ |
| `npm run dev`         | Development server                               |
| `npm run build`       | `prisma generate` then a production build        |
| `npm run start`       | Serve the production build                       |
| `npm run typecheck`   | `tsc --noEmit`                                   |
| `npm run lint`        | ESLint                                           |
| `npm run setup`       | Write .env and apply the schema                  |
| `npm run db:sql`      | Regenerate the DDL from schema.prisma            |
| `npm run db:drift`    | Check a live database against schema.prisma      |
| `npm run db:import`   | Copy an old SQLite database into PostgreSQL      |
| `npm run db:push`     | Sync schema without a migration file             |
| `npm run db:migrate`  | Create and apply a development migration         |
| `npm run db:deploy`   | Apply migrations in CI/production                |
| `npm run db:studio`   | Prisma Studio                                    |

`prisma/migrations/20261001000000_baseline` creates the whole schema, so
`npm run db:deploy` works on an empty database. A database that already has the
schema — created with `npm run setup` or `npm run db:push` — must not run it
again; mark it as applied once, then deploy as usual:

```bash
npx prisma migrate resolve --applied 20261001000000_baseline
npm run db:deploy
```

---

## Architecture

```
src/
├── app/
│   ├── (marketing)/        Public landing page. Static, own chrome.
│   ├── (onboarding)/       First-run setup. Centred, no product chrome.
│   ├── (app)/              Product. Sidebar shell + project switcher.
│   │   ├── dashboard/      Overview, scoped to the active project.
│   │   └── projects/       List, create, edit.
│   ├── api/health/         Readiness probe.
│   ├── layout.tsx          Root: fonts, metadata, toast host, skip link.
│   ├── globals.css         Design system: tokens, type scale, signatures.
│   ├── global-error.tsx    Last-resort boundary (renders its own <html>).
│   └── not-found.tsx       404.
├── components/
│   ├── ui/                 Primitives: button, card, input, badge, …
│   ├── layout/             Shells, containers, navigation, page header.
│   ├── feedback/           Error, empty, skeleton and section states.
│   └── brand/              Logo and ambient backdrop.
├── lib/
│   ├── db.ts               Prisma client, pooling, health check.
│   ├── env.ts              Zod-validated environment contract.
│   ├── errors.ts           AppError taxonomy.
│   ├── http.ts             Route handler envelope.
│   ├── result.ts           Result<T> for server actions.
│   ├── logger.ts           Structured logging.
│   └── utils.ts            `cn()` and small helpers.
├── config/                 Site metadata, navigation, project option lists.
├── hooks/                  useMediaQuery, useMounted.
├── types/                  Shared application types.
└── generated/prisma/       Generated client — gitignored, never edited.
```

### Route groups

Each group is a separate shell with different chrome, caching and (soon) auth
requirements, which is precisely what route groups are for. Every group declares
its own `loading.tsx` and `error.tsx`, so a slow or failing page shows its own
shape rather than collapsing the whole application.

### Error handling

Failures are normalised into `AppError`, which carries a stable machine-readable
`code`, an HTTP status, and an explicit `expose` flag so internal messages cannot
reach a user by accident.

- **Route handlers** wrap their body in `handleRoute()` and return one JSON
  envelope: `{ ok, data | error, requestId }`.
- **Server actions** return `Result<T>` instead of throwing, because a thrown
  error loses its shape crossing that boundary.
- **UI** renders every failure through a single `ErrorState` component.

### Environment

`src/lib/env.ts` parses server and client schemas separately at boot, so a
misconfigured deployment fails immediately with a readable message instead of
throwing deep inside a request. `NEXT_PUBLIC_*` keys are read as literal
property accesses so the bundler can inline them. Server values sit behind
`getServerEnv()`, which throws if called in the browser.

Set `SKIP_ENV_VALIDATION=1` only for container image builds that compile without
runtime secrets — never on a running instance.

---

## Design system

Defined entirely in `src/app/globals.css`. Retheming is editing that one file.

**Dark is the root, not a variant.** Tokens are declared once on `:root` in their
dark values; a light theme is an opt-in override on `[data-theme="light"]`. No
component carries `dark:` prefixes, and the interface cannot flash a light frame
on first paint. An inverted `light:` Tailwind variant is available for the rare
component that must diverge.

**Colour.** Near-black deep navy (`#07091a`) so violet and blue accents sit in
the same temperature family as the background. The accent ramp runs electric
violet (`#8b5cf6`) to signal blue (`#3b82f6`).

**Type carries three roles**, and the distinction is meaningful:

| Role    | Face              | Used for                                     |
| ------- | ----------------- | -------------------------------------------- |
| Display | Sora              | Headings, titles                             |
| UI      | Inter             | Body copy, controls, dense interface text    |
| Mono    | JetBrains Mono    | System metadata — identifiers, statuses, refs |

Monospace always means "this came from the machine". All three are self-hosted
through npm, so there is no font-CDN request on first paint and builds are
reproducible offline.

**Signature treatment.** `.aurora-edge` draws a masked violet→blue gradient
hairline around a rounded surface that brightens on hover. It is used on three
elements in the entire application; everything else stays quiet so it reads as
intentional rather than decorative.

**Quality floor.** Responsive to mobile, visible keyboard focus on every
interactive element, a skip link as the first focusable node, and
`prefers-reduced-motion` respected globally.

**Contrast is measured, not eyeballed.** The design audit computed WCAG ratios
for every token pair in both themes. The palette itself passed, but small labels
were being faded with opacity — `text-muted-foreground/70` measured 3.54:1 and
`/45` measured 2.16:1, below the 4.5:1 small-text threshold and in some cases
below 3:1 entirely. All 69 text usages now use the full token, which measures
6.07:1; hierarchy comes from size, letter-spacing and case rather than from
fading, which is what small type needed anyway. Only decorative bullets still use
reduced opacity.

That fix improved a product behaviour too: the em dash meaning "we cannot know
this" in analytics was rendering at 1.96:1 — nearly invisible. Absence of data is
information, so it should be as readable as the data.

**Repeated patterns were consolidated**, not restyled. Provenance badges had four
independent implementations across audience, content, campaigns, growth and
budget; they are now one `SourceBadge`, because provenance is a load-bearing idea
in this product and an operator should learn the badge once. Ten files hand-rolled
the same mono section heading at slightly different sizes — now one
`SectionHeading`.

---

## Data model

Three tables: `Project`, `BusinessProfile` (one-to-one), and `AgentRun`.

**Lists are real `text[]` columns.** `targetMarkets`, `brandVoice`,
`currentMarketingChannels`, `currentChallenges` and `knownCompetitors` were JSON
strings under SQLite, which has no array type, and were converted at the
data-access boundary. That boundary is gone: Prisma returns `string[]` directly.
`src/lib/json-list.ts` survives only so `npm run db:import` can still read a
database written the old way.

Duplicate-name checks are `mode: "insensitive"` filters. Under SQLite they had
to load every active project and compare in application code, which was fine for
one operator's handful of rows and would not be for every tenant's.

`Project` carries identity (name, website, description), market
(industry, country, targetMarkets), position (businessStage, primaryGoal) and
lifecycle (createdAt, updatedAt, archivedAt).

Every table added later must carry a `projectId` and cascade from it. Use
`requireActiveProject()` from `src/lib/projects/queries.ts` in any project-scoped
write, so a missing project fails loudly instead of writing orphaned rows.

**`BusinessProfile` deliberately does not repeat what `Project` owns.** Name,
website, industry, country, target markets, business stage and primary goal live
on `Project` and nowhere else. Onboarding collects them, but writes them back to
the project row — storing them twice would guarantee drift the first time
somebody edited a project. Read the two together through
`getBusinessContext(projectId)`, which returns a single merged `business` object.
That merged shape is what future AI features should consume as persistent
context, never the two tables separately.

Every profile column is nullable, because onboarding autosaves partial drafts and
the database has to accept an unfinished profile. Requiredness lives in the
validation layer, and completeness is derived from the data rather than trusted
from a flag — `completedAt` records *when* the flow finished, not whether the
answers are valid.

**Archive vs delete.** `archivedAt` is a nullable timestamp rather than a boolean,
so "when did we stop working on this" stays answerable. Archiving is reversible
and clears the active selection; deletion is permanent and requires the project's
name to be typed — re-checked server-side, because a confirmation that only
exists in the browser is decoration rather than a safeguard.

**Active project.** Persisted in an httpOnly cookie (`lumen.active_project`), not
localStorage, so server components can scope their queries during render. With
localStorage the server would render blind and every page would need a client
round-trip. If the cookie points at something archived or deleted, the app falls
back to the most recently updated project.

Prisma 7 note: connection URLs are **not** permitted in `schema.prisma`. Migrate
reads them from `prisma.config.ts`; the runtime client connects through the
`pg` driver adapter configured in `src/lib/db.ts`.

---

## Phase status

**Built and verified**

- Architecture, route groups, component layer, dark-first design system
- Prisma schema and client, pooled connection, health probe
- Environment validation, error taxonomy, structured logging
- Project management end-to-end: list, create, edit, archive, restore, delete
  with typed confirmation, and an active project selector
- First-run onboarding: a four-step wizard that reuses the same validated write
  as the full form, guarded so it cannot be re-entered once a project exists
- Business onboarding per project: a seven-step interview with autosave, resume,
  skippable optional fields and layered validation, plus a structured Business
  Profile page
- Overview dashboard: six status cards, business snapshot, derived next actions,
  and honest empty states for every area with no data source yet
- AI core infrastructure: provider-agnostic layer, bounded retries, timeouts,
  structured JSON output, project-scoped context, and run logging
- LUMEN Assistant: project-scoped chat with structured answers, conversation
  persistence, and required confidence/assumption/missing-data disclosure
- ATLAS strategy agent: fourteen-section marketing strategy with per-section
  editing, single-section rewrites, immutable version history and restore
- PULSE audience agent: segments, ICPs and personas with evidence labelling,
  manual authoring, editing, deletion and side-by-side comparison
- SCOUT market intelligence: manual competitor records and grounded analysis
  that cites recorded evidence, inference and unknowns separately
- MUSE content agent: platform-aware generation of hooks, bodies and CTAs, with
  a manual editor, filters and an editorial status lifecycle
- Content calendar: month, week and list views, rescheduling, and dated plan
  generation where the server computes the schedule
- ORBIT campaign agent: objective, offer, channels, budget split, messaging,
  funnel and KPI framework, as planning objects with no ad platform attached
- Marketing budget planner: interactive allocation that always totals the
  budget, with AI suggestions carrying why, role, risk and priority
- Manual analytics: hand-entered rows with CTR, CPC, CPL, conversion rate, CAC
  and ROAS derived on read, plus channel, campaign, funnel and time views
- ASCEND growth agent: recommendations with impact, effort and confidence that
  is clamped server-side against the evidence actually on record
- ProjectContextBuilder now reads every module, closing the intelligence loop
- Growth experiments: hypothesis-first records that cannot be completed without
  a result and a learning, closing the loop back into AI context
- Smart agent routing: the assistant picks the specialist, and anything that
  would create a record is shown before it runs
- Local settings and backup: install defaults, read-only AI status with a
  connection test, per-project data clearing, and versioned export/restore
- Design audit: measured contrast fix across 69 usages, plus shared provenance
  badge and section heading replacing per-module copies
- Production audit: dead code removed, boundaries completed, full verification
- 534 end-to-end tests passing across seventeen suites
- Empty, validation, error and loading states on every project surface

**Not built (by design)**

- No users, accounts, sign-in or workspaces — LUMEN is a local single-user tool
- Data ingestion, metrics, channels, reporting
- Content-Security-Policy is intentionally absent until third-party scripts are
  known — a permissive placeholder CSP looks like coverage that is not there

**Streaming changes how status codes work — known, documented behaviour**

Every page under a `loading.tsx` boundary streams, and a streamed response has
already sent its headers. Two consequences, both documented by Next.js and both
asserted by the test suite rather than worked around:

- `notFound()` renders the not-found UI but the response stays **200**, not 404.
  Next compensates with `<meta name="robots" content="noindex">`. Unmatched
  routes, which never begin streaming, still return a real 404.
- `redirect()` emits `<meta http-equiv="refresh" content="1;url=…">` in the body
  instead of a 3xx. Browsers follow it; `curl` will not without inspecting the
  body.

If a true 404 or 3xx is ever needed — for compliance or analytics — the check has
to run in `proxy.ts`, before the body streams.

### Content (MUSE)

`/content` is the content workspace: generate for one platform and format at a
time, filter by platform and status, edit or add pieces by hand.

**Generation always appends.** Unlike PULSE and SCOUT there is no replace rule,
because content is cumulative — a second batch of posts does not supersede the
first, and silently deleting last week's drafts would be indefensible. Removing
content is an explicit act.

`hook`, `body` and `cta` are separate columns rather than one blob, because they
are judged and reused independently: a good hook on a weak body is only a fixable
problem if the two are addressable. The requested platform is enforced over
whatever the model returns, so an item cannot be filed under a platform nobody
asked for, and batch size is capped server-side.

Statuses (IDEA → DRAFT → APPROVED → SCHEDULED → PUBLISHED) are editorial only.
LUMEN has no publishing integration; PUBLISHED records that the operator posted
it elsewhere.

### Settings and backup

`/settings` covers the five sections in the spec — General, AI, Data, Backup,
Appearance — and is the only page that works with no project selected, because
these are properties of the install.

**A backup contains no secrets, by construction rather than by filtering.** API
keys live in the environment and never touch the database, so they cannot reach
an export. Tests assert the exported bytes contain no `sk-ant-`, no
`ANTHROPIC_API_KEY` and no `DATABASE_URL`. The AI section reports whether a key
is *present* and never its value; there is no code path that returns it.

**A restore validates its version before touching anything.** An archive from a
newer build may describe tables this one lacks, and importing optimistically
would half-restore and then fail — leaving the install as neither backup nor
original. Version, shape and JSON validity are all checked first, then the whole
restore runs in a transaction. A test feeds it an archive with an orphaned
foreign key and asserts the existing data survives untouched.

Restoring replaces everything, so it requires typing REPLACE, re-checked
server-side. Clearing a single project requires typing its name, the same guard
used for deletion.

The theme is read on the server and written into the first byte of HTML, so
switching to light never flashes the dark palette first — the light tokens have
been in the design system since phase 1 and are now reachable.

### Agent routing

The operator never picks a specialist. `routeRequestAction` classifies the
request into an ordered sequence of agents — ATLAS, SCOUT, PULSE, MUSE, ORBIT,
ASCEND, or the general assistant — and returns each step with a plain-language
reason and its restated understanding of the request.

**Reading is separated from writing.** "What are my weaknesses?" is answered in
the conversation. "Write me a strategy" would create a strategy version, so the
route is *shown first* — which agents, why, and what each would produce — and
nothing runs until the operator confirms. A chat message should not silently
produce a campaign. Routing itself writes nothing; tests assert that six routing
calls create zero strategies, segments and campaigns.

**A failed step stops the rest.** Steps are ordered because each depends on the
last, so continuing past a failed audience generation would build a strategy on
nothing. What succeeded is kept and reported, with a link to each result.

A mock-provider bug found here is worth recording: the mock originally matched
routing keywords against the entire prompt, which includes the project context —
and the business profile contains `targetCustomers`, so every request matched
"customer" and routed to PULSE. It now reads only the request line. The bug was in
the test double, not the router, but it would have hidden four broken routes.

### Experiments

`/growth/experiments` records what was tried and what it taught. A recommendation
becomes an experiment in one click — its insight becomes the hypothesis and its
action becomes the action, because that is already what those fields are.

**An experiment cannot be completed without a result and a learning.** Only
completed experiments carrying a learning are read back into project context, so
allowing a silent completion would let the feedback loop appear to work while
doing nothing. The rule is enforced on both paths — the form and the status
shortcut — and a completed experiment that somehow has no learning is flagged in
the UI rather than hidden.

The loop is verified end to end: a test records a learning and then asserts that
ASCEND's confidence ceiling rises to HIGH as a result, with no analytics rows
present.

**This is context reuse, not training.** LUMEN fine-tunes nothing; it re-reads
what the operator wrote down. The page says so in plain text rather than letting
the loop imply a capability the product does not have.

Deleting a recommendation clears the link but keeps the experiment: the advice
was an opinion, the experiment is a record of work actually done.

### Growth (ASCEND)

`/growth` is where the loop closes. ASCEND is the only agent that reads
everything: profile, strategy, audience, competitors and insights, content,
campaigns, recorded performance and past experiment learnings.

**Confidence is capped by evidence, not claimed by the model.** A recommendation
reads as authoritative whether it rests on thirty days of measured performance or
on a business description alone, so `maxConfidence()` computes a ceiling from
what the gathered context actually contains — recorded analytics or experiment
learnings earn HIGH, a strategy or defined segments earn MEDIUM, a profile alone
earns LOW — and `clampConfidence()` enforces it. When a claim is reduced the
reason says so, and the UI reports how many were capped rather than adjusting
them silently. The mock provider always claims HIGH, so all three ceilings are
exercised by tests rather than assumed.

**Regeneration never erases a decision.** Only untouched `OPEN` AI
recommendations are replaced; anything accepted, started, completed, dismissed or
hand-written survives.

Impact, effort and confidence are shown side by side rather than collapsed into a
score, because the trade-off between them is what actually decides the next move.

### Context

`ProjectContextBuilder` now returns real data for every source. A source with no
data resolves to `empty` with wording that prevents absence being read as
evidence — "no campaigns have been recorded" is a fact about the records, not
about the business. The analytics slice carries an explicit note that null means
"not recorded, never zero", so the null-safe rule survives the trip into a prompt.

### Analytics

`/analytics` is manual entry only. **No external API is connected and nothing is
synced** — every number was typed in by the operator, and rows are marked
`MANUAL` so that when imports arrive later the distinction never has to be
reconstructed.

**A ratio with no denominator is `null`, never zero.** This is the rule the whole
module is built on. A CTR of 0% means nobody clicked; a CTR of null means we
cannot know. Collapsing the second into the first invents a data point saying the
campaign failed when in fact nothing was measured. `safeDivide()` guards a missing
numerator, a missing denominator and a zero denominator, and every unknown renders
as an em dash in muted styling — tests assert both directions, that an unknowable
CPC is dashed and a computable CTR is not.

Derived metrics are **never stored**, only computed on read, so a ratio can never
disagree with the numbers underneath it. A test asserts the table has no `ctr`,
`cpc`, `cpl`, `cac` or `roas` columns. Blank fields stay null through aggregation
too: "we never recorded revenue" and "revenue was zero" are different facts.

Rows carrying more than one currency are **not totalled** — adding dollars to
euros produces a number that looks real and means nothing — and money figures are
withheld with an explanation instead. Funnel step rates compare against the
previous *recorded* stage, so leaving one blank does not silently corrupt the next.

### Budget

`/budget` is the interactive planner. The spec's hard rule — *the total
allocation must always equal the total budget* — is enforced by `balanceLines()`
on every write, so a stored plan cannot be internally inconsistent whether it
came from a suggestion, manual entry or an edit. A client-side check is a
courtesy; the server-side one is the guarantee.

**The planner does not silently rebalance while you type.** Auto-adjusting the
other lines when one changes fights the operator and makes the numbers feel
haunted. Instead it shows exactly how much is unallocated or overcommitted and
offers one click to settle it — then the server balances on save regardless.
Amounts are authoritative and percentages are derived, because the operator
edits money, not proportions.

**Suggestions are proposals, not decisions.** `suggestBudgetAction` returns lines
without saving, so "suggest" stays distinguishable from "commit". Categories the
operator excluded are dropped before balancing, so a suggestion cannot spend on
something they ruled out. Every AI line carries why, role, risk and priority —
a number without them is a guess with a decimal point — and the agent is
forbidden from promising ROI or any outcome.

### Campaigns (ORBIT)

`/campaigns` holds campaign plans. **LUMEN connects to no ad platform**: nothing
here launches, spends or touches a live campaign, and `ACTIVE` records that the
operator is running it on their own accounts. The page says so in plain text.

**The model proposes proportions; the server computes the money.** Models
routinely return budget splits that sum to 97% or 103%, and a budget that does
not add up is worse than no budget. `normaliseAllocation()` rescales percentages
to exactly 100 and distributes the amounts so the parts sum to the whole, pushing
the rounding remainder onto the largest line. Changing a campaign's total
re-derives the split from the existing shares, so it cannot drift out of sync.
The mock provider deliberately returns 97% so the normalisation is exercised
rather than assumed.

**ORBIT never predicts a result.** The KPI schema has `metric` and `why` and no
target field, so a predicted value cannot be stored even if a model returned one
— targets are the operator's to set from their own history.

### Content calendar

`/content/calendar` gives month, week and list views over the same items, with
platform and status filters.

**The model writes the content; the server computes the dates.** Language models
are unreliable at calendar arithmetic — they skip weekends inconsistently,
miscount intervals and sometimes emit dates outside the requested range. So the
plan agent returns a `slot` index instead, and `buildSchedule()` derives real
dates from the range and frequency the operator chose. Slots are clamped and
de-duplicated on the way in, so a model returning slot 99, or two items for slot
3, cannot produce an undated item or steal another's date. Tests assert every
date falls inside the range, no two collide, and weekday-only frequencies never
schedule weekend work.

Validation runs before the provider is called, so a malformed range costs nothing.
Generated items land as `DRAFT` per the spec, and unscheduled items are shown in
their own tray rather than hidden — a calendar that silently omits undated drafts
would misreport how much work exists.

### Intelligence (SCOUT)

`/intelligence` holds competitor records the operator enters, and the analysis
SCOUT draws from them.

**SCOUT has no internet access, and that is a safety property rather than a
limitation.** A model asked about a named competitor will recall half-remembered
facts that are frequently wrong and always unverifiable. So competitor data is
supplied in the prompt and the schema requires every insight to carry non-empty
`evidence` — an insight that cites nothing cannot be stored. The prompt tells the
model explicitly to ignore any recollection of a company it thinks it recognises.

**Analysis is refused when there is nothing to analyse.** With no competitor
carrying detail beyond a name, generation stops before the provider is called.
Without that refusal the model would be asked for competitive insight from an
empty set, and it would oblige by inventing one.

The spec's three-way distinction is structural, not stylistic: each insight
stores `evidence` (what you recorded), `assumptions` (what SCOUT reasoned) and
`unknowns` (what nobody knows), and the UI shows all three together.

### Audience (PULSE)

`/audience` holds segments, each with one ICP and up to three personas.

**The spec's hardest constraint — do not invent precise demographic facts —
is enforced by schema, not wording.** ICP attributes are label/value pairs that
each carry a `basis` of `stated` or `inferred`, so a model cannot emit "ages
25–34, household income $80k" without also declaring it as reasoning. The UI
shows that badge on every attribute. Each segment additionally carries a required
`evidenceNote` saying what it rests on.

**Regeneration cannot destroy human work.** PULSE replaces only segments it
produced (`source: AI`). Editing an AI segment flips it to `EDITED`, which is
treated as adoption, and manual segments are `MANUAL` — neither is ever touched
by a regeneration. That is a property of the query, not a confirmation dialog
someone has to read.

### Strategy (ATLAS)

`/strategy` holds one marketing strategy per project, in the fourteen sections
defined by the product spec. The section list lives in `src/lib/strategy/agent.ts`
and everything else derives from it — schema, prompt, editor, ordering — so a
section cannot exist in one place and not another.

**AI output never overwrites anything.** `Strategy` is a container that stores no
content; every word lives in an immutable `StrategyVersion`, and the container
only records which version is current. Generating, or rewriting a single section,
appends a new version and moves the pointer. A hand-edited section therefore
survives a regeneration of a different section, and any earlier version can be
restored — nothing is deleted.

Manual edits are the exception: they update the current version in place, because
they are deliberate and a version per keystroke would bury the history that
matters. Each section carries its own provenance (`ATLAS` or `Yours`) shown in the
UI, so an operator returning a week later can see which sentences the model wrote.

Generation is **gated on a complete business profile**. A strategy written from
three known facts would look exactly as authoritative as one written from twenty,
which is the specific failure this product must not have.

### Assistant

`/assistant` is the conversational entry point, always scoped to the active
project. Threads belong to a project, and a conversation id from another project
cannot be attached to or read — the project is part of the lookup, not a check
performed afterwards.

**The answer shape is enforced by schema, not by prompt wording.** `confidence`,
`confidenceReason`, `missingInformation` and `assumptions` are required fields,
so a model cannot skip hedging when the profile is thin; it has to state what it
did not know. The UI gives those equal weight to the advice, because burying
them would let a low-confidence answer read like a certain one — the specific
failure this product must not have.

The user's message is persisted before the model is called, so a provider
failure never costs them their typing: the thread keeps the question, shows the
error, and the input is restored for a retry.

### AI infrastructure

Provider-agnostic and server-side only. No AI key is ever readable from a client
bundle: provider selection lives in server env, and `getServerEnv()` throws if
called in the browser.

**Five providers, one contract.** `mock` (no key, used by every test), `gemini`,
`groq` and `openrouter` (all free to start, no credit card) and `anthropic`
(paid). Adding each of Gemini, Groq and OpenRouter required one file and one
line in the registry — every agent, the runtime, the retries and the whole test
suite were untouched, which is what the abstraction was for. Gemini and Groq are
both put into native JSON mode, so the model is constrained to parseable output
rather than asked politely in a prompt; OpenRouter is not, because it fronts
hundreds of models across dozens of vendors and JSON-mode support is not
universal across them — it relies on the same prompt instruction and
salvage-then-validate parsing Anthropic does. OpenRouter is also the odd one
out in what `AI_MODEL` means: for the others it is optional pinning of an
otherwise-fixed model, but for OpenRouter it is the actual choice of which of
its hundreds of models to call.

Which key is required is validated at boot against the selected provider, so a
missing key fails on startup rather than when someone presses "generate
strategy".

**Agents are declarations, not classes.** An agent states what context it needs,
what shape it returns, and how to build its prompt. The runtime
(`src/lib/ai/runtime.ts`) owns everything else — context gathering, per-attempt
timeout with a real abort, bounded exponential backoff with jitter, schema
validation, and run persistence — so reliability cannot drift between agents.

**Retries branch on one question: could trying again plausibly help?** Transient
failures (429, 5xx, network, timeout, unparseable output) retry; a malformed
request does not, because repeating a known-bad call just spends the budget four
times. An `AgentRun` row is written *before* the first attempt, so a process that
dies mid-call leaves evidence rather than nothing.

**Provenance travels with context.** Every slice is tagged `user-provided`,
`imported`, `ai-inferred` or `unknown` (Master Document §9), and the prompt
instructs the model to treat inferences as hypotheses. Sources with no table yet
resolve to `unavailable` with a note — an agent must be able to tell "this
business runs no campaigns" from "campaigns do not exist yet".

`MockProvider` is a first-class part of the abstraction: it scripts failures,
timeouts and malformed output deterministically, so the whole pipeline is tested
with no API key, no network and no cost (`scripts/e2e-ai.sh`). The self-test
endpoint at `/api/ai/selftest` is hard-gated to the mock provider.

### Overview dashboard

The dashboard answers two questions: what is happening with this business, and
what to work on next. Both answers are derived from stored rows in
`src/lib/dashboard/state.ts` — the page itself computes nothing.

**Nothing is fabricated.** Only two areas have a real data source today: the
business snapshot, and Audience (derived from `targetCustomers` and
`targetMarkets`). The other five report one of two honest states — `locked`
("needs a complete business profile", with a working CTA) or `unbuilt` ("ships in
a later phase", with no CTA at all, because a button leading to a route that does
not exist is worse than no button). A rendered `0 campaigns` would read as
failure rather than absence, so it is never rendered; unset fields say "Not set".
The test suite asserts the absence of invented metrics.

**Next actions are derived, not authored.** Each entry corresponds to a column
that is genuinely empty and states why it matters, ordered smallest-useful-step
first. When nothing is outstanding the list says so rather than inventing busywork.

Adding a real module later means giving it a data source in `config/modules.ts`
and a branch in `buildDashboardState` — the cards, sections and actions follow.

### Business onboarding

`/projects/[id]/onboarding` is a seven-step interview. Three properties are worth
knowing before changing it:

**One form, one action.** Every transition — autosave, next, back, finish — is a
submission of the same form carrying an `intent` field, handled by
`onboardingStepAction`. The current step comes back from the server rather than
living in client state, so there is one authority for "where am I". This keeps
the whole flow on the progressive-enhancement path: it works without client
JavaScript, and it can be driven end-to-end over plain HTTP, which is how
`scripts/e2e-business-profile.sh` tests it.

**Every field stays mounted.** Hidden steps use `hidden`, not unmounting, so any
save posts a complete snapshot, going backwards never loses input, and the final
submit carries everything.

**Validation is layered, deliberately.** Autosave writes through a lenient schema
that drops malformed values instead of rejecting — it fires mid-typing, and
losing a keystroke to a validation error is worse than storing a partial answer.
Moving forward runs that step's strict schema. Finishing re-runs *every* step's
schema, because a resumed session can start on any step and the final gate cannot
assume the earlier ones ran. `lastStep` is monotonic so navigating back never
rewinds the resume position.

### First-run onboarding

`/onboarding` is the first-run path. It is `force-dynamic`: its only job is to
branch on how many projects exist, and it reads that from the database without
touching cookies or headers, so without forcing dynamic Next would prerender the
check and freeze it at build-time state.

The wizard keeps every field mounted (hidden steps use `hidden`, not unmounting)
so the final submit posts a complete FormData, going backwards never loses input,
and the whole thing reuses `createProjectAction` unchanged. Per-step validation
runs against the same Zod schema the server uses, so the wizard cannot advance
into a state the server will reject. `/dashboard` redirects to it while the
install is empty; it redirects back once any project exists.

**Notes for later phases**

- Next.js 16 renamed `middleware.ts` to `proxy.ts` (Node.js runtime only).
- Replace the `console.error` calls in the `error.tsx` boundaries with a real
  telemetry client.
- `prisma/sql/schema.sql` is a hand-written convenience for environments where
  the Prisma CLI cannot reach its engine download. `schema.prisma` is the source
  of truth — use `npm run db:push`.

---

## A note on `AGENTS.md`

`AGENTS.md` and `CLAUDE.md` are generated and re-added by `next dev` itself
(see `node_modules/next/dist/server/lib/generate-agent-files.js`). They point
coding agents at the version-accurate docs bundled in
`node_modules/next/dist/docs/`. Deleting them only recreates an uncommitted
change; commit them to keep the tree clean.


## Google integrations

Lumen can connect a project to Google Analytics 4 and Google Search Console with read-only OAuth access. Configure `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `INTEGRATION_ENCRYPTION_KEY`, then register `/api/integrations/google/callback` as the OAuth redirect URI. See `GLOBAL_LAUNCH_PHASE_3.md` for the deployment checklist.

## Global growth engine

Lumen now includes a deterministic Growth Pulse that compares two 14-day windows of recorded performance and feeds material changes into ASCEND and CADENCE. The product loop is designed to move from data to diagnosis to action rather than stopping at dashboards.
