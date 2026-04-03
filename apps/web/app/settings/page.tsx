import { AppShell } from "@/components/app-shell";
import { SettingsStudio } from "@/components/settings-studio";
import { requirePageSession } from "@/lib/auth";
import { getApprovalPoliciesView, getGitHubSettingsView, getModelPoliciesView, getRuntimeInfo, getUsageView, listKnowledgeSourcesView, listTeamSettingsView, listWorkspaceMembersView } from "@/lib/app-service";

export default async function SettingsPage() {
  const [session, runtime] = await Promise.all([requirePageSession(), getRuntimeInfo()]);
  const [settings, policies, teams, members, approvalPolicies, usage, knowledgeSources] = await Promise.all([
    getGitHubSettingsView(session),
    getModelPoliciesView(),
    listTeamSettingsView(session),
    listWorkspaceMembersView(session),
    getApprovalPoliciesView(session),
    getUsageView({ windowDays: 30 }, session),
    listKnowledgeSourcesView(session, session.activeTeamId ?? session.activeTeam?.id ?? null)
  ]);

  return (
    <AppShell session={session} runtime={runtime}>
      <SettingsStudio
        session={session}
        runtime={runtime}
        githubSettings={settings}
        teams={teams}
        policies={approvalPolicies}
        usage={usage}
        members={members}
        modelPolicies={policies}
        knowledgeSources={knowledgeSources}
      />
    </AppShell>
  );
}
