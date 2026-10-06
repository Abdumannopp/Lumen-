import type { LucideIcon } from "lucide-react";
import { BarChart3, CheckCircle2, Compass, LineChart, Rocket, Target, Workflow } from "lucide-react";

export interface MarketingSeoPage {
  slug: string;
  eyebrow: string;
  title: string;
  description: string;
  summary: string;
  outcomes: string[];
  sections: { title: string; body: string; icon: LucideIcon }[];
}

export const solutionPages: MarketingSeoPage[] = [
  {
    slug: "weekly-growth-plan",
    eyebrow: "Solution · Weekly planning",
    title: "A weekly growth plan your team can actually finish",
    description:
      "Turn business context and performance signals into a focused weekly growth plan with clear actions, reasons and measurable outcomes.",
    summary:
      "Lumen turns scattered marketing questions into a small, evidence-aware list of work for the week ahead.",
    outcomes: [
      "Know what deserves attention this week instead of starting from a blank page.",
      "See why a recommendation was made and what result to watch.",
      "Carry completed work, outcomes and learning into the next plan.",
    ],
    sections: [
      {
        title: "Start with your business, not a generic prompt",
        body:
          "Give Lumen the offer, customer, goal, channels and constraints that shape your business. The plan is built around that context rather than a generic list of marketing ideas.",
        icon: Target,
      },
      {
        title: "Prioritize a short list of useful work",
        body:
          "Lumen turns recorded performance and business context into recommendations and weekly tasks. Each task has a reason, steps, channel and expected result so the operator can decide quickly.",
        icon: Compass,
      },
      {
        title: "Close the loop with what happened",
        body:
          "Mark work done or skipped, capture the observed outcome, and feed the learning back into the next planning cycle. Execution becomes part of the intelligence instead of disappearing into a task list.",
        icon: Workflow,
      },
    ],
  },
  {
    slug: "marketing-analytics",
    eyebrow: "Solution · Marketing analytics",
    title: "Marketing analytics that leads to a decision",
    description:
      "Compare meaningful periods, surface real growth signals and turn marketing analytics into a prioritized action plan.",
    summary:
      "Lumen is built for the question after the chart: what changed, why it matters and what should we do next?",
    outcomes: [
      "See meaningful changes without inventing external benchmarks.",
      "Separate missing data from a true zero or decline.",
      "Turn a measured signal into a recommendation and a weekly task.",
    ],
    sections: [
      {
        title: "Compare like with like",
        body:
          "Lumen uses comparable time periods to detect meaningful movement. When data is missing, it stays missing rather than being treated as a zero just to fill the dashboard.",
        icon: LineChart,
      },
      {
        title: "Keep evidence beside the recommendation",
        body:
          "Growth signals are written in plain language with the evidence available to the system. Recommendations can then reference the actual business context that produced them.",
        icon: BarChart3,
      },
      {
        title: "Measure the next step",
        body:
          "A signal is useful when it changes a decision. Lumen can convert the recommendation into a weekly task and later compare the recorded outcome with the original expectation.",
        icon: CheckCircle2,
      },
    ],
  },
  {
    slug: "growth-workflow",
    eyebrow: "Solution · Growth workflow",
    title: "One growth workflow from insight to outcome",
    description:
      "Connect business context, analytics, AI recommendations, weekly execution and outcomes in one repeatable growth workflow.",
    summary:
      "Replace the cycle of disconnected dashboards, notes and AI chats with one operating loop.",
    outcomes: [
      "Keep strategy, analytics and weekly execution connected.",
      "Create a visible trail from insight to action to outcome.",
      "Build an evidence-backed learning loop over time.",
    ],
    sections: [
      {
        title: "One place for the operating context",
        body:
          "Strategy, audience, campaigns and performance data live in the same project context. That gives AI a more complete picture than a one-off prompt can provide.",
        icon: Workflow,
      },
      {
        title: "From recommendation to execution",
        body:
          "Lumen turns selected recommendations into concrete weekly tasks with priority and expected results. The operator stays in control of what gets accepted, changed or skipped.",
        icon: Rocket,
      },
      {
        title: "Learn without pretending to prove causality",
        body:
          "Observed outcomes and completed experiments are kept distinct. Lumen can learn from operator feedback and recorded results without claiming that every metric change was caused by one task.",
        icon: CheckCircle2,
      },
    ],
  },
];

