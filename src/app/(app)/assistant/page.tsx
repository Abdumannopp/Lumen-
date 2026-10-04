import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { FolderPlus, Layers, MessageSquare } from "lucide-react";

import { EmptyState } from "@/components/feedback/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { AssistantChat, type ChatMessage } from "@/components/assistant/assistant-chat";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { AssistantAnswer } from "@/lib/assistant/agent";
import { getConversation, listConversations } from "@/lib/assistant/queries";
import { getBusinessContext } from "@/lib/business-profile/queries";
import { countProjects, getActiveProject } from "@/lib/projects/queries";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Assistant",
};

/**
 * LUMEN Assistant.
 *
 * Always scoped to the active project: the thread list, the context the model
 * reads, and every reply belong to one business. Switching projects switches
 * the conversation history with it.
 */
export default async function AssistantPage({
  searchParams,
}: {
  searchParams: Promise<{ c?: string }>;
}) {
  const [project, counts] = await Promise.all([getActiveProject(), countProjects()]);

  if (counts.total === 0) redirect("/onboarding");

  if (!project) {
    return (
      <div className="space-y-8">
        <PageHeader eyebrow="Assistant" title="Assistant" />
        <EmptyState
          icon={<Layers className="size-5" />}
          title="No active project"
          description="The assistant answers about one business at a time. Select or restore a project first."
          action={
            <Button asChild>
              <Link href="/projects">
                <FolderPlus />
                Manage projects
              </Link>
            </Button>
          }
        />
      </div>
    );
  }

  const { c } = await searchParams;
  const [conversations, context] = await Promise.all([
    listConversations(project.id),
    getBusinessContext(project.id),
  ]);

  const conversation = c ? await getConversation(c, project.id) : null;

  const messages: ChatMessage[] = (conversation?.messages ?? []).map((message) => ({
    id: message.id,
    role: message.role,
    content: message.content,
    structured: (message.structured as AssistantAnswer | null) ?? null,
  }));

  const profileComplete = context?.completion.isComplete ?? false;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        eyebrow={project.name}
        title="Assistant"
        description="Ask about this business. Answers use the project profile, and say what they had to assume."
        actions={
          conversation ? (
            <Button asChild variant="outline" size="sm">
              <Link href="/assistant">New conversation</Link>
            </Button>
          ) : (
            !profileComplete && <Badge variant="warning">Profile incomplete</Badge>
          )
        }
      />

      {!profileComplete && (
        <div className="rounded-xl border border-dashed border-border px-4 py-3">
          <p className="text-sm leading-relaxed text-muted-foreground">
            The business profile is not finished, so answers will be thinner and the assistant
            will flag more assumptions.{" "}
            <Link
              href={`/projects/${project.id}/onboarding`}
              className="rounded-md text-[color:var(--gradient-from)] underline-offset-4 hover:underline"
            >
              Complete it
            </Link>
            .
          </p>
        </div>
      )}

      <AssistantChat
        projectId={project.id}
        conversationId={conversation?.id ?? null}
        initialMessages={messages}
      />

      {conversations.length > 0 && (
        <section className="space-y-3 border-t border-border pt-6">
          <h2 className="font-mono text-[0.6875rem] tracking-[0.18em] text-muted-foreground uppercase">
            Recent conversations
          </h2>
          <ul className="space-y-1">
            {conversations.map((entry) => (
              <li key={entry.id}>
                <Link
                  href={`/assistant?c=${entry.id}`}
                  className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-secondary/60 hover:text-foreground"
                >
                  <MessageSquare className="size-3.5 shrink-0" />
                  <span className="truncate">{entry.title}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
