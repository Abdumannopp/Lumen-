"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";

import type { AuthFormState } from "@/lib/auth/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

/**
 * The account forms.
 *
 * One component for sign-in, sign-up, reset and new-password, because they are
 * the same form with different fields and they must fail the same way. Four
 * near-copies is how one of them ends up leaking whether an account exists
 * while the others do not.
 *
 * Submitted as a real `<form action={…}>`, so it works before hydration —
 * which for a sign-in page is not a nicety: it is the page someone lands on
 * with a cold cache on a bad connection.
 */

function SubmitButton({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" className="w-full" disabled={pending} aria-busy={pending}>
      {pending && <Loader2 className="animate-spin" />}
      {pending ? pendingLabel : label}
    </Button>
  );
}

export interface AuthFieldSpec {
  name: "email" | "password";
  label: string;
  type: "email" | "password";
  hint?: string;
  autoComplete: string;
}

export function AuthForm({
  action,
  title,
  description,
  fields,
  submitLabel,
  pendingLabel,
  terms,
  hidden,
  footer,
}: {
  action: (state: AuthFormState, formData: FormData) => Promise<AuthFormState>;
  title: string;
  description: string;
  fields: AuthFieldSpec[];
  submitLabel: string;
  pendingLabel: string;
  /** Show the terms checkbox. Required only where an account is created. */
  terms?: boolean;
  /**
   * Values carried through the form without being typed.
   *
   * The invite token arrives in the URL and has to reach the action. A hidden
   * field rather than a value read from the query string on the server, because
   * a Server Action receives form data and not the URL the form was rendered
   * at.
   */
  hidden?: Record<string, string>;
  footer?: React.ReactNode;
}) {
  const [state, formAction] = useActionState(action, { ok: false } as AuthFormState);

  // A message with ok:true is the whole outcome — "check your email" has no
  // form left to fill in, and leaving one on screen invites a second submit.
  if (state.ok && state.message) {
    return (
      <Card>
        <CardContent className="space-y-4 p-8">
          <span className="flex size-9 items-center justify-center rounded-xl border border-success/30 bg-success/10 text-success">
            <CheckCircle2 className="size-4" />
          </span>
          <h1 className="font-display text-xl font-semibold">{title}</h1>
          <p className="text-sm leading-relaxed text-muted-foreground">{state.message}</p>
          {footer && <div className="pt-2 text-sm text-muted-foreground">{footer}</div>}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="space-y-6 p-8">
        <div className="space-y-2">
          <h1 className="font-display text-xl font-semibold">{title}</h1>
          <p className="text-sm leading-relaxed text-muted-foreground">{description}</p>
        </div>

        <form action={formAction} className="space-y-5" noValidate>
          {Object.entries(hidden ?? {}).map(([name, value]) => (
            <input key={name} type="hidden" name={name} value={value} />
          ))}

          {fields.map((field) => (
            <Field
              key={field.name}
              name={field.name}
              label={field.label}
              hint={field.hint}
              errors={state.fieldErrors?.[field.name]}
            >
              <Input
                id={field.name}
                name={field.name}
                type={field.type}
                autoComplete={field.autoComplete}
                required
              />
            </Field>
          ))}

          {terms && (
            <label className="flex items-start gap-2.5 text-sm text-muted-foreground">
              <input
                type="checkbox"
                name="terms"
                className="mt-0.5 size-4 shrink-0 rounded border-border-strong bg-transparent accent-[color:var(--gradient-via)]"
              />
              <span>
                I agree to the <Link href="/terms" className="underline underline-offset-4 hover:text-foreground">terms of service</Link> and the <Link href="/privacy" className="underline underline-offset-4 hover:text-foreground">privacy policy</Link>.
              </span>
            </label>
          )}

          {state.message && !state.ok && (
            <p role="alert" className="flex items-start gap-2 text-sm text-destructive">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              {state.message}
            </p>
          )}

          <SubmitButton label={submitLabel} pendingLabel={pendingLabel} />
        </form>

        {footer && <div className="text-sm text-muted-foreground">{footer}</div>}
      </CardContent>
    </Card>
  );
}

export function AuthLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="rounded-md text-[color:var(--gradient-from)] hover:opacity-80">
      {children}
    </Link>
  );
}
