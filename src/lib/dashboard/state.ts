import "server-only";

import { MODULES, type ModuleId } from "@/config/modules";
import type { BusinessContext } from "@/lib/business-profile/queries";
import type { DashboardSnapshot } from "@/lib/dashboard/queries";

/**
 * Dashboard state.
 *
 * Every value here is derived from rows that actually exist. A module with
 * nothing in it reads as `empty` and links to the page where the operator can
 * fill it; a module that cannot be used yet reads as `locked` and says what is
 * blocking it. Neither is ever reported as a fabricated zero, because "0
 * campaigns" reads as failure rather than absence.
 *
 * The `unbuilt` status is kept for a module with no data source at all. Nothing
 * uses it today — every area on the dashboard is backed by a real table — but
 * removing it would make a future half-built module look empty rather than
 * absent, which is the exact dishonesty this file exists to prevent.
 */

export type ModuleStatus =
  /** Real data exists and is in good shape. */
  | "ready"
  /** The module exists and is usable, but nothing has been added. */
  | "empty"
  /** Blocked on something the person can fix right now. */
  | "locked"
  /** No data source exists in this build. */
  | "unbuilt";

export interface ModuleState {
  id: ModuleId;
  status: ModuleStatus;
  /** One line describing the current state, never a fabricated metric. */
  detail: string;
  /** Present only when the action actually leads somewhere. */
  href?: string;
  cta?: string;
}

export interface NextAction {
  id: string;
  label: string;
  reason: string;
  href: string;
  /** Ordered: the smallest useful next step comes first. */
  priority: "now" | "soon";
}

export interface DashboardState {
  modules: ModuleState[];
  nextActions: NextAction[];
  /** True when the profile is complete and no gap is left to close. */
  awaitingFuturePhases: boolean;
}

const plural = (count: number, singular: string, many = `${singular}s`) =>
  `${count} ${count === 1 ? singular : many}`;

