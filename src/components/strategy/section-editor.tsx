"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Pencil, RefreshCw, X } from "lucide-react";

import { editSectionAction, regenerateSectionAction } from "@/lib/strategy/actions";
import type { StrategySectionKey } from "@/lib/strategy/agent";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";

/**
 * One strategy section: read, edit in place, or ask ATLAS to rewrite it.
 *
 * The provenance badge is always visible. An operator returning to this page a
 * week later needs to know at a glance which sentences are theirs and which the
 * model wrote — without that, AI output silently becomes remembered fact.
 */
export function SectionEditor({
  projectId,
  sectionKey,
  title,
  content,
  source,
}: {
  projectId: string;
  sectionKey: StrategySectionKey;
  title: string;
  content: string;
  source: "ai" | "edited";
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(content);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function save() {
    setError(null);
    startTransition(async () => {
      const result = await editSectionAction(projectId, sectionKey, draft);
      if (!result.ok) {
        setError(result.message ?? "Could not save.");
        return;
      }
      setEditing(false);
      router.refresh();
    });
  }

  function regenerate() {
    setError(null);
    startTransition(async () => {
      const result = await regenerateSectionAction(projectId, sectionKey);
      if (!result.ok) {
        setError(result.message ?? "Could not regenerate.");
        return;
      }
      router.refresh();
    });
  }

  return (
    <Card id={sectionKey} className="scroll-mt-24">
      <CardContent className="space-y-4 p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <h3 className="font-display text-base font-semibold">{title}</h3>
            <Badge variant={source === "edited" ? "default" : "accent"}>
              {source === "edited" ? "Yours" : "ATLAS"}
            </Badge>
          </div>

          {!editing && (
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setDraft(content);
                  setEditing(true);
                }}
                disabled={pending}
              >
                <Pencil />
                Edit
              </Button>
              <Button variant="ghost" size="sm" onClick={regenerate} disabled={pending}>
                {pending ? <Loader2 className="animate-spin" /> : <RefreshCw />}
                Rewrite
              </Button>
            </div>
          )}
        </div>

        {editing ? (
          <div className="space-y-3">
            <Textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              rows={8}
              maxLength={6000}
              aria-label={`${title} content`}
            />
            <div className="flex items-center gap-2">
              <Button size="sm" onClick={save} disabled={pending}>
                {pending ? <Loader2 className="animate-spin" /> : <Check />}
                Save
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setEditing(false);
                  setDraft(content);
                  setError(null);
                }}
                disabled={pending}
              >
                <X />
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <p className="text-sm leading-relaxed whitespace-pre-wrap text-muted-foreground">
            {content}
          </p>
        )}

        {error && (
          <p role="alert" className="text-xs text-destructive">
            {error}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
