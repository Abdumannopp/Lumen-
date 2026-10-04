"use client";

import { useActionState, useRef, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowLeft, ArrowRight, Check, Sparkles } from "lucide-react";

import {
  BUSINESS_STAGES,
  COUNTRIES,
  INDUSTRIES,
  PRIMARY_GOALS,
} from "@/config/project";
import { idleFormState } from "@/lib/forms";
import { projectFormData, projectSchema } from "@/lib/validation/project";
import { createProjectAction } from "@/lib/projects/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { MarketPicker } from "@/components/projects/market-picker";
import { SubmitButton } from "@/components/projects/submit-button";
import { cn } from "@/lib/utils";

/**
 * First-run onboarding.
 *
 * One form, revealed in stages. Every field stays mounted — hidden steps are
 * `hidden`, not unmounted — so the final submit posts a complete FormData and
 * moving backwards never loses what was typed. That also means this reuses
 * `createProjectAction` unchanged: onboarding is a different path through the
 * same validated write, not a second way to create a project.
 */

const STEPS = [
  { id: "welcome", label: "Welcome", fields: [] as const },
  { id: "basics", label: "Basics", fields: ["name", "website", "description"] as const },
  { id: "market", label: "Market", fields: ["industry", "country", "targetMarkets"] as const },
  { id: "position", label: "Position", fields: ["businessStage", "primaryGoal"] as const },
];

