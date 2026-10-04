"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  AlertTriangle,
  ArchiveRestore,
  Archive,
  Check,
  Loader2,
  MoreHorizontal,
  Pencil,
  Trash2,
} from "lucide-react";

import {
  archiveProjectAction,
  deleteProjectAction,
  restoreProjectAction,
  setActiveProjectAction,
} from "@/lib/projects/actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Row-level project controls.
 *
 * Archive and restore are one-click because both are reversible. Deletion is
 * not, so it requires the project's name to be typed — and the same check runs
 * again on the server, because a confirmation that only exists in the browser
 * is decoration rather than a safeguard.
 */
export function ProjectActions({
  projectId,
  projectName,
  isArchived,
  isActive,
}: {
  projectId: string;
  projectName: string;
  isArchived: boolean;
  isActive: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  function run(action: () => Promise<{ status: string; message?: string }>) {
    setActionError(null);
    startTransition(async () => {
      const result = await action();
      if (result.status === "error") {
        setActionError(result.message ?? "That action could not be completed.");
      } else {
        router.refresh();
      }
    });
  }

  async function handleDelete() {
    setDeleting(true);
    setActionError(null);

    const result = await deleteProjectAction(projectId, confirmation);

    setDeleting(false);

    if (result.status === "error") {
      setActionError(result.message ?? "The project could not be deleted.");
      return;
    }

    setDeleteOpen(false);
    setConfirmation("");
    router.refresh();
  }

  const confirmationMatches = confirmation.trim().toLowerCase() === projectName.toLowerCase();

  return (
    <>
      <div className="flex items-center gap-2">
        {!isArchived && !isActive && (
          <Button
            variant="outline"
            size="sm"
            disabled={pending}
            onClick={() => run(() => setActiveProjectAction(projectId))}
          >
            {pending ? <Loader2 className="animate-spin" /> : null}
            Set active
          </Button>
        )}

        {isActive && (
          <span className="flex items-center gap-1.5 font-mono text-[0.6875rem] tracking-[0.14em] text-[color:var(--gradient-from)] uppercase">
            <Check className="size-3.5" />
            Active
          </span>
        )}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label={`Actions for ${projectName}`}>
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>

          <DropdownMenuContent align="end">
            <DropdownMenuItem asChild>
              <Link href={`/projects/${projectId}/edit`}>
                <Pencil />
                Edit details
              </Link>
            </DropdownMenuItem>

            {isArchived ? (
              <DropdownMenuItem
                onSelect={() => run(() => restoreProjectAction(projectId))}
              >
                <ArchiveRestore />
                Restore
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem
                onSelect={() => run(() => archiveProjectAction(projectId))}
              >
                <Archive />
                Archive
              </DropdownMenuItem>
            )}

            <DropdownMenuSeparator />

            <DropdownMenuItem
              onSelect={() => setDeleteOpen(true)}
              className="text-destructive data-[highlighted]:bg-destructive/12 data-[highlighted]:text-destructive"
            >
              <Trash2 />
              Delete permanently
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {actionError && !deleteOpen && (
        <p role="alert" className="mt-2 text-xs text-destructive">
          {actionError}
        </p>
      )}

      <Dialog
        open={deleteOpen}
        onOpenChange={(open) => {
          setDeleteOpen(open);
          if (!open) {
            setConfirmation("");
            setActionError(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete “{projectName}”?</DialogTitle>
            <DialogDescription>
              This permanently removes the project and everything recorded against it. Archiving
              hides a project without losing anything — delete only if it should never have existed.
            </DialogDescription>
          </DialogHeader>

          <div className="mt-5 space-y-2">
            <Label htmlFor="delete-confirmation">
              Type <span className="font-mono text-foreground">{projectName}</span> to confirm
            </Label>
            <Input
              id="delete-confirmation"
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              autoComplete="off"
              aria-invalid={Boolean(actionError) || undefined}
            />
          </div>

          {actionError && (
            <p
              role="alert"
              className="mt-3 flex items-start gap-2 text-xs leading-relaxed text-destructive"
            >
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
              {actionError}
            </p>
          )}

          <DialogFooter className="mt-6">
            <Button variant="ghost" onClick={() => setDeleteOpen(false)} disabled={deleting}>
              Keep project
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={!confirmationMatches || deleting}
              aria-busy={deleting}
            >
              {deleting && <Loader2 className="animate-spin" />}
              {deleting ? "Deleting…" : "Delete permanently"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
