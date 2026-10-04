"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CalendarPlus, Loader2 } from "lucide-react";

import { PLATFORMS, type PlatformKey } from "@/lib/content/agent";
import { POSTING_FREQUENCIES, type FrequencyKey } from "@/lib/content/plan-agent";
import { generateContentPlanAction } from "@/lib/content/actions";
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
import { cn } from "@/lib/utils";
import { toDayInput } from "@/lib/date";

/** Default range: the next four weeks, which is the horizon most plans use. */
function defaultRange() {
  const from = new Date();
  const to = new Date();
  to.setDate(to.getDate() + 28);

  return { from: toDayInput(from), to: toDayInput(to) };
}

/**
 * "Generate a content plan".
 *
 * Collects exactly the inputs the spec names — goal, date range, platforms,
 * frequency, audience — and nothing else. The dates the plan lands on are
 * computed server-side from the range and frequency, not chosen by the model.
 */
export function PlanGenerator({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const range = defaultRange();
  const [form, setForm] = useState({
    goal: "",
    from: range.from,
    to: range.to,
    frequency: "THREE_PER_WEEK" as FrequencyKey,
    audience: "",
    guidance: "",
  });
  const [platforms, setPlatforms] = useState<PlatformKey[]>(["LINKEDIN"]);

  function togglePlatform(key: PlatformKey) {
    setPlatforms((current) =>
      current.includes(key) ? current.filter((entry) => entry !== key) : [...current, key],
    );
  }

  function generate() {
    setError(null);
    startTransition(async () => {
      const result = await generateContentPlanAction(projectId, {
        goal: form.goal,
        from: form.from,
        to: form.to,
        platforms,
        frequency: form.frequency,
        audience: form.audience || undefined,
        guidance: form.guidance || undefined,
      });

      if (!result.ok) {
        setError(result.message ?? "Could not generate the plan.");
        return;
      }

      setOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <CalendarPlus />
        Generate a content plan
      </Button>

      <Dialog open={open} onOpenChange={(next) => !pending && setOpen(next)}>
        <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Generate a content plan</DialogTitle>
            <DialogDescription>
              MUSE writes the pieces; LUMEN spreads them across your range at the frequency you
              choose. Everything lands as a draft — nothing is published anywhere.
            </DialogDescription>
          </DialogHeader>

          <div className="mt-5 space-y-4">
            <Field name="goal" label="Goal">
              <Input
                value={form.goal}
                onChange={(event) => setForm({ ...form, goal: event.target.value })}
                placeholder="Book 20 demos with agency owners"
              />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field name="from" label="From">
                <Input
                  type="date"
                  value={form.from}
                  onChange={(event) => setForm({ ...form, from: event.target.value })}
                />
              </Field>
              <Field name="to" label="To">
                <Input
                  type="date"
                  value={form.to}
                  onChange={(event) => setForm({ ...form, to: event.target.value })}
                />
              </Field>
            </div>

            <Field name="frequency" label="Posting frequency">
              <Select
                value={form.frequency}
                onChange={(event) =>
                  setForm({ ...form, frequency: event.target.value as FrequencyKey })
                }
              >
                {POSTING_FREQUENCIES.map((frequency) => (
                  <option key={frequency.key} value={frequency.key}>
                    {frequency.label}
                  </option>
                ))}
              </Select>
            </Field>

            <div className="space-y-2">
              <p className="text-sm font-medium text-foreground">Platforms</p>
              <div className="flex flex-wrap gap-1.5">
                {PLATFORMS.map((platform) => (
                  <button
                    key={platform.key}
                    type="button"
                    onClick={() => togglePlatform(platform.key)}
                    aria-pressed={platforms.includes(platform.key)}
                    className={cn(
                      "rounded-full border px-3 py-1.5 text-xs transition-colors",
                      platforms.includes(platform.key)
                        ? "border-primary/45 bg-primary/15 text-foreground"
                        : "border-border bg-secondary/50 text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {platform.label}
                  </button>
                ))}
              </div>
            </div>

            <Field name="audience" label="Audience focus" optional>
              <Input
                value={form.audience}
                onChange={(event) => setForm({ ...form, audience: event.target.value })}
                placeholder="Agency owners with 5–20 staff"
              />
            </Field>

            <Field name="guidance" label="Anything to keep in mind" optional>
              <Textarea
                value={form.guidance}
                onChange={(event) => setForm({ ...form, guidance: event.target.value })}
                rows={2}
              />
            </Field>

            {error && (
              <p role="alert" className="flex items-start gap-2 text-xs text-destructive">
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                {error}
              </p>
            )}

            <DialogFooter>
              <Button variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
                Cancel
              </Button>
              <Button onClick={generate} disabled={pending} aria-busy={pending}>
                {pending && <Loader2 className="animate-spin" />}
                {pending ? "Planning…" : "Generate plan"}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
