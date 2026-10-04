"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, ChevronLeft, ChevronRight, Loader2, X } from "lucide-react";

import {
  CONTENT_STATUSES,
  PLATFORMS,
  contentStatusLabel,
  platformLabel,
  type ContentStatusKey,
} from "@/lib/content/agent";
import { setContentScheduleAction, setContentStatusAction } from "@/lib/content/actions";
import type { ContentItemRecord } from "@/lib/content/queries";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { formatDayShort, localDayKey, toDayInput } from "@/lib/date";

type View = "month" | "week" | "list";

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** Monday-first weekday index, since the grid starts on Monday. */
const weekdayIndex = (date: Date) => (date.getDay() + 6) % 7;

function startOfWeek(date: Date) {
  const result = new Date(date);
  result.setDate(result.getDate() - weekdayIndex(result));
  result.setHours(0, 0, 0, 0);
  return result;
}

/**
 * Does a stored day fall on this grid cell?
 *
 * The two sides live in different frames: a cell is local wall-clock time, a
 * `scheduledAt` is a day pinned to UTC midnight. Comparing the Date objects
 * directly — or reading both with the same getters — put a piece on the wrong
 * cell in every timezone but UTC. Comparing `YYYY-MM-DD` keys, each read in its
 * own frame, is the comparison that actually holds.
 */
function isOnDay(stored: Date, cell: Date) {
  return toDayInput(stored) === localDayKey(cell);
}

function sameLocalDay(a: Date, b: Date) {
  return localDayKey(a) === localDayKey(b);
}

/**
 * Content calendar.
 *
 * Three views over the same filtered set. Unscheduled items are shown in their
 * own tray rather than hidden, because a plan with drafts nobody dated is the
 * normal state, and a calendar that silently omits them would misreport how
 * much work exists.
 */