export function OnboardingWizard() {
  const [state, formAction] = useActionState(createProjectAction, idleFormState);
  const [step, setStep] = useState(0);
  const [stepErrors, setStepErrors] = useState<Record<string, string[]>>({});
  const formRef = useRef<HTMLFormElement>(null);

  // Server errors win: they are the authoritative result of the last submit.
  const errors = { ...stepErrors, ...(state.fieldErrors ?? {}) };
  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;

  /**
   * Validate only the fields belonging to the current step, against the same
   * schema the server uses — so the wizard cannot advance into a state the
   * server will later reject.
   */
  function validateStep(): boolean {
    if (current.fields.length === 0) return true;
    if (!formRef.current) return true;

    const values = projectFormData(new FormData(formRef.current));
    const stepSchema = projectSchema.pick(
      Object.fromEntries(current.fields.map((field) => [field, true])) as Parameters<
        typeof projectSchema.pick
      >[0],
    );

    const result = stepSchema.safeParse(values);

    if (result.success) {
      setStepErrors({});
      return true;
    }

    const next: Record<string, string[]> = {};
    for (const issue of result.error.issues) {
      const key = issue.path.join(".") || "form";
      (next[key] ??= []).push(issue.message);
    }
    setStepErrors(next);
    return false;
  }

  function goNext() {
    if (validateStep()) setStep((value) => Math.min(value + 1, STEPS.length - 1));
  }

  function goBack() {
    setStepErrors({});
    setStep((value) => Math.max(value - 1, 0));
  }

  return (
    <div className="space-y-8">
      {/* Progress: named steps rather than a bare bar, so the shape of the task
          is visible before it starts. */}
      <ol className="flex flex-wrap items-center gap-x-2 gap-y-2">
        {STEPS.map((entry, index) => (
          <li key={entry.id} className="flex items-center gap-2">
            <span
              className={cn(
                "flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[0.625rem] tracking-[0.14em] uppercase transition-colors",
                index === step && "border-primary/45 bg-primary/15 text-foreground",
                index < step && "border-border bg-secondary/60 text-muted-foreground",
                index > step && "border-border text-muted-foreground",
              )}
            >
              {index < step ? <Check className="size-3" /> : null}
              {entry.label}
            </span>
            {index < STEPS.length - 1 && (
              <span aria-hidden className="h-px w-4 bg-border sm:w-6" />
            )}
          </li>
        ))}
      </ol>

      <form ref={formRef} action={formAction} noValidate className="space-y-6">
        {state.status === "error" && state.message && (
          <div
            role="alert"
            className="flex items-start gap-3 rounded-xl border border-destructive/35 bg-destructive/10 px-4 py-3"
          >
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
            <p className="text-sm leading-relaxed text-foreground">{state.message}</p>
          </div>
        )}

        <Card variant="aurora">
          <CardContent className="space-y-6 p-7">
            {/* Step 0 — welcome */}
            <div hidden={step !== 0} className="space-y-4">
              <span className="flex size-11 items-center justify-center rounded-xl border border-border bg-secondary text-[color:var(--gradient-from)]">
                <Sparkles className="size-5" />
              </span>
              <h2 className="font-display text-xl font-semibold">
                Let&rsquo;s set up your first business
              </h2>
              <p className="text-sm leading-relaxed text-muted-foreground">
                LUMEN organises everything by project — one per business you run. Four short
                steps and you&rsquo;ll be set up. You can change any of this later, and add as
                many businesses as you like.
              </p>
            </div>

            {/* Step 1 — basics */}
            <div hidden={step !== 1} className="space-y-5">
              <h2 className="font-display text-xl font-semibold">What is the business?</h2>

              <Field name="name" label="Business name" errors={errors.name}>
                <Input placeholder="Acme Analytics" />
              </Field>

              <Field
                name="website"
                label="Website"
                optional
                hint="A bare domain is fine — it will be normalised to https://"
                errors={errors.website}
              >
                <Input placeholder="acme.com" inputMode="url" />
              </Field>

              <Field
                name="description"
                label="Description"
                optional
                hint="What it does, in a sentence or two."
                errors={errors.description}
              >
                <Textarea rows={3} maxLength={500} placeholder="Self-serve analytics for independent brands." />
              </Field>
            </div>

            {/* Step 2 — market */}
            <div hidden={step !== 2} className="space-y-5">
              <h2 className="font-display text-xl font-semibold">Who does it sell to?</h2>

              <div className="grid gap-5 sm:grid-cols-2">
                <Field name="industry" label="Industry" errors={errors.industry}>
                  <Select defaultValue="">
                    <option value="">Select an industry</option>
                    {INDUSTRIES.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </Select>
                </Field>

                <Field name="country" label="Based in" errors={errors.country}>
                  <Select defaultValue="">
                    <option value="">Select a country</option>
                    {COUNTRIES.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>

              <Field
                name="targetMarkets"
                label="Target markets"
                optional
                hint="Pick a region to cover several countries at once."
                errors={errors.targetMarkets}
              >
                <MarketPicker />
              </Field>
            </div>

            {/* Step 3 — position */}
            <div hidden={step !== 3} className="space-y-5">
              <h2 className="font-display text-xl font-semibold">Where is it right now?</h2>

              <Field name="businessStage" label="Business stage" errors={errors.businessStage}>
                <Select defaultValue="">
                  <option value="">Select a stage</option>
                  {BUSINESS_STAGES.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field
                name="primaryGoal"
                label="Primary goal"
                hint="The one outcome this business is optimising for right now."
                errors={errors.primaryGoal}
              >
                <Select defaultValue="">
                  <option value="">Select a goal</option>
                  {PRIMARY_GOALS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
          </CardContent>
        </Card>

        <div className="flex flex-col-reverse items-stretch gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            {step > 0 ? (
              <Button type="button" variant="ghost" onClick={goBack}>
                <ArrowLeft />
                Back
              </Button>
            ) : (
              <Button asChild variant="ghost">
                <Link href="/projects/new">Skip — use the full form</Link>
              </Button>
            )}
          </div>

          {isLast ? (
            <SubmitButton pendingLabel="Creating…">Create project</SubmitButton>
          ) : (
            <Button type="button" onClick={goNext}>
              Continue
              <ArrowRight />
            </Button>
          )}
        </div>
      </form>
    </div>
  );
}
