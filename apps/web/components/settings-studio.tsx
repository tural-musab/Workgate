"use client";

import { useEffect, useMemo, useState } from "react";
import { BarChart3, CheckCheck, FolderGit2, LibraryBig, Mail, ShieldCheck, Users2 } from "lucide-react";
import { useRouter } from "next/navigation";

import { activeWorkflowTemplates, teamRoles, workflowTemplates, type ApprovalPolicy, type GitHubAppSettingsView, type KnowledgeSource, type ModelPolicy, type ModelProvider, type Session, type TeamRole, type UsageSummary, type WorkflowTemplateId } from "@workgate/shared";

import { resolveApiMessage } from "@/lib/i18n";

import { useLocale } from "./locale-provider";

type TeamSettingsView = {
  id: string;
  workspaceId: string;
  name: string;
  slug: string;
  description: string | null;
  createdAt: string;
  allowedWorkflows: WorkflowTemplateId[];
};

type SettingsStudioProps = {
  session: Session;
  runtime: { storageMode: string; queueMode: string; suggestedBranch: string };
  githubSettings: GitHubAppSettingsView;
  teams: TeamSettingsView[];
  policies: ApprovalPolicy[];
  usage: UsageSummary;
  members: Array<{
    id: string;
    email: string;
    displayName: string | null;
    workspaceRole: string | null;
    teamMemberships: Array<{ teamId: string; teamName: string; teamRole: TeamRole }>;
  }>;
  modelPolicies: ModelPolicy[];
  knowledgeSources: KnowledgeSource[];
};

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}

function formatCost(value: number) {
  return `$${value.toFixed(4)}`;
}

function workflowLabel(workflow: WorkflowTemplateId, locale: "en" | "tr") {
  const labels: Record<WorkflowTemplateId, { en: string; tr: string }> = {
    software_delivery: { en: "Software Delivery", tr: "Yazılım Teslimi" },
    rfp_response: { en: "RFP Response", tr: "RFP Yanıtı" },
    social_media_ops: { en: "Social Media Ops", tr: "Sosyal Medya Operasyonları" },
    security_questionnaire: { en: "Security Questionnaire", tr: "Güvenlik Soru Formu" }
  };
  return labels[workflow][locale];
}

function teamRoleLabel(role: TeamRole, locale: "en" | "tr") {
  const labels: Record<TeamRole, { en: string; tr: string }> = {
    team_operator: { en: "Operator", tr: "Operatör" },
    team_reviewer: { en: "Reviewer", tr: "Onaylayıcı" },
    team_viewer: { en: "Viewer", tr: "İzleyici" }
  };
  return labels[role][locale];
}

function SectionCard({
  eyebrow,
  title,
  description,
  children,
  accent = "cyan"
}: {
  eyebrow: string;
  title: string;
  description?: string;
  children: React.ReactNode;
  accent?: "cyan" | "emerald" | "amber";
}) {
  const accentMap = {
    cyan: "text-cyan-200/80",
    emerald: "text-emerald-200/80",
    amber: "text-amber-200/80"
  };

  return (
    <section className="relative overflow-hidden rounded-[2rem] bg-[#131c2c] px-6 py-6 shadow-[0_30px_80px_rgba(0,0,0,0.22)] ring-1 ring-white/6">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(68,211,255,0.12),_transparent_32%)]" />
      <div className="relative">
        <div className={`text-[0.7rem] uppercase tracking-[0.24em] ${accentMap[accent]}`}>{eyebrow}</div>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-[1.85rem] font-semibold tracking-[-0.045em] text-white">{title}</h2>
            {description ? <p className="mt-2 max-w-3xl text-sm leading-7 text-slate-300">{description}</p> : null}
          </div>
        </div>
        <div className="mt-6">{children}</div>
      </div>
    </section>
  );
}

