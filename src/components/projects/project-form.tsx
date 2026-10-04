"use client";

import { useActionState } from "react";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";

import {
  BUSINESS_STAGES,
  COUNTRIES,
  INDUSTRIES,
  PRIMARY_GOALS,
} from "@/config/project";
import { idleFormState, type FormState } from "@/lib/forms";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { MarketPicker } from "@/components/projects/market-picker";
import { SubmitButton } from "@/components/projects/submit-button";

export interface ProjectFormValues {
  name: string;
  website: string;
  industry: string;
  country: string;
  targetMarkets: string[];
  description: string;
  businessStage: string;
  primaryGoal: string;
}

const emptyValues: ProjectFormValues = {
  name: "",
  website: "",
  industry: "",
  country: "",
  targetMarkets: [],
  description: "",
  businessStage: "",
  primaryGoal: "",
};

/**
 * Create and edit share one form.
 *
 * The action is injected rather than chosen here, so this component never needs
 * to know which mode it is in — the page binds the right server action and the
 * form just submits it. Values are uncontrolled defaults, which means a failed
 * submit re-renders with the user's input intact.
 */
export function ProjectForm({
  action,
  defaultValues = emptyValues,
  submitLabel,
  pendingLabel,
  cancelHref = "/projects",
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  defaultValues?: ProjectFormValues;
  submitLabel: string;
  pendingLabel: string;
  cancelHref?: string;
}) {
  const [state, formAction] = useActionState(action, idleFormState);
  const errors = state.fieldErrors ?? {};

  return (
    <form action={formAction} noValidate className="space-y-6">
      {/* Form-level failures: shown once, above everything, in a live region. */}
      {state.status === "error" && state.message && (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-xl border border-destructive/35 bg-destructive/10 px-4 py-3"
        >
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
          <p className="text-sm leading-relaxed text-foreground">{state.message}</p>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Identity</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <Field name="name" label="Business name" errors={errors.name}>
            <Input defaultValue={defaultValues.name} placeholder="Acme Analytics" autoFocus />
          </Field>

          <Field
            name="website"
            label="Website"
            optional
            hint="A bare domain is fine — it will be normalised to https://"
            errors={errors.website}
          >
            <Input defaultValue={defaultValues.website} placeholder="acme.com" inputMode="url" />
          </Field>

          <Field
            name="description"
            label="Description"
            optional
            hint="What the business does, in a sentence or two."
            errors={errors.description}
          >
            <Textarea
              defaultValue={defaultValues.description}
              rows={3}
              maxLength={500}
              placeholder="Self-serve analytics for independent e-commerce brands."
            />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Market</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-5 sm:grid-cols-2">
            <Field name="industry" label="Industry" errors={errors.industry}>
              <Select defaultValue={defaultValues.industry}>
                <option value="">Select an industry</option>
                {INDUSTRIES.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </Field>

            <Field name="country" label="Based in" errors={errors.country}>
              <Select defaultValue={defaultValues.country}>
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
            <MarketPicker defaultValue={defaultValues.targetMarkets} />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Position</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <Field name="businessStage" label="Business stage" errors={errors.businessStage}>
            <Select defaultValue={defaultValues.businessStage}>
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
            <Select defaultValue={defaultValues.primaryGoal}>
              <option value="">Select a goal</option>
              {PRIMARY_GOALS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </Field>
        </CardContent>
      </Card>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button asChild variant="ghost">
          <Link href={cancelHref}>Cancel</Link>
        </Button>
        <SubmitButton pendingLabel={pendingLabel}>{submitLabel}</SubmitButton>
      </div>
    </form>
  );
}
