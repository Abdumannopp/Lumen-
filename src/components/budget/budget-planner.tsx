"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Check, Loader2, Save, Scale, Sparkles, Trash2 } from "lucide-react";

import {
  BUDGET_CATEGORIES,
  PRIORITIES,
  categoryLabel,
  type BudgetCategoryKey,
  type Priority,
} from "@/lib/budget/agent";
import {
  deleteBudgetPlanAction,
  saveBudgetPlanAction,
  suggestBudgetAction,
} from "@/lib/budget/actions";
import type { BudgetPlanRecord } from "@/lib/budget/queries";
import { CURRENCIES } from "@/config/business-profile";
import { Badge } from "@/components/ui/badge";
import { SourceBadge } from "@/components/ui/source-badge";
import { Button } from "@/components/ui/button";
import { SectionHeading } from "@/components/layout/section-heading";
import { Card, CardContent } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

interface DraftLine {
  category: BudgetCategoryKey;
  amount: string;
  why: string;
  role: string;
  risk: string;
  priority: Priority | null;
}

const PRIORITY_TONE: Record<Priority, "danger" | "warning" | "default"> = {
  HIGH: "danger",
  MEDIUM: "warning",
  LOW: "default",
};

/**
 * Interactive budget planner.
 *
 * The spec requires the allocation to always equal the total. Rather than
 * silently rebalancing the other lines when one changes — which fights the
 * operator and makes the numbers feel haunted — the planner shows exactly how
 * much is unallocated or overcommitted and offers one click to settle it. The
 * server rebalances on save regardless, so the stored plan is always consistent.
 */
