"use client";

import { useEffect } from "react";
import { ErrorState } from "@/components/feedback/error-state";

/**
 * Onboarding error boundary.
 *
 * Added by the production audit: without it a failure here escaped to
 * `global-error`, which replaces the whole document and loses the LUMEN shell.
 * A first-run failure is exactly the moment that should look handled.
 */
export default function OnboardingError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[onboarding] route error", error);
  }, [error]);

  return (
    <ErrorState
      title="Setup could not load"
      description="Something failed while preparing the first-run flow. Retrying usually clears it."
      digest={error.digest}
      onRetry={reset}
      homeHref="/"
    />
  );
}