export function ContentCalendar({
  projectId,
  items,
}: {
  projectId: string;
  items: ContentItemRecord[];
}) {
  const router = useRouter();
  const [view, setView] = useState<View>("month");
  const [anchor, setAnchor] = useState(() => new Date());
  const [platformFilter, setPlatformFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [selected, setSelected] = useState<ContentItemRecord | null>(null);
  const [pending, startTransition] = useTransition();

  const filtered = useMemo(
    () =>
      items.filter(
        (item) =>
          (!platformFilter || item.platform === platformFilter) &&
          (!statusFilter || item.status === statusFilter),
      ),
    [items, platformFilter, statusFilter],
  );

  const scheduled = filtered.filter((item) => item.scheduledAt);
  const unscheduled = filtered.filter((item) => !item.scheduledAt);

  const days = useMemo(() => {
    if (view === "week") {
      const start = startOfWeek(anchor);
      return Array.from({ length: 7 }, (_, index) => {
        const day = new Date(start);
        day.setDate(day.getDate() + index);
        return day;
      });
    }

    const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
    const start = startOfWeek(first);
    // Six weeks always renders, so the grid height never jumps between months.
    return Array.from({ length: 42 }, (_, index) => {
      const day = new Date(start);
      day.setDate(day.getDate() + index);
      return day;
    });
  }, [anchor, view]);

  function shift(direction: number) {
    const next = new Date(anchor);
    if (view === "week") next.setDate(next.getDate() + direction * 7);
    else next.setMonth(next.getMonth() + direction);
    setAnchor(next);
  }

  function reschedule(itemId: string, value: string | null) {
    startTransition(async () => {
      await setContentScheduleAction(projectId, itemId, value);
      setSelected(null);
      router.refresh();
    });
  }

  const label =
    view === "week"
      ? `${startOfWeek(anchor).toLocaleDateString("en-GB", { day: "numeric", month: "short" })} —`
        + ` ${new Date(startOfWeek(anchor).getTime() + 6 * 86_400_000).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`
      : anchor.toLocaleDateString("en-GB", { month: "long", year: "numeric" });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-lg border border-border p-0.5">
          {(["month", "week", "list"] as const).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setView(option)}
              aria-pressed={view === option}
              className={cn(
                "rounded-md px-3 py-1.5 font-mono text-[0.625rem] tracking-[0.14em] uppercase transition-colors",
                view === option
                  ? "bg-secondary text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {option}
            </button>
          ))}
        </div>

        {view !== "list" && (
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" onClick={() => shift(-1)} aria-label="Previous">
              <ChevronLeft />
            </Button>
            <span className="min-w-40 text-center text-sm font-medium text-foreground">{label}</span>
            <Button variant="ghost" size="icon" onClick={() => shift(1)} aria-label="Next">
              <ChevronRight />
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setAnchor(new Date())}>
              Today
            </Button>
          </div>
        )}

        <div className="ml-auto flex items-center gap-2">
          <Select
            value={platformFilter}
            onChange={(event) => setPlatformFilter(event.target.value)}
            aria-label="Filter by platform"
            className="h-9 w-40 text-xs"
          >
            <option value="">All platforms</option>
            {PLATFORMS.map((platform) => (
              <option key={platform.key} value={platform.key}>
                {platform.label}
              </option>
            ))}
          </Select>
          <Select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            aria-label="Filter by status"
            className="h-9 w-36 text-xs"
          >
            <option value="">All statuses</option>
            {CONTENT_STATUSES.map((status) => (
              <option key={status.key} value={status.key}>
                {status.label}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {view === "list" ? (
        <Card>
          <CardContent className="p-0">
            {scheduled.length === 0 ? (
              <p className="px-5 py-10 text-center text-sm text-muted-foreground">
                Nothing scheduled.
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {[...scheduled]
                  .sort(
                    (a, b) =>
                      new Date(a.scheduledAt!).getTime() - new Date(b.scheduledAt!).getTime(),
                  )
                  .map((item) => (
                    <li key={item.id}>
                      <button
                        type="button"
                        onClick={() => setSelected(item)}
                        className="flex w-full items-start gap-4 px-5 py-3 text-left transition-colors hover:bg-secondary/40"
                      >
                        <span className="w-24 shrink-0 font-mono text-[0.6875rem] text-muted-foreground tabular-nums">
                          {formatDayShort(item.scheduledAt)}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm text-foreground">
                            {item.hook ?? item.objective}
                          </span>
                          <span className="mt-0.5 block text-xs text-muted-foreground">
                            {platformLabel(item.platform)} · {contentStatusLabel(item.status)}
                          </span>
                        </span>
                      </button>
                    </li>
                  ))}
              </ul>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="grid grid-cols-7 border-b border-border">
              {DAY_NAMES.map((day) => (
                <div
                  key={day}
                  className="px-2 py-2 text-center font-mono text-[0.625rem] tracking-[0.14em] text-muted-foreground uppercase"
                >
                  {day}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7">
              {days.map((day) => {
                const dayItems = scheduled.filter((item) =>
                  isOnDay(new Date(item.scheduledAt!), day),
                );
                const inMonth = view === "week" || day.getMonth() === anchor.getMonth();
                const isToday = sameLocalDay(day, new Date());

                return (
                  <div
                    key={day.toISOString()}
                    className={cn(
                      "min-h-24 border-r border-b border-border p-1.5 last:border-r-0",
                      view === "week" && "min-h-40",
                      !inMonth && "opacity-40",
                    )}
                  >
                    <span
                      className={cn(
                        "inline-flex size-5 items-center justify-center rounded-md font-mono text-[0.625rem] tabular-nums",
                        isToday
                          ? "bg-[color:var(--gradient-via)] text-white"
                          : "text-muted-foreground",
                      )}
                    >
                      {day.getDate()}
                    </span>

                    <div className="mt-1 space-y-1">
                      {dayItems.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => setSelected(item)}
                          className="block w-full truncate rounded border border-border bg-secondary/60 px-1.5 py-1 text-left text-[0.6875rem] text-foreground transition-colors hover:border-primary/40"
                          title={item.hook ?? item.objective}
                        >
                          {item.hook ?? item.objective}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {unscheduled.length > 0 && (
        <section className="space-y-2">
          <h3 className="font-mono text-[0.625rem] tracking-[0.16em] text-muted-foreground uppercase">
            Not scheduled · {unscheduled.length}
          </h3>
          <div className="flex flex-wrap gap-1.5">
            {unscheduled.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setSelected(item)}
                className="max-w-64 truncate rounded-full border border-dashed border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-border-strong hover:text-foreground"
              >
                {item.hook ?? item.objective}
              </button>
            ))}
          </div>
        </section>
      )}

      <Dialog open={Boolean(selected)} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          {selected && (
            <>
              <DialogHeader>
                <DialogTitle className="pr-4 text-base">
                  {selected.hook ?? selected.objective}
                </DialogTitle>
              </DialogHeader>

              <div className="mt-4 space-y-4">
                <div className="flex flex-wrap gap-1.5">
                  <Badge variant="outline">{platformLabel(selected.platform)}</Badge>
                  {selected.pillar && <Badge>{selected.pillar}</Badge>}
                </div>

                {selected.body && (
                  <p className="text-sm leading-relaxed whitespace-pre-wrap text-muted-foreground">
                    {selected.body}
                  </p>
                )}

                {selected.cta && (
                  <p className="rounded-lg border border-primary/25 bg-primary/8 px-3 py-2 text-sm text-foreground">
                    {selected.cta}
                  </p>
                )}

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <label
                      htmlFor="cal-date"
                      className="font-mono text-[0.625rem] tracking-[0.14em] text-muted-foreground uppercase"
                    >
                      Planned date
                    </label>
                    <Input
                      id="cal-date"
                      type="date"
                      disabled={pending}
                      defaultValue={toDayInput(selected.scheduledAt)}
                      onChange={(event) =>
                        reschedule(selected.id, event.target.value || null)
                      }
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label
                      htmlFor="cal-status"
                      className="font-mono text-[0.625rem] tracking-[0.14em] text-muted-foreground uppercase"
                    >
                      Status
                    </label>
                    <Select
                      id="cal-status"
                      defaultValue={selected.status}
                      disabled={pending}
                      onChange={(event) =>
                        startTransition(async () => {
                          await setContentStatusAction(
                            projectId,
                            selected.id,
                            event.target.value as ContentStatusKey,
                          );
                          setSelected(null);
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
                  </div>
                </div>

                {selected.scheduledAt && (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={pending}
                    onClick={() => reschedule(selected.id, null)}
                  >
                    {pending ? <Loader2 className="animate-spin" /> : <X />}
                    Remove from calendar
                  </Button>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {scheduled.length === 0 && unscheduled.length === 0 && (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border px-6 py-10 text-center">
          <CalendarDays className="size-5 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            Nothing matches those filters.
          </p>
        </div>
      )}
    </div>
  );
}