export function BudgetPlanner({
  projectId,
  plans,
  defaultCurrency,
  defaultTotal,
  goal,
  canSuggest,
}: {
  projectId: string;
  plans: BudgetPlanRecord[];
  defaultCurrency: string;
  defaultTotal: number | null;
  goal: string;
  canSuggest: boolean;
}) {
  const router = useRouter();
  const [suggesting, startSuggesting] = useTransition();
  const [saving, startSaving] = useTransition();
  const [removing, startRemoving] = useTransition();

  const [name, setName] = useState("Monthly marketing budget");
  const [total, setTotal] = useState(defaultTotal ? String(defaultTotal) : "");
  const [currency, setCurrency] = useState(defaultCurrency);
  const [period, setPeriod] = useState("");
  const [guidance, setGuidance] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [notes, setNotes] = useState<{ assumptions: string[]; missing: string[] } | null>(null);
  const [fromAI, setFromAI] = useState(false);

  const [lines, setLines] = useState<DraftLine[]>([
    { category: "content", amount: "", why: "", role: "", risk: "", priority: null },
  ]);

  const totalNumber = Math.max(0, Math.round(Number(total) || 0));
  const allocated = lines.reduce(
    (running, line) => running + Math.max(0, Math.round(Number(line.amount) || 0)),
    0,
  );
  const remaining = totalNumber - allocated;

  const selectedCategories = useMemo(
    () => [...new Set(lines.map((line) => line.category))],
    [lines],
  );

  function updateLine(index: number, patch: Partial<DraftLine>) {
    setLines((current) =>
      current.map((line, position) => (position === index ? { ...line, ...patch } : line)),
    );
  }

  /** Put whatever is unallocated onto the largest line, or the first one. */
  function settleRemainder() {
    if (remaining === 0 || lines.length === 0) return;

    const target = lines.reduce(
      (best, line, index) =>
        Number(line.amount) > Number(lines[best].amount) ? index : best,
      0,
    );

    updateLine(target, {
      amount: String(Math.max(0, Math.round(Number(lines[target].amount) || 0) + remaining)),
    });
  }

  function suggest() {
    setMessage(null);
    startSuggesting(async () => {
      const result = await suggestBudgetAction(projectId, {
        total: totalNumber,
        currency,
        goal,
        categories: selectedCategories.length > 0
          ? selectedCategories
          : BUDGET_CATEGORIES.map((category) => category.key),
        guidance: guidance || undefined,
      });

      if (!result.ok || !result.lines) {
        setMessage(result.message ?? "Could not suggest an allocation.");
        return;
      }

      setLines(
        result.lines.map((line) => ({
          category: line.category as BudgetCategoryKey,
          amount: String(line.amount),
          why: line.why,
          role: line.role,
          risk: line.risk,
          priority: line.priority,
        })),
      );
      setNotes({
        assumptions: result.assumptions ?? [],
        missing: result.missingInformation ?? [],
      });
      setFromAI(true);
    });
  }

  function save() {
    setMessage(null);
    startSaving(async () => {
      const result = await saveBudgetPlanAction(projectId, {
        name,
        total: totalNumber,
        currency,
        period,
        goal,
        source: fromAI ? "AI" : "MANUAL",
        lines: lines.map((line) => ({
          category: line.category,
          amount: line.amount,
          why: line.why,
          role: line.role,
          risk: line.risk,
          priority: line.priority,
        })),
      });

      if (!result.ok) {
        setMessage(result.message ?? "Could not save the plan.");
        return;
      }

      setMessage(null);
      router.refresh();
    });
  }

  return (
    <div className="space-y-8">
      <Card>
        <CardContent className="space-y-5 p-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field name="plan-name" label="Plan name">
              <Input value={name} onChange={(event) => setName(event.target.value)} />
            </Field>
            <Field name="plan-period" label="Period" optional hint="e.g. 2026-10 or Q4">
              <Input value={period} onChange={(event) => setPeriod(event.target.value)} />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-[1fr_9rem]">
            <Field name="plan-total" label="Total monthly budget">
              <Input
                value={total}
                onChange={(event) => setTotal(event.target.value)}
                inputMode="numeric"
                placeholder="5000"
              />
            </Field>
            <Field name="plan-currency" label="Currency">
              <Select value={currency} onChange={(event) => setCurrency(event.target.value)}>
                {CURRENCIES.map((entry) => (
                  <option key={entry.value} value={entry.value}>
                    {entry.value}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <p className="text-xs text-muted-foreground">
            Allocating for: <span className="text-foreground">{goal}</span>
          </p>

          {canSuggest && (
            <div className="space-y-3 border-t border-border pt-4">
              <Field name="guidance" label="Anything to keep in mind" optional>
                <Textarea
                  value={guidance}
                  onChange={(event) => setGuidance(event.target.value)}
                  rows={2}
                  placeholder="No paid social this quarter."
                />
              </Field>
              <Button
                variant="outline"
                onClick={suggest}
                disabled={suggesting || totalNumber <= 0}
              >
                {suggesting ? <Loader2 className="animate-spin" /> : <Sparkles />}
                {suggesting ? "Thinking…" : "Suggest an allocation"}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Balance indicator — the invariant made visible. */}
      <div
        className={cn(
          "flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3",
          remaining === 0
            ? "border-success/35 bg-success/8"
            : "border-warning/35 bg-warning/8",
        )}
      >
        <div className="flex items-center gap-2.5">
          {remaining === 0 ? (
            <Check className="size-4 text-success" />
          ) : (
            <Scale className="size-4 text-warning" />
          )}
          <p className="text-sm text-foreground">
            {remaining === 0
              ? `Balanced — ${allocated.toLocaleString("en-US")} ${currency} allocated`
              : remaining > 0
                ? `${remaining.toLocaleString("en-US")} ${currency} unallocated`
                : `${Math.abs(remaining).toLocaleString("en-US")} ${currency} over budget`}
          </p>
        </div>

        {remaining !== 0 && (
          <Button variant="ghost" size="sm" onClick={settleRemainder}>
            Settle the difference
          </Button>
        )}
      </div>

      <div className="space-y-3">
        {lines.map((line, index) => {
          const amount = Math.max(0, Math.round(Number(line.amount) || 0));
          const percent = totalNumber > 0 ? Math.round((amount / totalNumber) * 1000) / 10 : 0;

          return (
            <Card key={`${line.category}-${index}`}>
              <CardContent className="space-y-3 p-5">
                <div className="grid gap-3 sm:grid-cols-[1fr_8rem_7rem_auto]">
                  <Select
                    value={line.category}
                    aria-label="Category"
                    onChange={(event) =>
                      updateLine(index, { category: event.target.value as BudgetCategoryKey })
                    }
                  >
                    {BUDGET_CATEGORIES.map((category) => (
                      <option key={category.key} value={category.key}>
                        {category.label}
                      </option>
                    ))}
                  </Select>

                  <Input
                    value={line.amount}
                    onChange={(event) => updateLine(index, { amount: event.target.value })}
                    inputMode="numeric"
                    aria-label={`Amount for ${categoryLabel(line.category)}`}
                    placeholder="0"
                  />

                  <Select
                    value={line.priority ?? ""}
                    aria-label="Priority"
                    onChange={(event) =>
                      updateLine(index, {
                        priority: (event.target.value || null) as Priority | null,
                      })
                    }
                  >
                    <option value="">Priority</option>
                    {PRIORITIES.map((priority) => (
                      <option key={priority} value={priority}>
                        {priority}
                      </option>
                    ))}
                  </Select>

                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Remove line"
                    onClick={() => setLines((current) => current.filter((_, i) => i !== index))}
                  >
                    <Trash2 />
                  </Button>
                </div>

                <div className="flex items-center gap-3">
                  <div className="h-1 flex-1 overflow-hidden rounded-full bg-secondary">
                    <div
                      className="h-full rounded-full bg-[linear-gradient(90deg,var(--gradient-via),var(--gradient-to))]"
                      style={{ width: `${Math.min(percent, 100)}%` }}
                    />
                  </div>
                  <span className="font-mono text-[0.6875rem] text-muted-foreground tabular-nums">
                    {percent}%
                  </span>
                  {line.priority && (
                    <Badge variant={PRIORITY_TONE[line.priority]}>{line.priority}</Badge>
                  )}
                </div>

                {(line.why || line.role || line.risk) && (
                  <dl className="space-y-1.5 border-t border-border pt-3 text-xs leading-relaxed">
                    {line.why && (
                      <div className="flex gap-2">
                        <dt className="w-12 shrink-0 font-mono text-[0.625rem] tracking-[0.12em] text-muted-foreground uppercase">
                          Why
                        </dt>
                        <dd className="text-muted-foreground">{line.why}</dd>
                      </div>
                    )}
                    {line.role && (
                      <div className="flex gap-2">
                        <dt className="w-12 shrink-0 font-mono text-[0.625rem] tracking-[0.12em] text-muted-foreground uppercase">
                          Role
                        </dt>
                        <dd className="text-muted-foreground">{line.role}</dd>
                      </div>
                    )}
                    {line.risk && (
                      <div className="flex gap-2">
                        <dt className="w-12 shrink-0 font-mono text-[0.625rem] tracking-[0.12em] text-warning/80 uppercase">
                          Risk
                        </dt>
                        <dd className="text-muted-foreground">{line.risk}</dd>
                      </div>
                    )}
                  </dl>
                )}
              </CardContent>
            </Card>
          );
        })}

        <Button
          variant="ghost"
          size="sm"
          onClick={() =>
            setLines((current) => [
              ...current,
              { category: "other", amount: "", why: "", role: "", risk: "", priority: null },
            ])
          }
        >
          Add a category
        </Button>
      </div>

      {notes && (notes.assumptions.length > 0 || notes.missing.length > 0) && (
        <Card>
          <CardContent className="space-y-3 p-5">
            {notes.assumptions.length > 0 && (
              <div className="space-y-1">
                <p className="font-mono text-[0.625rem] tracking-[0.16em] text-warning uppercase">
                  Assumptions
                </p>
                <ul className="space-y-1">
                  {notes.assumptions.map((entry) => (
                    <li key={entry} className="text-xs leading-relaxed text-muted-foreground">
                      {entry}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {notes.missing.length > 0 && (
              <div className="space-y-1">
                <p className="font-mono text-[0.625rem] tracking-[0.16em] text-muted-foreground uppercase">
                  This would sharpen it
                </p>
                <ul className="space-y-1">
                  {notes.missing.map((entry) => (
                    <li key={entry} className="text-xs leading-relaxed text-muted-foreground">
                      {entry}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {message && (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-xl border border-destructive/35 bg-destructive/10 px-4 py-3"
        >
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
          <p className="text-sm leading-relaxed text-foreground">{message}</p>
        </div>
      )}

      <div className="flex items-center gap-2">
        <Button onClick={save} disabled={saving || totalNumber <= 0}>
          {saving ? <Loader2 className="animate-spin" /> : <Save />}
          Save plan
        </Button>
        <p className="text-xs text-muted-foreground">
          Saved plans are always stored balanced to the total.
        </p>
      </div>

      {plans.length > 0 && (
        <section className="space-y-3 border-t border-border pt-6">
          <SectionHeading title="Saved plans" />
          <div className="space-y-2">
            {plans.map((plan) => (
              <Card key={plan.id}>
                <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-medium text-foreground">{plan.name}</p>
                      {plan.period && <Badge variant="outline">{plan.period}</Badge>}
                      <SourceBadge source={plan.source} agent="Suggested" />
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {plan.total.toLocaleString("en-US")} {plan.currency} across{" "}
                      {plan.lines.length} {plan.lines.length === 1 ? "category" : "categories"}
                    </p>
                  </div>

                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setName(plan.name);
                        setTotal(String(plan.total));
                        setCurrency(plan.currency);
                        setPeriod(plan.period ?? "");
                        setFromAI(plan.source === "AI");
                        setLines(
                          plan.lines.map((line) => ({
                            category: line.category as BudgetCategoryKey,
                            amount: String(line.amount),
                            why: line.why,
                            role: line.role,
                            risk: line.risk,
                            priority: line.priority,
                          })),
                        );
                      }}
                    >
                      Load
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Delete ${plan.name}`}
                      disabled={removing}
                      onClick={() =>
                        startRemoving(async () => {
                          await deleteBudgetPlanAction(projectId, plan.id);
                          router.refresh();
                        })
                      }
                    >
                      {removing ? <Loader2 className="animate-spin" /> : <Trash2 />}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
