"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Ban, Copy, Loader2, Undo2, UserPlus, X } from "lucide-react";

import {
  createInviteAction,
  revokeInviteAction,
  setUserDisabledAction,
} from "@/lib/beta/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { formatDayShort } from "@/lib/date";

/**
 * Running the beta.
 *
 * Three jobs: let somebody in, take an invite back, and stop an account.
 *
 * The invite link is shown exactly once, in a box with a copy button, and
 * carries a warning saying so. That is not a UX flourish — the token is a
 * credential and it is never stored, so "show it again" is not a feature that
 * could exist. Saying so where the link appears is what stops someone closing
 * the page and then asking for it.
 */

const INVITE_VARIANT: Record<string, "success" | "warning" | "outline"> = {
  PENDING: "warning",
  ACCEPTED: "success",
  REVOKED: "outline",
};

interface InviteRow {
  id: string;
  email: string;
  status: string;
  expiresAt: Date;
  acceptedAt: Date | null;
  createdAt: Date;
}

interface UserRow {
  id: string;
  email: string;
  disabledAt: Date | null;
  createdAt: Date;
  _count: { memberships: number };
}

export function AdminWorkspace({
  invites,
  users,
  currentUserId,
}: {
  invites: InviteRow[];
  users: UserRow[];
  currentUserId: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const run = (work: () => Promise<{ ok: boolean; message?: string; inviteUrl?: string }>) => {
    setMessage(null);
    setError(null);

    start(async () => {
      const result = await work();

      if (!result.ok) {
        setError(result.message ?? "That did not work.");
        return;
      }

      setMessage(result.message ?? null);
      if (result.inviteUrl) setInviteUrl(result.inviteUrl);
      router.refresh();
    });
  };

  return (
    <div className="space-y-8">
      <section className="space-y-4">
        <div className="space-y-1">
          <h2 className="font-mono text-[0.6875rem] tracking-[0.18em] text-muted-foreground uppercase">
            Invite
          </h2>
          <p className="text-sm text-muted-foreground">
            One address per invite, good for fourteen days, usable once.
          </p>
        </div>

        <Card>
          <CardContent className="space-y-4 p-6">
            <div className="flex flex-wrap items-end gap-3">
              <Field name="inviteEmail" label="Email" className="min-w-56 flex-1">
                <Input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="them@theircompany.com"
                />
              </Field>
              <Button
                disabled={pending || !email.trim()}
                onClick={() => {
                  const target = email.trim();
                  setInviteUrl(null);
                  setCopied(false);
                  run(async () => {
                    const result = await createInviteAction(target);
                    if (result.ok) setEmail("");
                    return result;
                  });
                }}
              >
                {pending ? <Loader2 className="animate-spin" /> : <UserPlus />}
                Create invite
              </Button>
            </div>

            {inviteUrl && (
              <div className="space-y-2 rounded-xl border border-warning/35 bg-warning/10 p-4">
                <p className="flex items-start gap-2 text-sm text-warning">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                  Copy this now. It is not stored, so it cannot be shown again — issue a new
                  invite if it is lost.
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <code className="min-w-0 flex-1 overflow-x-auto rounded-lg bg-background/60 px-3 py-2 font-mono text-xs">
                    {inviteUrl}
                  </code>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      navigator.clipboard?.writeText(inviteUrl).then(
                        () => setCopied(true),
                        () => setCopied(false),
                      );
                    }}
                  >
                    <Copy />
                    {copied ? "Copied" : "Copy"}
                  </Button>
                </div>
              </div>
            )}

            {message && !inviteUrl && <p className="text-sm text-success">{message}</p>}
            {error && (
              <p role="alert" className="flex items-start gap-2 text-sm text-destructive">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                {error}
              </p>
            )}
          </CardContent>
        </Card>
      </section>

      <section className="space-y-4">
        <h2 className="font-mono text-[0.6875rem] tracking-[0.18em] text-muted-foreground uppercase">
          Invites
        </h2>

        <Card>
          <CardContent className="p-0">
            {invites.length === 0 ? (
              <p className="p-6 text-sm text-muted-foreground">No invites yet.</p>
            ) : (
              <ul className="divide-y divide-border">
                {invites.map((invite) => (
                  <li
                    key={invite.id}
                    className="flex flex-wrap items-center justify-between gap-3 px-5 py-3"
                  >
                    <div className="min-w-0 space-y-0.5">
                      <p className="truncate text-sm">{invite.email}</p>
                      <p className="text-xs text-muted-foreground">
                        {invite.acceptedAt
                          ? `Accepted ${formatDayShort(invite.acceptedAt)}`
                          : `Expires ${formatDayShort(invite.expiresAt)}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={INVITE_VARIANT[invite.status] ?? "outline"}>
                        {invite.status}
                      </Badge>
                      {invite.status === "PENDING" && (
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={pending}
                          onClick={() => run(() => revokeInviteAction(invite.id))}
                        >
                          <X />
                          Revoke
                        </Button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </section>

      <section className="space-y-4">
        <div className="space-y-1">
          <h2 className="font-mono text-[0.6875rem] tracking-[0.18em] text-muted-foreground uppercase">
            Accounts
          </h2>
          <p className="text-sm text-muted-foreground">
            Disabling stops access on the next page load. Nothing is deleted.
          </p>
        </div>

        <Card>
          <CardContent className="p-0">
            <ul className="divide-y divide-border">
              {users.map((user) => (
                <li
                  key={user.id}
                  className="flex flex-wrap items-center justify-between gap-3 px-5 py-3"
                >
                  <div className="min-w-0 space-y-0.5">
                    <p className="truncate text-sm">{user.email}</p>
                    <p className="text-xs text-muted-foreground">
                      Joined {formatDayShort(user.createdAt)} ·{" "}
                      {user._count.memberships === 1
                        ? "1 workspace"
                        : `${user._count.memberships} workspaces`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {user.disabledAt && <Badge variant="danger">Disabled</Badge>}
                    {user.id !== currentUserId && (
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={pending}
                        onClick={() =>
                          run(() => setUserDisabledAction(user.id, !user.disabledAt))
                        }
                      >
                        {user.disabledAt ? <Undo2 /> : <Ban />}
                        {user.disabledAt ? "Re-enable" : "Disable"}
                      </Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
