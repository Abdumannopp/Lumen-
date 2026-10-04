import Link from "next/link";
import { EmptyState } from "@/components/feedback/empty-state";
import { Button } from "@/components/ui/button";
import { FolderSearch } from "lucide-react";

export default function ProjectNotFound() {
  return (
    <div className="py-16">
      <EmptyState
        icon={<FolderSearch className="size-5" />}
        title="That project no longer exists"
        description="It may have been deleted from another tab or window."
        action={
          <Button asChild variant="outline">
            <Link href="/projects">Back to projects</Link>
          </Button>
        }
      />
    </div>
  );
}
