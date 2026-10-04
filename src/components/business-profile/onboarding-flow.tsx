"use client";

import { useActionState, useCallback, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Check,
  Cloud,
  CloudOff,
  Loader2,
} from "lucide-react";

import {
  BRAND_VOICE_TRAITS,
  BUSINESS_CHALLENGES,
  BUSINESS_MODELS,
  CURRENCIES,
  MARKETING_CHANNELS,
  SOCIAL_PLATFORMS,
} from "@/config/business-profile";
import { BUSINESS_STAGES, COUNTRIES, INDUSTRIES, PRIMARY_GOALS } from "@/config/project";
import { ONBOARDING_STEPS, REVIEW_STEP } from "@/lib/validation/business-profile";
import { onboardingStepAction } from "@/lib/business-profile/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ChipSelect } from "@/components/ui/chip-select";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { TagInput } from "@/components/ui/tag-input";
import { Textarea } from "@/components/ui/textarea";
import { MarketPicker } from "@/components/projects/market-picker";
import { cn } from "@/lib/utils";

export interface OnboardingDefaults {
  name: string;
  website: string;
  industry: string;
  country: string;
  targetMarkets: string[];
  description: string;
  businessStage: string;
  primaryGoal: string;
  productOrService: string;
  businessModel: string;
  targetCustomers: string;
  currentMarketingChannels: string[];
  monthlyBudgetAmount: string;
  monthlyBudgetCurrency: string;
  currentChallenges: string[];
  knownCompetitors: string[];
  brandVoice: string[];
  notes: string;
  socials: Record<string, string>;
}

const AUTOSAVE_DELAY_MS = 1200;

/** Reports the enclosing form's pending state to the autosave indicator. */
function SaveIndicator({ savedAt, error }: { savedAt?: string; error?: boolean }) {
  const { pending } = useFormStatus();

  return (
    <p
      aria-live="polite"
      className="flex items-center gap-1.5 font-mono text-[0.625rem] tracking-[0.14em] text-muted-foreground uppercase"
    >
      {pending && (
        <>
          <Loader2 className="size-3 animate-spin" /> Saving
        </>
      )}
      {!pending && error && (
        <span className="flex items-center gap-1.5 text-destructive">
          <CloudOff className="size-3" /> Not saved
        </span>
      )}
      {!pending && !error && savedAt && (
        <>
          <Cloud className="size-3" /> Saved
        </>
      )}
    </p>
  );
}

/** Submit button that carries the intent the server branches on. */
function IntentButton({
  intent,
  children,
  ...props
}: { intent: string } & React.ComponentProps<typeof Button>) {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" name="intent" value={intent} disabled={pending} {...props}>
      {pending && <Loader2 className="animate-spin" />}
      {children}
    </Button>
  );
}

/**
 * Business onboarding.
 *
 * Every field stays mounted for the whole flow — hidden steps use `hidden`
 * rather than unmounting — so a save can post a complete snapshot at any
 * moment, moving backwards never loses input, and the final submit carries
 * everything without reassembling state.
 *
 * The current step comes from the server's response, not local state. Every
 * transition is a form submission carrying an `intent`, which means the flow
 * works without client JavaScript and can be driven end-to-end over plain HTTP.
 *
 * Validation is layered: autosave writes through a lenient schema that never
 * rejects a partial answer, moving forward runs that step's strict schema, and
 * completing re-runs every step — because a resumed session can start on any
 * step and the final gate cannot assume the earlier ones ever ran.
 */
