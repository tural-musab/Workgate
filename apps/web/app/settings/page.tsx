import { AppShell } from "@/components/app-shell";
import { GitHubSettingsForm } from "@/components/github-settings-form";
import { requirePageSession } from "@/lib/auth";
import { getApprovalPoliciesView, getGitHubSettingsView, getModelPoliciesView, getRuntimeInfo, getUsageView, listTeamsView, listWorkspaceMembersView } from "@/lib/app-service";
import { getMessages, getRoleLabel } from "@/lib/i18n";
import { getServerLocale } from "@/lib/i18n-server";

export default async function SettingsPage() {
  const [session, runtime, locale] = await Promise.all([requirePageSession(), getRuntimeInfo(), getServerLocale()]);
  const [settings, policies, teams, members, approvalPolicies, usage] = await Promise.all([
    getGitHubSettingsView(session),
    getModelPoliciesView(),
    listTeamsView(session),
    listWorkspaceMembersView(session),
    getApprovalPoliciesView(session),
    getUsageView({ windowDays: 30 }, session)
  ]);
  const messages = getMessages(locale);

  return (
    <AppShell session={session} runtime={runtime}>
      <div className="space-y-8">
        <header className="space-y-3">
          <div className="text-[0.72rem] uppercase tracking-[0.22em] text-cyan-200/70">{messages.settingsPage.eyebrow}</div>
          <h1 className="text-4xl font-semibold tracking-[-0.05em] text-white">{messages.settingsPage.title}</h1>
          <p className="max-w-3xl text-sm leading-7 text-slate-300">{messages.settingsPage.description}</p>
        </header>

        <div className="operator-grid">
          <div className="space-y-6">
            <GitHubSettingsForm initial={settings} activeTeamId={session.activeTeamId ?? session.activeTeam?.id ?? null} />
            <section className="rounded-[2rem] border border-white/10 bg-white/[0.04] px-6 py-6">
              <div className="space-y-1">
                <div className="text-[0.72rem] uppercase tracking-[0.2em] text-cyan-200/70">Teams</div>
                <h2 className="text-2xl font-semibold tracking-[-0.04em] text-white">Workspace teams</h2>
              </div>
              <div className="mt-5 space-y-3">
                {teams.map((team) => (
                  <div key={team.id} className="rounded-[1.5rem] border border-white/10 px-4 py-4">
                    <div className="text-sm font-medium text-white">{team.name}</div>
                    <div className="mt-1 text-xs uppercase tracking-[0.14em] text-slate-500">{team.slug}</div>
                    {team.description ? <p className="mt-2 text-sm text-slate-400">{team.description}</p> : null}
                  </div>
                ))}
              </div>
            </section>
          </div>

          <div className="space-y-6">
            <section className="rounded-[2rem] border border-white/10 bg-white/[0.04] px-6 py-6">
              <div className="space-y-1">
                <div className="text-[0.72rem] uppercase tracking-[0.2em] text-cyan-200/70">{messages.settingsPage.runtimeEyebrow}</div>
                <h2 className="text-2xl font-semibold tracking-[-0.04em] text-white">{messages.settingsPage.runtimeTitle}</h2>
              </div>
              <div className="mt-5 space-y-3 text-sm leading-6 text-slate-300">
                <p>{messages.settingsPage.storageMode}: {runtime.storageMode}</p>
                <p>{messages.settingsPage.queueMode}: {runtime.queueMode}</p>
                <p>{messages.settingsPage.suggestedBranch}: {runtime.suggestedBranch}</p>
              </div>
            </section>

            <section className="rounded-[2rem] border border-white/10 bg-white/[0.04] px-6 py-6">
              <div className="space-y-1">
                <div className="text-[0.72rem] uppercase tracking-[0.2em] text-cyan-200/70">{messages.settingsPage.modelPolicyEyebrow}</div>
                <h2 className="text-2xl font-semibold tracking-[-0.04em] text-white">{messages.settingsPage.modelPolicyTitle}</h2>
              </div>
              <div className="mt-5 space-y-3">
                {policies.map((policy) => (
                  <div key={policy.role} className="rounded-[1.5rem] border border-white/10 px-4 py-4">
                    <div className="text-sm font-medium text-white">{getRoleLabel(policy.role, messages)}</div>
                    <div className="mt-2 text-sm text-slate-400">
                      {policy.provider} / {policy.model}
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-[2rem] border border-white/10 bg-white/[0.04] px-6 py-6">
              <div className="space-y-1">
                <div className="text-[0.72rem] uppercase tracking-[0.2em] text-cyan-200/70">Approval policies</div>
                <h2 className="text-2xl font-semibold tracking-[-0.04em] text-white">Workspace defaults</h2>
              </div>
              <div className="mt-5 space-y-3">
                {approvalPolicies.map((policy) => (
                  <div key={`${policy.scopeType}-${policy.teamId ?? "workspace"}-${policy.workflowTemplate}`} className="rounded-[1.5rem] border border-white/10 px-4 py-4">
                    <div className="text-sm font-medium text-white">{policy.workflowTemplate}</div>
                    <div className="mt-2 text-sm text-slate-400">
                      {policy.scopeType} · min approvals: {policy.minApprovals}
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-[2rem] border border-white/10 bg-white/[0.04] px-6 py-6">
              <div className="space-y-1">
                <div className="text-[0.72rem] uppercase tracking-[0.2em] text-cyan-200/70">Usage</div>
                <h2 className="text-2xl font-semibold tracking-[-0.04em] text-white">Last 30 days</h2>
              </div>
              <div className="mt-5 space-y-3 text-sm text-slate-300">
                <p>Total runs: {usage.totalRuns}</p>
                <p>Total input tokens: {usage.totalInputTokens}</p>
                <p>Total output tokens: {usage.totalOutputTokens}</p>
                <p>Total cost: ${usage.totalCostUsd.toFixed(4)}</p>
              </div>
            </section>

            <section className="rounded-[2rem] border border-white/10 bg-white/[0.04] px-6 py-6">
              <div className="space-y-1">
                <div className="text-[0.72rem] uppercase tracking-[0.2em] text-cyan-200/70">Members</div>
                <h2 className="text-2xl font-semibold tracking-[-0.04em] text-white">Workspace access</h2>
              </div>
              <div className="mt-5 space-y-3">
                {members.map((member) => (
                  <div key={member.id} className="rounded-[1.5rem] border border-white/10 px-4 py-4">
                    <div className="text-sm font-medium text-white">{member.displayName ?? member.email}</div>
                    <div className="mt-2 text-sm text-slate-400">
                      {member.workspaceRole ?? "member"} · {member.teamMemberships.map((membership) => `${membership.teamName} (${membership.teamRole})`).join(", ")}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
