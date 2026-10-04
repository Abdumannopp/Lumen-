import Link from "next/link";
import { Globe, MapPin } from "lucide-react";

import {
  BUSINESS_STAGE_SHORT,
  PRIMARY_GOAL_SHORT,
  countryLabel,
  industryLabel,
  marketLabel,
} from "@/config/project";
import type { ProjectRecord } from "@/lib/projects/queries";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ProjectActions } from "@/components/projects/project-actions";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** How many markets to show before collapsing the rest into a count. */
const MARKETS_SHOWN = 4;

export function ProjectCard({
  project,
  isActive,
  profileComplete,
}: {
  project: ProjectRecord;
  isActive: boolean;
  /** Undefined for archived rows, where profile status is not actionable. */
  profileComplete?: boolean;
}) {
  const isArchived = project.archivedAt !== null;
  const extraMarkets = project.targetMarkets.length - MARKETS_SHOWN;

  return (
    <Card
      variant={isActive ? "aurora" : "default"}
      className={cn("transition-opacity", isArchived && "opacity-65")}
    >
      <CardContent className="flex flex-col gap-5 p-6 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 space-y-3">
          <div className="flex flex-wrap items-center gap-2.5">
            <h3 className="font-display text-base font-semibold">
              <Link
                href={`/projects/${project.id}/edit`}
                className="rounded-md transition-colors hover:text-[color:var(--gradient-from)]"
              >
                {project.name}
              </Link>
            </h3>
            {isArchived && <Badge variant="outline">Archived</Badge>}
            {!isArchived && profileComplete === false && (
              <Badge variant="warning">Profile incomplete</Badge>
            )}
          </div>

          {project.description && (
            <p className="max-w-prose text-sm leading-relaxed text-muted-foreground">
              {project.description}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <MapPin className="size-3.5" />
              {countryLabel(project.country)}
            </span>

            <span>{industryLabel(project.industry)}</span>

            {project.website && (
              <a
                href={project.website}
                target="_blank"
                rel="noreferrer noopener"
                className="flex items-center gap-1.5 rounded-md transition-colors hover:text-foreground"
              >
                <Globe className="size-3.5" />
                {project.website.replace(/^https?:\/\//, "")}
              </a>
            )}
          </div>

          <div className="flex flex-wrap gap-1.5">
            <Badge>{BUSINESS_STAGE_SHORT[project.businessStage]}</Badge>
            <Badge variant="accent">{PRIMARY_GOAL_SHORT[project.primaryGoal]}</Badge>

            {project.targetMarkets.slice(0, MARKETS_SHOWN).map((market) => (
              <Badge key={market} variant="outline">
                {marketLabel(market)}
              </Badge>
            ))}

            {extraMarkets > 0 && <Badge variant="outline">+{extraMarkets} more</Badge>}
          </div>
        </div>

        <div className="flex shrink-0 flex-col items-start gap-2 lg:items-end">
          {!isArchived && (
            <Button asChild variant={profileComplete ? "ghost" : "outline"} size="sm">
              <Link
                href={
                  profileComplete
                    ? `/projects/${project.id}/profile`
                    : `/projects/${project.id}/onboarding`
                }
              >
                {profileComplete ? "View profile" : "Complete profile"}
              </Link>
            </Button>
          )}
          <ProjectActions
            projectId={project.id}
            projectName={project.name}
            isArchived={isArchived}
            isActive={isActive}
          />
        </div>
      </CardContent>
    </Card>
  );
}
