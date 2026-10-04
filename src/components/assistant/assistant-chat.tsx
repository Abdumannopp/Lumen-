"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Loader2,
  Route,
  Send,
  Sparkles,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";

import { askAssistantAction } from "@/lib/assistant/actions";
import {
  routeRequestAction,
  runRouteAction,
  type RouteStep,
  type RunStepOutcome,
} from "@/lib/assistant/route-actions";
import type { AssistantAnswer } from "@/lib/assistant/agent";
import { AnswerCard } from "@/components/assistant/answer-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";

export interface ChatMessage {
  id: string;
  role: "USER" | "ASSISTANT";
  content: string;
  structured: AssistantAnswer | null;
}

/** Starter questions, taken from the product specification. */
const SUGGESTIONS = [
  "What should I do next?",
  "Analyze my marketing situation.",
  "What are my biggest weaknesses?",
  "What information are we missing?",
];

/**
 * Assistant chat.
 *
 * The pending state is optimistic on the question only: the operator's message
 * appears immediately, while the answer waits for the server. Showing a
 * placeholder answer would be a lie, so the pending slot says what it is doing
 * instead.
 */
export function AssistantChat({
  projectId,
  conversationId,
  initialMessages,
}: {
  projectId: string;
  conversationId: string | null;
  initialMessages: ChatMessage[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [question, setQuestion] = useState("");
  const [optimistic, setOptimistic] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  // A proposed route, awaiting confirmation. Held here rather than persisted:
  // it is a suggestion about what to do next, not a record of anything.
  const [proposal, setProposal] = useState<{
    request: string;
    understanding: string;
    steps: RouteStep[];
  } | null>(null);
  const [outcomes, setOutcomes] = useState<RunStepOutcome[] | null>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [initialMessages.length, optimistic]);

  function submit(text: string) {
    const trimmed = text.trim();
    if (!trimmed || pending) return;

    setError(null);
    setProposal(null);
    setOutcomes(null);
    setOptimistic(trimmed);
    setQuestion("");

    startTransition(async () => {
      // Route first. Questions are answered here; anything that would create a
      // record is proposed and waits for confirmation.
      const route = await routeRequestAction(projectId, trimmed);

      if (route.ok && route.steps && route.writes) {
        setOptimistic(null);
        setProposal({
          request: trimmed,
          understanding: route.understanding ?? trimmed,
          steps: route.steps,
        });
        return;
      }

      const result = await askAssistantAction(projectId, conversationId, trimmed);

      setOptimistic(null);

      if (!result.ok) {
        setError(result.message ?? "That did not work.");
        // Restore the text so a failure never costs the operator their typing.
        setQuestion(trimmed);
      }

      if (result.conversationId && result.conversationId !== conversationId) {
        router.push(`/assistant?c=${result.conversationId}`);
      } else {
        router.refresh();
      }
    });
  }

  const isEmpty = initialMessages.length === 0 && !optimistic;

  return (
    <div className="flex min-h-[60vh] flex-col gap-6">
      <div className="flex-1 space-y-6">
        {isEmpty && (
          <div className="space-y-5 py-8">
            <div className="space-y-2">
              <span className="flex size-10 items-center justify-center rounded-xl border border-border bg-secondary text-[color:var(--gradient-from)]">
                <Sparkles className="size-5" />
              </span>
              <h2 className="font-display text-lg font-semibold">
                Ask about this business
              </h2>
              <p className="max-w-lg text-sm leading-relaxed text-muted-foreground">
                Ask anything. LUMEN picks the right specialist for you — ATLAS for strategy, PULSE
                for audience, SCOUT for competitors, MUSE for content, ORBIT for campaigns, ASCEND
                for what to improve. Questions are answered here; anything that would create a
                document is shown to you first.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              {SUGGESTIONS.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => submit(suggestion)}
                  className="rounded-full border border-border bg-secondary/50 px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-border-strong hover:text-foreground"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        )}

        {initialMessages.map((message) =>
          message.role === "USER" ? (
            <div key={message.id} className="flex justify-end">
              <p className="max-w-[85%] rounded-2xl rounded-br-sm border border-border bg-secondary px-4 py-2.5 text-sm leading-relaxed text-foreground">
                {message.content}
              </p>
            </div>
          ) : message.structured ? (
            <AnswerCard key={message.id} answer={message.structured} />
          ) : (
            <Card key={message.id}>
              <CardContent className="p-5">
                <p className="text-sm leading-relaxed whitespace-pre-wrap text-foreground">
                  {message.content}
                </p>
              </CardContent>
            </Card>
          ),
        )}

        {optimistic && (
          <div className="flex justify-end">
            <p className="max-w-[85%] rounded-2xl rounded-br-sm border border-border bg-secondary px-4 py-2.5 text-sm leading-relaxed text-foreground opacity-70">
              {optimistic}
            </p>
          </div>
        )}

        {pending && (
          <Card>
            <CardContent className="flex items-center gap-3 p-5">
              <Loader2 className="size-4 animate-spin text-[color:var(--gradient-from)]" />
              <p className="text-sm text-muted-foreground">
                Reading this project&rsquo;s context and thinking it through…
              </p>
            </CardContent>
          </Card>
        )}

        {/* A proposed route. Shown before anything is created, with the agents
            named — the operator never has to pick one, but always sees which. */}
        {proposal && !pending && (
          <Card variant="aurora">
            <CardContent className="space-y-4 p-5">
              <div className="space-y-1.5">
                <p className="flex items-center gap-1.5 font-mono text-[0.625rem] tracking-[0.18em] text-muted-foreground uppercase">
                  <Route className="size-3" />
                  Suggested route
                </p>
                <p className="text-sm leading-relaxed text-foreground">
                  {proposal.understanding}
                </p>
              </div>

              <ol className="space-y-2">
                {proposal.steps.map((step, index) => (
                  <li key={`${step.agent}-${index}`} className="flex items-start gap-3">
                    <span className="mt-0.5 font-mono text-[0.6875rem] text-muted-foreground tabular-nums">
                      {index + 1}
                    </span>
                    <div className="min-w-0 space-y-0.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="accent">{step.label}</Badge>
                        {step.writes && (
                          <span className="text-xs text-muted-foreground">
                            creates {step.creates}
                          </span>
                        )}
                      </div>
                      <p className="text-sm leading-relaxed text-muted-foreground">
                        {step.reason}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>

              <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
                <Button
                  size="sm"
                  disabled={pending}
                  onClick={() => {
                    const steps = proposal.steps.map((step) => step.agent);
                    const request = proposal.request;
                    setProposal(null);

                    startTransition(async () => {
                      const result = await runRouteAction(projectId, steps, request);
                      setOutcomes(result.outcomes ?? null);
                      if (!result.ok) setError(result.message ?? "Some steps did not finish.");
                      router.refresh();
                    });
                  }}
                >
                  Run it
                  <ArrowRight />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    const request = proposal.request;
                    setProposal(null);
                    // Answering instead creates nothing.
                    startTransition(async () => {
                      const result = await askAssistantAction(projectId, conversationId, request);
                      if (!result.ok) setError(result.message ?? "That did not work.");
                      if (result.conversationId && result.conversationId !== conversationId) {
                        router.push(`/assistant?c=${result.conversationId}`);
                      } else {
                        router.refresh();
                      }
                    });
                  }}
                >
                  Just answer instead
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* What each step actually produced, with a link to go and look. */}
        {outcomes && outcomes.length > 0 && !pending && (
          <Card>
            <CardContent className="space-y-3 p-5">
              <p className="font-mono text-[0.625rem] tracking-[0.18em] text-muted-foreground uppercase">
                What was created
              </p>
              <ul className="space-y-2">
                {outcomes.map((outcome, index) => (
                  <li key={`${outcome.agent}-${index}`} className="flex items-start gap-2.5">
                    {outcome.ok ? (
                      <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" />
                    ) : (
                      <XCircle className="mt-0.5 size-4 shrink-0 text-destructive" />
                    )}
                    <div className="min-w-0 space-y-0.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline">{outcome.label}</Badge>
                        {outcome.href && outcome.ok && (
                          <Link
                            href={outcome.href}
                            className="rounded-md text-xs text-[color:var(--gradient-from)] underline-offset-4 hover:underline"
                          >
                            Open
                          </Link>
                        )}
                      </div>
                      <p className="text-sm leading-relaxed text-muted-foreground">
                        {outcome.detail}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}

        {error && (
          <div
            role="alert"
            className="flex items-start gap-3 rounded-xl border border-destructive/35 bg-destructive/10 px-4 py-3"
          >
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
            <p className="text-sm leading-relaxed text-foreground">{error}</p>
          </div>
        )}

        <div ref={endRef} />
      </div>

      <div className="sticky bottom-0 space-y-2 bg-background/85 pt-2 pb-4 backdrop-blur-xl">
        <Textarea
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          onKeyDown={(event) => {
            // Enter sends; Shift+Enter is a newline, as in every chat app.
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              submit(question);
            }
          }}
          rows={2}
          maxLength={2000}
          placeholder="Ask anything about this business…"
          aria-label="Your question"
          disabled={pending}
        />
        <div className="flex items-center justify-between gap-3">
          <p className="font-mono text-[0.625rem] tracking-[0.14em] text-muted-foreground uppercase">
            Enter to send · Shift+Enter for a new line
          </p>
          <Button onClick={() => submit(question)} disabled={pending || !question.trim()}>
            {pending ? <Loader2 className="animate-spin" /> : <Send />}
            Ask
          </Button>
        </div>
      </div>
    </div>
  );
}
