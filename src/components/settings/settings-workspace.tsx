"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  Loader2,
  Plug,
  Upload,
  XCircle,
} from "lucide-react";

import { CURRENCIES } from "@/config/business-profile";
import {
  clearProjectDataAction,
  exportBackupAction,
  inspectBackupAction,
  restoreBackupAction,
  saveSettingsAction,
  testAiConnectionAction,
  type ConnectionTestResult,
} from "@/lib/settings/actions";
import type { BackupSummary } from "@/lib/settings/backup";
import type { SettingsRecord } from "@/lib/settings/queries";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

const TIMEZONES = [
  "UTC",
  "Europe/London",
  "Europe/Berlin",
  "Europe/Warsaw",
  "Europe/Istanbul",
  "Asia/Tashkent",
  "Asia/Dubai",
  "Asia/Karachi",
  "Asia/Kolkata",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Australia/Sydney",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Sao_Paulo",
  "Africa/Lagos",
  "Africa/Johannesburg",
] as const;

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-4">
      <div className="space-y-1">
        <h2 className="font-mono text-[0.6875rem] tracking-[0.18em] text-muted-foreground uppercase">
          {title}
        </h2>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      {children}
    </section>
  );
}

/**
 * Local settings.
 *
 * The AI section reports configuration but never edits it: provider and key live
 * in the environment file, which is what keeps the key off every page and out of
 * every backup. Showing an editable key field here would undo that.
 */
