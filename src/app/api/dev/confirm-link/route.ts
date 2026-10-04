import { NextResponse, type NextRequest } from "next/server";

import { getServerEnv } from "@/lib/env";
import { LocalAuthProvider } from "@/lib/auth/providers/local";

/**
 * Read back the link the local provider would have emailed.
 *
 * The local auth provider is a test double with no mailbox behind it, so signup
 * and password reset would otherwise be untestable end to end — and the parts
 * worth testing are exactly the ones on the far side of that link: that a
 * confirmation establishes a session, that a used token stops working, that a
 * reset link lets you set a password and nothing else does.
 *
 * Guarded twice over, because "development only" written in a comment is not a
 * guard:
 *
 *   this route 404s unless `AUTH_PROVIDER=local` **and** `APP_ENV` (a plain
 *   server variable, resolved at process start — never `NEXT_PUBLIC_APP_ENV`,
 *   which Next.js would freeze at whatever it was during `npm run build`) is
 *   not "production"
 *
 *   `src/lib/env.ts` refuses to start the process at all with
 *   `AUTH_PROVIDER=local` in production
 *
 * So the deployed product has no local provider to read tokens from, and this
 * handler cannot exist in a state where it would leak one. With the Supabase
 * provider it is inert: the tokens are Supabase's and never pass through here.
 */
export async function GET(request: NextRequest) {
  const env = getServerEnv();

  if (env.AUTH_PROVIDER !== "local" || env.APP_ENV !== "local") {
    return new NextResponse("Not found", { status: 404 });
  }

  const email = request.nextUrl.searchParams.get("email");

  if (!email) {
    return NextResponse.json({ error: "email is required" }, { status: 400 });
  }

  const token = LocalAuthProvider.pendingTokenFor(email);

  if (!token) {
    return NextResponse.json({ error: "no pending link for that address" }, { status: 404 });
  }

  return NextResponse.json({ tokenHash: token });
}