export function buildDashboardState(
  context: BusinessContext,
  snapshot: DashboardSnapshot,
): DashboardState {
  const { project, business, completion } = context;
  const profileComplete = completion.isComplete;
  const onboardingHref = `/projects/${project.id}/onboarding`;

  /**
   * Everything downstream reads the business profile as its context, so an
   * incomplete profile blocks a module that holds nothing yet. A module that
   * already has records is never shown as blocked — the work exists, and hiding
   * it behind a setup prompt would be a lie about the operator's own data.
   */
  const blocked = (): ModuleState["status"] => (profileComplete ? "empty" : "locked");

  const byId: Record<ModuleId, ModuleState> = {
    strategy: snapshot.strategy.exists
      ? {
          id: "strategy",
          status: "ready",
          detail: `Version ${snapshot.strategy.version} is current.`,
          href: "/strategy",
          cta: "Open strategy",
        }
      : {
          id: "strategy",
          status: blocked(),
          detail: profileComplete
            ? "No strategy generated yet."
            : "Needs a complete business profile.",
          href: profileComplete ? "/strategy" : onboardingHref,
          cta: profileComplete ? "Create strategy" : "Complete profile",
        },

    audience:
      snapshot.audience.segments > 0
        ? {
            id: "audience",
            status: "ready",
            detail: `${plural(snapshot.audience.segments, "segment")} defined.`,
            href: "/audience",
            cta: "Open audience",
          }
        : {
            id: "audience",
            status: business.targetCustomers ? blocked() : "locked",
            detail: business.targetCustomers
              ? "Customers described in the profile, but no segments built yet."
              : "Nothing recorded yet.",
            href: business.targetCustomers && profileComplete ? "/audience" : onboardingHref,
            cta: business.targetCustomers && profileComplete ? "Build segments" : "Complete profile",
          },

    content:
      snapshot.content.total > 0
        ? {
            id: "content",
            status: "ready",
            detail:
              snapshot.content.scheduled > 0
                ? `${plural(snapshot.content.total, "piece")} · ${snapshot.content.scheduled} scheduled ahead.`
                : `${plural(snapshot.content.total, "piece")} · none dated yet.`,
            href: "/content",
            cta: "Open content",
          }
        : {
            id: "content",
            status: blocked(),
            detail: profileComplete
              ? "No content created yet."
              : "Needs a complete business profile.",
            href: profileComplete ? "/content" : onboardingHref,
            cta: profileComplete ? "Plan content" : "Complete profile",
          },

    campaigns:
      snapshot.campaigns.total > 0
        ? {
            id: "campaigns",
            status: "ready",
            detail:
              snapshot.campaigns.active > 0
                ? `${plural(snapshot.campaigns.total, "campaign")} · ${snapshot.campaigns.active} active.`
                : `${plural(snapshot.campaigns.total, "campaign")} · none active.`,
            href: "/campaigns",
            cta: "Open campaigns",
          }
        : {
            id: "campaigns",
            status: blocked(),
            detail: profileComplete
              ? "No campaigns planned yet."
              : "Needs a complete business profile.",
            href: profileComplete ? "/campaigns" : onboardingHref,
            cta: profileComplete ? "Plan a campaign" : "Complete profile",
          },

    analytics:
      snapshot.analytics.rows > 0
        ? {
            id: "analytics",
            status: "ready",
            detail: `${plural(snapshot.analytics.rows, "row")} entered by hand. Nothing is synced.`,
            href: "/analytics",
            cta: "Open analytics",
          }
        : {
            id: "analytics",
            status: "empty",
            // Analytics never blocks on the profile: recording what happened
            // does not depend on describing the business first.
            detail: "No performance data entered. LUMEN connects to no ad platform.",
            href: "/analytics",
            cta: "Enter results",
          },

    growth:
      snapshot.growth.total > 0
        ? {
            id: "growth",
            status: snapshot.growth.open > 0 ? "ready" : "empty",
            detail:
              snapshot.growth.open > 0
                ? `${plural(snapshot.growth.open, "open recommendation")} to act on.`
                : `${plural(snapshot.growth.total, "recommendation")}, all closed out.`,
            href: "/growth",
            cta: "Open growth",
          }
        : {
            id: "growth",
            status: blocked(),
            detail: profileComplete
              ? "No recommendations generated yet."
              : "Needs a complete business profile.",
            href: profileComplete ? "/growth" : onboardingHref,
            cta: profileComplete ? "Find opportunities" : "Complete profile",
          },
  };

  const modules = MODULES.map((module) => byId[module.id]);

  const nextActions: NextAction[] = [];

  if (!profileComplete) {
    nextActions.push({
      id: "complete-profile",
      label:
        completion.answered > 0 ? "Finish the business profile" : "Start the business profile",
      reason: `${completion.answered} of ${completion.total} required answers so far. Everything else builds on this.`,
      href: onboardingHref,
      priority: "now",
    });
  }

  // The critical path, in the order the modules actually depend on each other.
  // Each step is suggested only once the one before it exists, so the list never
  // asks for work that has nothing to build on.
  if (profileComplete) {
    if (!snapshot.strategy.exists) {
      nextActions.push({
        id: "generate-strategy",
        label: "Generate a strategy",
        reason: "ATLAS reads the profile and writes the positioning everything else works from.",
        href: "/strategy",
        priority: "now",
      });
    } else if (snapshot.audience.segments === 0) {
      nextActions.push({
        id: "build-audience",
        label: "Build audience segments",
        reason: "PULSE turns the strategy into the segments content and campaigns are aimed at.",
        href: "/audience",
        priority: "now",
      });
    } else if (snapshot.content.total === 0 && snapshot.campaigns.total === 0) {
      nextActions.push({
        id: "plan-work",
        label: "Plan a campaign or some content",
        reason: "The strategy and audience are in place — this is where the work starts.",
        href: "/campaigns",
        priority: "now",
      });
    } else if (snapshot.analytics.rows === 0) {
      nextActions.push({
        id: "record-results",
        label: "Record what the work did",
        reason:
          "Nothing is synced automatically. Growth advice stays guesswork until real numbers are entered.",
        href: "/analytics",
        priority: "now",
      });
    } else if (snapshot.growth.total === 0) {
      nextActions.push({
        id: "find-growth",
        label: "Ask ASCEND what to improve",
        reason: "There are results on record now, so recommendations can be grounded in them.",
        href: "/growth",
        priority: "now",
      });
    }
  }

  // Optional gaps worth closing — each one is a real, empty column.
  const gaps: { id: string; when: boolean; label: string; reason: string }[] = [
    {
      id: "website",
      when: !business.website,
      label: "Add the website",
      reason: "Used later to analyse your own pages.",
    },
    {
      id: "markets",
      when: business.targetMarkets.length === 0,
      label: "Set target markets",
      reason: "Scopes benchmarks and opportunities to where you actually sell.",
    },
    {
      id: "channels",
      when: business.currentMarketingChannels.length === 0,
      label: "Record current marketing channels",
      reason: "Without this, advice cannot tell you what to stop doing.",
    },
    {
      id: "competitors",
      when: business.knownCompetitors.length === 0,
      label: "List known competitors",
      reason: "Needed before any competitive comparison is meaningful.",
    },
    {
      id: "budget",
      when: business.monthlyBudget === null,
      label: "Add a monthly marketing budget",
      reason: "Determines which recommendations are realistic.",
    },
    {
      id: "voice",
      when: business.brandVoice.length === 0,
      label: "Describe the brand voice",
      reason: "Anything that writes on your behalf will need it.",
    },
  ];

  for (const gap of gaps) {
    if (!gap.when) continue;
    nextActions.push({
      id: gap.id,
      label: gap.label,
      reason: gap.reason,
      href: onboardingHref,
      priority: profileComplete ? "now" : "soon",
    });
  }

  return {
    modules,
    nextActions,
    awaitingFuturePhases: profileComplete && nextActions.length === 0,
  };
}
