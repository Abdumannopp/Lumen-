"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Loader2, Megaphone, Plus, Sparkles } from "lucide-react";

import {
  CAMPAIGN_CHANNELS,
  CAMPAIGN_STATUSES,
  type CampaignChannelKey,
  type CampaignStatusKey,
} from "@/lib/campaigns/agent";
import { planCampaignAction, saveCampaignAction } from "@/lib/campaigns/actions";
import type { CampaignRecord } from "@/lib/campaigns/queries";
import { CURRENCIES } from "@/config/business-profile";
import { CampaignCard } from "@/components/campaigns/campaign-card";
import { EmptyState } from "@/components/feedback/empty-state";
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

/**
 * Campaign workspace.
 *
 * ORBIT plans; the operator edits. Manual campaigns exist because a plan that
 * came from a meeting is as real as one that came from a model.
 */
export function CampaignWorkspace({
  projectId,
  campaigns,
  canPlan,
  defaultCurrency,
}: {
  projectId: string;
  campaigns: CampaignRecord[];
  canPlan: boolean;
  defaultCurrency: string;
}) {
  const router = useRouter();
  const [planning, startPlanning] = useTransition();
  const [saving, startSaving] = useTransition();

  const [planOpen, setPlanOpen] = useState(false);
  const [planError, setPlanError] = useState<string | null>(null);
  const [plan, setPlan] = useState({
    brief: "",
    budgetAmount: "",
    budgetCurrency: defaultCurrency,
    startDate: "",
    endDate: "",
    guidance: "",
  });

  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<CampaignRecord | null>(null);
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [formMessage, setFormMessage] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [channels, setChannels] = useState<CampaignChannelKey[]>([]);

  const [statusFilter, setStatusFilter] = useState("");
  const visible = campaigns.filter((campaign) => !statusFilter || campaign.status === statusFilter);

  function generate() {
    setPlanError(null);
    startPlanning(async () => {
      const result = await planCampaignAction(projectId, {
        brief: plan.brief,
        budgetAmount: plan.budgetAmount ? Number(plan.budgetAmount) : null,
        budgetCurrency: plan.budgetCurrency,
        startDate: plan.startDate || null,
        endDate: plan.endDate || null,
        guidance: plan.guidance || undefined,
      });

      if (!result.ok) {
        setPlanError(result.message ?? "Could not plan the campaign.");
        return;
      }

      setPlanOpen(false);
      setPlan({ ...plan, brief: "", guidance: "" });
      router.refresh();
    });
  }

  function openEditor(campaign: CampaignRecord | null) {
    setEditing(campaign);
    setErrors({});
    setFormMessage(null);
    setChannels((campaign?.channels ?? []) as CampaignChannelKey[]);
    setDraft({
      name: campaign?.name ?? "",
      objective: campaign?.objective ?? "",
      audience: campaign?.audience ?? "",
      offer: campaign?.offer ?? "",
      totalBudgetAmount:
        campaign?.totalBudgetAmount !== null && campaign?.totalBudgetAmount !== undefined
          ? String(campaign.totalBudgetAmount)
          : "",
      totalBudgetCurrency: campaign?.totalBudgetCurrency ?? defaultCurrency,
      startDate: toDayInput(campaign?.startDate),
      endDate: toDayInput(campaign?.endDate),
      creativeConcept: campaign?.creativeConcept ?? "",
      landingPage: campaign?.landingPage ?? "",
      status: campaign?.status ?? "DRAFT",
    });
    setEditorOpen(true);
  }

  function save() {
    setErrors({});
    setFormMessage(null);

    startSaving(async () => {
      const result = await saveCampaignAction(projectId, {
        campaignId: editing?.id,
        name: draft.name ?? "",
        objective: draft.objective ?? "",
        audience: draft.audience,
        offer: draft.offer,
        channels,
        totalBudgetAmount: draft.totalBudgetAmount,
        totalBudgetCurrency: draft.totalBudgetCurrency,
        startDate: draft.startDate,
        endDate: draft.endDate,
        creativeConcept: draft.creativeConcept,
        landingPage: draft.landingPage,
        status: (draft.status ?? "DRAFT") as CampaignStatusKey,
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
        {canPlan && (
          <Button onClick={() => setPlanOpen(true)}>
            <Sparkles />
            Plan with ORBIT
          </Button>
        )}
        <Button variant="ghost" onClick={() => openEditor(null)}>
          <Plus />
          Add campaign
        </Button>

        {campaigns.length > 0 && (
          <Select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            aria-label="Filter by status"
            className="ml-auto h-9 w-36 text-xs"
          >
            <option value="">All statuses</option>
            {CAMPAIGN_STATUSES.map((status) => (
              <option key={status.key} value={status.key}>
                {status.label}
              </option>
            ))}
          </Select>
        )}
      </div>

      {campaigns.length === 0 ? (
        <EmptyState
          icon={<Megaphone className="size-5" />}
          title="No campaigns yet"
          description="ORBIT plans the objective, offer, channels, budget split, messaging, funnel and what to measure. Campaigns here are plans — LUMEN connects to no ad platform."
          action={
            canPlan ? (
              <Button onClick={() => setPlanOpen(true)}>
                <Sparkles />
                Plan a campaign
              </Button>
            ) : undefined
          }
        />
      ) : visible.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
          No campaigns with that status.
        </p>
      ) : (
        <div className="space-y-4">
          {visible.map((campaign) => (
            <CampaignCard
              key={campaign.id}
              projectId={projectId}
              campaign={campaign}
              onEdit={openEditor}
            />
          ))}
        </div>
      )}

      {/* Planning */}
      <Dialog open={planOpen} onOpenChange={(next) => !planning && setPlanOpen(next)}>
        <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Plan a campaign</DialogTitle>
            <DialogDescription>
              ORBIT writes the plan from this project&rsquo;s profile, strategy and audience. It
              recommends what to measure — it never predicts results.
            </DialogDescription>
          </DialogHeader>

          <div className="mt-5 space-y-4">
            <Field name="brief" label="What is this campaign for?">
              <Textarea
                value={plan.brief}
                onChange={(event) => setPlan({ ...plan, brief: event.target.value })}
                rows={3}
                placeholder="Launch the new pricing tier to existing free users."
              />
            </Field>

            <div className="grid gap-4 sm:grid-cols-[1fr_9rem]">
              <Field name="budget" label="Total budget" optional>
                <Input
                  value={plan.budgetAmount}
                  onChange={(event) => setPlan({ ...plan, budgetAmount: event.target.value })}
                  inputMode="numeric"
                  placeholder="5000"
                />
              </Field>
              <Field name="currency" label="Currency" optional>
                <Select
                  value={plan.budgetCurrency}
                  onChange={(event) => setPlan({ ...plan, budgetCurrency: event.target.value })}
                >
                  {CURRENCIES.map((currency) => (
                    <option key={currency.value} value={currency.value}>
                      {currency.value}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field name="start" label="Starts" optional>
                <Input
                  type="date"
                  value={plan.startDate}
                  onChange={(event) => setPlan({ ...plan, startDate: event.target.value })}
                />
              </Field>
              <Field name="end" label="Ends" optional>
                <Input
                  type="date"
                  value={plan.endDate}
                  onChange={(event) => setPlan({ ...plan, endDate: event.target.value })}
                />
              </Field>
            </div>

            <Field name="guidance" label="Anything to keep in mind" optional>
              <Textarea
                value={plan.guidance}
                onChange={(event) => setPlan({ ...plan, guidance: event.target.value })}
                rows={2}
              />
            </Field>

            {planError && (
              <p role="alert" className="flex items-start gap-2 text-xs text-destructive">
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                {planError}
              </p>
            )}

            <DialogFooter>
              <Button variant="ghost" onClick={() => setPlanOpen(false)} disabled={planning}>
                Cancel
              </Button>
              <Button onClick={generate} disabled={planning} aria-busy={planning}>
                {planning && <Loader2 className="animate-spin" />}
                {planning ? "Planning…" : "Plan campaign"}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      {/* Manual editor */}
      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit campaign" : "Add a campaign"}</DialogTitle>
            <DialogDescription>
              {editing
                ? "Editing marks this campaign as yours."
                : "A campaign you planned elsewhere is as real as one ORBIT wrote."}
            </DialogDescription>
          </DialogHeader>

          <div className="mt-5 space-y-4">
            <Field name="name" label="Name" errors={errors.name}>
              <Input
                value={draft.name ?? ""}
                onChange={(event) => setDraft({ ...draft, name: event.target.value })}
              />
            </Field>

            <Field name="objective" label="Objective" errors={errors.objective}>
              <Textarea
                value={draft.objective ?? ""}
                onChange={(event) => setDraft({ ...draft, objective: event.target.value })}
                rows={2}
              />
            </Field>

            <Field name="audience" label="Audience" optional>
              <Input
                value={draft.audience ?? ""}
                onChange={(event) => setDraft({ ...draft, audience: event.target.value })}
              />
            </Field>

            <Field name="offer" label="Offer" optional>
              <Input
                value={draft.offer ?? ""}
                onChange={(event) => setDraft({ ...draft, offer: event.target.value })}
              />
            </Field>

            <div className="space-y-2">
              <p className="text-sm font-medium text-foreground">Channels</p>
              <div className="flex flex-wrap gap-1.5">
                {CAMPAIGN_CHANNELS.map((channel) => (
                  <button
                    key={channel.key}
                    type="button"
                    onClick={() =>
                      setChannels((current) =>
                        current.includes(channel.key)
                          ? current.filter((entry) => entry !== channel.key)
                          : [...current, channel.key],
                      )
                    }
                    aria-pressed={channels.includes(channel.key)}
                    className={cn(
                      "rounded-full border px-3 py-1.5 text-xs transition-colors",
                      channels.includes(channel.key)
                        ? "border-primary/45 bg-primary/15 text-foreground"
                        : "border-border bg-secondary/50 text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {channel.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-[1fr_9rem]">
              <Field name="totalBudgetAmount" label="Total budget" optional>
                <Input
                  value={draft.totalBudgetAmount ?? ""}
                  onChange={(event) =>
                    setDraft({ ...draft, totalBudgetAmount: event.target.value })
                  }
                  inputMode="numeric"
                />
              </Field>
              <Field name="totalBudgetCurrency" label="Currency" optional>
                <Select
                  value={draft.totalBudgetCurrency ?? defaultCurrency}
                  onChange={(event) =>
                    setDraft({ ...draft, totalBudgetCurrency: event.target.value })
                  }
                >
                  {CURRENCIES.map((currency) => (
                    <option key={currency.value} value={currency.value}>
                      {currency.value}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>

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

            <Field name="creativeConcept" label="Creative concept" optional>
              <Textarea
                value={draft.creativeConcept ?? ""}
                onChange={(event) => setDraft({ ...draft, creativeConcept: event.target.value })}
                rows={2}
              />
            </Field>

            <Field name="landingPage" label="Landing page" optional>
              <Input
                value={draft.landingPage ?? ""}
                onChange={(event) => setDraft({ ...draft, landingPage: event.target.value })}
                placeholder="https://…"
              />
            </Field>

            <Field name="status" label="Status">
              <Select
                value={draft.status ?? "DRAFT"}
                onChange={(event) => setDraft({ ...draft, status: event.target.value })}
              >
                {CAMPAIGN_STATUSES.map((status) => (
                  <option key={status.key} value={status.key}>
                    {status.label}
                  </option>
                ))}
              </Select>
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
                {editing ? "Save changes" : "Add campaign"}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
