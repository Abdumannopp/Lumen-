"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Loader2, Sparkles } from "lucide-react";

import { generateStrategyAction } from "@/lib/strategy/actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

/**
 * Generation entry point.
 *
 * When a strategy already exists the dialog says plainly that a new version is
 * created and the current one is kept, because "Regenerate" on a document
 * someone has edited is otherwise a frightening button to press.
 */
export function GenerateStrategyButton({
  projectId,
  hasExisting,
}: {
  projectId: string;
  hasExisting: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [guidance, setGuidance] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function generate() {
    setError(null);
    startTransition(async () => {
      const result = await generateStrategyAction(projectId, guidance || undefined);
      if (!result.ok) {
        setError(result.message ?? "Could not generate the strategy.");
        return;
      }
      setOpen(false);
      setGuidance("");
      router.refresh();
    });
  }

  return (
    <>
      <Button onClick={() => setOpen(true)} variant={hasExisting ? "outline" : "primary"}>
        <Sparkles />
        {hasExisting ? "New version" : "Generate strategy"}
      </Button>

      <Dialog open={open} onOpenChange={(next) => !pending && setOpen(next)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {hasExisting ? "Generate a new version" : "Generate the strategy"}
            </DialogTitle>
            <DialogDescription>
              {hasExisting
                ? "ATLAS writes a new version from the current business profile. Your existing version is kept and can be restored at any time."
                : "ATLAS reads this project's business profile and writes a full marketing strategy. You can edit every section afterwards."}
            </DialogDescription>
          </DialogHeader>

          <div className="mt-5 space-y-2">
            <label htmlFor="guidance" className="text-sm font-medium text-foreground">
              Anything to keep in mind? <span className="text-muted-foreground">(optional)</span>
            </label>
            <Textarea
              id="guidance"
              value={guidance}
              onChange={(event) => setGuidance(event.target.value)}
              rows={3}
              maxLength={500}
              placeholder="We have no budget for paid ads this quarter."
              disabled={pending}
            />
          </div>

          {error && (
            <p role="alert" className="mt-3 flex items-start gap-2 text-xs text-destructive">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
              {error}
            </p>
          )}

          <DialogFooter className="mt-6">
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button onClick={generate} disabled={pending} aria-busy={pending}>
              {pending && <Loader2 className="animate-spin" />}
              {pending ? "Writing…" : "Generate"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
