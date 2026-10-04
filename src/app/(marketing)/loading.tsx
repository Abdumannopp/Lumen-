import { Container } from "@/components/layout/container";
import { Skeleton } from "@/components/ui/skeleton";

export default function MarketingLoading() {
  return (
    <Container className="py-24">
      <div className="mx-auto max-w-3xl space-y-6 text-center">
        <Skeleton className="mx-auto h-6 w-40" />
        <Skeleton className="mx-auto h-14 w-full" />
        <Skeleton className="mx-auto h-14 w-4/5" />
        <Skeleton className="mx-auto h-4 w-2/3" />
      </div>
    </Container>
  );
}
