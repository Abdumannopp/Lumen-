import type { Metadata } from "next";

import { PageHeader } from "@/components/layout/page-header";
import { SettingsWorkspace } from "@/components/settings/settings-workspace";
import { getAiStatus, getDataStats, getSettings } from "@/lib/settings/queries";
import { getUsageSummary } from "@/lib/usage/queries";
import { UsagePanel } from "@/components/settings/usage-panel";
import { BillingPanel } from "@/components/settings/billing-panel";
import { getBillingState } from "@/lib/billing/queries";
import { listProjects } from "@/lib/projects/queries";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Settings",
};

/**
 * Local settings.
 *
 * Not scoped to a project — these are properties of the install, so unlike
 * every other page it works with no project selected.
 */
export default async function SettingsPage() {
  const [settings, projects, ai, stats, usage, billing] = await Promise.all([
    getSettings(),
    listProjects({ includeArchived: true }),
    getAiStatus(),
    getDataStats(),
    getUsageSummary(),
    getBillingState(),
  ]);

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <PageHeader
        eyebrow="This install"
        title="Settings"
        description="Your plan, AI usage and configuration, defaults, your data, and backups."
      />

      <SettingsWorkspace
        settings={settings}
        projects={projects.map((project) => ({ id: project.id, name: project.name }))}
        ai={ai}
        stats={stats}
        usagePanel={<UsagePanel usage={usage} />}
        billingPanel={<BillingPanel billing={billing} />}
      />
    </div>
  );
}
