import { z } from "zod";

import type { Agent } from "@/lib/ai/types";

/**
 * Agent routing.
 *
 * The operator should not have to know which specialist handles which question,
 * so the router classifies the request instead. Two decisions shape it:
 *
 * 1. **Reading is not writing.** "What should I focus on?" is answered in the
 *    conversation; "write me a strategy" creates a document. The router marks
 *    which is which, and anything that writes is confirmed before it runs — a
 *    chat message should not silently produce a strategy version or a campaign.
 *
 * 2. **Sequences are declared, not improvised.** A launch plan genuinely needs
 *    audience before strategy before campaign, so the router returns an ordered
 *    list and the runtime executes it in order, reporting each step.
 */

export const AGENT_REGISTRY = {
  ATLAS: {
    label: "ATLAS",
    role: "Marketing strategy",
    /** Running it creates a record, so it needs confirmation. */
    writes: true,
    creates: "a new strategy version",
    handles: "positioning, messaging, channels, objectives, priorities, roadmap",
  },
  SCOUT: {
    label: "SCOUT",
    role: "Market intelligence",
    writes: true,
    creates: "market insights from your recorded competitors",
    handles: "competitors, gaps, differentiation, threats",
  },
  PULSE: {
    label: "PULSE",
    role: "Audience intelligence",
    writes: true,
    creates: "audience segments, ICPs and personas",
    handles: "who buys, why, their objections and channels",
  },
  MUSE: {
    label: "MUSE",
    role: "Content and creative",
    writes: true,
    creates: "draft content items",
    handles: "posts, hooks, scripts, captions, ad copy",
  },
  ORBIT: {
    label: "ORBIT",
    role: "Campaign intelligence",
    writes: true,
    creates: "a campaign plan",
    handles: "campaign objective, offer, channels, budget split, funnel, KPIs",
  },
  ASCEND: {
    label: "ASCEND",
    role: "Growth intelligence",
    writes: true,
    creates: "growth recommendations",
    handles: "what to improve next, opportunities, problems, priorities",
  },
  ASSISTANT: {
    label: "Assistant",
    role: "General analysis",
    /** Answers in the conversation and stores nothing beyond the message. */
    writes: false,
    creates: "an answer in this conversation",
    handles: "questions, analysis, explanations, anything that does not create a record",
  },
} as const;

export type AgentKey = keyof typeof AGENT_REGISTRY;

export const agentKeys = Object.keys(AGENT_REGISTRY) as [AgentKey, ...AgentKey[]];

export const routeStepSchema = z.object({
  agent: z.enum(agentKeys),
  /** Why this agent, in the operator's terms. Shown, not hidden. */
  reason: z.string().min(1),
});

export const routerOutputSchema = z.object({
  steps: z.array(routeStepSchema).min(1).max(4),
  /** One line describing what the operator asked for, echoed back. */
  understanding: z.string().min(1),
});

export type RouterOutput = z.infer<typeof routerOutputSchema>;

const SYSTEM = `You are the router inside LUMEN. You decide which specialist
should handle a request. You do not answer the request yourself.

The specialists:

- ATLAS — marketing strategy: positioning, messaging, channels, objectives,
  priorities, roadmap. Creates a strategy document.
- SCOUT — market intelligence: competitors, gaps, differentiation, threats.
  Analyses competitors the operator has already recorded.
- PULSE — audience intelligence: segments, ideal customer profiles, personas,
  pain points, objections.
- MUSE — content and creative: posts, hooks, scripts, captions, ad copy.
- ORBIT — campaign intelligence: campaign objective, offer, channels, budget
  allocation, funnel, KPI framework.
- ASCEND — growth intelligence: what to improve next, opportunities, problems,
  prioritised recommendations.
- ASSISTANT — general analysis: questions, explanations, and anything that does
  not need a new document created.

Rules:

1. Choose ASSISTANT whenever the request is a question rather than a request to
   produce something. "What are my weaknesses?" is ASSISTANT. "Write me a
   strategy" is ATLAS.
2. Use one specialist unless the request genuinely needs several. When it does,
   order them so each has what it needs: audience before strategy, strategy
   before campaign, campaign before content.
3. Never chain more than four steps. A long chain is usually a sign the request
   should be broken up.
4. Give a short, plain reason for each step. The operator sees these.
5. Do not answer the request. Do not describe your reasoning process. Return the
   route only.`;

export interface RouterPayload {
  request: string;
}

export const routerAgent: Agent<RouterPayload, RouterOutput> = {
  type: "router",
  // The project and profile are enough to route well; loading every module here
  // would spend the context budget on a decision that does not need it.
  contextSources: ["project", "businessProfile"],
  outputSchema: routerOutputSchema,
  system: SYSTEM,
  temperature: 0.1,
  maxTokens: 700,

  buildPrompt: (input) =>
    [
      `Route this request: ${input.payload.request}`,
      "",
      "Return `steps` (each with agent and reason) and `understanding` — one line",
      "restating what the operator wants, so they can tell if you misread it.",
    ].join("\n"),

  summarizeInput: (input) => `router — ${input.payload.request.slice(0, 150)}`,
};
