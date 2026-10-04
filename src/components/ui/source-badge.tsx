import { Badge } from "@/components/ui/badge";

/**
 * Provenance badge.
 *
 * Every module that mixes generated and hand-written records showed this
 * differently — four separate label maps, four sets of variants. Provenance is
 * one of the product's load-bearing ideas, so it should look identical
 * everywhere: an operator learns the badge once.
 *
 * The agent name is passed in because "ATLAS" and "PULSE" mean more to someone
 * reading a strategy than a generic "AI" would.
 */
export function SourceBadge({
  source,
  agent,
}: {
  source: "AI" | "MANUAL" | "EDITED";
  /** Displayed for AI-written records. Falls back to "AI". */
  agent?: string;
}) {
  if (source === "AI") return <Badge variant="accent">{agent ?? "AI"}</Badge>;
  if (source === "EDITED") return <Badge>Edited</Badge>;
  return <Badge>Yours</Badge>;
}
