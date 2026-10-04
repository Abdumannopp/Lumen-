"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Loader2, Trash2 } from "lucide-react";

import {
  CONTENT_STATUSES,
  contentTypeLabel,
  platformLabel,
  type ContentStatusKey,
} from "@/lib/content/agent";
import { deleteContentItemAction, setContentStatusAction } from "@/lib/content/actions";
import type { ContentItemRecord } from "@/lib/content/queries";
import { Badge } from "@/components/ui/badge";
import { SourceBadge } from "@/components/ui/source-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { formatDayShort } from "@/lib/date";

/**
 * One content item.
 *
 * The hook is shown at full weight while collapsed and the body is hidden,
 * because scanning a content plan is really scanning hooks — that is the part
 * that decides whether a piece is worth keeping.
 */
export function ContentItemCard({
  projectId,
  item,
  onEdit,
}: {
  projectId: string;
  item: ContentItemRecord;
  onEdit: (item: ContentItemRecord) => void;
}) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const [pending, startTransition] = useTransition();

  return (
    <Card>
      <CardContent className="space-y-3 p-5">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">{platformLabel(item.platform)}</Badge>
          <Badge variant="outline">{contentTypeLabel(item.type)}</Badge>
          <SourceBadge source={item.source} agent="MUSE" />
          {item.pillar && <Badge>{item.pillar}</Badge>}

          <div className="ml-auto flex items-center gap-1">
            <Select
              value={item.status}
              aria-label="Status"
              className="h-8 w-36 text-xs"
              disabled={pending}
              onChange={(event) =>
                startTransition(async () => {
                  await setContentStatusAction(
                    projectId,
                    item.id,
                    event.target.value as ContentStatusKey,
                  );
                  router.refresh();
                })
              }
            >
              {CONTENT_STATUSES.map((status) => (
                <option key={status.key} value={status.key}>
                  {status.label}
                </option>
              ))}
            </Select>

            <Button variant="ghost" size="sm" onClick={() => onEdit(item)}>
              Edit
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Delete item"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  await deleteContentItemAction(projectId, item.id);
                  router.refresh();
                })
              }
            >
              {pending ? <Loader2 className="animate-spin" /> : <Trash2 />}
            </Button>
          </div>
        </div>

        {item.hook && (
          <p className="text-sm leading-relaxed font-medium text-foreground">{item.hook}</p>
        )}

        <p className="text-xs text-muted-foreground">{item.objective}</p>

        {(item.body || item.cta || item.audience) && (
          <>
            <button
              type="button"
              onClick={() => setExpanded((value) => !value)}
              aria-expanded={expanded}
              className="flex items-center gap-1.5 rounded-md font-mono text-[0.625rem] tracking-[0.16em] text-muted-foreground uppercase transition-colors hover:text-foreground"
            >
              <ChevronDown className={cn("size-3 transition-transform", expanded && "rotate-180")} />
              {expanded ? "Hide" : "Show full"}
            </button>

            {expanded && (
              <div className="space-y-3 border-t border-border pt-4">
                {item.audience && (
                  <p className="text-xs text-muted-foreground">
                    <span className="font-mono text-[0.625rem] tracking-[0.14em] uppercase">
                      Audience:{" "}
                    </span>
                    {item.audience}
                  </p>
                )}
                {item.body && (
                  <p className="text-sm leading-relaxed whitespace-pre-wrap text-muted-foreground">
                    {item.body}
                  </p>
                )}
                {item.cta && (
                  <p className="rounded-lg border border-primary/25 bg-primary/8 px-3 py-2 text-sm text-foreground">
                    {item.cta}
                  </p>
                )}
                {item.scheduledAt && (
                  <p className="font-mono text-[0.625rem] tracking-[0.14em] text-muted-foreground uppercase">
                    Planned for {formatDayShort(item.scheduledAt)}
                  </p>
                )}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
