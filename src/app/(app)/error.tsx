"use client";

import { useEffect } from "react";
import { ErrorState } from "@/components/feedback/error-state";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Replace with the telemetry client once observability is wired up.
    console.error("[app] route error", error);
  }, [error]);

  return (
    <div className="py-16">
      <ErrorState
        digest={error.digest}
        onRetry={reset}
        homeHref="/overview"
        description="The data request failed before it returned. Retrying usually clears it."
      />
    </div>
  );
}
