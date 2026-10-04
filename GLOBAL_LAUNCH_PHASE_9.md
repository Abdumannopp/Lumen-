# Lumen — Global Launch Phase 9

## Billing + Global SaaS Hardening

### Objective

Make Lumen's paid lifecycle safe for a global launch: provider state must remain correct under retries and out-of-order delivery, monthly AI allowances must reset at the real billing period boundary, customers must be able to manage billing without a support ticket, and global settings must reject invalid locale/currency/timezone values.

### Shipped

#### 1. Paddle event ordering is durable

- `Subscription.lastEventOccurredAt` stores the latest Paddle `occurred_at` applied to the workspace subscription.
- `WebhookEvent.occurredAt` preserves the provider event timestamp for reconciliation.
- Subscription updates run inside a database transaction.
- Older/out-of-order events are acknowledged and ignored rather than rolling subscription state backwards.
- A second provider subscription cannot silently replace an active Lumen subscription.

Paddle explicitly documents that webhook delivery can be out of order and recommends comparing `occurred_at` before applying state. It also recommends a reconciliation process for missed events. See the implementation note in `GLOBAL_LAUNCH_PHASE_9.md` and the Paddle provisioning guidance. citeturn309763search1turn309763search3

#### 2. Billing period and quota are synchronized

- Paddle `current_billing_period.starts_at` and `ends_at` are stored on the subscription/entitlement path.
- A new billing period resets the AI usage meter to `0` exactly once.
- The plan limit changes without granting extra usage from the previous period.
- Canceled/paused states still avoid destructive account deletion.

#### 3. Only the configured Lumen price can grant paid access

- A verified Paddle event for an unexpected price is recorded as ignored rather than granting the Lumen entitlement.
- This protects against catalog misconfiguration and prevents an unrelated Paddle price from accidentally provisioning the product.

#### 4. Customer self-service billing

Owners with an optional server-side `PADDLE_API_KEY` can open a fresh Paddle customer-portal link from Settings.

- The API key never reaches the browser.
- The management URL is fetched on demand instead of stored, because Paddle documents the portal token as temporary.
- The server pins `Paddle-Version: 1` and uses an environment-specific API base URL.
- The portal URL is accepted only when it is an HTTPS Paddle buyer-portal URL.
- Requests have a 5-second default timeout.

Paddle documents that authenticated management links are temporary and should not be stored; it also requires a server-side API key for the customer-portal session capability. citeturn814309search0turn814309search4turn235553search0

#### 5. Global settings validation

- Currency must be one of Lumen's supported ISO currency codes.
- Timezone is validated against IANA/Intl support instead of accepting arbitrary strings.
- Locale is currently limited to the locales Lumen actually renders: `en-US` and `en-GB`.

This keeps stored settings globally valid without pretending Lumen has translations it does not yet ship.

#### 6. Production configuration contract

- Optional `PADDLE_API_KEY` support is documented as server-only.
- `PADDLE_API_TIMEOUT_MS` is bounded and defaults to 5 seconds.
- Paddle API key prefixes are checked against sandbox/live environment configuration at boot.

### Billing state model

`TRIALING / ACTIVE / PAST_DUE` can use the paid allowance according to product policy. `PAST_DUE` intentionally keeps access while Paddle is retrying collection. `PAUSED` and `CANCELED` fall back to the trial allowance without deleting the workspace.

### Verification

Passed locally in the build artifact environment:

- TypeScript parser/transpile checks for all changed TS/TSX files.
- `bash -n` for the billing end-to-end script.
- Source-level verification of schema, migration, price-guard, event-ordering and portal-link hardening.
- No real Paddle API key or customer data was included in the release artifact.

Full `npm build` / `npm typecheck` remains environment-dependent because the release container does not contain installed `node_modules` or a generated Prisma client.

### Recommended go-live configuration

For live billing:

1. Create the live Paddle product/price and replace the sandbox price id.
2. Create a live notification destination for the production webhook endpoint.
3. Set a live client token and `PADDLE_ENVIRONMENT=production`.
4. Optionally create a narrowly scoped Paddle API key for customer-portal management and set `PADDLE_API_KEY`.
5. Run a real sandbox purchase first and confirm webhook, entitlement, renewal, past-due and cancellation flows before switching live credentials.

Paddle's current go-live guidance requires separate sandbox/live credentials and catalog configuration, and recommends signature verification plus webhook handling designed for retries. citeturn235553search2turn235553search1

### Next phase

**Phase 10 — AI Evaluation & Learning Loop**

Turn Lumen's growing product/outcome data into a measured AI-quality system: recommendation acceptance, task completion, outcome capture, repeated recommendation detection, evidence quality, and model/provider comparisons.
