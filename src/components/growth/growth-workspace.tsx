"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, FlaskConical, Loader2, Plus, Sparkles, Sprout, Trash2 } from "lucide-react";

import {
  LEVELS,
  PRIORITIES,
  RECOMMENDATION_STATUSES,
  type LevelKey,
  type RecommendationPriorityKey,
  type RecommendationStatusKey,
} from "@/lib/growth/agent";
import {
  deleteRecommendationAction,
  generateRecommendationsAction,
  saveRecommendationAction,
  setRecommendationStatusAction,
} from "@/lib/growth/actions";
import type { RecommendationRecord } from "@/lib/growth/queries";
import { experimentFromRecommendationAction } from "@/lib/experiments/actions";
import { EmptyState } from "@/components/feedback/empty-state";
import { Badge } from "@/components/ui/badge";
import { SourceBadge } from "@/components/ui/source-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
import { cn } from "@/lib/utils";

const PRIORITY_TONE: Record<string, "danger" | "warning" | "default" | "outline"> = {
  CRITICAL: "danger",
  HIGH: "warning",
  MEDIUM: "default",
  LOW: "outline",
};

const CONFIDENCE_TONE: Record<string, "success" | "warning" | "danger"> = {
  HIGH: "success",
  MEDIUM: "warning",
  LOW: "danger",
};

/**
 * Growth workspace.
 *
 * Recommendations are shown with impact, effort and confidence side by side
 * rather than as a single score. Collapsing them into one number would hide the
 * trade-off that actually decides what to do — a high-impact, high-effort item
 * is not the right first move for a business with one operator.
 */
