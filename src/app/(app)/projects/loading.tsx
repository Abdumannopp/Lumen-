import { SkeletonPageHeader } from "@/components/feedback/skeletons";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function ProjectsLoading() {
  return (
    <div className="space-y-8">
      <SkeletonPageHeader />
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, index) => (
          <Card key={index}>
            <CardContent className="flex flex-col gap-5 p-6 lg:flex-row lg:items-start lg:justify-between">
              <div className="w-full space-y-3">
                <Skeleton className="h-5 w-48" />
                <Skeleton className="h-4 w-full max-w-md" />
                <div className="flex gap-2">
                  <Skeleton className="h-5 w-24 rounded-full" />
                  <Skeleton className="h-5 w-28 rounded-full" />
                  <Skeleton className="h-5 w-20 rounded-full" />
                </div>
              </div>
              <Skeleton className="h-9 w-28 shrink-0" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
