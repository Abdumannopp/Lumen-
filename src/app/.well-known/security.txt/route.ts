import { getServerEnv } from "@/lib/env";

export const dynamic = "force-dynamic";

export async function GET() {
  const env = getServerEnv();
  const body = [
    "Contact: mailto:" + env.SUPPORT_EMAIL,
    `Expires: ${new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString()}`,
    "Preferred-Languages: en",
    "Canonical: " + new URL("/.well-known/security.txt", env.NEXT_PUBLIC_APP_URL).toString(),
    "",
  ].join("\n");

  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=86400",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
