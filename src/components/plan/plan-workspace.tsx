"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronDown,
  Loader2,
  MessageSquareQuote,
  RotateCcw,
  Sparkles,
  SkipForward,
} from "lucide-react";

import { SKIP_REASONS, skipReasonLabel } from "@/config/weekly-plan";
import { channelLabel } from "@/config/business-profile";
import { generateWeeklyPlanAction } from "@/lib/weekly-plan/actions";
import {
  completeTaskAction,
  recordTaskOutcomeAction,
  reopenTaskAction,
  skipTaskAction,
} from "@/lib/weekly-plan/task-actions";
import type { PlanRecord, TaskRecord } from "@/lib/weekly-plan/queries";
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
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { formatDayShort } from "@/lib/date";
import { cn } from "@/lib/utils";

/**
 * The week's work.
 *
 * Two decisions per task and nothing else: I did it, or I am not going to. The
 * interface offers no "in progress" and no "blocked", because every extra state
 * is bookkeeping the operator does instead of marketing.
 *
 * Status changes are optimistic — the card moves the moment it is clicked —
 * but an optimistic update that is never reconciled is a lie the interface
 * tells on the server's behalf. So a failed mutation puts the card back where
 * it was and says what happened, rather than leaving a task looking done that
 * is not.
 */

const PRIORITY_VARIANT: Record<string, "warning" | "default" | "outline"> = {
  HIGH: "warning",
  MEDIUM: "default",
  LOW: "outline",
};

