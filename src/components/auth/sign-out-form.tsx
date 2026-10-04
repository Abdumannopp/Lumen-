import { LogOut } from "lucide-react";

/**
 * Sign out.
 *
 * A plain HTML form posting to `/logout`, with no Server Action behind it —
 * both halves of that are deliberate. The form makes signing out an act rather
 * than something any prefetch can trigger; the absence of a Server Action keeps
 * this out of the page's action numbering, so adding account chrome does not
 * quietly renumber the action fields of the forms below it.
 *
 * Works with JavaScript switched off, and adds nothing to the client bundle.
 */
export function SignOutForm({ email }: { email: string }) {
  return (
    <form method="post" action="/logout" className="space-y-2">
      <p className="truncate font-mono text-[0.625rem] tracking-[0.14em] text-muted-foreground uppercase">
        {email}
      </p>
      <button
        type="submit"
        className="flex items-center gap-2 rounded-md text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        <LogOut className="size-3.5" />
        Sign out
      </button>
    </form>
  );
}
