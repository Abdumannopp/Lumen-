import { SkeletonPageHeader } from "@/components/feedback/skeletons";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Shown while a page in this group streams. Mirrors the dashboard's shape —
 * header, status grid, then stacked sections — so content lands in the space
 * the placeholder already occupied.
 */
export default function AppLoading() {
  return (
    <div className="space-y-12">
      <SkeletonPageHeader />

      <div className="space-y-4">
        <Skeleton className="h-3 w-20" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <Card key={index}>
              <CardContent className="space-y-4 p-5">
                <div className="flex items-start justify-between">
                  <Skeleton className="size-9 rounded-xl" />
                  <Skeleton className="h-3 w-12" />
                </div>
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-3 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      <div className="space-y-4">
        <Skeleton className="h-3 w-32" />
        <Card>
          <CardContent className="grid gap-6 p-6 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className="space-y-2">
                <Skeleton className="h-2.5 w-16" />
                <Skeleton className="h-4 w-28" />
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <div className="space-y-4">
        <Skeleton className="h-3 w-24" />
        {Array.from({ length: 2 }).map((_, index) => (
          <Card key={index}>
            <CardContent className="space-y-2 p-5">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-3 w-full max-w-md" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