function TaskCard({
  task,
  onChanged,
}: {
  task: TaskRecord;
  onChanged: (message?: string) => void;
}) {
  const [pending, startTransition] = useTransition();
  const [expanded, setExpanded] = useState(task.status === "TODO");
  const [skipOpen, setSkipOpen] = useState(false);
  const [outcomeOpen, setOutcomeOpen] = useState(false);
  const [outcomeNote, setOutcomeNote] = useState(task.completionNote ?? "");
  const [skipReason, setSkipReason] = useState<string>(SKIP_REASONS[0].value);
  const [skipNote, setSkipNote] = useState("");
  const [optimistic, setOptimistic] = useState<TaskRecord["status"] | null>(null);

  const status = optimistic ?? task.status;

  const run = (work: () => Promise<{ ok: boolean; message?: string }>, next: TaskRecord["status"]) => {
    setOptimistic(next);

    startTransition(async () => {
      const result = await work();

      if (!result.ok) {
        // Put it back. A card that stays "done" after the server refused is
        // worse than no feedback at all.
        setOptimistic(null);
        onChanged(result.message ?? "That did not save.");
        return;
      }

      setOptimistic(null);
      onChanged();
    });
  };

  return (
    <Card
      className={cn(
        "transition-opacity",
        status !== "TODO" && "opacity-70",
        pending && "pointer-events-none",
      )}
    >
      <CardContent className="space-y-4 p-5">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={PRIORITY_VARIANT[task.priority] ?? "default"}>{task.priority}</Badge>
              <Badge variant="outline">{channelLabel(task.channel)}</Badge>
              {status === "DONE" && (
                <Badge variant="success">
                  <Check className="size-3" /> Done
                </Badge>
              )}
              {status === "SKIPPED" && (
                <Badge variant="outline">Skipped — {skipReasonLabel(task.skipReason ?? "")}</Badge>
              )}
            </div>

            <h3
              className={cn(
                "font-display text-base font-semibold",
                status === "DONE" && "line-through decoration-1",
              )}
            >
              {task.title}
            </h3>

            <p className="text-sm leading-relaxed text-muted-foreground">{task.why}</p>
          </div>

          <Button
            variant="ghost"
            size="icon"
            aria-expanded={expanded}
            aria-label={expanded ? "Hide the steps" : "Show the steps"}
            onClick={() => setExpanded((open) => !open)}
          >
            <ChevronDown className={cn("size-4 transition-transform", expanded && "rotate-180")} />
          </Button>
        </div>

        {expanded && (
          <div className="space-y-4 border-t border-border pt-4">
            <div className="space-y-2">
              <p className="font-mono text-[0.625rem] tracking-[0.14em] text-muted-foreground uppercase">
                Steps
              </p>
              <ol className="list-decimal space-y-1.5 pl-5 text-sm leading-relaxed">
                {task.steps.map((step, index) => (
                  <li key={index}>{step}</li>
                ))}
              </ol>
            </div>

            <div className="space-y-1.5">
              <p className="font-mono text-[0.625rem] tracking-[0.14em] text-muted-foreground uppercase">
                What to expect
              </p>
              <p className="text-sm leading-relaxed text-muted-foreground">
                {task.expectedResult}
              </p>
            </div>

            {task.evidence.length > 0 && (
              <div className="space-y-2">
                <p className="font-mono text-[0.625rem] tracking-[0.14em] text-muted-foreground uppercase">
                  What this rests on
                </p>
                <ul className="space-y-2 text-sm leading-relaxed text-muted-foreground">
                  {task.evidence.map((item) => (
                    <li key={item.id} className="flex flex-wrap items-baseline gap-2">
                      <Badge variant="outline">{item.confidence}</Badge>
                      <span className="min-w-0">{item.claim}</span>
                      {item.sourceUrl && (
                        <a
                          href={item.sourceUrl}
                          target="_blank"
                          rel="noreferrer noopener"
                          className="rounded text-[color:var(--gradient-from)] hover:opacity-80"
                        >
                          {item.sourceTitle || "source"}
                        </a>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {status === "DONE" && task.completionNote && (
              <div className="space-y-1.5 rounded-xl border border-border bg-muted/20 px-4 py-3">
                <p className="font-mono text-[0.625rem] tracking-[0.14em] text-muted-foreground uppercase">
                  Outcome recorded
                </p>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {task.completionNote}
                </p>
              </div>
            )}
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          {status === "TODO" ? (
            <>
              <Button
                size="sm"
                disabled={pending}
                onClick={() => {
                  setOutcomeNote("");
                  setOutcomeOpen(true);
                }}
              >
                {pending ? <Loader2 className="animate-spin" /> : <CheckCircle2 />}
                Done
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={pending}
                onClick={() => setSkipOpen(true)}
              >
                <SkipForward />
                Skip
              </Button>
            </>
          ) : status === "DONE" ? (
            <>
              <Button
                size="sm"
                variant="outline"
                disabled={pending}
                onClick={() => {
                  setOutcomeNote(task.completionNote ?? "");
                  setOutcomeOpen(true);
                }}
              >
                <MessageSquareQuote />
                {task.completionNote ? "Edit outcome" : "Record outcome"}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={pending}
                onClick={() => run(() => reopenTaskAction(task.id), "TODO")}
              >
                {pending ? <Loader2 className="animate-spin" /> : <RotateCcw />}
                Put it back
              </Button>
            </>
          ) : (
            <Button
              size="sm"
              variant="ghost"
              disabled={pending}
              onClick={() => run(() => reopenTaskAction(task.id), "TODO")}
            >
              {pending ? <Loader2 className="animate-spin" /> : <RotateCcw />}
              Put it back
            </Button>
          )}
        </div>
      </CardContent>

      <Dialog open={outcomeOpen} onOpenChange={setOutcomeOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{status === "DONE" ? "Record the outcome" : "Mark task done"}</DialogTitle>
            <DialogDescription>
              Write down what actually happened. This is an operator record, not a claim that Lumen caused the result.
            </DialogDescription>
          </DialogHeader>

          <Field
            name="outcomeNote"
            label="What happened?"
            hint="Examples: 7 replies, 3 demo requests, no change yet, or test is still running."
            optional
          >
            <Textarea
              rows={4}
              value={outcomeNote}
              onChange={(event) => setOutcomeNote(event.target.value)}
              placeholder="Record the factual result you observed."
            />
          </Field>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setOutcomeOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={pending}
              onClick={() => {
                setOutcomeOpen(false);
                const note = outcomeNote.trim() || undefined;
                if (status === "DONE") {
                  run(() => recordTaskOutcomeAction(task.id, note), "DONE");
                } else {
                  run(() => completeTaskAction(task.id, note), "DONE");
                }
              }}
            >
              {pending ? <Loader2 className="animate-spin" /> : null}
              {status === "DONE" ? "Save outcome" : "Mark done"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={skipOpen} onOpenChange={setSkipOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Skip this task</DialogTitle>
            <DialogDescription>
              The reason is not paperwork — next week&rsquo;s plan reads it, and will not suggest
              this again.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <Field name="skipReason" label="Why are you skipping it?">
              <Select value={skipReason} onChange={(event) => setSkipReason(event.target.value)}>
                {SKIP_REASONS.map((reason) => (
                  <option key={reason.value} value={reason.value}>
                    {reason.label}
                  </option>
                ))}
              </Select>
            </Field>

            <Field name="skipNote" label="Anything to add?" optional>
              <Textarea
                rows={3}
                value={skipNote}
                onChange={(event) => setSkipNote(event.target.value)}
                placeholder="Only if it helps you remember."
              />
            </Field>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setSkipOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                setSkipOpen(false);
                run(
                  () =>
                    skipTaskAction(task.id, {
                      reason: skipReason,
                      note: skipNote.trim() || undefined,
                    }),
                  "SKIPPED",
                );
              }}
            >
              Skip it
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

export function PlanWorkspace({
  projectId,
  plan,
  canGenerate,
  blockedReason,
  allowance,
}: {
  projectId: string;
  plan: PlanRecord | null;
  canGenerate: boolean;
  /** Why generating is unavailable, when it is. */
  blockedReason?: string;
  /** Shown beside the button, because that is where the person spends it. */
  allowance: { remaining: number; limit: number };
}) {
  const router = useRouter();
  const [generating, startGenerating] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [dropped, setDropped] = useState<{ title: string; reason: string }[]>([]);

  const generate = () => {
    setMessage(null);
    setDropped([]);

    startGenerating(async () => {
      const result = await generateWeeklyPlanAction(projectId);

      if (!result.ok) {
        setMessage(result.message ?? "The plan could not be generated.");
        setDropped(result.dropped ?? []);
        return;
      }

      setDropped(result.dropped ?? []);
      router.refresh();
    });
  };

  const done = plan?.tasks.filter((task) => task.status === "DONE").length ?? 0;
  const skipped = plan?.tasks.filter((task) => task.status === "SKIPPED").length ?? 0;
  const total = plan?.tasks.length ?? 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1">
          {plan ? (
            <>
              <p className="text-sm text-muted-foreground">
                Week of {formatDayShort(plan.weekStart)} · version {plan.version}
              </p>
              <p className="font-mono text-[0.625rem] tracking-[0.14em] text-muted-foreground uppercase">
                {done} done · {skipped} skipped · {total - done - skipped} to do
              </p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">No plan yet.</p>
          )}
        </div>

        <div className="flex flex-col items-end gap-1.5">
          <Button onClick={generate} disabled={generating || !canGenerate}>
            {generating ? <Loader2 className="animate-spin" /> : <Sparkles />}
            {plan ? "Plan next week" : "Build this week's plan"}
          </Button>
          {/* Beside the button rather than buried in settings: the moment
              someone decides whether to spend an AI action is the moment they
              need to know how many are left. */}
          <p className="font-mono text-[0.625rem] tracking-[0.14em] text-muted-foreground uppercase">
            {allowance.remaining} of {allowance.limit} AI actions left
          </p>
        </div>
      </div>

      {blockedReason && !canGenerate && (
        <p className="rounded-xl border border-border bg-surface/60 px-4 py-3 text-sm text-muted-foreground">
          {blockedReason}
        </p>
      )}

      {message && (
        <p role="alert" className="flex items-start gap-2 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          {message}
        </p>
      )}

      {dropped.length > 0 && (
        <div className="space-y-2 rounded-xl border border-border bg-surface/60 px-4 py-3">
          <p className="font-mono text-[0.625rem] tracking-[0.14em] text-muted-foreground uppercase">
            Left out of the plan
          </p>
          <ul className="space-y-1 text-sm text-muted-foreground">
            {dropped.map((item, index) => (
              <li key={index}>
                <span className="text-foreground">{item.title}</span> — {item.reason}
              </li>
            ))}
          </ul>
        </div>
      )}

      {plan ? (
        <div className="space-y-3">
          {plan.tasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              onChanged={(failure) => {
                if (failure) setMessage(failure);
                else router.refresh();
              }}
            />
          ))}
        </div>
      ) : (
        <EmptyState
          icon={<Sparkles className="size-5" />}
          title="No plan for this week"
          description="LUMEN reads everything recorded about this business and returns a short list of marketing work you can finish this week. Nothing here is a suggestion you cannot act on."
        />
      )}
    </div>
  );
}
