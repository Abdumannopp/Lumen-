"use client";

import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";
import { Button, type ButtonProps } from "@/components/ui/button";

/**
 * Submit control that reports the pending state of its enclosing form.
 *
 * Reads useFormStatus rather than taking a `pending` prop, so the form does not
 * have to thread submission state down to it. Disabled while pending, which
 * makes double submission impossible without any extra guard.
 */
export function SubmitButton({
  children,
  pendingLabel,
  ...props
}: ButtonProps & { pendingLabel?: string }) {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" disabled={pending} aria-busy={pending} {...props}>
      {pending && <Loader2 className="animate-spin" />}
      {pending ? (pendingLabel ?? "Saving…") : children}
    </Button>
  );
}
