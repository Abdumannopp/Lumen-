import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  Compass,
  Megaphone,
  PenLine,
  Sprout,
  Users,
} from "lucide-react";

/**
 * The six capability areas the dashboard reports on.
 *
 * Declared as data so the status cards, the next-actions list and the
 * navigation all read from one definition. Each area is backed by its own
 * table, and its status on the dashboard is counted from those rows — a module
 * holding nothing reports "nothing recorded yet" and links to the page that
 * fills it, never a fabricated zero.
 */

export type ModuleId =
  | "strategy"
  | "audience"
  | "content"
  | "campaigns"
  | "analytics"
  | "growth";

export interface ModuleDefinition {
  id: ModuleId;
  label: string;
  icon: LucideIcon;
  /** What this area will hold, in the operator's words. */
  blurb: string;
  /** Copy for the empty state once the module exists. */
  emptyTitle: string;
  /** Label for the action that would resolve the empty state. */
  cta: string;
  /** Where this module lives in the app. */
  href: string;
}

export const MODULES: ModuleDefinition[] = [
  {
    id: "strategy",
    label: "Strategy",
    icon: Compass,
    blurb: "Positioning, messaging and the plan behind the work.",
    emptyTitle: "No strategy yet",
    cta: "Create strategy",
    href: "/strategy",
  },
  {
    id: "audience",
    label: "Audience",
    icon: Users,
    blurb: "Who you sell to, and the markets you sell into.",
    emptyTitle: "No audience defined",
    cta: "Define audience",
    href: "/audience",
  },
  {
    id: "content",
    label: "Content",
    icon: PenLine,
    blurb: "What you publish, and when it goes out.",
    emptyTitle: "No content planned",
    cta: "Plan content",
    href: "/content",
  },
  {
    id: "campaigns",
    label: "Campaigns",
    icon: Megaphone,
    blurb: "Coordinated pushes with a start, an end and a goal.",
    emptyTitle: "No campaigns yet",
    cta: "Create campaign",
    href: "/campaigns",
  },
  {
    id: "analytics",
    label: "Analytics",
    icon: BarChart3,
    blurb: "What the numbers did, and why they moved.",
    emptyTitle: "No data recorded yet",
    cta: "Enter your numbers",
    href: "/analytics",
  },
  {
    id: "growth",
    label: "Growth",
    icon: Sprout,
    blurb: "Opportunities worth trying next, ranked by effort.",
    emptyTitle: "No opportunities yet",
    cta: "Find opportunities",
    href: "/growth",
  },
];
