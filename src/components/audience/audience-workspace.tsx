"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Loader2, Plus, Sparkles, Users } from "lucide-react";

import { generateAudienceAction, saveSegmentAction } from "@/lib/audience/actions";
import type { SegmentRecord } from "@/lib/audience/queries";
import { SegmentCard } from "@/components/audience/segment-card";
import { SegmentCompare } from "@/components/audience/segment-compare";
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
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState } from "@/components/feedback/empty-state";

const LIST_FIELDS = [
  { name: "painPoints", label: "Pain points" },
  { name: "motivations", label: "Motivations" },
  { name: "buyingTriggers", label: "Buying triggers" },
  { name: "objections", label: "Objections" },
  { name: "preferredChannels", label: "Preferred channels" },
  { name: "messagingAngles", label: "Messaging angles" },
] as const;

/**
 * Audience workspace.
 *
 * Holds the three things the spec asks for in one place — generate, manage,
 * compare — because they are the same task at different zoom levels, and
 * splitting them across routes would mean losing your place to compare two
 * segments you just edited.
 */
export function AudienceWorkspace({
  projectId,
  segments,
  canGenerate,
}: {
  projectId: string;
  segments: SegmentRecord[];
  canGenerate: boolean;
}) {
  const router = useRouter();
  const [generating, startGenerating] = useTransition();
  const [genError, setGenError] = useState<string | null>(null);

  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<SegmentRecord | null>(null);

  const [saving, startSaving] = useTransition();
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [formMessage, setFormMessage] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});

  const manualCount = segments.filter((segment) => segment.source !== "AI").length;

  function generate() {
    setGenError(null);
    startGenerating(async () => {
      const result = await generateAudienceAction(projectId);
      if (!result.ok) {
        setGenError(result.message ?? "Could not generate the audience analysis.");
        return;
      }
      router.refresh();
    });
  }

  function openEditor(segment: SegmentRecord | null) {
    setEditing(segment);
    setErrors({});
    setFormMessage(null);
    setDraft({
      name: segment?.name ?? "",
      description: segment?.description ?? "",
      kind: segment?.kind ?? "B2B",
      ...Object.fromEntries(
        LIST_FIELDS.map((field) => [field.name, (segment?.[field.name] ?? []).join("\n")]),
      ),
    });
    setEditorOpen(true);
  }

  /** One entry per line, trimmed and capped. */
  function toList(value: string | undefined) {
    return (value ?? "")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(0, 12);
  }

  function save() {
    setErrors({});
    setFormMessage(null);

    startSaving(async () => {
      const result = await saveSegmentAction(projectId, {
        segmentId: editing?.id,
        name: draft.name ?? "",
        description: draft.description ?? "",
        kind: draft.kind ?? "B2B",
        painPoints: toList(draft.painPoints),
        motivations: toList(draft.motivations),
        buyingTriggers: toList(draft.buyingTriggers),
        objections: toList(draft.objections),
        preferredChannels: toList(draft.preferredChannels),
        messagingAngles: toList(draft.messagingAngles),
      });

      if (!result.ok) {
        setErrors(result.fieldErrors ?? {});
        setFormMessage(result.message ?? "Could not save.");
        return;
      }

      setEditorOpen(false);
      setEditing(null);
      router.refresh();
    });
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center gap-2">
        {canGenerate && (
          <Button onClick={generate} disabled={generating} variant={segments.length ? "outline" : "primary"}>
            {generating ? <Loader2 className="animate-spin" /> : <Sparkles />}
            {generating ? "Analysing…" : segments.length ? "Regenerate with PULSE" : "Generate audience"}
          </Button>
        )}
        <Button variant="ghost" onClick={() => openEditor(null)}>
          <Plus />
          Add segment
        </Button>
      </div>

      {segments.length > 0 && manualCount > 0 && (
        <p className="text-xs leading-relaxed text-muted-foreground">
          Regenerating replaces only the segments PULSE wrote. Your {manualCount}{" "}
          {manualCount === 1 ? "segment is" : "segments are"} kept.
        </p>
      )}

      {genError && (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-xl border border-destructive/35 bg-destructive/10 px-4 py-3"
        >
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
          <p className="text-sm leading-relaxed text-foreground">{genError}</p>
        </div>
      )}

      {segments.length === 0 ? (
        <EmptyState
          icon={<Users className="size-5" />}
          title="No audience defined"
          description="PULSE reads this project's profile and identifies who buys, why, and what would stop them. You can also add a segment yourself."
          action={
            canGenerate ? (
              <Button onClick={generate} disabled={generating}>
                {generating ? <Loader2 className="animate-spin" /> : <Sparkles />}
                Generate audience
              </Button>
            ) : undefined
          }
        />
      ) : (
        <>
          <div className="space-y-4">
            {segments.map((segment) => (
              <SegmentCard
                key={segment.id}
                projectId={projectId}
                segment={segment}
                onEdit={openEditor}
              />
            ))}
          </div>

          <SegmentCompare segments={segments} />
        </>
      )}

      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit segment" : "Add a segment"}</DialogTitle>
            <DialogDescription>
              {editing
                ? "Editing marks this segment as yours, so PULSE will not replace it."
                : "One entry per line in the lists."}
            </DialogDescription>
          </DialogHeader>

          <div className="mt-5 space-y-4">
            <Field name="name" label="Name" errors={errors.name}>
              <Input
                value={draft.name ?? ""}
                onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                placeholder="Solo operators"
              />
            </Field>

            <Field name="description" label="Description" errors={errors.description}>
              <Textarea
                value={draft.description ?? ""}
                onChange={(event) => setDraft({ ...draft, description: event.target.value })}
                rows={2}
                placeholder="Founders running marketing themselves alongside everything else."
              />
            </Field>

            <Field name="kind" label="Type" errors={errors.kind}>
              <Select
                value={draft.kind ?? "B2B"}
                onChange={(event) => setDraft({ ...draft, kind: event.target.value })}
              >
                <option value="B2B">B2B — selling to businesses</option>
                <option value="B2C">B2C — selling to consumers</option>
              </Select>
            </Field>

            {LIST_FIELDS.map((field) => (
              <Field key={field.name} name={field.name} label={field.label} optional>
                <Textarea
                  value={draft[field.name] ?? ""}
                  onChange={(event) => setDraft({ ...draft, [field.name]: event.target.value })}
                  rows={3}
                  placeholder="One per line"
                />
              </Field>
            ))}

            {formMessage && (
              <p role="alert" className="text-xs text-destructive">
                {formMessage}
              </p>
            )}

            <DialogFooter>
              <Button variant="ghost" onClick={() => setEditorOpen(false)} disabled={saving}>
                Cancel
              </Button>
              <Button onClick={save} disabled={saving} aria-busy={saving}>
                {saving && <Loader2 className="animate-spin" />}
                {editing ? "Save changes" : "Add segment"}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
