import { Skeleton } from "@/components/ui/skeleton";

/**
 * Composed skeletons.
 *
 * Sized to mirror the real components' box model, so a `loading.tsx` occupies
 * the same space the content will and nothing shifts when data arrives.
 */
export function SkeletonPageHeader() {
  return (
    <div className="space-y-3">
      <Skeleton className="h-3 w-28" />
      <Skeleton className="h-8 w-64" />
      <Skeleton className="h-4 w-full max-w-md" />
    </div>
  );
}