export function GrowthWorkspace({
  projectId,
  recommendations,
  canGenerate,
  evidenceNote,
}: {
  projectId: string;
  recommendations: RecommendationRecord[];
  canGenerate: boolean;
  evidenceNote: string;
}) {
  const router = useRouter();
  const [generating, startGenerating] = useTransition();
  const [acting, startActing] = useTransition();
  const [saving, startSaving] = useTransition();

  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [guidance, setGuidance] = useState("");
  const [genOpen, setGenOpen] = useState(false);

  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<RecommendationRecord | null>(null);
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [formMessage, setFormMessage] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});

  const [statusFilter, setStatusFilter] = useState("");
  const visible = recommendations.filter(
    (entry) => !statusFilter || entry.status === statusFilter,
  );

  function generate() {
    setError(null);
    setNotice(null);

    startGenerating(async () => {
      const result = await generateRecommendationsAction(projectId, guidance || undefined);

      if (!result.ok) {
        setError(result.message ?? "Could not generate recommendations.");
        return;
      }

      // Clamping is reported rather than applied silently: the operator should
      // know the model claimed more certainty than the evidence supports.
      if (result.clamped && result.clamped > 0) {
        setNotice(
          `${result.clamped} of ${result.created} recommendations had their confidence reduced to match the evidence on record.`,
        );
      }

      setGenOpen(false);
      setGuidance("");
      router.refresh();
    });
  }

  function openEditor(entry: RecommendationRecord | null) {
    setEditing(entry);
    setErrors({});
    setFormMessage(null);
    setDraft({
      title: entry?.title ?? "",
      insight: entry?.insight ?? "",
      reason: entry?.reason ?? "",
      action: entry?.action ?? "",
      priority: entry?.priority ?? "MEDIUM",
      impact: entry?.impact ?? "MEDIUM",
      effort: entry?.effort ?? "MEDIUM",
      confidence: entry?.confidence ?? "LOW",
      confidenceReason: entry?.confidenceReason ?? "",
      status: entry?.status ?? "OPEN",
    });
    setEditorOpen(true);
  }

  function save() {
    setErrors({});
    setFormMessage(null);

    startSaving(async () => {
      const result = await saveRecommendationAction(projectId, {
        recommendationId: editing?.id,
        title: draft.title ?? "",
        insight: draft.insight ?? "",
        reason: draft.reason ?? "",
        action: draft.action ?? "",
        priority: (draft.priority ?? "MEDIUM") as RecommendationPriorityKey,
        impact: (draft.impact ?? "MEDIUM") as LevelKey,
        effort: (draft.effort ?? "MEDIUM") as LevelKey,
        confidence: (draft.confidence ?? "LOW") as LevelKey,
        confidenceReason: draft.confidenceReason ?? "",
        status: (draft.status ?? "OPEN") as RecommendationStatusKey,
      });

      if (!result.ok) {
        setErrors(result.fieldErrors ?? {});
        setFormMessage(result.message ?? "Could not save.");
        return;
      }

      setEditorOpen(false);
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        {canGenerate && (
          <Button onClick={() => setGenOpen(true)} disabled={generating}>
            {generating ? <Loader2 className="animate-spin" /> : <Sparkles />}
            {recommendations.length > 0 ? "Re-run ASCEND" : "Ask ASCEND"}
          </Button>
        )}
        <Button variant="ghost" onClick={() => openEditor(null)}>
          <Plus />
          Add your own
        </Button>

        {recommendations.length > 0 && (
          <Select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            aria-label="Filter by status"
            className="ml-auto h-9 w-40 text-xs"
          >
            <option value="">All statuses</option>
            {RECOMMENDATION_STATUSES.map((status) => (
              <option key={status.key} value={status.key}>
                {status.label}
              </option>
            ))}
          </Select>
        )}
      </div>

      <p className="rounded-xl border border-dashed border-border px-4 py-2.5 text-xs leading-relaxed text-muted-foreground">
        {evidenceNote}
      </p>

      {notice && (
        <p className="rounded-xl border border-warning/35 bg-warning/8 px-4 py-2.5 text-xs leading-relaxed text-foreground">
          {notice}
        </p>
      )}

      {error && (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-xl border border-destructive/35 bg-destructive/10 px-4 py-3"
        >
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
          <p className="text-sm leading-relaxed text-foreground">{error}</p>
        </div>
      )}

      {recommendations.length === 0 ? (
        <EmptyState
          icon={<Sprout className="size-5" />}
          title="No opportunities yet"
          description="ASCEND reads everything recorded for this project — profile, strategy, audience, competitors, content, campaigns and any performance you have entered — and decides what to do next."
          action={
            canGenerate ? (
              <Button onClick={() => setGenOpen(true)}>
                <Sparkles />
                Ask ASCEND
              </Button>
            ) : undefined
          }
        />
      ) : visible.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
          Nothing with that status.
        </p>
      ) : (
        <div className="space-y-3">
          {visible.map((entry) => (
            <Card
              key={entry.id}
              className={cn(
                (entry.status === "DONE" || entry.status === "DISMISSED") && "opacity-60",
              )}
            >
              <CardContent className="space-y-4 p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 space-y-2">
                    <h3 className="font-display text-base font-semibold">{entry.title}</h3>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge variant={PRIORITY_TONE[entry.priority]}>{entry.priority}</Badge>
                      <Badge variant="outline">Impact {entry.impact}</Badge>
                      <Badge variant="outline">Effort {entry.effort}</Badge>
                      <Badge variant={CONFIDENCE_TONE[entry.confidence]}>
                        {entry.confidence} confidence
                      </Badge>
                      <SourceBadge source={entry.source} agent="ASCEND" />
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-1">
                    <Select
                      value={entry.status}
                      aria-label="Status"
                      className="h-8 w-36 text-xs"
                      disabled={acting}
                      onChange={(event) =>
                        startActing(async () => {
                          await setRecommendationStatusAction(
                            projectId,
                            entry.id,
                            event.target.value as RecommendationStatusKey,
                          );
                          router.refresh();
                        })
                      }
                    >
                      {RECOMMENDATION_STATUSES.map((status) => (
                        <option key={status.key} value={status.key}>
                          {status.label}
                        </option>
                      ))}
                    </Select>

                    <Button variant="ghost" size="sm" onClick={() => openEditor(entry)}>
                      Edit
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Delete ${entry.title}`}
                      disabled={acting}
                      onClick={() =>
                        startActing(async () => {
                          await deleteRecommendationAction(projectId, entry.id);
                          router.refresh();
                        })
                      }
                    >
                      {acting ? <Loader2 className="animate-spin" /> : <Trash2 />}
                    </Button>
                  </div>
                </div>

                <dl className="space-y-2.5 text-sm">
                  <div className="space-y-0.5">
                    <dt className="font-mono text-[0.625rem] tracking-[0.16em] text-muted-foreground uppercase">
                      What is happening
                    </dt>
                    <dd className="leading-relaxed text-muted-foreground">{entry.insight}</dd>
                  </div>
                  <div className="space-y-0.5">
                    <dt className="font-mono text-[0.625rem] tracking-[0.16em] text-muted-foreground uppercase">
                      Why it matters
                    </dt>
                    <dd className="leading-relaxed text-muted-foreground">{entry.reason}</dd>
                  </div>
                </dl>

                <div className="rounded-xl border border-primary/25 bg-primary/8 p-3.5">
                  <p className="font-mono text-[0.625rem] tracking-[0.16em] text-[color:var(--gradient-from)] uppercase">
                    Do this
                  </p>
                  <p className="mt-1 text-sm leading-relaxed font-medium text-foreground">
                    {entry.action}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
                  {/* An experiment is how a recommendation stops being an
                      opinion and starts producing evidence. */}
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={acting}
                    onClick={() =>
                      startActing(async () => {
                        setError(null);
                        const result = await experimentFromRecommendationAction(
                          projectId,
                          entry.id,
                        );
                        if (!result.ok) {
                          setError(result.message ?? "Could not create the experiment.");
                          return;
                        }
                        router.push("/growth/experiments");
                      })
                    }
                  >
                    <FlaskConical />
                    Run as an experiment
                  </Button>
                </div>

                <div className="space-y-1.5">
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    <span className="font-mono text-[0.625rem] tracking-[0.14em] uppercase">
                      Confidence:{" "}
                    </span>
                    {entry.confidenceReason}
                  </p>
                  {entry.basedOn.length > 0 && (
                    <p className="flex flex-wrap gap-1.5">
                      {entry.basedOn.map((source) => (
                        <Badge key={source} variant="outline">
                          {source}
                        </Badge>
                      ))}
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Generation */}
      <Dialog open={genOpen} onOpenChange={(next) => !generating && setGenOpen(next)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ask ASCEND</DialogTitle>
            <DialogDescription>
              ASCEND reads everything recorded for this project. Recommendations you have accepted,
              started, completed or dismissed are kept — only untouched suggestions are replaced.
            </DialogDescription>
          </DialogHeader>

          <div className="mt-5 space-y-4">
            <Field name="guidance" label="Anything to focus on" optional>
              <Textarea
                value={guidance}
                onChange={(event) => setGuidance(event.target.value)}
                rows={3}
                placeholder="We have no budget for paid this quarter — focus on organic."
              />
            </Field>

            <DialogFooter>
              <Button variant="ghost" onClick={() => setGenOpen(false)} disabled={generating}>
                Cancel
              </Button>
              <Button onClick={generate} disabled={generating} aria-busy={generating}>
                {generating && <Loader2 className="animate-spin" />}
                {generating ? "Thinking…" : "Generate"}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      {/* Manual editor */}
      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit recommendation" : "Add a recommendation"}</DialogTitle>
            <DialogDescription>
              {editing ? "Editing marks this as yours." : "Your own call, recorded alongside ASCEND's."}
            </DialogDescription>
          </DialogHeader>

          <div className="mt-5 space-y-4">
            <Field name="title" label="Title" errors={errors.title}>
              <Input
                value={draft.title ?? ""}
                onChange={(event) => setDraft({ ...draft, title: event.target.value })}
              />
            </Field>

            <Field name="insight" label="What is happening" errors={errors.insight}>
              <Textarea
                value={draft.insight ?? ""}
                onChange={(event) => setDraft({ ...draft, insight: event.target.value })}
                rows={2}
              />
            </Field>

            <Field name="reason" label="Why it matters" errors={errors.reason}>
              <Textarea
                value={draft.reason ?? ""}
                onChange={(event) => setDraft({ ...draft, reason: event.target.value })}
                rows={2}
              />
            </Field>

            <Field name="action" label="What to do" errors={errors.action}>
              <Textarea
                value={draft.action ?? ""}
                onChange={(event) => setDraft({ ...draft, action: event.target.value })}
                rows={2}
              />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field name="priority" label="Priority">
                <Select
                  value={draft.priority ?? "MEDIUM"}
                  onChange={(event) => setDraft({ ...draft, priority: event.target.value })}
                >
                  {PRIORITIES.map((priority) => (
                    <option key={priority} value={priority}>
                      {priority}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field name="status" label="Status">
                <Select
                  value={draft.status ?? "OPEN"}
                  onChange={(event) => setDraft({ ...draft, status: event.target.value })}
                >
                  {RECOMMENDATION_STATUSES.map((status) => (
                    <option key={status.key} value={status.key}>
                      {status.label}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field name="impact" label="Impact">
                <Select
                  value={draft.impact ?? "MEDIUM"}
                  onChange={(event) => setDraft({ ...draft, impact: event.target.value })}
                >
                  {LEVELS.map((level) => (
                    <option key={level} value={level}>
                      {level}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field name="effort" label="Effort">
                <Select
                  value={draft.effort ?? "MEDIUM"}
                  onChange={(event) => setDraft({ ...draft, effort: event.target.value })}
                >
                  {LEVELS.map((level) => (
                    <option key={level} value={level}>
                      {level}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>

            <Field name="confidence" label="Confidence">
              <Select
                value={draft.confidence ?? "LOW"}
                onChange={(event) => setDraft({ ...draft, confidence: event.target.value })}
              >
                {LEVELS.map((level) => (
                  <option key={level} value={level}>
                    {level}
                  </option>
                ))}
              </Select>
            </Field>

            <Field
              name="confidenceReason"
              label="Why that confidence"
              errors={errors.confidenceReason}
            >
              <Textarea
                value={draft.confidenceReason ?? ""}
                onChange={(event) => setDraft({ ...draft, confidenceReason: event.target.value })}
                rows={2}
              />
            </Field>

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
                {editing ? "Save changes" : "Add"}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
