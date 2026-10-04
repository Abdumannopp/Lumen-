import { z } from "zod";

/**
 * Growth experiments.
 *
 * No agent here — experiments are the operator's own record of what they tried
 * and what happened. The only AI involvement is downstream: completed
 * experiments with a recorded learning are read back into project context, so
 * future advice is informed by what this business has actually tested.
 *
 * That is context reuse, not training. LUMEN does not fine-tune anything, and
 * the UI says so rather than letting the loop imply otherwise.
 */

export const EXPERIMENT_STATUSES = [
  { key: "IDEA", label: "Idea" },
  { key: "PLANNED", label: "Planned" },
  { key: "RUNNING", label: "Running" },
  { key: "COMPLETED", label: "Completed" },
  { key: "CANCELLED", label: "Cancelled" },
] as const;

export type ExperimentStatusKey = (typeof EXPERIMENT_STATUSES)[number]["key"];

export const experimentStatusKeys = EXPERIMENT_STATUSES.map((status) => status.key) as [
  ExperimentStatusKey,
  ...ExperimentStatusKey[],
];

const optionalDate = z
  .string()
  .trim()
  .optional()
  .transform((value) => value || null)
  .refine((value) => !value || !Number.isNaN(Date.parse(value)), {
    message: "Enter a valid date.",
  });

export const experimentSchema = z.object({
  name: z.string().trim().min(2, "Give the experiment a name.").max(160),
  /**
   * Required, and phrased as a claim that could turn out false. An experiment
   * without a hypothesis is just an activity — there is nothing to be wrong
   * about, so nothing can be learned.
   */
  hypothesis: z.string().trim().min(5, "State what you believe will happen, and why.").max(1000),
  /** The one number this is judged by. */
  targetMetric: z.string().trim().min(1, "Name the metric this is judged by.").max(120),
  action: z.string().trim().min(2, "Say what you will actually do.").max(1000),
  expectedResult: z.string().trim().max(600).optional().transform((value) => value || null),
  startDate: optionalDate,
  endDate: optionalDate,
  status: z.enum(experimentStatusKeys),
  actualResult: z.string().trim().max(1000).optional().transform((value) => value || null),
  learning: z.string().trim().max(1000).optional().transform((value) => value || null),
  recommendationId: z.string().trim().optional().transform((value) => value || null),
});

export type ExperimentInput = z.input<typeof experimentSchema>;

export const experimentStatusLabel = (key: string) =>
  EXPERIMENT_STATUSES.find((status) => status.key === key)?.label ?? key;
