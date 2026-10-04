"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Globe, Loader2, Plus, Radar, Sparkles, Trash2 } from "lucide-react";

import { deleteCompetitorAction, generateInsightsAction } from "@/lib/intelligence/actions";
import { INSIGHT_KINDS, insightKindLabel } from "@/lib/intelligence/agent";
import type { CompetitorRecord, InsightRecord } from "@/lib/intelligence/queries";
import { CompetitorEditor } from "@/components/intelligence/competitor-editor";
import { InsightCard } from "@/components/intelligence/insight-card";
import { EmptyState } from "@/components/feedback/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SectionHeading } from "@/components/layout/section-heading";
import { Card, CardContent } from "@/components/ui/card";

/**
 * Intelligence workspace.
 *
 * Competitors first, insights second — that order is the argument. SCOUT cannot
 * research anything, so the recorded data is the input, and putting it at the
 * top makes the dependency obvious rather than surprising.
 */
export function IntelligenceWorkspace({
  projectId,
  competitors,
  insights,
  canAnalyse,
}: {
  projectId: string;
  competitors: CompetitorRecord[];
  insights: InsightRecord[];
  canAnalyse: boolean;
}) {
  const router = useRouter();
  const [analysing, startAnalysing] = useTransition();
  const [deleting, startDeleting] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<CompetitorRecord | null>(null);

  function analyse() {
    setError(null);
    startAnalysing(async () => {
      const result = await generateInsightsAction(projectId);
      if (!result.ok) {
        setError(result.message ?? "Could not analyse.");
        return;
      }
      router.refresh();
    });
  }

  function openEditor(competitor: CompetitorRecord | null) {
    setEditing(competitor);
    setEditorOpen(true);
  }

  return (
    <div className="space-y-10">
      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SectionHeading title={`Competitors · ${competitors.length}`} />
          <Button variant="ghost" size="sm" onClick={() => openEditor(null)}>
            <Plus />
            Add competitor
          </Button>
        </div>

        {competitors.length === 0 ? (
          <EmptyState
            icon={<Radar className="size-5" />}
            title="No competitors recorded"
            description="SCOUT has no internet access — it reasons only about what you write down. Add the competitors you know, with whatever detail you have."
            action={
              <Button onClick={() => openEditor(null)}>
                <Plus />
                Add the first competitor
              </Button>
            }
          />
        ) : (
          <div className="space-y-3">
            {competitors.map((competitor) => {
              const detail = [
                competitor.description,
                competitor.strengths.length > 0 && `${competitor.strengths.length} strengths`,
                competitor.weaknesses.length > 0 && `${competitor.weaknesses.length} weaknesses`,
                competitor.positioning && "positioning",
                competitor.pricingNotes && "pricing",
                competitor.marketingNotes && "marketing",
              ].filter(Boolean);

              return (
                <Card key={competitor.id}>
                  <CardContent className="flex flex-wrap items-start justify-between gap-3 p-5">
                    <div className="min-w-0 space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-sm font-semibold text-foreground">{competitor.name}</h3>
                        {detail.length === 0 && <Badge variant="warning">Name only</Badge>}
                      </div>

                      {competitor.description && (
                        <p className="text-sm leading-relaxed text-muted-foreground">
                          {competitor.description}
                        </p>
                      )}

                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        {competitor.website && (
                          <span className="flex items-center gap-1.5">
                            <Globe className="size-3" />
                            {competitor.website.replace(/^https?:\/\//, "")}
                          </span>
                        )}
                        {competitor.strengths.length > 0 && (
                          <span>{competitor.strengths.length} strengths</span>
                        )}
                        {competitor.weaknesses.length > 0 && (
                          <span>{competitor.weaknesses.length} weaknesses</span>
                        )}
                      </div>
                    </div>

                    <div className="flex shrink-0 items-center gap-1">
                      <Button variant="ghost" size="sm" onClick={() => openEditor(competitor)}>
                        Edit
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Delete ${competitor.name}`}
                        disabled={deleting}
                        onClick={() =>
                          startDeleting(async () => {
                            await deleteCompetitorAction(projectId, competitor.id);
                            router.refresh();
                          })
                        }
                      >
                        {deleting ? <Loader2 className="animate-spin" /> : <Trash2 />}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SectionHeading title="Analysis" />
          {canAnalyse && (
            <Button
              onClick={analyse}
              disabled={analysing}
              variant={insights.length > 0 ? "outline" : "primary"}
            >
              {analysing ? <Loader2 className="animate-spin" /> : <Sparkles />}
              {analysing ? "Analysing…" : insights.length > 0 ? "Re-analyse" : "Analyse with SCOUT"}
            </Button>
          )}
        </div>

        {error && (
          <div
            role="alert"
            className="flex items-start gap-3 rounded-xl border border-destructive/35 bg-destructive/10 px-4 py-3"
          >
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
            <p className="text-sm leading-relaxed text-foreground">{error}</p>
          </div>
        )}

        {!canAnalyse && competitors.length > 0 && (
          <p className="rounded-xl border border-dashed border-border px-4 py-3 text-sm leading-relaxed text-muted-foreground">
            Add some detail to at least one competitor — strengths, weaknesses, positioning or
            pricing. SCOUT cannot look anything up, so a list of names gives it nothing to work
            with.
          </p>
        )}

        {insights.length === 0 && canAnalyse && (
          <EmptyState
            icon={<Radar className="size-5" />}
            title="No analysis yet"
            description="SCOUT reads your competitor records and looks for gaps, openings and threats — citing what each conclusion rests on."
          />
        )}

        {insights.length > 0 && (
          <div className="space-y-8">
            {INSIGHT_KINDS.map((kind) => {
              const forKind = insights.filter((insight) => insight.kind === kind.key);
              if (forKind.length === 0) return null;

              return (
                <div key={kind.key} className="space-y-3">
                  <div className="space-y-0.5">
                    <h3 className="text-sm font-semibold text-foreground">
                      {insightKindLabel(kind.key)}
                    </h3>
                    <p className="text-xs text-muted-foreground">{kind.blurb}</p>
                  </div>
                  <div className="space-y-3">
                    {forKind.map((insight) => (
                      <InsightCard key={insight.id} projectId={projectId} insight={insight} />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {editorOpen && (
        <CompetitorEditor
          // Remounted per target so the draft state starts from the right record.
          key={editing?.id ?? "new"}
          projectId={projectId}
          competitor={editing}
          open={editorOpen}
          onOpenChange={setEditorOpen}
        />
      )}
    </div>
  );
}
