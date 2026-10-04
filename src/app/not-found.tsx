import Link from "next/link";
import { Button } from "@/components/ui/button";
import { AuroraBackdrop } from "@/components/brand/aurora-backdrop";
import { Logo } from "@/components/brand/logo";

export default function NotFound() {
  return (
    <div className="grid min-h-dvh place-items-center px-6">
      <AuroraBackdrop />
      <main id="main" className="flex max-w-md flex-col items-center gap-6 text-center">
        <Logo />
        <p className="font-mono text-[0.6875rem] tracking-[0.2em] text-muted-foreground uppercase">
          404
        </p>
        <h1 className="text-2xl font-semibold">There is nothing at this address</h1>
        <p className="text-sm leading-relaxed text-muted-foreground">
          The page may have moved, or the link may be out of date.
        </p>
        <Button asChild>
          <Link href="/">Back to home</Link>
        </Button>
      </main>
    </div>
  );
}
