"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Loader2, PenLine, Plus, Sparkles } from "lucide-react";

import {
  CONTENT_STATUSES,
  CONTENT_TYPES,
  PLATFORMS,
  contentStatusLabel,
  type ContentStatusKey,
  type ContentTypeKey,
  type PlatformKey,
} from "@/lib/content/agent";
import { generateContentAction, saveContentItemAction } from "@/lib/content/actions";
import type { ContentItemRecord } from "@/lib/content/queries";
import { ContentItemCard } from "@/components/content/content-item-card";
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
 * Content workspace.
 *
 * Generation, filtering and editing in one place. Filters are client-side
 * because the whole set is already loaded and a local install will not have
 * enough items for that to matter — a round-trip per filter click would be
 * slower and no more correct.
 */
export function ContentWorkspace({
  projectId,
  items,
  canGenerate,
}: {
  projectId: string;
  items: ContentItemRecord[];
  canGenerate: boolean;
}) {
  const router = useRouter();
  const [generating, startGenerating] = useTransition();
  const [saving, startSaving] = useTransition();

  const [genOpen, setGenOpen] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);
  const [gen, setGen] = useState({
    platform: "INSTAGRAM" as PlatformKey,
    type: "POST" as ContentTypeKey,
    count: "3",
    objective: "",
    guidance: "",
  });

  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<ContentItemRecord | null>(null);
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [formMessage, setFormMessage] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});

  const [platformFilter, setPlatformFilter] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("");

  const visible = items.filter(
    (item) =>
      (!platformFilter || item.platform === platformFilter) &&
      (!statusFilter || item.status === statusFilter),
  );

  function generate() {
    setGenError(null);
    startGenerating(async () => {
      const result = await generateContentAction(projectId, {
        platform: gen.platform,
        type: gen.type,
        count: Number(gen.count) || 3,
        objective: gen.objective || undefined,
        guidance: gen.guidance || undefined,
      });

      if (!result.ok) {
        setGenError(result.message ?? "Could not generate content.");
        return;
      }

      setGenOpen(false);
      router.refresh();
    });
  }

  function openEditor(item: ContentItemRecord | null) {
    setEditing(item);
    setErrors({});
    setFormMessage(null);
    setDraft({
      platform: item?.platform ?? "INSTAGRAM",
      type: item?.type ?? "POST",
      status: item?.status ?? "IDEA",
      objective: item?.objective ?? "",
      audience: item?.audience ?? "",
      pillar: item?.pillar ?? "",
      hook: item?.hook ?? "",
      body: item?.body ?? "",
      cta: item?.cta ?? "",
      scheduledAt: toDayInput(item?.scheduledAt),
    });
    setEditorOpen(true);
  }

  function save() {
    setErrors({});
    setFormMessage(null);

    startSaving(async () => {
      const result = await saveContentItemAction(projectId, {
        itemId: editing?.id,
        platform: (draft.platform ?? "INSTAGRAM") as PlatformKey,
        type: (draft.type ?? "POST") as ContentTypeKey,
        status: (draft.status ?? "IDEA") as ContentStatusKey,
        objective: draft.objective ?? "",
        audience: draft.audience,
        pillar: draft.pillar,
        hook: draft.hook,
        body: draft.body,
        cta: draft.cta,
        scheduledAt: draft.scheduledAt,
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
          <Button onClick={() => setGenOpen(true)}>
            <Sparkles />
            Generate with MUSE
          </Button>
        )}
        <Button variant="ghost" onClick={() => openEditor(null)}>
          <Plus />
          Add item
        </Button>
      </div>

      {items.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={platformFilter}
            onChange={(event) => setPlatformFilter(event.target.value)}
            aria-label="Filter by platform"
            className="h-9 w-44 text-xs"
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
            className="h-9 w-40 text-xs"
          >
            <option value="">All statuses</option>
            {CONTENT_STATUSES.map((status) => (
              <option key={status.key} value={status.key}>
                {status.label}
              </option>
            ))}
          </Select>

          <span className={cn("font-mono text-[0.625rem] tracking-[0.14em] text-muted-foreground uppercase")}>
            {visible.length} of {items.length}
          </span>
        </div>
      )}

      {items.length === 0 ? (
        <EmptyState
          icon={<PenLine className="size-5" />}
          title="No content planned"
          description="MUSE writes hooks, bodies and CTAs from this project's profile, strategy, audience and brand voice. You can also add pieces yourself."
          action={
            canGenerate ? (
              <Button onClick={() => setGenOpen(true)}>
                <Sparkles />
                Generate content
              </Button>
            ) : undefined
          }
        />
      ) : visible.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
          Nothing matches those filters.
        </p>
      ) : (
        <div className="space-y-3">
          {visible.map((item) => (
            <ContentItemCard
              key={item.id}
              projectId={projectId}
              item={item}
              onEdit={openEditor}
            />
          ))}
        </div>
      )}

      {/* Generation */}
      <Dialog open={genOpen} onOpenChange={(next) => !generating && setGenOpen(next)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Generate content</DialogTitle>
            <DialogDescription>
              MUSE writes for one platform and format at a time, using this project&rsquo;s
              profile, strategy, audience and brand voice.
            </DialogDescription>
          </DialogHeader>

          <div className="mt-5 space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field name="gen-platform" label="Platform">
                <Select
                  value={gen.platform}
                  onChange={(event) =>
                    setGen({ ...gen, platform: event.target.value as PlatformKey })
                  }
                >
                  {PLATFORMS.map((platform) => (
                    <option key={platform.key} value={platform.key}>
                      {platform.label}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field name="gen-type" label="Format">
                <Select
                  value={gen.type}
                  onChange={(event) =>
                    setGen({ ...gen, type: event.target.value as ContentTypeKey })
                  }
                >
                  {CONTENT_TYPES.map((type) => (
                    <option key={type.key} value={type.key}>
                      {type.label}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>

            <Field name="gen-count" label="How many" hint="Up to 8 at a time.">
              <Input
                value={gen.count}
                onChange={(event) => setGen({ ...gen, count: event.target.value })}
                inputMode="numeric"
              />
            </Field>

            <Field name="gen-objective" label="Objective" optional>
              <Input
                value={gen.objective}
                onChange={(event) => setGen({ ...gen, objective: event.target.value })}
                placeholder="Get trial sign-ups from founders"
              />
            </Field>

            <Field name="gen-guidance" label="Anything to keep in mind" optional>
              <Textarea
                value={gen.guidance}
                onChange={(event) => setGen({ ...gen, guidance: event.target.value })}
                rows={2}
                placeholder="No emojis. Do not mention pricing."
              />
            </Field>

            {genError && (
              <p role="alert" className="flex items-start gap-2 text-xs text-destructive">
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                {genError}
              </p>
            )}

            <DialogFooter>
              <Button variant="ghost" onClick={() => setGenOpen(false)} disabled={generating}>
                Cancel
              </Button>
              <Button onClick={generate} disabled={generating} aria-busy={generating}>
                {generating && <Loader2 className="animate-spin" />}
                {generating ? "Writing…" : "Generate"}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      {/* Manual editor */}
      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit item" : "Add an item"}</DialogTitle>
            <DialogDescription>
              {editing
                ? "Editing marks this as yours."
                : "Anything not filled in can be added later."}
            </DialogDescription>
          </DialogHeader>

          <div className="mt-5 space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field name="platform" label="Platform">
                <Select
                  value={draft.platform ?? "INSTAGRAM"}
                  onChange={(event) => setDraft({ ...draft, platform: event.target.value })}
                >
                  {PLATFORMS.map((platform) => (
                    <option key={platform.key} value={platform.key}>
                      {platform.label}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field name="type" label="Format">
                <Select
                  value={draft.type ?? "POST"}
                  onChange={(event) => setDraft({ ...draft, type: event.target.value })}
                >
                  {CONTENT_TYPES.map((type) => (
                    <option key={type.key} value={type.key}>
                      {type.label}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>

            <Field name="objective" label="Objective" errors={errors.objective}>
              <Input
                value={draft.objective ?? ""}
                onChange={(event) => setDraft({ ...draft, objective: event.target.value })}
                placeholder="What is this piece for?"
              />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field name="status" label="Status">
                <Select
                  value={draft.status ?? "IDEA"}
                  onChange={(event) => setDraft({ ...draft, status: event.target.value })}
                >
                  {CONTENT_STATUSES.map((status) => (
                    <option key={status.key} value={status.key}>
                      {contentStatusLabel(status.key)}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field name="scheduledAt" label="Planned date" optional errors={errors.scheduledAt}>
                <Input
                  type="date"
                  value={draft.scheduledAt ?? ""}
                  onChange={(event) => setDraft({ ...draft, scheduledAt: event.target.value })}
                />
              </Field>
            </div>

            <Field name="pillar" label="Pillar" optional>
              <Input
                value={draft.pillar ?? ""}
                onChange={(event) => setDraft({ ...draft, pillar: event.target.value })}
              />
            </Field>

            <Field name="audience" label="Audience" optional>
              <Input
                value={draft.audience ?? ""}
                onChange={(event) => setDraft({ ...draft, audience: event.target.value })}
              />
            </Field>

            <Field name="hook" label="Hook" optional>
              <Textarea
                value={draft.hook ?? ""}
                onChange={(event) => setDraft({ ...draft, hook: event.target.value })}
                rows={2}
              />
            </Field>

            <Field name="body" label="Body" optional>
              <Textarea
                value={draft.body ?? ""}
                onChange={(event) => setDraft({ ...draft, body: event.target.value })}
                rows={6}
              />
            </Field>

            <Field name="cta" label="Call to action" optional>
              <Input
                value={draft.cta ?? ""}
                onChange={(event) => setDraft({ ...draft, cta: event.target.value })}
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
                {editing ? "Save changes" : "Add item"}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
