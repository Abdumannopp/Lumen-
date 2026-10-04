import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  Wallet,
  Compass,
  FolderKanban,
  LayoutDashboard,
  ListChecks,
  Megaphone,
  PenLine,
  Radar,
  Settings2,
  Sparkles,
  Sprout,
  Users,
} from "lucide-react";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  /** Route is defined by the product spec but its phase has not shipped. */
  disabled?: boolean;
}

export interface NavSection {
  label: string;
  items: NavItem[];
}

/**
 * Application navigation.
 *
 * The module list comes from the LUMEN product specification and must not be
 * invented or renamed here — the information architecture is a product
 * decision, not a UI one. Modules whose phase has not shipped are shown
 * `disabled` rather than hidden, so the shape of the product is visible while
 * it is being built, and nothing links to a route that does not exist.
 */
export const appNavigation: NavSection[] = [
  {
    label: "Intelligence",
    items: [
      { label: "Overview", href: "/overview", icon: LayoutDashboard },
      { label: "This week", href: "/plan", icon: ListChecks },
      { label: "Assistant", href: "/assistant", icon: Sparkles },
      { label: "Intelligence", href: "/intelligence", icon: Radar },
    ],
  },
  {
    label: "Plan",
    items: [
      { label: "Strategy", href: "/strategy", icon: Compass },
      { label: "Audience", href: "/audience", icon: Users },
      { label: "Content", href: "/content", icon: PenLine },
      { label: "Campaigns", href: "/campaigns", icon: Megaphone },
    ],
  },
  {
    label: "Measure",
    items: [
      { label: "Budget", href: "/budget", icon: Wallet },
      { label: "Analytics", href: "/analytics", icon: BarChart3 },
      { label: "Growth", href: "/growth", icon: Sprout },
    ],
  },
  {
    label: "Workspace",
    items: [
      { label: "Projects", href: "/projects", icon: FolderKanban },
      { label: "Settings", href: "/settings", icon: Settings2 },
    ],
  },
];

export const marketingNavigation = [
  { label: "How it works", href: "/#how-it-works" },
  { label: "Platform", href: "/#platform" },
  { label: "Solutions", href: "/solutions/weekly-growth-plan" },
  { label: "Industries", href: "/industries/saas" },
  { label: "Pricing", href: "/#pricing" },
] as const;
