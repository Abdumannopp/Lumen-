import "server-only";

/**
 * The operator of an install that predates accounts.
 *
 * `scripts/migrate-sqlite-to-postgres.mjs` puts imported data in a workspace
 * owned by this placeholder, because the old database had no users at all. The
 * first real person to sign up on that install adopts it — see
 * `provisionAccount` in `src/lib/auth/actions.ts` — so a founder who migrates
 * their own data finds it waiting rather than starting empty beside it.
 *
 * The script cannot import this file (it is TypeScript, and the script depends
 * on nothing that has to compile), so the same constant is written in both
 * places. `scripts/e2e-tenancy.sh` asserts the adoption works, which is what
 * would catch them drifting apart.
 *
 * This file used to also hold `resolveWorkspaceId()`, which guessed the
 * workspace when there was no session to ask, and then briefly delegated to the
 * Data Access Layer. It is gone rather than kept: two names for "which cabinet
 * is this" meant two places to audit, and callers now ask `requireWorkspace()`
 * in `src/lib/auth/dal.ts` directly.
 */
export const LOCAL_OPERATOR_ID = "local-operator";
