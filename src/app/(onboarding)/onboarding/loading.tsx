import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function OnboardingLoading() {
  return (
    <div className="space-y-8">
      <div className="flex gap-2">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-6 w-20 rounded-full" />
        ))}
      </div>
      <Card>
        <CardContent className="space-y-5 p-7">
          <Skeleton className="size-11 rounded-xl" />
          <Skeleton className="h-6 w-64" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-4/5" />
        </CardContent>
      </Card>
    </div>
  );
}
