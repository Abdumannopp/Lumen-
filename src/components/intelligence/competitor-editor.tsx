"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

import { saveCompetitorAction } from "@/lib/intelligence/actions";
import type { CompetitorRecord } from "@/lib/intelligence/queries";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

/**
 * Competitor entry.
 *
 * Every field but the name is optional, and the dialog says why filling them in
 * matters: SCOUT cannot look anything up, so a sparse record produces a sparse
 * analysis. That is stated once here rather than repeated as a warning later.
 */
export function CompetitorEditor({
  projectId,
  competitor,
  open,
  onOpenChange,
}: {
  projectId: string;
  competitor: CompetitorRecord | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [saving, startSaving] = useTransition();
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [message, setMessage] = useState<string | null>(null);

  const [draft, setDraft] = useState({
    name: competitor?.name ?? "",
    website: competitor?.website ?? "",
    description: competitor?.description ?? "",
    strengths: (competitor?.strengths ?? []).join("\n"),
    weaknesses: (competitor?.weaknesses ?? []).join("\n"),
    positioning: competitor?.positioning ?? "",
    pricingNotes: competitor?.pricingNotes ?? "",
    marketingNotes: competitor?.marketingNotes ?? "",
  });

  function toList(value: string) {
    return value
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(0, 15);
  }

  function save() {
    setErrors({});
    setMessage(null);

    startSaving(async () => {
      const result = await saveCompetitorAction(projectId, {
        competitorId: competitor?.id,
        name: draft.name,
        website: draft.website,
        description: draft.description,
        strengths: toList(draft.strengths),
        weaknesses: toList(draft.weaknesses),
        positioning: draft.positioning,
        pricingNotes: draft.pricingNotes,
        marketingNotes: draft.marketingNotes,
      });

      if (!result.ok) {
        setErrors(result.fieldErrors ?? {});
        setMessage(result.message ?? "Could not save.");
        return;
      }

      onOpenChange(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{competitor ? "Edit competitor" : "Add a competitor"}</DialogTitle>
          <DialogDescription>
            SCOUT has no internet access, so it can only reason about what you record here. The
            more you write, the more grounded its analysis is.
          </DialogDescription>
        </DialogHeader>

        <div className="mt-5 space-y-4">
          <Field name="name" label="Name" errors={errors.name}>
            <Input
              value={draft.name}
              onChange={(event) => setDraft({ ...draft, name: event.target.value })}
              placeholder="Northwind Analytics"
            />
          </Field>

          <Field name="website" label="Website" optional errors={errors.website}>
            <Input
              value={draft.website}
              onChange={(event) => setDraft({ ...draft, website: event.target.value })}
              placeholder="northwind.com"
            />
          </Field>

          <Field name="description" label="What they do" optional errors={errors.description}>
            <Textarea
              value={draft.description}
              onChange={(event) => setDraft({ ...draft, description: event.target.value })}
              rows={2}
            />
          </Field>

          <Field name="strengths" label="Strengths" optional hint="One per line.">
            <Textarea
              value={draft.strengths}
              onChange={(event) => setDraft({ ...draft, strengths: event.target.value })}
              rows={3}
            />
          </Field>

          <Field name="weaknesses" label="Weaknesses" optional hint="One per line.">
            <Textarea
              value={draft.weaknesses}
              onChange={(event) => setDraft({ ...draft, weaknesses: event.target.value })}
              rows={3}
            />
          </Field>

          <Field name="positioning" label="Positioning" optional>
            <Textarea
              value={draft.positioning}
              onChange={(event) => setDraft({ ...draft, positioning: event.target.value })}
              rows={2}
            />
          </Field>

          <Field name="pricingNotes" label="Pricing notes" optional>
            <Textarea
              value={draft.pricingNotes}
              onChange={(event) => setDraft({ ...draft, pricingNotes: event.target.value })}
              rows={2}
            />
          </Field>

          <Field name="marketingNotes" label="Marketing notes" optional>
            <Textarea
              value={draft.marketingNotes}
              onChange={(event) => setDraft({ ...draft, marketingNotes: event.target.value })}
              rows={2}
            />
          </Field>

          {message && (
            <p role="alert" className="text-xs text-destructive">
              {message}
            </p>
          )}

          <DialogFooter>
            <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={save} disabled={saving} aria-busy={saving}>
              {saving && <Loader2 className="animate-spin" />}
              {competitor ? "Save changes" : "Add competitor"}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
