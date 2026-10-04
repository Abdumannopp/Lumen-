"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Check, ChevronsUpDown, FolderPlus, Loader2, Settings2 } from "lucide-react";

import { setActiveProjectAction } from "@/lib/projects/actions";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export interface SwitcherProject {
  id: string;
  name: string;
}

/**
 * Active project selector, mounted in the application topbar.
 *
 * Switching writes the cookie server-side and revalidates the layout, so every
 * server component below re-renders already scoped to the new project — no
 * client cache to invalidate and no chance of a stale view.
 */
export function ProjectSwitcher({
  projects,
  activeProjectId,
}: {
  projects: SwitcherProject[];
  activeProjectId: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const active = projects.find((project) => project.id === activeProjectId) ?? null;

  if (projects.length === 0) {
    return (
      <Button asChild variant="outline" size="sm">
        <Link href="/projects/new">
          <FolderPlus />
          New project
        </Link>
      </Button>
    );
  }

  function select(projectId: string) {
    if (projectId === activeProjectId) return;

    startTransition(async () => {
      await setActiveProjectAction(projectId);
      router.refresh();
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="secondary"
          size="sm"
          className="max-w-[13rem] justify-between gap-2"
          aria-label="Switch project"
        >
          {pending ? <Loader2 className="animate-spin" /> : null}
          <span className="truncate">{active?.name ?? "Select project"}</span>
          <ChevronsUpDown className="opacity-60" />
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="min-w-64">
        <DropdownMenuLabel>Projects</DropdownMenuLabel>

        {projects.map((project) => (
          <DropdownMenuItem key={project.id} onSelect={() => select(project.id)}>
            <Check
              className={project.id === activeProjectId ? "opacity-100" : "opacity-0"}
              aria-hidden
            />
            <span className="truncate">{project.name}</span>
          </DropdownMenuItem>
        ))}

        <DropdownMenuSeparator />

        <DropdownMenuItem asChild>
          <Link href="/projects/new">
            <FolderPlus />
            New project
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/projects">
            <Settings2 />
            Manage projects
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
