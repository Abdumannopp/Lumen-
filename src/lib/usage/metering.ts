import type { WorkspaceContext } from "@/lib/auth/dal";
import type { RunAgentOptions } from "@/lib/ai/runtime";

/**
 * Attach a run to the account that pays for it.
 *
 * A one-line helper rather than three properties spelled out at thirteen call
 * sites, because the failure mode of spelling them out is a call site that
 * quietly forgets one — and a run with no workspace is a run that costs money
 * and counts against nothing.
 *
 * The context comes from `projectInWorkspace()` or `requireWorkspace()`, which
 * every AI action already calls to authorise itself. So the account being
 * charged is the account that was authorised, by construction: there is no
 * separate lookup that could disagree.
 */
export function metering(
  context: Pick<WorkspaceContext, "workspaceId" | "userId">,
  featureKey: string,
  extra: Omit<RunAgentOptions, "workspaceId" | "userId" | "featureKey"> = {},
): RunAgentOptions {
  return {
    workspaceId: context.workspaceId,
    userId: context.userId,
    featureKey,
    ...extra,
  };
}