export function BusinessOnboardingFlow({
  projectId,
  defaults,
  initialStep,
}: {
  projectId: string;
  defaults: OnboardingDefaults;
  initialStep: number;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const saveButtonRef = useRef<HTMLButtonElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [state, formAction] = useActionState(onboardingStepAction, {
    status: "idle" as const,
    step: Math.min(Math.max(initialStep, 0), REVIEW_STEP),
  });

  const step = state.step;
  const errors = state.fieldErrors ?? {};
  const definition = ONBOARDING_STEPS[step];
  const isReview = step === REVIEW_STEP;

  // Controlled because they are not native inputs; mirrored to hidden fields.
  const [markets, setMarkets] = useState(defaults.targetMarkets);
  const [channels, setChannels] = useState(defaults.currentMarketingChannels);
  const [challenges, setChallenges] = useState(defaults.currentChallenges);
  const [competitors, setCompetitors] = useState(defaults.knownCompetitors);
  const [voice, setVoice] = useState(defaults.brandVoice);

  /** Debounced: typing should not fire a write per keystroke. */
  const scheduleSave = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => saveButtonRef.current?.click(), AUTOSAVE_DELAY_MS);
  }, []);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  // Finishing goes to the plan, not to the profile that was just filled in.
  //
  // The profile is a means; nobody answers nine screens of questions in order
  // to admire the answers. The brief is explicit that completion routes to plan
  // generation, and it is right — the moment the last question is answered is
  // the one moment the operator finds out what answering them was for.
  useEffect(() => {
    if (state.done) router.push("/plan");
  }, [state.done, router]);

  function updateControlled<T>(setter: (value: T) => void, value: T) {
    setter(value);
    scheduleSave();
  }

  return (
    <div className="space-y-7">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <ol className="flex flex-wrap items-center gap-x-1.5 gap-y-2">
          {ONBOARDING_STEPS.map((entry, index) => (
            <li key={entry.id} className="flex items-center gap-1.5">
              <button
                type="submit"
                form="onboarding-form"
                name="intent"
                value="save"
                // Backwards only: jumping ahead would skip validation.
                disabled={index > step}
                onClick={() => {
                  const field = formRef.current?.elements.namedItem("step");
                  if (field instanceof HTMLInputElement) field.value = String(index);
                }}
                className={cn(
                  "flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[0.625rem] tracking-[0.12em] uppercase transition-colors",
                  index === step && "border-primary/45 bg-primary/15 text-foreground",
                  index < step &&
                    "border-border bg-secondary/60 text-muted-foreground hover:text-foreground",
                  index > step && "cursor-not-allowed border-border text-muted-foreground",
                )}
              >
                {index < step ? <Check className="size-3" /> : null}
                {entry.label}
              </button>
              {index < ONBOARDING_STEPS.length - 1 && (
                <span aria-hidden className="h-px w-3 bg-border" />
              )}
            </li>
          ))}
        </ol>

        {/* Autosave indicator: a live region, because it reports something the
            person did not explicitly trigger. */}
        <SaveIndicator savedAt={state.savedAt} error={state.status === "error"} />
      </div>

      <form
        id="onboarding-form"
        ref={formRef}
        action={formAction}
        // Autosave is driven by real input events rather than an effect on every
        // value, so uncontrolled fields need no mirrored state.
        onInput={scheduleSave}
        onChange={scheduleSave}
        noValidate
        className="space-y-6"
      >
        <input type="hidden" name="projectId" value={projectId} />
        <input type="hidden" name="step" defaultValue={step} key={`step-${step}`} />
        {/* Clicked programmatically by the debounced autosave. */}
        <button ref={saveButtonRef} type="submit" name="intent" value="save" className="hidden" />

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
            <div className="space-y-1.5">
              <h2 className="font-display text-xl font-semibold">{definition.title}</h2>
              <p className="text-sm leading-relaxed text-muted-foreground">{definition.blurb}</p>
            </div>

            {/* Step 0 — basics */}
            <div hidden={step !== 0} className="space-y-5">
              <Field name="name" label="Business name" errors={errors.name}>
                <Input defaultValue={defaults.name} placeholder="Acme Analytics" />
              </Field>

              <Field name="website" label="Website" optional errors={errors.website}>
                <Input defaultValue={defaults.website} placeholder="acme.com" inputMode="url" />
              </Field>

              <div className="grid gap-5 sm:grid-cols-2">
                <Field name="industry" label="Industry" errors={errors.industry}>
                  <Select defaultValue={defaults.industry}>
                    <option value="">Select an industry</option>
                    {INDUSTRIES.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </Select>
                </Field>

                <Field name="country" label="Based in" errors={errors.country}>
                  <Select defaultValue={defaults.country}>
                    <option value="">Select a country</option>
                    {COUNTRIES.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>

              <Field name="businessStage" label="Business stage" errors={errors.businessStage}>
                <Select defaultValue={defaults.businessStage}>
                  <option value="">Select a stage</option>
                  {BUSINESS_STAGES.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>

            {/* Step 1 — offering */}
            <div hidden={step !== 1} className="space-y-5">
              <Field
                name="productOrService"
                label="Product or service"
                hint="What does the customer actually buy?"
                errors={errors.productOrService}
              >
                <Textarea
                  defaultValue={defaults.productOrService}
                  rows={3}
                  maxLength={300}
                  placeholder="A self-serve analytics dashboard sold as a monthly subscription."
                />
              </Field>

              <Field
                name="description"
                label="Business description"
                optional
                hint="The wider context around what you sell."
                errors={errors.description}
              >
                <Textarea defaultValue={defaults.description} rows={3} maxLength={500} />
              </Field>

              <Field name="businessModel" label="Business model" errors={errors.businessModel}>
                <Select defaultValue={defaults.businessModel}>
                  <option value="">Select a model</option>
                  {BUSINESS_MODELS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>

            {/* Step 2 — customers */}
            <div hidden={step !== 2} className="space-y-5">
              <Field
                name="targetCustomers"
                label="Target customers"
                hint="Who they are, what they do, and what makes them buy."
                errors={errors.targetCustomers}
              >
                <Textarea
                  defaultValue={defaults.targetCustomers}
                  rows={4}
                  maxLength={500}
                  placeholder="Founders and marketers at independent e-commerce brands doing $1–10M a year, with no in-house analyst."
                />
              </Field>

              <Field name="targetMarkets" label="Target markets" optional errors={errors.targetMarkets}>
                <MarketPicker
                  defaultValue={markets}
                  onChange={(next) => updateControlled(setMarkets, next)}
                />
              </Field>
            </div>

            {/* Step 3 — marketing */}
            <div hidden={step !== 3} className="space-y-5">
              <Field name="primaryGoal" label="Primary marketing goal" errors={errors.primaryGoal}>
                <Select defaultValue={defaults.primaryGoal}>
                  <option value="">Select a goal</option>
                  {PRIMARY_GOALS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field
                name="currentMarketingChannels"
                label="Current marketing channels"
                optional
                hint="What you are actually doing today, not what you plan to."
                errors={errors.currentMarketingChannels}
              >
                <ChipSelect
                  name="currentMarketingChannels"
                  options={MARKETING_CHANNELS}
                  value={channels}
                  onChange={(next) => updateControlled(setChannels, next)}
                  columns
                />
              </Field>

              <div className="grid gap-5 sm:grid-cols-[1fr_12rem]">
                <Field
                  name="monthlyBudgetAmount"
                  label="Monthly marketing budget"
                  optional
                  errors={errors.monthlyBudgetAmount}
                >
                  <Input
                    defaultValue={defaults.monthlyBudgetAmount}
                    inputMode="numeric"
                    placeholder="5000"
                  />
                </Field>

                <Field
                  name="monthlyBudgetCurrency"
                  label="Currency"
                  optional
                  errors={errors.monthlyBudgetCurrency}
                >
                  <Select defaultValue={defaults.monthlyBudgetCurrency}>
                    <option value="">—</option>
                    {CURRENCIES.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.value}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
            </div>

            {/* Step 4 — context */}
            <div hidden={step !== 4} className="space-y-5">
              <Field
                name="currentChallenges"
                label="Current challenges"
                optional
                errors={errors.currentChallenges}
              >
                <ChipSelect
                  name="currentChallenges"
                  options={BUSINESS_CHALLENGES}
                  value={challenges}
                  onChange={(next) => updateControlled(setChallenges, next)}
                  columns
                />
              </Field>

              <Field
                name="knownCompetitors"
                label="Known competitors"
                optional
                hint="Names or domains. Press Enter to add each one."
                errors={errors.knownCompetitors}
              >
                <TagInput
                  name="knownCompetitors"
                  value={competitors}
                  onChange={(next) => updateControlled(setCompetitors, next)}
                  placeholder="competitor.com"
                />
              </Field>
            </div>

            {/* Step 5 — brand */}
            <div hidden={step !== 5} className="space-y-5">
              <Field name="brandVoice" label="Brand voice" optional errors={errors.brandVoice}>
                <ChipSelect
                  name="brandVoice"
                  options={BRAND_VOICE_TRAITS}
                  value={voice}
                  onChange={(next) => updateControlled(setVoice, next)}
                />
              </Field>

              <fieldset className="space-y-4">
                <legend className="text-sm font-medium text-foreground">Social media links</legend>
                <div className="grid gap-4 sm:grid-cols-2">
                  {SOCIAL_PLATFORMS.map((platform) => (
                    <Field
                      key={platform.field}
                      name={platform.field}
                      label={platform.label}
                      optional
                      errors={errors[platform.field]}
                    >
                      <Input
                        defaultValue={defaults.socials[platform.field] ?? ""}
                        placeholder={platform.placeholder}
                        inputMode="url"
                      />
                    </Field>
                  ))}
                </div>
              </fieldset>

              <Field
                name="notes"
                label="Notes"
                optional
                hint="Anything else worth knowing about this business."
                errors={errors.notes}
              >
                <Textarea defaultValue={defaults.notes} rows={4} maxLength={2000} />
              </Field>
            </div>

            {/* Step 6 — review */}
            <div hidden={!isReview} className="space-y-4">
              <p className="text-sm leading-relaxed text-muted-foreground">
                Your answers are saved as you go. Use the steps above to revisit anything, then
                finish to build the profile.
              </p>
              <ul className="space-y-2">
                {ONBOARDING_STEPS.slice(0, REVIEW_STEP).map((entry, index) => (
                  <li
                    key={entry.id}
                    className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface/50 px-4 py-2.5"
                  >
                    <span className="text-sm text-foreground">{entry.title}</span>
                    <button
                      type="submit"
                      name="intent"
                      value="save"
                      onClick={() => {
                        const field = formRef.current?.elements.namedItem("step");
                        if (field instanceof HTMLInputElement) field.value = String(index);
                      }}
                      className="rounded-md font-mono text-[0.625rem] tracking-[0.14em] text-muted-foreground uppercase transition-colors hover:text-foreground"
                    >
                      Edit
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </CardContent>
        </Card>

        <div className="flex flex-col-reverse items-stretch gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            {step > 0 ? (
              <IntentButton intent="back" variant="ghost">
                <ArrowLeft />
                Back
              </IntentButton>
            ) : (
              <Button asChild variant="ghost">
                <Link href="/projects">Continue later</Link>
              </Button>
            )}
          </div>

          {isReview ? (
            <IntentButton intent="complete">Finish onboarding</IntentButton>
          ) : (
            <IntentButton intent="next">
              Continue
              <ArrowRight />
            </IntentButton>
          )}
        </div>
      </form>
    </div>
  );
}
