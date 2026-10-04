"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { History, Loader2, RotateCcw } from "lucide-react";

import { restoreVersionAction } from "@/lib/strategy/actions";
import { Button } from "@/components/ui/button";
import { SectionHeading } from "@/components/layout/section-heading";
import { Badge } from "@/components/ui/badge";

export interface VersionSummary {
  id: string;
  version: number;
  note: string;
  createdAt: string;
}

/** Version history. Restoring moves the pointer; nothing is ever deleted. */
export function VersionList({
  projectId,
  versions,
  currentId,
}: {
  projectId: string;
  versions: VersionSummary[];
  currentId: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  if (versions.length <= 1) return null;

  return (
    <section className="space-y-3">
      <SectionHeading title="Version history" icon={<History className="size-3" />} />

      <ul className="space-y-1.5">
        {versions.map((version) => {
          const isCurrent = version.id === currentId;

          return (
            <li
              key={version.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-surface/50 px-4 py-2.5"
            >
              <div className="flex min-w-0 items-center gap-3">
                <span className="font-mono text-[0.6875rem] text-muted-foreground tabular-nums">
                  v{version.version}
                </span>
                <span className="truncate text-sm text-foreground">{version.note}</span>
                {isCurrent && <Badge variant="accent">Current</Badge>}
              </div>

              {!isCurrent && (
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={pending}
                  onClick={() =>
                    startTransition(async () => {
                      await restoreVersionAction(projectId, version.id);
                      router.refresh();
                    })
                  }
                >
                  {pending ? <Loader2 className="animate-spin" /> : <RotateCcw />}
                  Restore
                </Button>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
