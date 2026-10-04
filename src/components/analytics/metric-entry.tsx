"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Loader2, Plus, Trash2 } from "lucide-react";

import { METRIC_CHANNELS, formatNumber } from "@/lib/analytics/metrics";
import { deleteMetricAction, saveMetricAction } from "@/lib/analytics/actions";
import type { MetricRow } from "@/lib/analytics/queries";
// Both the table and the edit dialog read the row through the same helpers.
// Formatting one with `toLocaleDateString()` and the other with
// `toISOString()` made them disagree by a day for anyone not on UTC.
import { formatDayShort, toDayInput, todayInput } from "@/lib/date";
import { CURRENCIES } from "@/config/business-profile";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SectionHeading } from "@/components/layout/section-heading";
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

const NUMBER_FIELDS = [
  { name: "spend", label: "Spend" },
  { name: "revenue", label: "Revenue" },
  { name: "impressions", label: "Impressions" },
  { name: "reach", label: "Reach" },
  { name: "clicks", label: "Clicks" },
  { name: "leads", label: "Leads" },
  { name: "conversions", label: "Conversions" },
  { name: "customers", label: "Customers" },
] as const;

/**
 * Manual metric entry and the row list.
 *
 * Every field but date and channel is optional, and blank means "not recorded"
 * rather than zero. That distinction is the whole basis of the null-safe
 * derivation downstream, so the form must never coerce an empty box to 0.
 */
export function MetricEntry({
  projectId,
  rows,
  defaultCurrency,
}: {
  projectId: string;
  rows: MetricRow[];
  defaultCurrency: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<MetricRow | null>(null);
  const [saving, startSaving] = useTransition();
  const [removing, startRemoving] = useTransition();
  // Which row is being deleted. One shared flag disabled and spun every row's
  // delete button at once, which read as "the whole table is busy".
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});

  function openEditor(row: MetricRow | null) {
    setEditing(row);
    setErrors({});
    setMessage(null);
    setDraft({
      date: row ? toDayInput(row.date) : todayInput(),
      channel: row?.channel ?? METRIC_CHANNELS[0],
      campaign: row?.campaign ?? "",
      currency: row?.currency ?? defaultCurrency,
      note: row?.note ?? "",
      ...Object.fromEntries(
        NUMBER_FIELDS.map((field) => [
          field.name,
          row?.[field.name] !== null && row?.[field.name] !== undefined
            ? String(row[field.name])
            : "",
        ]),
      ),
    });
    setOpen(true);
  }

  function save() {
    setErrors({});
    setMessage(null);

    startSaving(async () => {
      const result = await saveMetricAction(projectId, {
        metricId: editing?.id,
        date: draft.date ?? "",
        channel: draft.channel ?? "",
        campaign: draft.campaign,
        currency: draft.currency,
        note: draft.note,
        spend: draft.spend,
        revenue: draft.revenue,
        impressions: draft.impressions,
        reach: draft.reach,
        clicks: draft.clicks,
        leads: draft.leads,
        conversions: draft.conversions,
        customers: draft.customers,
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
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SectionHeading title={`Recorded rows · ${rows.length}`} />
        <Button variant="ghost" size="sm" onClick={() => openEditor(null)}>
          <Plus />
          Add a row
        </Button>
      </div>

      {rows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
          No rows in this range.
        </p>
      ) : (
        <Card>
          <CardContent className="overflow-x-auto p-0">
            <table className="w-full min-w-[40rem] text-left text-sm">
              <thead>
                <tr className="border-b border-border">
                  {["Date", "Channel", "Campaign", "Spend", "Clicks", "Leads", "Customers", ""].map(
                    (heading) => (
                      <th
                        key={heading}
                        className="px-3 py-2.5 font-mono text-[0.625rem] tracking-[0.14em] text-muted-foreground uppercase"
                      >
                        {heading}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-b border-border last:border-0">
                    <td className="px-3 py-2.5 font-mono text-xs text-muted-foreground tabular-nums">
                      {formatDayShort(row.date)}
                    </td>
                    <td className="px-3 py-2.5 text-foreground">{row.channel}</td>
                    <td className="px-3 py-2.5 text-muted-foreground">{row.campaign ?? "—"}</td>
                    <td className="px-3 py-2.5 tabular-nums text-muted-foreground">
                      {formatNumber(row.spend)}
                    </td>
                    <td className="px-3 py-2.5 tabular-nums text-muted-foreground">
                      {formatNumber(row.clicks)}
                    </td>
                    <td className="px-3 py-2.5 tabular-nums text-muted-foreground">
                      {formatNumber(row.leads)}
                    </td>
                    <td className="px-3 py-2.5 tabular-nums text-muted-foreground">
                      {formatNumber(row.customers)}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="sm" onClick={() => openEditor(row)}>
                          Edit
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="Delete row"
                          disabled={removing}
                          onClick={() => {
                            setRemovingId(row.id);
                            startRemoving(async () => {
                              await deleteMetricAction(projectId, row.id);
                              router.refresh();
                              setRemovingId(null);
                            });
                          }}
                        >
                          {removing && removingId === row.id ? (
                            <Loader2 className="animate-spin" />
                          ) : (
                            <Trash2 />
                          )}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit row" : "Add a row"}</DialogTitle>
            <DialogDescription>
              Leave anything you did not measure blank. Blank means &ldquo;not recorded&rdquo; — it
              is not treated as zero.
            </DialogDescription>
          </DialogHeader>

          <div className="mt-5 space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field name="date" label="Date" errors={errors.date}>
                <Input
                  type="date"
                  value={draft.date ?? ""}
                  onChange={(event) => setDraft({ ...draft, date: event.target.value })}
                />
              </Field>

              <Field name="channel" label="Channel" errors={errors.channel}>
                <Select
                  value={draft.channel ?? ""}
                  onChange={(event) => setDraft({ ...draft, channel: event.target.value })}
                >
                  {METRIC_CHANNELS.map((channel) => (
                    <option key={channel} value={channel}>
                      {channel}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-[1fr_9rem]">
              <Field name="campaign" label="Campaign" optional>
                <Input
                  value={draft.campaign ?? ""}
                  onChange={(event) => setDraft({ ...draft, campaign: event.target.value })}
                />
              </Field>
              <Field name="currency" label="Currency" optional>
                <Select
                  value={draft.currency ?? defaultCurrency}
                  onChange={(event) => setDraft({ ...draft, currency: event.target.value })}
                >
                  {CURRENCIES.map((entry) => (
                    <option key={entry.value} value={entry.value}>
                      {entry.value}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              {NUMBER_FIELDS.map((field) => (
                <Field key={field.name} name={field.name} label={field.label} optional>
                  <Input
                    value={draft[field.name] ?? ""}
                    onChange={(event) =>
                      setDraft({ ...draft, [field.name]: event.target.value })
                    }
                    inputMode="numeric"
                    placeholder="—"
                  />
                </Field>
              ))}
            </div>

            <Field name="note" label="Note" optional>
              <Input
                value={draft.note ?? ""}
                onChange={(event) => setDraft({ ...draft, note: event.target.value })}
              />
            </Field>

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
                {editing ? "Save changes" : "Add row"}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <Badge variant="outline">Manual</Badge>
        Every row here was entered by hand. LUMEN connects to no ad platform and syncs nothing.
      </p>
    </div>
  );
}