export function SettingsWorkspace({
  settings,
  projects,
  ai,
  stats,
  usagePanel,
  billingPanel,
}: {
  settings: SettingsRecord;
  projects: { id: string; name: string }[];
  ai: {
    provider: string;
    model: string;
    hasApiKey: boolean;
    timeoutMs: number;
    maxAttempts: number;
    isMock: boolean;
  };
  stats: Record<string, number>;
  /**
   * Server-rendered usage figures.
   *
   * Passed as a slot rather than as data because it is read-only and needs no
   * interactivity — rendering it on the server keeps four aggregate queries'
   * worth of shape out of this client bundle.
   */
  usagePanel?: React.ReactNode;
  /** Plan and payment. Its own slot for the same reason as the usage panel. */
  billingPanel?: React.ReactNode;
}) {
  const router = useRouter();
  const [saving, startSaving] = useTransition();
  const [testing, startTesting] = useTransition();
  const [working, startWorking] = useTransition();

  const [draft, setDraft] = useState({
    defaultProjectId: settings.defaultProjectId ?? "",
    currency: settings.currency,
    timezone: settings.timezone,
    locale: settings.locale,
    theme: settings.theme,
  });

  const [savedNote, setSavedNote] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<ConnectionTestResult | null>(null);

  const [backupSummary, setBackupSummary] = useState<BackupSummary | null>(null);
  const [importRaw, setImportRaw] = useState<string | null>(null);
  const [importSummary, setImportSummary] = useState<BackupSummary | null>(null);
  const [importConfirm, setImportConfirm] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [clearProject, setClearProject] = useState("");
  const [clearConfirm, setClearConfirm] = useState("");

  function save() {
    setSavedNote(null);
    startSaving(async () => {
      const result = await saveSettingsAction({
        ...draft,
        theme: draft.theme === "light" ? "light" : "dark",
      });
      if (!result.ok) {
        setError(result.message ?? "Could not save.");
        return;
      }
      setSavedNote("Saved.");
      router.refresh();
    });
  }

  function download() {
    setError(null);
    startWorking(async () => {
      const result = await exportBackupAction();

      if (!result.ok || !result.json) {
        setError(result.message ?? "Could not create the backup.");
        return;
      }

      const blob = new Blob([result.json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = result.filename ?? "lumen-backup.json";
      anchor.click();
      URL.revokeObjectURL(url);

      setBackupSummary(result.summary ?? null);
    });
  }

  async function onFile(file: File) {
    setError(null);
    setImportSummary(null);
    setImportConfirm("");

    const raw = await file.text();
    setImportRaw(raw);

    const result = await inspectBackupAction(raw);

    if (!result.ok) {
      setImportRaw(null);
      setError(result.message ?? "That file could not be read.");
      return;
    }

    setImportSummary(result.summary ?? null);
  }

  function restore() {
    if (!importRaw) return;
    setError(null);

    startWorking(async () => {
      const result = await restoreBackupAction(importRaw, importConfirm);

      if (!result.ok) {
        setError(result.message ?? "The restore failed.");
        return;
      }

      setImportRaw(null);
      setImportSummary(null);
      setImportConfirm("");
      setMessage(`Restored ${result.restored ?? 0} records.`);
      router.refresh();
    });
  }

  function clear() {
    setError(null);
    startWorking(async () => {
      const result = await clearProjectDataAction(clearProject, clearConfirm);

      if (!result.ok) {
        setError(result.message ?? "Nothing was deleted.");
        return;
      }

      setClearProject("");
      setClearConfirm("");
      setMessage("Project data cleared.");
      router.refresh();
    });
  }

  const selectedForClear = projects.find((project) => project.id === clearProject);

  return (
    <div className="space-y-12">
      {(message || error) && (
        <div
          role="alert"
          className={
            error
              ? "flex items-start gap-3 rounded-xl border border-destructive/35 bg-destructive/10 px-4 py-3"
              : "flex items-start gap-3 rounded-xl border border-success/35 bg-success/8 px-4 py-3"
          }
        >
          {error ? (
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
          ) : (
            <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" />
          )}
          <p className="text-sm leading-relaxed text-foreground">{error ?? message}</p>
        </div>
      )}

      <Section title="General" description="Defaults for this install.">
        <Card>
          <CardContent className="space-y-5 p-6">
            <Field name="defaultProjectId" label="Default project" optional>
              <Select
                value={draft.defaultProjectId}
                onChange={(event) => setDraft({ ...draft, defaultProjectId: event.target.value })}
              >
                <option value="">Most recently updated</option>
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </Select>
            </Field>

            <div className="grid gap-5 sm:grid-cols-2">
              <Field name="currency" label="Default currency">
                <Select
                  value={draft.currency}
                  onChange={(event) => setDraft({ ...draft, currency: event.target.value })}
                >
                  {CURRENCIES.map((entry) => (
                    <option key={entry.value} value={entry.value}>
                      {entry.label}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field name="timezone" label="Timezone">
                <Select
                  value={draft.timezone}
                  onChange={(event) => setDraft({ ...draft, timezone: event.target.value })}
                >
                  {TIMEZONES.map((zone) => (
                    <option key={zone} value={zone}>
                      {zone}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>

            <Field
              name="locale"
              label="Language"
              hint="English only for now. Stored so translations can be added without a schema change."
            >
              <Select
                value={draft.locale}
                onChange={(event) => setDraft({ ...draft, locale: event.target.value })}
              >
                <option value="en-US">English (US)</option>
                <option value="en-GB">English (UK)</option>
              </Select>
            </Field>
          </CardContent>
        </Card>
      </Section>

      {billingPanel && (
        <Section
          title="Plan"
          description="What you are on, and what it includes. Payments are handled by Paddle."
        >
          {billingPanel}
        </Section>
      )}

      {usagePanel && (
        <Section
          title="Usage"
          description="What the AI has done this month, and what it cost. Costs are estimates from published rates."
        >
          {usagePanel}
        </Section>
      )}

      <Section title="AI" description="Configured in your environment file, shown here read-only.">
        <Card>
          <CardContent className="space-y-4 p-6">
            <dl className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1">
                <dt className="font-mono text-[0.625rem] tracking-[0.16em] text-muted-foreground uppercase">
                  Provider
                </dt>
                <dd className="flex items-center gap-2 text-sm text-foreground">
                  {ai.provider}
                  {ai.isMock && <Badge variant="warning">Mock</Badge>}
                </dd>
              </div>
              <div className="space-y-1">
                <dt className="font-mono text-[0.625rem] tracking-[0.16em] text-muted-foreground uppercase">
                  Model
                </dt>
                <dd className="text-sm text-foreground">{ai.model}</dd>
              </div>
              <div className="space-y-1">
                <dt className="font-mono text-[0.625rem] tracking-[0.16em] text-muted-foreground uppercase">
                  API key
                </dt>
                <dd className="text-sm">
                  {ai.hasApiKey ? (
                    <Badge variant="success">Present</Badge>
                  ) : (
                    <Badge variant="outline">Not set</Badge>
                  )}
                </dd>
              </div>
              <div className="space-y-1">
                <dt className="font-mono text-[0.625rem] tracking-[0.16em] text-muted-foreground uppercase">
                  Timeout / attempts
                </dt>
                <dd className="text-sm text-foreground">
                  {ai.timeoutMs}ms · {ai.maxAttempts}
                </dd>
              </div>
            </dl>

            {ai.isMock && (
              <p className="rounded-lg border border-dashed border-border px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
                The mock provider returns placeholder text so the whole product works without a key.
                For real analysis, set one of these in your <span className="font-mono">.env</span>{" "}
                file and restart:
                <br />
                <span className="font-mono">AI_PROVIDER=&quot;gemini&quot;</span> +{" "}
                <span className="font-mono">GOOGLE_API_KEY</span> — free, no card, widest daily
                allowance. Note that Google may use free-tier prompts to improve their products.
                <br />
                <span className="font-mono">AI_PROVIDER=&quot;groq&quot;</span> +{" "}
                <span className="font-mono">GROQ_API_KEY</span> — free, no card, much faster,
                smaller daily allowance.
                <br />
                <span className="font-mono">AI_PROVIDER=&quot;openrouter&quot;</span> +{" "}
                <span className="font-mono">OPENROUTER_API_KEY</span> — one key reaches hundreds
                of models; the free default has its own small daily limit, and{" "}
                <span className="font-mono">AI_MODEL</span> switches to any paid one on the same
                key.
                <br />
                <span className="font-mono">AI_PROVIDER=&quot;anthropic&quot;</span> +{" "}
                <span className="font-mono">ANTHROPIC_API_KEY</span> — paid.
              </p>
            )}

            <div className="flex flex-wrap items-center gap-3 border-t border-border pt-4">
              <Button
                variant="outline"
                onClick={() =>
                  startTesting(async () => {
                    setTestResult(null);
                    setTestResult(await testAiConnectionAction());
                  })
                }
                disabled={testing}
              >
                {testing ? <Loader2 className="animate-spin" /> : <Plug />}
                Test connection
              </Button>

              {testResult && (
                <p className="flex items-center gap-2 text-xs text-muted-foreground">
                  {testResult.ok ? (
                    <CheckCircle2 className="size-3.5 text-success" />
                  ) : (
                    <XCircle className="size-3.5 text-destructive" />
                  )}
                  {testResult.message}
                  {testResult.latencyMs !== undefined && ` (${testResult.latencyMs}ms)`}
                </p>
              )}
            </div>

            <p className="text-xs text-muted-foreground">
              Your API key is never displayed, logged, or written to a backup.
            </p>
          </CardContent>
        </Card>
      </Section>

      <Section title="Appearance" description="Dark is the product's default, not a fallback.">
        <Card>
          <CardContent className="space-y-4 p-6">
            <Field name="theme" label="Theme">
              <Select
                value={draft.theme}
                onChange={(event) => setDraft({ ...draft, theme: event.target.value })}
              >
                <option value="dark">Dark (default)</option>
                <option value="light">Light</option>
              </Select>
            </Field>
            <p className="text-xs text-muted-foreground">
              Every colour is a semantic token, so further themes can be added without touching a
              component.
            </p>
          </CardContent>
        </Card>
      </Section>

      <div className="flex items-center gap-3">
        <Button onClick={save} disabled={saving}>
          {saving && <Loader2 className="animate-spin" />}
          Save settings
        </Button>
        {savedNote && <span className="text-xs text-success">{savedNote}</span>}
      </div>

      <Section title="Data" description="What is stored on this machine.">
        <Card>
          <CardContent className="space-y-5 p-6">
            <dl className="grid gap-3 sm:grid-cols-4">
              {Object.entries(stats)
                .filter(([key]) => key !== "total")
                .map(([key, value]) => (
                  <div key={key} className="space-y-0.5">
                    <dt className="font-mono text-[0.625rem] tracking-[0.14em] text-muted-foreground uppercase">
                      {key}
                    </dt>
                    <dd className="font-display text-base font-semibold tabular-nums text-foreground">
                      {value}
                    </dd>
                  </div>
                ))}
            </dl>

            <p className="text-xs leading-relaxed text-muted-foreground">
              All of it lives in a single SQLite file on this computer. Nothing is sent anywhere
              except the prompts you choose to send to your AI provider.
            </p>

            <div className="space-y-3 border-t border-border pt-5">
              <p className="text-sm font-medium text-foreground">Clear one project&rsquo;s data</p>
              <p className="text-xs leading-relaxed text-muted-foreground">
                Deletes the project and everything recorded against it. Export a backup first if
                you might want it back.
              </p>

              <div className="grid gap-3 sm:grid-cols-2">
                <Select
                  value={clearProject}
                  onChange={(event) => {
                    setClearProject(event.target.value);
                    setClearConfirm("");
                  }}
                  aria-label="Project to clear"
                >
                  <option value="">Select a project</option>
                  {projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                    </option>
                  ))}
                </Select>

                {selectedForClear && (
                  <Input
                    value={clearConfirm}
                    onChange={(event) => setClearConfirm(event.target.value)}
                    placeholder={`Type ${selectedForClear.name}`}
                    aria-label="Type the project name to confirm"
                  />
                )}
              </div>

              {selectedForClear && (
                <Button
                  variant="destructive"
                  onClick={clear}
                  disabled={
                    working ||
                    clearConfirm.trim().toLowerCase() !== selectedForClear.name.toLowerCase()
                  }
                >
                  {working && <Loader2 className="animate-spin" />}
                  Delete this project&rsquo;s data
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </Section>

      <Section title="Backup" description="Export everything, or restore from a file.">
        <Card>
          <CardContent className="space-y-6 p-6">
            <div className="space-y-3">
              <Button variant="outline" onClick={download} disabled={working}>
                {working ? <Loader2 className="animate-spin" /> : <Download />}
                Export a backup
              </Button>

              {backupSummary && (
                <p className="text-xs text-muted-foreground">
                  Exported {backupSummary.total} records in format v{backupSummary.version}.
                </p>
              )}

              <p className="text-xs leading-relaxed text-muted-foreground">
                The file contains your project data only. API keys live in your environment file and
                are never included.
              </p>
            </div>

            <div className="space-y-3 border-t border-border pt-5">
              <p className="text-sm font-medium text-foreground">Restore from a backup</p>
              <p className="text-xs leading-relaxed text-warning">
                A restore replaces everything currently in LUMEN. Export a backup of what you have
                now before doing this.
              </p>

              <Input
                type="file"
                accept="application/json,.json"
                aria-label="Backup file"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void onFile(file);
                }}
              />

              {importSummary && (
                <div className="space-y-3 rounded-xl border border-border bg-surface/50 p-4">
                  <p className="text-sm text-foreground">
                    This backup holds {importSummary.total} records, exported{" "}
                    {new Date(importSummary.exportedAt).toLocaleString("en-GB")}.
                  </p>
                  <p className="font-mono text-[0.625rem] tracking-[0.14em] text-muted-foreground uppercase">
                    format v{importSummary.version} · compatible
                  </p>

                  <Input
                    value={importConfirm}
                    onChange={(event) => setImportConfirm(event.target.value)}
                    placeholder="Type REPLACE to confirm"
                    aria-label="Type REPLACE to confirm"
                  />

                  <Button
                    variant="destructive"
                    onClick={restore}
                    disabled={working || importConfirm.trim().toUpperCase() !== "REPLACE"}
                  >
                    {working ? <Loader2 className="animate-spin" /> : <Upload />}
                    Replace everything with this backup
                  </Button>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </Section>
    </div>
  );
}
