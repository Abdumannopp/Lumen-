import { AlertTriangle, ArrowRight, HelpCircle, Lightbulb, Target } from "lucide-react";

import type { AssistantAnswer } from "@/lib/assistant/agent";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * A structured assistant answer.
 *
 * Rendered as labelled sections rather than a paragraph, because the value the
 * product promises is prioritisation: the operator should be able to read the
 * next action without reading the reasoning.
 *
 * Confidence, assumptions and missing information are given equal visual weight
 * to the advice itself. Burying them would let a low-confidence answer read
 * like a certain one, which is the specific failure this product must not have.
 */

const CONFIDENCE_TONE: Record<AssistantAnswer["confidence"], string> = {
  high: "success",
  medium: "warning",
  low: "danger",
};

const SECTIONS = [
  { key: "insight", label: "Insight", icon: Lightbulb },
  { key: "whyItMatters", label: "Why it matters", icon: HelpCircle },
  { key: "recommendation", label: "Recommendation", icon: Target },
] as const;

export function AnswerCard({ answer }: { answer: AssistantAnswer }) {
  return (
    <Card variant="aurora" className="overflow-hidden">
      <CardContent className="space-y-6 p-6">
        {SECTIONS.map((section) => {
          const Icon = section.icon;
          return (
            <div key={section.key} className="space-y-1.5">
              <p className="flex items-center gap-1.5 font-mono text-[0.625rem] tracking-[0.18em] text-muted-foreground uppercase">
                <Icon className="size-3" />
                {section.label}
              </p>
              <p className="text-sm leading-relaxed text-foreground">{answer[section.key]}</p>
            </div>
          );
        })}

        {/* The one thing to do, given the most emphasis on the card. */}
        <div className="rounded-xl border border-primary/30 bg-primary/8 p-4">
          <p className="flex items-center gap-1.5 font-mono text-[0.625rem] tracking-[0.18em] text-[color:var(--gradient-from)] uppercase">
            <ArrowRight className="size-3" />
            Next action
          </p>
          <p className="mt-1.5 text-sm leading-relaxed font-medium text-foreground">
            {answer.nextAction}
          </p>
        </div>

        <div className="space-y-4 border-t border-border pt-5">
          <div className="flex flex-wrap items-center gap-2">
            <Badge
              variant={
                CONFIDENCE_TONE[answer.confidence] as "success" | "warning" | "danger"
              }
            >
              {answer.confidence} confidence
            </Badge>
            <p className="text-xs leading-relaxed text-muted-foreground">
              {answer.confidenceReason}
            </p>
          </div>

          {answer.assumptions.length > 0 && (
            <div className="space-y-1.5">
              <p className="font-mono text-[0.625rem] tracking-[0.18em] text-muted-foreground uppercase">
                Assumptions — not facts you gave us
              </p>
              <ul className="space-y-1">
                {answer.assumptions.map((assumption) => (
                  <li
                    key={assumption}
                    className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground"
                  >
                    <AlertTriangle className="mt-0.5 size-3 shrink-0 text-warning" />
                    {assumption}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {answer.missingInformation.length > 0 && (
            <div className="space-y-1.5">
              <p className="font-mono text-[0.625rem] tracking-[0.18em] text-muted-foreground uppercase">
                This would sharpen the answer
              </p>
              <ul className="space-y-1">
                {answer.missingInformation.map((item) => (
                  <li
                    key={item}
                    className={cn(
                      "flex items-start gap-2 text-xs leading-relaxed text-muted-foreground",
                    )}
                  >
                    <span className="mt-1.5 size-1 shrink-0 rounded-full bg-muted-foreground/50" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