export const industryPages: MarketingSeoPage[] = [
  {
    slug: "saas",
    eyebrow: "Industry · SaaS",
    title: "AI growth planning for SaaS teams",
    description:
      "Help a lean SaaS team turn product and marketing signals into a focused weekly acquisition and retention plan.",
    summary:
      "Lumen is designed for teams that need a practical growth system without building a full marketing operations stack.",
    outcomes: [
      "Connect acquisition data with the work planned for the week.",
      "Prioritize a small number of experiments and marketing actions.",
      "Carry outcomes into the next growth cycle.",
    ],
    sections: [
      {
        title: "Useful for small growth teams",
        body:
          "When one founder or a small team owns growth, the challenge is rarely a lack of ideas. It is choosing what to do first and keeping the work connected to the numbers.",
        icon: Target,
      },
      {
        title: "Make acquisition work visible",
        body:
          "Enter your performance figures, then let Lumen surface changes worth acting on instead of producing another disconnected report.",
        icon: BarChart3,
      },
      {
        title: "Learn from actual execution",
        body:
          "Record what the team shipped and what happened afterward. The next plan can use that history as a qualitative learning signal while experiments remain the stronger evidence for causal conclusions.",
        icon: LineChart,
      },
    ],
  },
  {
    slug: "service-businesses",
    eyebrow: "Industry · Service businesses",
    title: "A practical growth system for service businesses",
    description:
      "Turn offers, local or niche marketing channels and lead signals into a weekly growth plan for a service business.",
    summary:
      "Keep marketing simple: focus on the audience, the channels that matter and the actions most likely to create the next useful conversation.",
    outcomes: [
      "Translate business goals into a concrete weekly marketing list.",
      "Track leads and other outcomes you can actually observe.",
      "Avoid spreading limited time across too many channels.",
    ],
    sections: [
      {
        title: "Plan around the offer",
        body:
          "Lumen starts with the service, target customer, market and business goal so recommendations reflect what the business can realistically sell and deliver.",
        icon: Compass,
      },
      {
        title: "Focus scarce marketing time",
        body:
          "Weekly tasks are intentionally small and prioritized. That makes the system suitable for owners who have to do the marketing themselves or coordinate a very small team.",
        icon: Target,
      },
      {
        title: "Record the result",
        body:
          "Capture enquiries, booked calls, customers or another business metric when it is available. Lumen keeps observed movement separate from unsupported claims about cause.",
        icon: CheckCircle2,
      },
    ],
  },
  {
    slug: "ecommerce",
    eyebrow: "Industry · Ecommerce",
    title: "Growth planning for ecommerce operators",
    description:
      "Use ecommerce performance signals, campaign context and weekly execution to decide what marketing work to prioritize next.",
    summary:
      "Lumen helps an ecommerce operator connect performance movement with the actions that can be shipped this week.",
    outcomes: [
      "Prioritize a few campaigns, content actions or channel changes.",
      "Record observed changes in traffic, orders or conversion metrics.",
      "Build a weekly learning loop instead of reacting to every metric fluctuation.",
    ],
    sections: [
      {
        title: "Start from what changed",
        body:
          "Comparable analytics periods can surface meaningful movements in the metrics you record, giving the operator a focused starting point for the week.",
        icon: LineChart,
      },
      {
        title: "Turn signals into work",
        body:
          "Lumen can turn a growth signal into a recommendation and then a weekly task, keeping the reason for the work visible alongside the execution steps.",
        icon: Rocket,
      },
      {
        title: "Close with measured outcomes",
        body:
          "After the work ships, record what happened. When a controlled experiment exists, its learning can be used as stronger evidence for future recommendations.",
        icon: BarChart3,
      },
    ],
  },
];

export function findSeoPage(collection: MarketingSeoPage[], slug: string) {
  return collection.find((page) => page.slug === slug);
}
