"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, FlaskConical, Loader2, Plus, Trash2 } from "lucide-react";

import {
  EXPERIMENT_STATUSES,
  type ExperimentStatusKey,
} from "@/lib/experiments/agent";
import {
  deleteExperimentAction,
  saveExperimentAction,
  setExperimentStatusAction,
} from "@/lib/experiments/actions";
import type { ExperimentRecord } from "@/lib/experiments/queries";
import { EmptyState } from "@/components/feedback/empty-state";
import { Badge } from "@/components/ui/badge";
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
import { toDayInput } from "@/lib/date";

const STATUS_TONE: Record<string, "success" | "warning" | "accent" | "outline" | "default"> = {
  RUNNING: "accent",
  PLANNED: "warning",
  IDEA: "outline",
  COMPLETED: "success",
  CANCELLED: "default",
};

/**
 * Experiments workspace.
 *
 * A completed experiment without a learning is flagged rather than hidden: it
 * is the one state that looks finished but contributes nothing downstream, so
 * making it visible is the point.
 */
export function ExperimentWorkspace({
  projectId,
  experiments,
}: {
  projectId: string;
  experiments: ExperimentRecord[];
}) {
  const router = useRouter();
  const [acting, startActing] = useTransition();
  const [saving, startSaving] = useTransition();

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ExperimentRecord | null>(null);
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});

  const [statusFilter, setStatusFilter] = useState("");
  const visible = experiments.filter((entry) => !statusFilter || entry.status === statusFilter);

  function openEditor(entry: ExperimentRecord | null) {
    setEditing(entry);
    setErrors({});
    setMessage(null);
    setDraft({
      name: entry?.name ?? "",
      hypothesis: entry?.hypothesis ?? "",
      targetMetric: entry?.targetMetric ?? "",
      action: entry?.action ?? "",
      expectedResult: entry?.expectedResult ?? "",
      startDate: toDayInput(entry?.startDate),
      endDate: toDayInput(entry?.endDate),
      status: entry?.status ?? "IDEA",
      actualResult: entry?.actualResult ?? "",
      learning: entry?.learning ?? "",
    });
    setOpen(true);
  }

  function save() {
    setErrors({});
    setMessage(null);

    startSaving(async () => {
      const result = await saveExperimentAction(projectId, {
        experimentId: editing?.id,
        name: draft.name ?? "",
        hypothesis: draft.hypothesis ?? "",
        targetMetric: draft.targetMetric ?? "",
        action: draft.action ?? "",
        expectedResult: draft.expectedResult,
        startDate: draft.startDate,
        endDate: draft.endDate,
        status: (draft.status ?? "IDEA") as ExperimentStatusKey,
        actualResult: draft.actualResult,
        learning: draft.learning,
        recommendationId: editing?.recommendationId ?? undefined,
      });

      if (!result.ok) {
        setErrors(result.fieldErrors ?? {});
        setMessage(result.message ?? "Could not save.");
        return;
      }

      setOpen(false);
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={() => openEditor(null)}>
          <Plus />
          New experiment
        </Button>

        {experiments.length > 0 && (
          <Select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            aria-label="Filter by status"
            className="ml-auto h-9 w-36 text-xs"
          >
            <option value="">All statuses</option>
            {EXPERIMENT_STATUSES.map((status) => (
              <option key={status.key} value={status.key}>
                {status.label}
              </option>
            ))}
          </Select>
        )}
      </div>

      {statusError && (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-xl border border-destructive/35 bg-destructive/10 px-4 py-3"
        >
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
          <p className="text-sm leading-relaxed text-foreground">{statusError}</p>
        </div>
      )}

      {experiments.length === 0 ? (
        <EmptyState
          icon={<FlaskConical className="size-5" />}
          title="No experiments yet"
          description="An experiment is a claim you could be wrong about, a way to test it, and one metric to judge it by. Start one from a growth recommendation, or write your own."
          action={
            <Button onClick={() => openEditor(null)}>
              <Plus />
              New experiment
            </Button>
          }
        />
      ) : visible.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
          Nothing with that status.
        </p>
      ) : (
        <div className="space-y-3">
          {visible.map((entry) => {
            const finishedWithoutLearning = entry.status === "COMPLETED" && !entry.learning;

            return (
              <Card
                key={entry.id}
                className={cn(entry.status === "CANCELLED" && "opacity-60")}
              >
                <CardContent className="space-y-4 p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 space-y-2">
                      <h3 className="font-display text-base font-semibold">{entry.name}</h3>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Badge variant={STATUS_TONE[entry.status]}>
                          {EXPERIMENT_STATUSES.find((s) => s.key === entry.status)?.label}
                        </Badge>
                        <Badge variant="outline">{entry.targetMetric}</Badge>
                        {entry.recommendationTitle && (
                          <Badge variant="accent">From a recommendation</Badge>
                        )}
                        {finishedWithoutLearning && (
                          <Badge variant="warning">No learning recorded</Badge>
                        )}
                      </div>
                    </div>

                    <div className="flex shrink-0 items-center gap-1">
                      <Select
                        value={entry.status}
                        aria-label="Status"
                        className="h-8 w-32 text-xs"
                        disabled={acting}
                        onChange={(event) =>
                          startActing(async () => {
                            setStatusError(null);
                            const result = await setExperimentStatusAction(
                              projectId,
                              entry.id,
                              event.target.value as ExperimentStatusKey,
                            );
                            if (!result.ok) {
                              setStatusError(result.message ?? "Could not change the status.");
                              return;
                            }
                            router.refresh();
                          })
                        }
                      >
                        {EXPERIMENT_STATUSES.map((status) => (
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
                        aria-label={`Delete ${entry.name}`}
                        disabled={acting}
                        onClick={() =>
                          startActing(async () => {
                            await deleteExperimentAction(projectId, entry.id);
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
                        Hypothesis
                      </dt>
                      <dd className="leading-relaxed text-muted-foreground">{entry.hypothesis}</dd>
                    </div>
                    <div className="space-y-0.5">
                      <dt className="font-mono text-[0.625rem] tracking-[0.16em] text-muted-foreground uppercase">
                        What we will do
                      </dt>
                      <dd className="leading-relaxed text-muted-foreground">{entry.action}</dd>
                    </div>
                    {entry.expectedResult && (
                      <div className="space-y-0.5">
                        <dt className="font-mono text-[0.625rem] tracking-[0.16em] text-muted-foreground uppercase">
                          Expected
                        </dt>
                        <dd className="leading-relaxed text-muted-foreground">
                          {entry.expectedResult}
                        </dd>
                      </div>
                    )}
                  </dl>

                  {(entry.actualResult || entry.learning) && (
                    <div className="space-y-2.5 rounded-xl border border-border bg-surface/50 p-4">
                      {entry.actualResult && (
                        <div className="space-y-0.5">
                          <p className="font-mono text-[0.625rem] tracking-[0.16em] text-muted-foreground uppercase">
                            What happened
                          </p>
                          <p className="text-sm leading-relaxed text-muted-foreground">
                            {entry.actualResult}
                          </p>
                        </div>
                      )}
                      {entry.learning && (
                        <div className="space-y-0.5">
                          <p className="font-mono text-[0.625rem] tracking-[0.16em] text-[color:var(--gradient-from)] uppercase">
                            Learning
                          </p>
                          <p className="text-sm leading-relaxed text-foreground">
                            {entry.learning}
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit experiment" : "New experiment"}</DialogTitle>
            <DialogDescription>
              A hypothesis is a claim that could turn out false. Without one there is nothing to be
              wrong about, and so nothing to learn.
            </DialogDescription>
          </DialogHeader>

          <div className="mt-5 space-y-4">
            <Field name="name" label="Name" errors={errors.name}>
              <Input
                value={draft.name ?? ""}
                onChange={(event) => setDraft({ ...draft, name: event.target.value })}
              />
            </Field>

            <Field name="hypothesis" label="Hypothesis" errors={errors.hypothesis}>
              <Textarea
                value={draft.hypothesis ?? ""}
                onChange={(event) => setDraft({ ...draft, hypothesis: event.target.value })}
                rows={3}
                placeholder="Shorter onboarding emails will lift activation, because most drop-off happens before the first send is read."
              />
            </Field>

            <Field name="targetMetric" label="Metric it is judged by" errors={errors.targetMetric}>
              <Input
                value={draft.targetMetric ?? ""}
                onChange={(event) => setDraft({ ...draft, targetMetric: event.target.value })}
                placeholder="Activation rate"
              />
            </Field>

            <Field name="action" label="What you will do" errors={errors.action}>
              <Textarea
                value={draft.action ?? ""}
                onChange={(event) => setDraft({ ...draft, action: event.target.value })}
                rows={2}
              />
            </Field>

            <Field name="expectedResult" label="What you expect" optional>
              <Textarea
                value={draft.expectedResult ?? ""}
                onChange={(event) => setDraft({ ...draft, expectedResult: event.target.value })}
                rows={2}
              />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field name="startDate" label="Starts" optional errors={errors.startDate}>
                <Input
                  type="date"
                  value={draft.startDate ?? ""}
                  onChange={(event) => setDraft({ ...draft, startDate: event.target.value })}
                />
              </Field>
              <Field name="endDate" label="Ends" optional errors={errors.endDate}>
                <Input
                  type="date"
                  value={draft.endDate ?? ""}
                  onChange={(event) => setDraft({ ...draft, endDate: event.target.value })}
                />
              </Field>
            </div>

            <Field name="status" label="Status">
              <Select
                value={draft.status ?? "IDEA"}
                onChange={(event) => setDraft({ ...draft, status: event.target.value })}
              >
                {EXPERIMENT_STATUSES.map((status) => (
                  <option key={status.key} value={status.key}>
                    {status.label}
                  </option>
                ))}
              </Select>
            </Field>

            <div className="space-y-4 border-t border-border pt-4">
              <p className="font-mono text-[0.625rem] tracking-[0.16em] text-muted-foreground uppercase">
                After it runs
              </p>

              <Field name="actualResult" label="What actually happened" errors={errors.actualResult}>
                <Textarea
                  value={draft.actualResult ?? ""}
                  onChange={(event) => setDraft({ ...draft, actualResult: event.target.value })}
                  rows={2}
                />
              </Field>

              <Field
                name="learning"
                label="What you learned"
                errors={errors.learning}
                hint="This is read back into future advice for this project."
              >
                <Textarea
                  value={draft.learning ?? ""}
                  onChange={(event) => setDraft({ ...draft, learning: event.target.value })}
                  rows={3}
                />
              </Field>
            </div>

            {message && (
              <p role="alert" className="flex items-start gap-2 text-xs text-destructive">
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                {message}
              </p>
            )}

            <DialogFooter>
              <Button variant="ghost" onClick={() => setOpen(false)} disabled={saving}>
                Cancel
              </Button>
              <Button onClick={save} disabled={saving} aria-busy={saving}>
                {saving && <Loader2 className="animate-spin" />}
                {editing ? "Save changes" : "Create"}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
