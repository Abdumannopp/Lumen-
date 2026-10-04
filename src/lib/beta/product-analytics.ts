import "server-only";

import { db } from "@/lib/db";
import { requireWorkspace } from "@/lib/auth/dal";
import { isFounderEmail } from "@/lib/beta/invites";
import { PRODUCT_EVENTS } from "@/lib/product-analytics/events";

const CORE_EVENTS = [
  PRODUCT_EVENTS.ANALYTICS_METRIC_SAVED,
  PRODUCT_EVENTS.RECOMMENDATIONS_GENERATED,
  PRODUCT_EVENTS.RECOMMENDATION_STATUS_CHANGED,
  PRODUCT_EVENTS.WEEKLY_PLAN_GENERATED,
  PRODUCT_EVENTS.TASK_COMPLETED,
  PRODUCT_EVENTS.TASK_SKIPPED,
  PRODUCT_EVENTS.TASK_OUTCOME_RECORDED,
  PRODUCT_EVENTS.EXPERIMENT_CREATED,
  PRODUCT_EVENTS.EXPERIMENT_COMPLETED,
] as const;

const FUNNEL_EVENTS = [
  PRODUCT_EVENTS.PROJECT_CREATED,
  PRODUCT_EVENTS.ONBOARDING_COMPLETED,
  PRODUCT_EVENTS.RECOMMENDATIONS_GENERATED,
  PRODUCT_EVENTS.WEEKLY_PLAN_GENERATED,
  PRODUCT_EVENTS.TASK_COMPLETED,
  PRODUCT_EVENTS.TASK_OUTCOME_RECORDED,
  PRODUCT_EVENTS.SUBSCRIPTION_ACTIVE,
] as const;

function addDays(date: Date, days: number) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

