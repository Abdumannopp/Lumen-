import { z } from "zod";

/**
 * Shared shape for `useActionState` form results.
 *
 * Server actions return this instead of throwing so a failed submit re-renders
 * the form with its errors attached to the right fields, rather than replacing
 * the page with an error boundary.
 */
export interface FormState {
  status: "idle" | "success" | "error";
  /** Form-level message: shown above the fields. */
  message?: string;
  /** Field-level messages, keyed by input name. */
  fieldErrors?: Record<string, string[]>;
}

export const idleFormState: FormState = { status: "idle" };

export function formError(message: string, fieldErrors?: Record<string, string[]>): FormState {
  return { status: "error", message, fieldErrors };
}

/** Convert a Zod failure into field-keyed messages the form can render. */
export function fieldErrorsFrom(error: z.ZodError): Record<string, string[]> {
  const result: Record<string, string[]> = {};

  for (const issue of error.issues) {
    const key = issue.path.join(".") || "form";
    (result[key] ??= []).push(issue.message);
  }

  return result;
}
