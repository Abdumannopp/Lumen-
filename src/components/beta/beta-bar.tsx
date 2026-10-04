"use client";

import { useState, useTransition } from "react";
import { LifeBuoy, Loader2, MessageSquare } from "lucide-react";

import { submitFeedbackAction } from "@/lib/beta/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";

/**
 * The beta marker, and the two ways out of a bad moment.
 *
 * Always visible, on every page, because the two things a beta user needs are
 * the two things products hide: a way to say "this is broken" and a human to
 * write to. Buried behind a menu, neither gets used, and the beta produces
 * silence that reads like satisfaction.
 *
 * The questions are fixed and there are five of them. Free-form feedback is
 * what people send when they are angry; the same five questions asked of every
 * user produce answers that can be compared, which is the entire reason to run
 * a beta with a handful of people rather than a thousand.
 */

const QUESTIONS = [
  {
    name: "onboardingFriction",
    label: "Where did onboarding slow you down?",
    placeholder: "The step you had to think about, or nearly gave up on.",
  },
  {
    name: "mostUseful",
    label: "Which task in the weekly plan was actually worth doing?",
    placeholder: "The one you did, and what happened.",
  },
  {
    name: "leastUseful",
    label: "Which task was wrong, or made no sense?",
    placeholder: "Be blunt. This is the useful half.",
  },
  {
    name: "statusEase",
    label: "Was marking work done or skipped easy?",
    placeholder: "If you did not bother, say that — it is the same answer.",
  },
  {
    name: "overall",
    label: "Did this make marketing easier, or just different?",
    placeholder: "",
  },
] as const;

export function BetaBar({ supportEmail }: { supportEmail: string }) {
  const [open, setOpen] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();

  const submit = () => {
    setError(null);

    start(async () => {
      const result = await submitFeedbackAction(answers);

      if (!result.ok) {
        setError(result.message ?? "That did not send.");
        return;
      }

      setSent(true);
      setAnswers({});
    });
  };

  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <Badge variant="accent">Beta</Badge>

        <button
          type="button"
          onClick={() => {
            setSent(false);
            setOpen(true);
          }}
          className="flex items-center gap-1.5 rounded-md text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <MessageSquare className="size-3.5" />
          Give feedback
        </button>

        <a
          href={`mailto:${supportEmail}`}
          className="flex items-center gap-1.5 rounded-md text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          <LifeBuoy className="size-3.5" />
          Get help
        </a>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{sent ? "Thank you" : "How is it going?"}</DialogTitle>
            <DialogDescription>
              {sent
                ? "This is read, and it changes what gets built next."
                : "Answer whichever of these you have an answer to. Skipping the rest is fine."}
            </DialogDescription>
          </DialogHeader>

          {!sent && (
            <div className="max-h-[55vh] space-y-4 overflow-y-auto pr-1">
              {QUESTIONS.map((question) => (
                <Field key={question.name} name={question.name} label={question.label} optional>
                  <Textarea
                    rows={2}
                    placeholder={question.placeholder}
                    value={answers[question.name] ?? ""}
                    onChange={(event) =>
                      setAnswers((current) => ({ ...current, [question.name]: event.target.value }))
                    }
                  />
                </Field>
              ))}

              {error && (
                <p role="alert" className="text-sm text-destructive">
                  {error}
                </p>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              {sent ? "Close" : "Cancel"}
            </Button>
            {!sent && (
              <Button onClick={submit} disabled={pending}>
                {pending && <Loader2 className="animate-spin" />}
                Send
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
