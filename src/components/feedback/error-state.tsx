"use client";

import { AlertTriangle, RotateCw } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface ErrorStateProps {
  title?: string;
  description?: string;
  /** Digest from a Next.js error boundary — the key for finding server logs. */
  digest?: string;
  /** Retry callback supplied by the boundary's `reset` function. */
  onRetry?: () => void;
  /** Escape hatch when retrying is unlikely to help. */
  homeHref?: string;
  className?: string;
}

/**
 * The single error presentation used by every boundary in the app.
 *
 * Copy states what happened and what to do next; it does not apologise or
 * speculate. The digest is shown in mono because it is a system identifier
 * the user may need to quote to support.
 */
export function ErrorState({
  title = "This view could not load",
  description = "The request failed before the data arrived. Retrying usually clears it.",
  digest,
  onRetry,
  homeHref,
  className,
}: ErrorStateProps) {
  return (
    <div
      role="alert"
      className={cn(
        "mx-auto flex max-w-md flex-col items-center gap-5 rounded-2xl border border-border bg-card px-8 py-12 text-center",
        className,
      )}
    >
      <span className="flex size-11 items-center justify-center rounded-xl border border-destructive/30 bg-destructive/10 text-destructive">
        <AlertTriangle className="size-5" />
      </span>

      <div className="space-y-2">
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="text-sm leading-relaxed text-muted-foreground">{description}</p>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-2">
        {onRetry && (
          <Button onClick={onRetry} size="sm">
            <RotateCw />
            Try again
          </Button>
        )}
        {homeHref && (
          <Button asChild variant="outline" size="sm">
            <Link href={homeHref}>Go back</Link>
          </Button>
        )}
      </div>

      {digest && (
        <p className="font-mono text-[0.6875rem] tracking-wide text-muted-foreground">
          ref {digest}
        </p>
      )}
    </div>
  );
}
