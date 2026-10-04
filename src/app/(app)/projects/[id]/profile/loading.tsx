import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { SkeletonPageHeader } from "@/components/feedback/skeletons";

export default function OnboardingLoading() {
  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <SkeletonPageHeader />
      <div className="flex gap-1.5">
        {Array.from({ length: 7 }).map((_, index) => (
          <Skeleton key={index} className="h-6 w-16 rounded-full" />
        ))}
      </div>
      <Card>
        <CardContent className="space-y-5 p-7">
          <Skeleton className="h-6 w-56" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-24 w-full" />
        </CardContent>
      </Card>
    </div>
  );
}
