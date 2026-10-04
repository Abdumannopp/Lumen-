import type { BusinessStage, PrimaryGoal } from "@/generated/prisma/enums";

/**
 * Shared application types. Database row types come from the Prisma client;
 * this file holds the shapes that cross boundaries or have no table.
 */

export type { BusinessStage, PrimaryGoal };

/** Minimal project identity, for switchers and breadcrumbs. */
export interface ProjectSummary {
  id: string;
  name: string;
}

/**
 * Every project-scoped feature added later should accept this, so the project
 * boundary is explicit in the type system rather than assumed.
 */
export interface ProjectScoped {
  projectId: string;
}

/** Standard shape for paginated list endpoints. */
export interface Page<T> {
  items: T[];
  nextCursor: string | null;
  total: number;
}

/** Props every layout and page-level component receives children through. */
export interface WithChildren {
  children: React.ReactNode;
}
