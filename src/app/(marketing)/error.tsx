"use client";

import { useEffect } from "react";
import { ErrorState } from "@/components/feedback/error-state";
import { Container } from "@/components/layout/container";

export default function MarketingError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[marketing] route error", error);
  }, [error]);

  return (
    <Container className="py-28">
      <ErrorState
        title="This page could not load"
        description="Something failed while rendering. Reloading usually resolves it."
        digest={error.digest}
        onRetry={reset}
        homeHref="/"
      />
    </Container>
  );
}