export function SettingsStudio({
  session,
  runtime,
  githubSettings,
  teams,
  policies,
  usage,
  members,
  modelPolicies,
  knowledgeSources
}: SettingsStudioProps) {
  const router = useRouter();
  const { messages, locale } = useLocale();
  const [githubMessage, setGitHubMessage] = useState<string | null>(null);
  const [githubError, setGitHubError] = useState<string | null>(null);
  const [teamMessage, setTeamMessage] = useState<string | null>(null);
  const [teamError, setTeamError] = useState<string | null>(null);
  const [policyMessage, setPolicyMessage] = useState<string | null>(null);
  const [policyError, setPolicyError] = useState<string | null>(null);
  const [knowledgeMessage, setKnowledgeMessage] = useState<string | null>(null);
  const [knowledgeError, setKnowledgeError] = useState<string | null>(null);
  const [isSavingGitHub, setIsSavingGitHub] = useState(false);
  const [isCreatingTeam, setIsCreatingTeam] = useState(false);
  const [savingAccessTeamId, setSavingAccessTeamId] = useState<string | null>(null);
  const [isSavingPolicy, setIsSavingPolicy] = useState(false);
  const [isSavingKnowledge, setIsSavingKnowledge] = useState(false);
  const [usageLoading, setUsageLoading] = useState(false);
  const [usageError, setUsageError] = useState<string | null>(null);
  const [usageData, setUsageData] = useState(usage);
  const activeTeamId = session.activeTeamId ?? session.activeTeam?.id ?? teams[0]?.id ?? null;
  const activeTeam = useMemo(() => teams.find((team) => team.id === activeTeamId) ?? null, [teams, activeTeamId]);

  const copy =
    locale === "tr"
      ? {
          headerEyebrow: "Control studio",
          headerTitle: "GitHub erişimi, takım sınırları ve onay politikaları tek konsolda",
          headerDescription:
            "Stitch tasarımındaki daha net bilgi hiyerarşisini bu ekrana taşıdım: entegrasyon kurulumu, takım erişimi, onay kuralları ve kullanım verileri artık aynı kontrol akışında.",
          statusGithub: "GitHub App",
          statusTeams: "Takımlar",
          statusPolicies: "Politikalar",
          statusUsage: "30 günlük maliyet",
          onboardingEyebrow: "GitHub onboarding",
          onboardingTitle: "Software Delivery Team için kurulum akışı",
          onboardingDescription:
            "Bu akış takım bazlıdır. Aktif takım için GitHub App kimliği, installation erişimi ve repo allowlist burada birlikte yönetilir.",
          activeTeam: "Aktif takım",
          onboardingStepsTitle: "Kurulum adımları",
          onboardingSteps: [
            "GitHub App oluştur ve gerekli repository izinlerini ver.",
            "App’i ilgili repo veya org üstüne kur.",
            "App ID, Installation ID ve private key değerlerini buraya gir.",
            "Sadece bu takımın kullanabileceği repo allowlist’ini kaydet."
          ],
          connected: "Bağlı",
          incomplete: "Eksik",
          appId: "App ID",
          installationId: "Installation ID",
          appSlug: "App slug",
          privateKey: "Private key PEM",
          allowlist: "Repo allowlist",
          allowlistHint: "Her satıra bir repo yaz. Örnek: owner/repo",
          encrypted: "Private key şifrelenerek saklanır.",
          saveGitHub: "GitHub App kaydet",
          saving: "Kaydediliyor...",
          teamEyebrow: "Team studio",
          teamTitle: "Takımlar ve workflow erişimi",
          teamDescription:
            "Her takımın kullanabildiği workflow’ları görünür kıl. Bu yüzey artık sadece liste değil; onboarding sonrası gerçek erişim matrisi burada yönetiliyor.",
          createTeam: "Takım oluştur",
          teamName: "Takım adı",
          teamSlug: "Takım slug",
          teamDescriptionField: "Açıklama",
          workflowAccess: "Workflow erişimi",
          saveAccess: "Erişimi kaydet",
          policyEyebrow: "Policy console",
          policyTitle: "Onay kurallarını ürün seviyesinde yönet",
          policyDescription:
            "Workspace default ve team override aynı yüzeyde düzenlenebilir. External write için ikinci onay gereksinimi burada net bir policy haline geldi.",
          workspaceDefault: "Workspace default",
          teamOverride: "Team override",
          scope: "Kapsam",
          targetTeam: "Hedef takım",
          targetWorkflow: "Workflow",
          minApprovals: "Minimum onay",
          approverRoles: "Onaylayıcı roller",
          rejectNote: "Reject notu zorunlu",
          secondApproval: "External write için ikinci onay zorunlu",
          savePolicy: "Politikayı kaydet",
          loadIntoEditor: "Düzenleyiciye yükle",
          usageEyebrow: "Usage analytics",
          usageTitle: "Takım ve model tüketimi",
          usageDescription: "Filtreleri değiştirip takım, workflow ve model bazında token ve maliyet yoğunluğunu incele.",
          lastDays: "Son dönem",
          allTeams: "Tüm takımlar",
          allWorkflows: "Tüm workflow’lar",
          allProviders: "Tüm sağlayıcılar",
          allModels: "Tüm modeller",
          byProvider: "Sağlayıcı / model dağılımı",
          byTeam: "Takım dağılımı",
          knowledgeEyebrow: "Knowledge packs",
          knowledgeTitle: "RFP bilgi paketleri",
          knowledgeDescription: "Aktif takım için reusable knowledge pack kaydet. RFP workflow’u bunları referans olarak kullanabilir.",
          packName: "Paket adı",
          packType: "Format",
          packContent: "İçerik",
          savePack: "Pack kaydet",
          membersEyebrow: "Workspace access",
          membersTitle: "Kim hangi takımı görebiliyor",
          membersDescription: "RBAC tablosunun ilk görünümü. Her üyenin workspace rolü ve takım bazlı üyeliği burada okunabilir.",
          noMembers: "Henüz üye eklenmedi.",
          noKnowledge: "Aktif takım için knowledge pack yok.",
          saved: "Kaydedildi.",
          loadingUsage: "Kullanım verisi güncelleniyor..."
        }
      : {
          headerEyebrow: "Control studio",
          headerTitle: "GitHub onboarding, team boundaries, and approval policy in one operator surface",
          headerDescription:
            "This carries the clearer hierarchy from the stitch direction into the live product: integration setup, team access, approval rules, and usage analytics now sit inside one control flow.",
          statusGithub: "GitHub App",
          statusTeams: "Teams",
          statusPolicies: "Policies",
          statusUsage: "30d cost",
          onboardingEyebrow: "GitHub onboarding",
          onboardingTitle: "Setup flow for Software Delivery Team",
          onboardingDescription:
            "This flow is team-scoped. The active team's GitHub App identity, installation access, and repository allowlist are managed together here.",
          activeTeam: "Active team",
          onboardingStepsTitle: "Setup steps",
          onboardingSteps: [
            "Create a GitHub App with repository permissions for Workgate-managed branches and pull requests.",
            "Install the app on the target repository or organization.",
            "Paste the App ID, Installation ID, and private key into this panel.",
            "Save the repository allowlist that this team is allowed to touch."
          ],
          connected: "Connected",
          incomplete: "Incomplete",
          appId: "App ID",
          installationId: "Installation ID",
          appSlug: "App slug",
          privateKey: "Private key PEM",
          allowlist: "Repository allowlist",
          allowlistHint: "One repository per line. Example: owner/repo",
          encrypted: "Private keys are stored encrypted at rest.",
          saveGitHub: "Save GitHub App",
          saving: "Saving...",
          teamEyebrow: "Team studio",
          teamTitle: "Teams and workflow access",
          teamDescription:
            "Make each team's workflow surface explicit. This is no longer just a list; after onboarding, this becomes the live access matrix.",
          createTeam: "Create team",
          teamName: "Team name",
          teamSlug: "Team slug",
          teamDescriptionField: "Description",
          workflowAccess: "Workflow access",
          saveAccess: "Save access",
          policyEyebrow: "Policy console",
          policyTitle: "Manage approval rules as product policy",
          policyDescription:
            "Workspace defaults and team overrides now live in one editable surface. Second approval for external writes is enforced as an explicit policy.",
          workspaceDefault: "Workspace default",
          teamOverride: "Team override",
          scope: "Scope",
          targetTeam: "Target team",
          targetWorkflow: "Workflow",
          minApprovals: "Minimum approvals",
          approverRoles: "Approver roles",
          rejectNote: "Require reject note",
          secondApproval: "Require second approval for external write",
          savePolicy: "Save policy",
          loadIntoEditor: "Load into editor",
          usageEyebrow: "Usage analytics",
          usageTitle: "Model and team consumption",
          usageDescription: "Switch filters to inspect token and cost concentration by team, workflow, and model.",
          lastDays: "Window",
          allTeams: "All teams",
          allWorkflows: "All workflows",
          allProviders: "All providers",
          allModels: "All models",
          byProvider: "Provider / model breakdown",
          byTeam: "Team breakdown",
          knowledgeEyebrow: "Knowledge packs",
          knowledgeTitle: "RFP knowledge packs",
          knowledgeDescription: "Save reusable knowledge packs for the active team. The RFP workflow can reference them directly.",
          packName: "Pack name",
          packType: "Format",
          packContent: "Content",
          savePack: "Save pack",
          membersEyebrow: "Workspace access",
          membersTitle: "Who can see which team",
          membersDescription: "The first RBAC visibility layer. Read each member's workspace role and team memberships here.",
          noMembers: "No members yet.",
          noKnowledge: "No knowledge packs for the active team yet.",
          saved: "Saved.",
          loadingUsage: "Refreshing usage analytics..."
        };

  const workflowOptions = workflowTemplates.map((workflow) => ({
    id: workflow,
    label: workflowLabel(workflow, locale)
  }));

  const [githubDraft, setGitHubDraft] = useState({
    appId: githubSettings.appId ?? "",
    installationId: githubSettings.installationId ?? "",
    appSlug: githubSettings.appSlug ?? "",
    privateKeyPem: "",
    allowedRepos: githubSettings.allowedRepos.map((repo) => `${repo.owner}/${repo.repo}`).join("\n")
  });

  const [teamDraft, setTeamDraft] = useState<{
    name: string;
    slug: string;
    description: string;
    allowedWorkflows: WorkflowTemplateId[];
  }>({
    name: "",
    slug: "",
    description: "",
    allowedWorkflows: [...activeWorkflowTemplates] as WorkflowTemplateId[]
  });
  const [slugTouched, setSlugTouched] = useState(false);
  const [workflowDrafts, setWorkflowDrafts] = useState<Record<string, WorkflowTemplateId[]>>(
    Object.fromEntries(teams.map((team) => [team.id, team.allowedWorkflows]))
  );

  const defaultPolicy = policies.find((policy) => policy.scopeType === "workspace_default" && policy.workflowTemplate === "software_delivery") ?? policies[0];
  const [policyDraft, setPolicyDraft] = useState({
    scopeType: defaultPolicy?.scopeType ?? "workspace_default",
    teamId: defaultPolicy?.teamId ?? null,
    workflowTemplate: defaultPolicy?.workflowTemplate ?? "software_delivery",
    minApprovals: defaultPolicy?.minApprovals ?? 1,
    approverRoles: defaultPolicy?.approverRoles ?? ["team_reviewer"],
    requireRejectNote: defaultPolicy?.requireRejectNote ?? true,
    requireSecondApprovalForExternalWrite: defaultPolicy?.requireSecondApprovalForExternalWrite ?? false
  });

  const [knowledgeDraft, setKnowledgeDraft] = useState({
    name: "",
    sourceType: "markdown" as "markdown" | "text" | "json",
    description: "",
    content: ""
  });

  const [usageFilters, setUsageFilters] = useState<UsageSummary["filters"]>({
    teamId: usage.filters.teamId,
    workflowTemplate: usage.filters.workflowTemplate,
    provider: usage.filters.provider,
    model: usage.filters.model,
    windowDays: usage.filters.windowDays
  });

  useEffect(() => {
    setWorkflowDrafts(Object.fromEntries(teams.map((team) => [team.id, team.allowedWorkflows])));
  }, [teams]);

  useEffect(() => {
    const params = new URLSearchParams();
    if (usageFilters.teamId) params.set("teamId", usageFilters.teamId);
    if (usageFilters.workflowTemplate) params.set("workflowTemplate", usageFilters.workflowTemplate);
    if (usageFilters.provider) params.set("provider", usageFilters.provider);
    if (usageFilters.model) params.set("model", usageFilters.model);
    params.set("windowDays", String(usageFilters.windowDays));

    let cancelled = false;
    setUsageLoading(true);
    setUsageError(null);
    fetch(`/api/usage?${params.toString()}`)
      .then(async (response) => {
        if (!response.ok) {
          const body = (await response.json().catch(() => null)) as { error?: string } | null;
          throw new Error(body?.error ?? "Unable to load usage analytics.");
        }
        return response.json();
      })
      .then((nextUsage) => {
        if (!cancelled) {
          setUsageData(nextUsage as UsageSummary);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setUsageError(error instanceof Error ? error.message : "Unable to load usage analytics.");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setUsageLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [usageFilters.teamId, usageFilters.workflowTemplate, usageFilters.provider, usageFilters.model, usageFilters.windowDays]);

  const activeKnowledgeSources = useMemo(
    () => knowledgeSources.filter((source) => source.teamId === activeTeamId),
    [knowledgeSources, activeTeamId]
  );

  const providerOptions = useMemo(
    () =>
      [...new Set(usageData.byProvider.map((entry) => entry.provider).filter((value): value is NonNullable<typeof value> => Boolean(value)))],
    [usageData.byProvider]
  );

  const modelOptions = useMemo(
    () => [...new Set(usageData.byProvider.map((entry) => entry.model).filter((value): value is string => Boolean(value)))],
    [usageData.byProvider]
  );

  async function handleGitHubSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setGitHubError(null);
    setGitHubMessage(null);
    setIsSavingGitHub(true);

    try {
      const response = await fetch("/api/settings/github-app", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          appId: githubDraft.appId,
          installationId: githubDraft.installationId,
          appSlug: githubDraft.appSlug || undefined,
          privateKeyPem: githubDraft.privateKeyPem,
          teamId: activeTeamId,
          allowedRepos: githubDraft.allowedRepos
            .split("\n")
            .map((item) => item.trim())
            .filter(Boolean)
        })
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(resolveApiMessage(body?.error, messages, "unableToSaveGitHubSettings"));
      }

      setGitHubMessage(copy.saved);
      setGitHubDraft((current) => ({ ...current, privateKeyPem: "" }));
      router.refresh();
    } catch (error) {
      setGitHubError(error instanceof Error ? error.message : messages.apiMessages.unableToSaveGitHubSettings);
    } finally {
      setIsSavingGitHub(false);
    }
  }

  async function handleCreateTeam(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setTeamError(null);
    setTeamMessage(null);
    setIsCreatingTeam(true);

    try {
      const response = await fetch("/api/teams", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: teamDraft.name,
          slug: teamDraft.slug,
          description: teamDraft.description || null,
          allowedWorkflows: teamDraft.allowedWorkflows
        })
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? "Unable to save team.");
      }

      setTeamMessage(copy.saved);
          setTeamDraft({
            name: "",
            slug: "",
            description: "",
            allowedWorkflows: [...activeWorkflowTemplates] as WorkflowTemplateId[]
          });
      setSlugTouched(false);
      router.refresh();
    } catch (error) {
      setTeamError(error instanceof Error ? error.message : "Unable to save team.");
    } finally {
      setIsCreatingTeam(false);
    }
  }

  async function handleSaveAccess(teamId: string) {
    setTeamError(null);
    setTeamMessage(null);
    setSavingAccessTeamId(teamId);

    try {
      const response = await fetch("/api/teams", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          teamId,
          allowedWorkflows: workflowDrafts[teamId] ?? []
        })
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? "Unable to update team workflow access.");
      }

      setTeamMessage(copy.saved);
      router.refresh();
    } catch (error) {
      setTeamError(error instanceof Error ? error.message : "Unable to update team workflow access.");
    } finally {
      setSavingAccessTeamId(null);
    }
  }

  async function handleSavePolicy(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPolicyError(null);
    setPolicyMessage(null);
    setIsSavingPolicy(true);

    try {
      const response = await fetch("/api/settings/policies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...policyDraft,
          teamId: policyDraft.scopeType === "team_override" ? policyDraft.teamId : null
        })
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? "Unable to save approval policy.");
      }

      setPolicyMessage(copy.saved);
      router.refresh();
    } catch (error) {
      setPolicyError(error instanceof Error ? error.message : "Unable to save approval policy.");
    } finally {
      setIsSavingPolicy(false);
    }
  }

  async function handleSaveKnowledge(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!activeTeamId) return;
    setKnowledgeError(null);
    setKnowledgeMessage(null);
    setIsSavingKnowledge(true);

    try {
      const response = await fetch("/api/knowledge-sources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          teamId: activeTeamId,
          name: knowledgeDraft.name,
          sourceType: knowledgeDraft.sourceType,
          description: knowledgeDraft.description || null,
          content: knowledgeDraft.content
        })
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? "Unable to save knowledge source.");
      }

      setKnowledgeMessage(copy.saved);
      setKnowledgeDraft({
        name: "",
        sourceType: "markdown",
        description: "",
        content: ""
      });
      router.refresh();
    } catch (error) {
      setKnowledgeError(error instanceof Error ? error.message : "Unable to save knowledge source.");
    } finally {
      setIsSavingKnowledge(false);
    }
  }

  function loadPolicy(policy: ApprovalPolicy) {
    setPolicyDraft({
      scopeType: policy.scopeType,
      teamId: policy.teamId,
      workflowTemplate: policy.workflowTemplate,
      minApprovals: policy.minApprovals,
      approverRoles: [...policy.approverRoles],
      requireRejectNote: policy.requireRejectNote,
      requireSecondApprovalForExternalWrite: policy.requireSecondApprovalForExternalWrite
    });
  }

  const policyCounts = {
    workspaceDefaults: policies.filter((policy) => policy.scopeType === "workspace_default").length,
    teamOverrides: policies.filter((policy) => policy.scopeType === "team_override").length
  };

  const connectorHealthy = githubSettings.hasApp && githubSettings.allowedRepos.length > 0;

  return (
    <div className="space-y-8">
      <header className="space-y-4">
        <div className="text-[0.72rem] uppercase tracking-[0.24em] text-cyan-200/70">{copy.headerEyebrow}</div>
        <div className="max-w-4xl space-y-3">
          <h1 className="text-4xl font-semibold tracking-[-0.05em] text-white">{copy.headerTitle}</h1>
          <p className="text-sm leading-7 text-slate-300">{copy.headerDescription}</p>
        </div>
      </header>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          {
            label: copy.statusGithub,
            value: connectorHealthy ? copy.connected : copy.incomplete,
            subvalue: connectorHealthy ? `${githubSettings.allowedRepos.length} repos` : messages.common.notConfigured,
            icon: FolderGit2
          },
          {
            label: copy.statusTeams,
            value: String(teams.length),
            subvalue: activeTeam ? `${copy.activeTeam}: ${activeTeam.name}` : messages.common.none,
            icon: Users2
          },
          {
            label: copy.statusPolicies,
            value: String(policies.length),
            subvalue: `${policyCounts.workspaceDefaults}/${policyCounts.teamOverrides}`,
            icon: ShieldCheck
          },
          {
            label: copy.statusUsage,
            value: formatCost(usageData.totalCostUsd),
            subvalue: `${formatNumber(usageData.totalRuns)} runs`,
            icon: BarChart3
          }
        ].map((item) => {
          const Icon = item.icon;
          return (
            <div key={item.label} className="rounded-[1.6rem] bg-[#171f33] px-5 py-5 ring-1 ring-white/6">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-2">
                  <div className="text-[0.68rem] uppercase tracking-[0.2em] text-slate-400">{item.label}</div>
                  <div className="text-3xl font-semibold tracking-[-0.05em] text-white">{item.value}</div>
                  <div className="text-sm text-slate-400">{item.subvalue}</div>
                </div>
                <div className="rounded-2xl bg-cyan-300/10 p-3 text-cyan-200">
                  <Icon className="h-5 w-5" />
                </div>
              </div>
            </div>
          );
        })}
      </section>

      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <SectionCard eyebrow={copy.onboardingEyebrow} title={copy.onboardingTitle} description={copy.onboardingDescription}>
          <div className="grid gap-6 lg:grid-cols-[0.78fr_1.22fr]">
            <div className="space-y-4">
              <div className="rounded-[1.5rem] bg-[#0b1424] px-4 py-4 ring-1 ring-white/6">
                <div className="text-xs uppercase tracking-[0.18em] text-slate-400">{copy.activeTeam}</div>
                <div className="mt-2 text-lg font-semibold text-white">{activeTeam?.name ?? messages.common.none}</div>
                <div className="mt-1 text-sm text-slate-400">{activeTeam?.slug ?? messages.common.notConfigured}</div>
              </div>

              <div className="space-y-3">
                <div className="text-xs uppercase tracking-[0.18em] text-slate-400">{copy.onboardingStepsTitle}</div>
                {copy.onboardingSteps.map((step, index) => {
                  const complete = index === 0 ? githubSettings.hasApp : index === 1 ? githubSettings.hasApp : index === 2 ? githubSettings.hasApp : githubSettings.allowedRepos.length > 0;
                  return (
                    <div key={step} className="flex gap-3 rounded-[1.35rem] bg-[#0f1828] px-4 py-4 ring-1 ring-white/6">
                      <div className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${complete ? "bg-emerald-400/15 text-emerald-300" : "bg-slate-800 text-slate-400"}`}>
                        {complete ? <CheckCheck className="h-4 w-4" /> : <span className="text-xs font-semibold">{index + 1}</span>}
                      </div>
                      <p className="text-sm leading-6 text-slate-300">{step}</p>
                    </div>
                  );
                })}
              </div>
            </div>

            <form onSubmit={handleGitHubSubmit} className="space-y-4 rounded-[1.6rem] bg-[#0d1626] px-5 py-5 ring-1 ring-white/6">
              <div className="grid gap-4 md:grid-cols-2">
                <label className="space-y-2">
                  <span className="text-xs uppercase tracking-[0.18em] text-slate-400">{copy.appId}</span>
                  <input
                    value={githubDraft.appId}
                    onChange={(event) => setGitHubDraft((current) => ({ ...current, appId: event.target.value }))}
                    className="w-full rounded-2xl bg-[#07101d] px-4 py-3 text-sm text-white outline-none ring-1 ring-white/8 transition focus:ring-cyan-300/50"
                    placeholder="123456"
                  />
                </label>
                <label className="space-y-2">
                  <span className="text-xs uppercase tracking-[0.18em] text-slate-400">{copy.installationId}</span>
                  <input
                    value={githubDraft.installationId}
                    onChange={(event) => setGitHubDraft((current) => ({ ...current, installationId: event.target.value }))}
                    className="w-full rounded-2xl bg-[#07101d] px-4 py-3 text-sm text-white outline-none ring-1 ring-white/8 transition focus:ring-cyan-300/50"
                    placeholder="7891011"
                  />
                </label>
              </div>

              <label className="space-y-2">
                <span className="text-xs uppercase tracking-[0.18em] text-slate-400">{copy.appSlug}</span>
                <input
                  value={githubDraft.appSlug}
                  onChange={(event) => setGitHubDraft((current) => ({ ...current, appSlug: event.target.value }))}
                  className="w-full rounded-2xl bg-[#07101d] px-4 py-3 text-sm text-white outline-none ring-1 ring-white/8 transition focus:ring-cyan-300/50"
                  placeholder="workgate-app"
                />
              </label>

              <label className="space-y-2">
                <span className="text-xs uppercase tracking-[0.18em] text-slate-400">{copy.privateKey}</span>
                <textarea
                  value={githubDraft.privateKeyPem}
                  onChange={(event) => setGitHubDraft((current) => ({ ...current, privateKeyPem: event.target.value }))}
                  className="min-h-36 w-full rounded-[1.4rem] bg-[#07101d] px-4 py-3 text-sm leading-6 text-white outline-none ring-1 ring-white/8 transition focus:ring-cyan-300/50"
                  placeholder="-----BEGIN RSA PRIVATE KEY-----"
                />
                <div className="text-xs text-slate-500">
                  {githubSettings.maskedPrivateKey ? `${copy.encrypted} ${githubSettings.maskedPrivateKey}` : copy.encrypted}
                </div>
              </label>

              <label className="space-y-2">
                <span className="text-xs uppercase tracking-[0.18em] text-slate-400">{copy.allowlist}</span>
                <textarea
                  value={githubDraft.allowedRepos}
                  onChange={(event) => setGitHubDraft((current) => ({ ...current, allowedRepos: event.target.value }))}
                  className="min-h-28 w-full rounded-[1.4rem] bg-[#07101d] px-4 py-3 text-sm leading-6 text-white outline-none ring-1 ring-white/8 transition focus:ring-cyan-300/50"
                  placeholder="tural-musab/Workgate"
                />
                <div className="text-xs text-slate-500">{copy.allowlistHint}</div>
              </label>

              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="text-sm">
                  {githubError ? <span className="text-rose-300">{githubError}</span> : githubMessage ? <span className="text-emerald-300">{githubMessage}</span> : <span className="text-slate-400">{copy.encrypted}</span>}
                </div>
                <button
                  disabled={isSavingGitHub}
                  className="rounded-full bg-gradient-to-r from-[#baf4ff] to-[#28d5ff] px-5 py-3 text-sm font-semibold text-slate-950 transition hover:shadow-[0_0_28px_rgba(0,229,255,0.22)] disabled:opacity-60"
                >
                  {isSavingGitHub ? copy.saving : copy.saveGitHub}
                </button>
              </div>
            </form>
          </div>
        </SectionCard>

        <div className="space-y-6">
          <SectionCard eyebrow={messages.settingsPage.runtimeEyebrow} title={messages.settingsPage.runtimeTitle} description={messages.settingsPage.description} accent="emerald">
            <div className="grid gap-3">
              <div className="flex items-center justify-between rounded-[1.2rem] bg-[#0d1626] px-4 py-4 text-sm text-slate-300 ring-1 ring-white/6">
                <span>{messages.settingsPage.storageMode}</span>
                <span className="font-semibold text-white">{runtime.storageMode}</span>
              </div>
              <div className="flex items-center justify-between rounded-[1.2rem] bg-[#0d1626] px-4 py-4 text-sm text-slate-300 ring-1 ring-white/6">
                <span>{messages.settingsPage.queueMode}</span>
                <span className="font-semibold text-white">{runtime.queueMode}</span>
              </div>
              <div className="flex items-center justify-between rounded-[1.2rem] bg-[#0d1626] px-4 py-4 text-sm text-slate-300 ring-1 ring-white/6">
                <span>{messages.settingsPage.suggestedBranch}</span>
                <span className="font-mono text-xs text-cyan-200">{runtime.suggestedBranch}</span>
              </div>
            </div>
          </SectionCard>

          <SectionCard eyebrow={messages.settingsPage.modelPolicyEyebrow} title={messages.settingsPage.modelPolicyTitle} accent="amber">
            <div className="space-y-3">
              {modelPolicies.map((policy) => (
                <div key={policy.role} className="flex items-center justify-between rounded-[1.2rem] bg-[#0d1626] px-4 py-4 ring-1 ring-white/6">
                  <div>
                    <div className="text-sm font-medium text-white">{policy.role}</div>
                    <div className="mt-1 text-xs uppercase tracking-[0.18em] text-slate-500">{policy.provider}</div>
                  </div>
                  <div className="rounded-full bg-white/5 px-3 py-1 text-xs text-slate-300">{policy.model}</div>
                </div>
              ))}
            </div>
          </SectionCard>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <SectionCard eyebrow={copy.teamEyebrow} title={copy.teamTitle} description={copy.teamDescription}>
          <div className="grid gap-6 lg:grid-cols-[0.78fr_1.22fr]">
            <form onSubmit={handleCreateTeam} className="space-y-4 rounded-[1.6rem] bg-[#0d1626] px-5 py-5 ring-1 ring-white/6">
              <div className="text-sm font-semibold text-white">{copy.createTeam}</div>
              <label className="space-y-2">
                <span className="text-xs uppercase tracking-[0.18em] text-slate-400">{copy.teamName}</span>
                <input
                  value={teamDraft.name}
                  onChange={(event) => {
                    const nextName = event.target.value;
                    setTeamDraft((current) => ({
                      ...current,
                      name: nextName,
                      slug: slugTouched ? current.slug : slugify(nextName)
                    }));
                  }}
                  className="w-full rounded-2xl bg-[#07101d] px-4 py-3 text-sm text-white outline-none ring-1 ring-white/8 transition focus:ring-cyan-300/50"
                  placeholder="Revenue Operations"
                />
              </label>
              <label className="space-y-2">
                <span className="text-xs uppercase tracking-[0.18em] text-slate-400">{copy.teamSlug}</span>
                <input
                  value={teamDraft.slug}
                  onChange={(event) => {
                    setSlugTouched(true);
                    setTeamDraft((current) => ({ ...current, slug: slugify(event.target.value) }));
                  }}
                  className="w-full rounded-2xl bg-[#07101d] px-4 py-3 text-sm text-white outline-none ring-1 ring-white/8 transition focus:ring-cyan-300/50"
                  placeholder="revenue-ops"
                />
              </label>
              <label className="space-y-2">
                <span className="text-xs uppercase tracking-[0.18em] text-slate-400">{copy.teamDescriptionField}</span>
                <textarea
                  value={teamDraft.description}
                  onChange={(event) => setTeamDraft((current) => ({ ...current, description: event.target.value }))}
                  className="min-h-24 w-full rounded-[1.4rem] bg-[#07101d] px-4 py-3 text-sm leading-6 text-white outline-none ring-1 ring-white/8 transition focus:ring-cyan-300/50"
                  placeholder="Runs proposal and delivery workflows for client-facing work."
                />
              </label>
              <div className="space-y-3">
                <div className="text-xs uppercase tracking-[0.18em] text-slate-400">{copy.workflowAccess}</div>
                <div className="grid gap-2">
                  {workflowOptions.map((workflow) => (
                    <label key={workflow.id} className="flex items-center gap-3 rounded-[1.1rem] bg-[#07101d] px-4 py-3 text-sm text-slate-200 ring-1 ring-white/8">
                      <input
                        type="checkbox"
                        checked={teamDraft.allowedWorkflows.includes(workflow.id)}
                        onChange={(event) =>
                          setTeamDraft((current) => ({
                            ...current,
                            allowedWorkflows: event.target.checked
                              ? [...new Set([...current.allowedWorkflows, workflow.id])]
                              : current.allowedWorkflows.filter((item) => item !== workflow.id)
                          }))
                        }
                        className="h-4 w-4 rounded border-white/10 bg-slate-950 text-cyan-300"
                      />
                      <span>{workflow.label}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div className="flex items-center justify-between gap-4">
                <div className="text-sm">
                  {teamError ? <span className="text-rose-300">{teamError}</span> : teamMessage ? <span className="text-emerald-300">{teamMessage}</span> : <span className="text-slate-400">{copy.teamDescription}</span>}
                </div>
                <button
                  disabled={isCreatingTeam}
                  className="rounded-full bg-gradient-to-r from-[#baf4ff] to-[#28d5ff] px-5 py-3 text-sm font-semibold text-slate-950 transition hover:shadow-[0_0_28px_rgba(0,229,255,0.22)] disabled:opacity-60"
                >
                  {isCreatingTeam ? copy.saving : copy.createTeam}
                </button>
              </div>
            </form>

            <div className="space-y-4">
              {teams.map((team) => (
                <div key={team.id} className="rounded-[1.6rem] bg-[#0d1626] px-5 py-5 ring-1 ring-white/6">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="text-lg font-semibold text-white">{team.name}</div>
                      <div className="mt-1 text-xs uppercase tracking-[0.18em] text-slate-500">{team.slug}</div>
                      {team.description ? <p className="mt-3 text-sm leading-6 text-slate-400">{team.description}</p> : null}
                    </div>
                    {team.id === activeTeamId ? <div className="rounded-full bg-cyan-300/12 px-3 py-1 text-xs uppercase tracking-[0.14em] text-cyan-200">{copy.activeTeam}</div> : null}
                  </div>
                  <div className="mt-4 grid gap-2 md:grid-cols-2">
                    {workflowOptions.map((workflow) => (
                      <label key={`${team.id}-${workflow.id}`} className="flex items-center gap-3 rounded-[1.1rem] bg-[#07101d] px-4 py-3 text-sm text-slate-200 ring-1 ring-white/8">
                        <input
                          type="checkbox"
                        checked={(workflowDrafts[team.id] ?? []).includes(workflow.id)}
                        onChange={(event) =>
                          setWorkflowDrafts((current) => ({
                            ...current,
                            [team.id]: event.target.checked
                                ? [...new Set([...(current[team.id] ?? []), workflow.id])]
                                : (current[team.id] ?? []).filter((item) => item !== workflow.id)
                            }))
                          }
                          className="h-4 w-4 rounded border-white/10 bg-slate-950 text-cyan-300"
                        />
                        <span>{workflow.label}</span>
                      </label>
                    ))}
                  </div>
                  <div className="mt-4 flex items-center justify-between gap-4">
                    <div className="flex flex-wrap gap-2">
                      {(workflowDrafts[team.id] ?? []).map((workflow) => (
                        <span key={`${team.id}-badge-${workflow}`} className="rounded-full bg-white/6 px-3 py-1 text-xs text-slate-300">
                          {workflowLabel(workflow, locale)}
                        </span>
                      ))}
                    </div>
                    <button
                      onClick={() => void handleSaveAccess(team.id)}
                      disabled={savingAccessTeamId === team.id}
                      className="rounded-full border border-white/10 px-4 py-2 text-sm text-slate-200 transition hover:bg-white/5 disabled:opacity-60"
                    >
                      {savingAccessTeamId === team.id ? copy.saving : copy.saveAccess}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </SectionCard>

        <SectionCard eyebrow={copy.policyEyebrow} title={copy.policyTitle} description={copy.policyDescription}>
          <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
            <form onSubmit={handleSavePolicy} className="space-y-4 rounded-[1.6rem] bg-[#0d1626] px-5 py-5 ring-1 ring-white/6">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="space-y-2">
                  <span className="text-xs uppercase tracking-[0.18em] text-slate-400">{copy.scope}</span>
                  <select
                    value={policyDraft.scopeType}
                    onChange={(event) =>
                      setPolicyDraft((current) => ({
                        ...current,
                        scopeType: event.target.value as ApprovalPolicy["scopeType"],
                        teamId: event.target.value === "team_override" ? current.teamId ?? activeTeamId : null
                      }))
                    }
                    className="w-full rounded-2xl bg-[#07101d] px-4 py-3 text-sm text-white outline-none ring-1 ring-white/8 transition focus:ring-cyan-300/50"
                  >
                    <option value="workspace_default">{copy.workspaceDefault}</option>
                    <option value="team_override">{copy.teamOverride}</option>
                  </select>
                </label>
                <label className="space-y-2">
                  <span className="text-xs uppercase tracking-[0.18em] text-slate-400">{copy.targetWorkflow}</span>
                  <select
                    value={policyDraft.workflowTemplate}
                    onChange={(event) =>
                      setPolicyDraft((current) => ({
                        ...current,
                        workflowTemplate: event.target.value as WorkflowTemplateId
                      }))
                    }
                    className="w-full rounded-2xl bg-[#07101d] px-4 py-3 text-sm text-white outline-none ring-1 ring-white/8 transition focus:ring-cyan-300/50"
                  >
                    {workflowOptions.map((workflow) => (
                      <option key={workflow.id} value={workflow.id}>
                        {workflow.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              {policyDraft.scopeType === "team_override" ? (
                <label className="space-y-2">
                  <span className="text-xs uppercase tracking-[0.18em] text-slate-400">{copy.targetTeam}</span>
                  <select
                    value={policyDraft.teamId ?? ""}
                    onChange={(event) =>
                      setPolicyDraft((current) => ({
                        ...current,
                        teamId: event.target.value || null
                      }))
                    }
                    className="w-full rounded-2xl bg-[#07101d] px-4 py-3 text-sm text-white outline-none ring-1 ring-white/8 transition focus:ring-cyan-300/50"
                  >
                    {teams.map((team) => (
                      <option key={team.id} value={team.id}>
                        {team.name}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}

              <label className="space-y-2">
                <span className="text-xs uppercase tracking-[0.18em] text-slate-400">{copy.minApprovals}</span>
                <input
                  type="number"
                  min={1}
                  max={3}
                  value={policyDraft.minApprovals}
                  onChange={(event) =>
                    setPolicyDraft((current) => ({
                      ...current,
                      minApprovals: Math.max(1, Number(event.target.value) || 1)
                    }))
                  }
                  className="w-full rounded-2xl bg-[#07101d] px-4 py-3 text-sm text-white outline-none ring-1 ring-white/8 transition focus:ring-cyan-300/50"
                />
              </label>

              <div className="space-y-3">
                <div className="text-xs uppercase tracking-[0.18em] text-slate-400">{copy.approverRoles}</div>
                <div className="grid gap-2">
                  {teamRoles.map((role) => (
                    <label key={role} className="flex items-center gap-3 rounded-[1.1rem] bg-[#07101d] px-4 py-3 text-sm text-slate-200 ring-1 ring-white/8">
                      <input
                        type="checkbox"
                        checked={policyDraft.approverRoles.includes(role)}
                        onChange={(event) =>
                          setPolicyDraft((current) => {
                            if (!event.target.checked && current.approverRoles.length === 1 && current.approverRoles.includes(role)) {
                              return current;
                            }
                            return {
                              ...current,
                              approverRoles: event.target.checked
                                ? [...new Set([...current.approverRoles, role])]
                                : current.approverRoles.filter((item) => item !== role)
                            };
                          })
                        }
                        className="h-4 w-4 rounded border-white/10 bg-slate-950 text-cyan-300"
                      />
                      <span>{teamRoleLabel(role, locale)}</span>
                    </label>
                  ))}
                </div>
              </div>

              <label className="flex items-center gap-3 rounded-[1.1rem] bg-[#07101d] px-4 py-3 text-sm text-slate-200 ring-1 ring-white/8">
                <input
                  type="checkbox"
                  checked={policyDraft.requireRejectNote}
                  onChange={(event) => setPolicyDraft((current) => ({ ...current, requireRejectNote: event.target.checked }))}
                  className="h-4 w-4 rounded border-white/10 bg-slate-950 text-cyan-300"
                />
                <span>{copy.rejectNote}</span>
              </label>

              <label className="flex items-center gap-3 rounded-[1.1rem] bg-[#07101d] px-4 py-3 text-sm text-slate-200 ring-1 ring-white/8">
                <input
                  type="checkbox"
                  checked={policyDraft.requireSecondApprovalForExternalWrite}
                  onChange={(event) =>
                    setPolicyDraft((current) => ({
                      ...current,
                      requireSecondApprovalForExternalWrite: event.target.checked
                    }))
                  }
                  className="h-4 w-4 rounded border-white/10 bg-slate-950 text-cyan-300"
                />
                <span>{copy.secondApproval}</span>
              </label>

              <div className="flex items-center justify-between gap-4">
                <div className="text-sm">
                  {policyError ? <span className="text-rose-300">{policyError}</span> : policyMessage ? <span className="text-emerald-300">{policyMessage}</span> : <span className="text-slate-400">{copy.policyDescription}</span>}
                </div>
                <button
                  disabled={isSavingPolicy}
                  className="rounded-full bg-gradient-to-r from-[#baf4ff] to-[#28d5ff] px-5 py-3 text-sm font-semibold text-slate-950 transition hover:shadow-[0_0_28px_rgba(0,229,255,0.22)] disabled:opacity-60"
                >
                  {isSavingPolicy ? copy.saving : copy.savePolicy}
                </button>
              </div>
            </form>

            <div className="space-y-4">
              {policies.map((policy) => (
                <div key={`${policy.scopeType}-${policy.teamId ?? "workspace"}-${policy.workflowTemplate}`} className="rounded-[1.6rem] bg-[#0d1626] px-5 py-5 ring-1 ring-white/6">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="text-lg font-semibold text-white">{workflowLabel(policy.workflowTemplate, locale)}</div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <span className="rounded-full bg-white/6 px-3 py-1 text-xs text-slate-300">
                          {policy.scopeType === "workspace_default" ? copy.workspaceDefault : copy.teamOverride}
                        </span>
                        {policy.teamId ? (
                          <span className="rounded-full bg-cyan-300/10 px-3 py-1 text-xs text-cyan-200">
                            {teams.find((team) => team.id === policy.teamId)?.name ?? policy.teamId}
                          </span>
                        ) : null}
                      </div>
                    </div>
                    <button
                      onClick={() => loadPolicy(policy)}
                      className="rounded-full border border-white/10 px-4 py-2 text-sm text-slate-200 transition hover:bg-white/5"
                    >
                      {copy.loadIntoEditor}
                    </button>
                  </div>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <div className="rounded-[1.1rem] bg-[#07101d] px-4 py-3 ring-1 ring-white/8">
                      <div className="text-xs uppercase tracking-[0.16em] text-slate-500">{copy.minApprovals}</div>
                      <div className="mt-2 text-base font-semibold text-white">{policy.minApprovals}</div>
                    </div>
                    <div className="rounded-[1.1rem] bg-[#07101d] px-4 py-3 ring-1 ring-white/8">
                      <div className="text-xs uppercase tracking-[0.16em] text-slate-500">{copy.approverRoles}</div>
                      <div className="mt-2 text-sm text-slate-300">{policy.approverRoles.map((role) => teamRoleLabel(role, locale)).join(", ")}</div>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs">
                    {policy.requireRejectNote ? <span className="rounded-full bg-amber-300/10 px-3 py-1 text-amber-200">{copy.rejectNote}</span> : null}
                    {policy.requireSecondApprovalForExternalWrite ? <span className="rounded-full bg-emerald-300/10 px-3 py-1 text-emerald-200">{copy.secondApproval}</span> : null}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </SectionCard>
      </div>

      <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <SectionCard eyebrow={copy.usageEyebrow} title={copy.usageTitle} description={copy.usageDescription} accent="emerald">
          <div className="space-y-5">
            <div className="grid gap-3 md:grid-cols-4">
              <label className="space-y-2">
                <span className="text-xs uppercase tracking-[0.18em] text-slate-400">{copy.lastDays}</span>
                <select
                  value={usageFilters.windowDays}
                  onChange={(event) => setUsageFilters((current) => ({ ...current, windowDays: Number(event.target.value) as 7 | 30 | 90 }))}
                  className="w-full rounded-2xl bg-[#07101d] px-4 py-3 text-sm text-white outline-none ring-1 ring-white/8 transition focus:ring-cyan-300/50"
                >
                  <option value={7}>7d</option>
                  <option value={30}>30d</option>
                  <option value={90}>90d</option>
                </select>
              </label>
              <label className="space-y-2">
                <span className="text-xs uppercase tracking-[0.18em] text-slate-400">{copy.targetTeam}</span>
                <select
                  value={usageFilters.teamId ?? ""}
                  onChange={(event) => setUsageFilters((current) => ({ ...current, teamId: event.target.value || null }))}
                  className="w-full rounded-2xl bg-[#07101d] px-4 py-3 text-sm text-white outline-none ring-1 ring-white/8 transition focus:ring-cyan-300/50"
                >
                  <option value="">{copy.allTeams}</option>
                  {teams.map((team) => (
                    <option key={team.id} value={team.id}>
                      {team.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-2">
                <span className="text-xs uppercase tracking-[0.18em] text-slate-400">{copy.targetWorkflow}</span>
                <select
                  value={usageFilters.workflowTemplate ?? ""}
                  onChange={(event) => setUsageFilters((current) => ({ ...current, workflowTemplate: (event.target.value || null) as WorkflowTemplateId | null }))}
                  className="w-full rounded-2xl bg-[#07101d] px-4 py-3 text-sm text-white outline-none ring-1 ring-white/8 transition focus:ring-cyan-300/50"
                >
                  <option value="">{copy.allWorkflows}</option>
                  {workflowOptions.map((workflow) => (
                    <option key={workflow.id} value={workflow.id}>
                      {workflow.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-2">
                <span className="text-xs uppercase tracking-[0.18em] text-slate-400">{copy.allProviders}</span>
                <select
                  value={usageFilters.provider ?? ""}
                  onChange={(event) =>
                    setUsageFilters((current) => ({
                      ...current,
                      provider: (event.target.value || null) as ModelProvider | null,
                      model: null
                    }))
                  }
                  className="w-full rounded-2xl bg-[#07101d] px-4 py-3 text-sm text-white outline-none ring-1 ring-white/8 transition focus:ring-cyan-300/50"
                >
                  <option value="">{copy.allProviders}</option>
                  {providerOptions.map((provider) => (
                    <option key={provider} value={provider}>
                      {provider}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <label className="space-y-2">
              <span className="text-xs uppercase tracking-[0.18em] text-slate-400">{copy.allModels}</span>
              <select
                value={usageFilters.model ?? ""}
                onChange={(event) => setUsageFilters((current) => ({ ...current, model: event.target.value || null }))}
                className="w-full rounded-2xl bg-[#07101d] px-4 py-3 text-sm text-white outline-none ring-1 ring-white/8 transition focus:ring-cyan-300/50"
              >
                <option value="">{copy.allModels}</option>
                {modelOptions.map((model) => (
                  <option key={model} value={model}>
                    {model}
                  </option>
                ))}
              </select>
            </label>

            <div className="grid gap-4 md:grid-cols-3">
              <div className="rounded-[1.35rem] bg-[#0d1626] px-4 py-4 ring-1 ring-white/6">
                <div className="text-xs uppercase tracking-[0.16em] text-slate-500">{messages.dashboard.totalRuns}</div>
                <div className="mt-2 text-3xl font-semibold tracking-[-0.05em] text-white">{formatNumber(usageData.totalRuns)}</div>
              </div>
              <div className="rounded-[1.35rem] bg-[#0d1626] px-4 py-4 ring-1 ring-white/6">
                <div className="text-xs uppercase tracking-[0.16em] text-slate-500">{messages.runDetail.totalInputTokens}</div>
                <div className="mt-2 text-3xl font-semibold tracking-[-0.05em] text-white">{formatNumber(usageData.totalInputTokens)}</div>
              </div>
              <div className="rounded-[1.35rem] bg-[#0d1626] px-4 py-4 ring-1 ring-white/6">
                <div className="text-xs uppercase tracking-[0.16em] text-slate-500">{messages.runDetail.totalCost}</div>
                <div className="mt-2 text-3xl font-semibold tracking-[-0.05em] text-white">{formatCost(usageData.totalCostUsd)}</div>
              </div>
            </div>

            {usageError ? <div className="text-sm text-rose-300">{usageError}</div> : null}
            {usageLoading ? <div className="text-sm text-slate-400">{copy.loadingUsage}</div> : null}

            <div className="grid gap-6 lg:grid-cols-2">
              <div className="space-y-3">
                <div className="text-xs uppercase tracking-[0.18em] text-slate-400">{copy.byProvider}</div>
                {usageData.byProvider.map((entry) => (
                  <div key={`${entry.provider ?? "none"}-${entry.model ?? "none"}`} className="rounded-[1.2rem] bg-[#0d1626] px-4 py-4 ring-1 ring-white/6">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <div className="text-sm font-medium text-white">{entry.model ?? messages.common.none}</div>
                        <div className="mt-1 text-xs uppercase tracking-[0.16em] text-slate-500">{entry.provider ?? messages.common.none}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-semibold text-white">{formatCost(entry.costUsd)}</div>
                        <div className="mt-1 text-xs text-slate-500">{formatNumber(entry.runs)} step runs</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="space-y-3">
                <div className="text-xs uppercase tracking-[0.18em] text-slate-400">{copy.byTeam}</div>
                {usageData.byTeam.map((entry) => (
                  <div key={entry.teamId} className="rounded-[1.2rem] bg-[#0d1626] px-4 py-4 ring-1 ring-white/6">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <div className="text-sm font-medium text-white">{entry.teamName}</div>
                        <div className="mt-1 text-xs text-slate-500">{formatNumber(entry.runs)} runs</div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-semibold text-white">{formatCost(entry.costUsd)}</div>
                        <div className="mt-1 text-xs text-slate-500">{formatNumber(entry.outputTokens)} out</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </SectionCard>

        <div className="space-y-6">
          <SectionCard eyebrow={copy.knowledgeEyebrow} title={copy.knowledgeTitle} description={copy.knowledgeDescription} accent="amber">
            <form onSubmit={handleSaveKnowledge} className="space-y-4 rounded-[1.5rem] bg-[#0d1626] px-5 py-5 ring-1 ring-white/6">
              <div className="grid gap-4 md:grid-cols-2">
                <label className="space-y-2">
                  <span className="text-xs uppercase tracking-[0.18em] text-slate-400">{copy.packName}</span>
                  <input
                    value={knowledgeDraft.name}
                    onChange={(event) => setKnowledgeDraft((current) => ({ ...current, name: event.target.value }))}
                    className="w-full rounded-2xl bg-[#07101d] px-4 py-3 text-sm text-white outline-none ring-1 ring-white/8 transition focus:ring-cyan-300/50"
                    placeholder="Renewal security baseline"
                  />
                </label>
                <label className="space-y-2">
                  <span className="text-xs uppercase tracking-[0.18em] text-slate-400">{copy.packType}</span>
                  <select
                    value={knowledgeDraft.sourceType}
                    onChange={(event) =>
                      setKnowledgeDraft((current) => ({
                        ...current,
                        sourceType: event.target.value as "markdown" | "text" | "json"
                      }))
                    }
                    className="w-full rounded-2xl bg-[#07101d] px-4 py-3 text-sm text-white outline-none ring-1 ring-white/8 transition focus:ring-cyan-300/50"
                  >
                    <option value="markdown">Markdown</option>
                    <option value="text">Text</option>
                    <option value="json">JSON</option>
                  </select>
                </label>
              </div>
              <label className="space-y-2">
                <span className="text-xs uppercase tracking-[0.18em] text-slate-400">{copy.teamDescriptionField}</span>
                <input
                  value={knowledgeDraft.description}
                  onChange={(event) => setKnowledgeDraft((current) => ({ ...current, description: event.target.value }))}
                  className="w-full rounded-2xl bg-[#07101d] px-4 py-3 text-sm text-white outline-none ring-1 ring-white/8 transition focus:ring-cyan-300/50"
                  placeholder="Internal positioning, approved claims, and response constraints."
                />
              </label>
              <label className="space-y-2">
                <span className="text-xs uppercase tracking-[0.18em] text-slate-400">{copy.packContent}</span>
                <textarea
                  value={knowledgeDraft.content}
                  onChange={(event) => setKnowledgeDraft((current) => ({ ...current, content: event.target.value }))}
                  className="min-h-40 w-full rounded-[1.4rem] bg-[#07101d] px-4 py-3 text-sm leading-6 text-white outline-none ring-1 ring-white/8 transition focus:ring-cyan-300/50"
                  placeholder="Paste reusable proposal context, differentiators, pricing guardrails, or customer-approved language."
                />
              </label>
              <div className="flex items-center justify-between gap-4">
                <div className="text-sm">
                  {knowledgeError ? <span className="text-rose-300">{knowledgeError}</span> : knowledgeMessage ? <span className="text-emerald-300">{knowledgeMessage}</span> : <span className="text-slate-400">{activeTeam?.name ?? messages.common.none}</span>}
                </div>
                <button
                  disabled={isSavingKnowledge || !activeTeamId}
                  className="rounded-full bg-gradient-to-r from-[#baf4ff] to-[#28d5ff] px-5 py-3 text-sm font-semibold text-slate-950 transition hover:shadow-[0_0_28px_rgba(0,229,255,0.22)] disabled:opacity-60"
                >
                  {isSavingKnowledge ? copy.saving : copy.savePack}
                </button>
              </div>
            </form>

            <div className="mt-5 space-y-3">
              {activeKnowledgeSources.length === 0 ? (
                <div className="rounded-[1.25rem] bg-[#0d1626] px-4 py-4 text-sm text-slate-400 ring-1 ring-white/6">{copy.noKnowledge}</div>
              ) : (
                activeKnowledgeSources.map((source) => (
                  <div key={source.id} className="rounded-[1.25rem] bg-[#0d1626] px-4 py-4 ring-1 ring-white/6">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <div className="text-sm font-medium text-white">{source.name}</div>
                        <div className="mt-1 text-xs uppercase tracking-[0.16em] text-slate-500">{source.sourceType}</div>
                      </div>
                      <LibraryBig className="h-4 w-4 text-cyan-200" />
                    </div>
                    {source.description ? <p className="mt-3 text-sm leading-6 text-slate-400">{source.description}</p> : null}
                  </div>
                ))
              )}
            </div>
          </SectionCard>

          <SectionCard eyebrow={copy.membersEyebrow} title={copy.membersTitle} description={copy.membersDescription} accent="emerald">
            <div className="space-y-3">
              {members.length === 0 ? (
                <div className="rounded-[1.25rem] bg-[#0d1626] px-4 py-4 text-sm text-slate-400 ring-1 ring-white/6">{copy.noMembers}</div>
              ) : (
                members.map((member) => (
                  <div key={member.id} className="rounded-[1.25rem] bg-[#0d1626] px-4 py-4 ring-1 ring-white/6">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="text-sm font-medium text-white">{member.displayName ?? member.email}</div>
                        <div className="mt-1 flex items-center gap-2 text-xs text-slate-500">
                          <Mail className="h-3.5 w-3.5" />
                          {member.email}
                        </div>
                      </div>
                      <div className="rounded-full bg-white/6 px-3 py-1 text-xs text-slate-300">
                        {member.workspaceRole ?? "member"}
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {member.teamMemberships.map((membership) => (
                        <span key={`${member.id}-${membership.teamId}-${membership.teamRole}`} className="rounded-full bg-cyan-300/10 px-3 py-1 text-xs text-cyan-200">
                          {membership.teamName} · {teamRoleLabel(membership.teamRole, locale)}
                        </span>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
          </SectionCard>
        </div>
      </div>
    </div>
  );
}