function startOfDay(date: Date) {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function startOfWeek(date: Date) {
  const copy = startOfDay(date);
  const day = copy.getDay();
  copy.setDate(copy.getDate() + (day === 0 ? -6 : 1 - day));
  return copy;
}

function weekKey(date: Date) {
  return startOfWeek(date).toISOString().slice(0, 10);
}

function pct(n: number, d: number) {
  return d === 0 ? null : Math.round((n / d) * 100);
}

function median(values: number[]) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

export interface ProductAnalyticsView {
  windowDays: number;
  funnel: { key: string; label: string; workspaces: number; rateFromCreated: number | null }[];
  activation: { created: number; onboardingCompleted: number; activationRate: number | null; medianDaysToPlan: number | null };
  retention: {
    cohort: string; activated: number;
    eligibleW1: number; retainedW1: number; w1Rate: number | null;
    eligibleW2: number; retainedW2: number; w2Rate: number | null;
    eligibleW4: number; retainedW4: number; w4Rate: number | null;
  }[];
  eventVolume: { name: string; count: number }[];
  acquisition: { key: string; source: string; medium: string; campaign: string; signups: number; activated: number; paid: number; activationRate: number | null; paidRate: number | null }[];
}

export async function getProductAnalytics(): Promise<ProductAnalyticsView | null> {
  const context = await requireWorkspace();
  if (!isFounderEmail(context.email)) return null;

  const now = new Date();
  const windowStart = addDays(now, -90);

  const events = await db.productEvent.findMany({
    where: {
      createdAt: { gte: windowStart },
      eventName: { in: [...FUNNEL_EVENTS, ...CORE_EVENTS, PRODUCT_EVENTS.SIGNUP_COMPLETED, PRODUCT_EVENTS.SIGNUP_ATTRIBUTED] },
    },
    select: { workspaceId: true, eventName: true, createdAt: true, metadata: true },
    orderBy: { createdAt: "asc" },
  });

  const workspaces = await db.workspace.findMany({
    where: { createdAt: { gte: windowStart } },
    select: { id: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });

  const workspaceIds = new Set(workspaces.map((row) => row.id));
  const eventWorkspaceSets = new Map<string, Set<string>>();
  const eventsByWorkspace = new Map<string, typeof events>();

  for (const event of events) {
    if (!workspaceIds.has(event.workspaceId)) continue;
    const set = eventWorkspaceSets.get(event.eventName) ?? new Set<string>();
    set.add(event.workspaceId);
    eventWorkspaceSets.set(event.eventName, set);

    const list = eventsByWorkspace.get(event.workspaceId) ?? [];
    list.push(event);
    eventsByWorkspace.set(event.workspaceId, list);
  }

  const labels: Record<string, string> = {
    [PRODUCT_EVENTS.PROJECT_CREATED]: "Project created",
    [PRODUCT_EVENTS.ONBOARDING_COMPLETED]: "Onboarding completed",
    [PRODUCT_EVENTS.RECOMMENDATIONS_GENERATED]: "Growth run generated",
    [PRODUCT_EVENTS.WEEKLY_PLAN_GENERATED]: "Weekly plan generated",
    [PRODUCT_EVENTS.TASK_COMPLETED]: "Task completed",
    [PRODUCT_EVENTS.TASK_OUTCOME_RECORDED]: "Outcome recorded",
    [PRODUCT_EVENTS.SUBSCRIPTION_ACTIVE]: "Paid subscription active",
  };

  const created = workspaces.length;
  const funnel = FUNNEL_EVENTS.map((eventName) => {
    const count = eventWorkspaceSets.get(eventName)?.size ?? 0;
    return { key: eventName, label: labels[eventName] ?? eventName, workspaces: count, rateFromCreated: pct(count, created) };
  });

  const onboardingEvents = eventWorkspaceSets.get(PRODUCT_EVENTS.ONBOARDING_COMPLETED) ?? new Set<string>();
  const activations: { workspaceId: string; at: Date }[] = [];
  const planDelayDays: number[] = [];

  for (const workspaceId of onboardingEvents) {
    const list = eventsByWorkspace.get(workspaceId) ?? [];
    const activation = list.find((e) => e.eventName === PRODUCT_EVENTS.ONBOARDING_COMPLETED);
    if (!activation) continue;
    activations.push({ workspaceId, at: activation.createdAt });
    const plan = list.find((e) => e.eventName === PRODUCT_EVENTS.WEEKLY_PLAN_GENERATED && e.createdAt >= activation.createdAt);
    if (plan) planDelayDays.push(Math.max(0, Math.round((plan.createdAt.getTime() - activation.createdAt.getTime()) / 86_400_000)));
  }

  const cohorts = new Map<string, typeof activations>();
  for (const activation of activations) {
    const key = weekKey(activation.at);
    const list = cohorts.get(key) ?? [];
    list.push(activation);
    cohorts.set(key, list);
  }

  const retention = [...cohorts.entries()].sort((a, b) => a[0].localeCompare(b[0])).slice(-8).map(([cohort, members]) => {
    const measure = (offset: number) => {
      const eligible = members.filter(({ at }) => now.getTime() >= addDays(at, offset).getTime());
      const retained = eligible.filter(({ workspaceId, at }) => {
        const from = addDays(at, offset);
        const to = addDays(at, offset + 7);
        return (eventsByWorkspace.get(workspaceId) ?? []).some((event) =>
          (CORE_EVENTS as readonly string[]).includes(event.eventName) && event.createdAt >= from && event.createdAt < to,
        );
      });
      return { eligible: eligible.length, retained: retained.length };
    };

    const w1 = measure(7);
    const w2 = measure(14);
    const w4 = measure(28);
    return {
      cohort,
      activated: members.length,
      eligibleW1: w1.eligible, retainedW1: w1.retained, w1Rate: pct(w1.retained, w1.eligible),
      eligibleW2: w2.eligible, retainedW2: w2.retained, w2Rate: pct(w2.retained, w2.eligible),
      eligibleW4: w4.eligible, retainedW4: w4.retained, w4Rate: pct(w4.retained, w4.eligible),
    };
  });


  const attributedEvents = events.filter((event) => event.eventName === PRODUCT_EVENTS.SIGNUP_ATTRIBUTED);
  const eventNamesByWorkspace = new Map<string, Set<string>>();
  for (const event of events) {
    const set = eventNamesByWorkspace.get(event.workspaceId) ?? new Set<string>();
    set.add(event.eventName);
    eventNamesByWorkspace.set(event.workspaceId, set);
  }

  const acquisitionGroups = new Map<string, { source: string; medium: string; campaign: string; workspaceIds: Set<string> }>();
  for (const event of attributedEvents) {
    const metadata = event.metadata && typeof event.metadata === "object" ? (event.metadata as Record<string, unknown>) : {};
    const source = typeof metadata.source === "string" && metadata.source ? metadata.source : "unknown";
    const medium = typeof metadata.medium === "string" && metadata.medium ? metadata.medium : "unknown";
    const campaign = typeof metadata.campaign === "string" && metadata.campaign ? metadata.campaign : "—";
    const key = `${source}::${medium}::${campaign}`;
    const group = acquisitionGroups.get(key) ?? { source, medium, campaign, workspaceIds: new Set<string>() };
    group.workspaceIds.add(event.workspaceId);
    acquisitionGroups.set(key, group);
  }

  const acquisition = [...acquisitionGroups.values()]
    .map((group) => {
      const signups = group.workspaceIds.size;
      const activated = [...group.workspaceIds].filter((id) => eventNamesByWorkspace.get(id)?.has(PRODUCT_EVENTS.ONBOARDING_COMPLETED)).length;
      const paid = [...group.workspaceIds].filter((id) => eventNamesByWorkspace.get(id)?.has(PRODUCT_EVENTS.SUBSCRIPTION_ACTIVE)).length;
      return {
        key: `${group.source}::${group.medium}`,
        source: group.source,
        medium: group.medium,
        campaign: group.campaign,
        signups,
        activated,
        paid,
        activationRate: pct(activated, signups),
        paidRate: pct(paid, signups),
      };
    })
    .sort((a, b) => b.signups - a.signups)
    .slice(0, 8);

  const eventVolume = [...eventWorkspaceSets.keys()]
    .map((name) => ({ name, count: events.filter((event) => event.eventName === name).length }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  return {
    windowDays: 90,
    funnel,
    activation: {
      created,
      onboardingCompleted: onboardingEvents.size,
      activationRate: pct(onboardingEvents.size, created),
      medianDaysToPlan: median(planDelayDays),
    },
    retention,
    eventVolume,
    acquisition,
  };
}
