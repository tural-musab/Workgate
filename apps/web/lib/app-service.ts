import {
  createQueueConsumer,
  createQueueProducer,
  createStorageAdapter,
  type QueueAdapter,
  type QueueConsumer,
  type QueueProducer,
  type StorageAdapter
} from "@workgate/db";
import { GitHubExecutionService, buildManagedBranchName } from "@workgate/github";
import {
  buildApprovalQueueItem,
  buildRetrySeed,
  buildRetryTask,
  canRetryFailedOnly as runtimeCanRetryFailedOnly,
  extractEngineerPlan,
  normalizeAllowedRepos,
  seedRetryHistory,
  startWorker,
  stopWorker,
  type GitHubExecutor,
  type RuntimeServices
} from "@workgate/runtime";
import {
  CreateTaskPayloadSchema,
  GitHubAppSettingsSchema,
  GitHubAppSettingsViewSchema,
  KnowledgeSourceInputSchema,
  RetryRunPayloadSchema,
  SaveApprovalPolicySchema,
  TeamManagementSchema,
  TeamWorkflowAccessInputSchema,
  UsageFiltersSchema,
  WorkspaceMemberInputSchema,
  canCancelRun,
  canCreateTasks,
  canDeleteRun,
  canManageWorkspace,
  canOperateRuns,
  canRetryRun,
  canReviewRuns,
  canViewAllTeams,
  defaultModelPolicies,
  isActiveWorkflowTemplate,
  isGitHubWorkflowTemplate,
  isValidGitHubRepoSlug,
  normalizeCreateTaskPayload,
  type ApprovalAction,
  type ApprovalPolicy,
  type GitHubAppSettings,
  type GitHubAppSettingsView,
  type GitHubRepoConnection,
  type RunDetail,
  type Session
} from "@workgate/shared";

import { decryptSecret, encryptSecret, maskSecret } from "./secrets";
import { getAppEnv } from "./env";

export type AppRuntime = RuntimeServices;

declare global {
  var __WORKGATE_RUNTIME__: AppRuntime | undefined;
}

function buildPullRequestBody(detail: RunDetail) {
  const artifactSections = detail.artifacts.map((artifact) => `## ${artifact.title}\n\n${artifact.content}`).join("\n\n");

  return [
    "Workgate created this draft pull request after operator approval.",
    "",
    "### Run metadata",
    `- Run ID: ${detail.run.id}`,
    `- Task: ${detail.run.title}`,
    `- Workflow: ${detail.run.workflowTemplate}`,
    `- Target repo: ${detail.run.targetRepo}`,
    "",
    artifactSections
  ].join("\n");
}

function createRuntime(): AppRuntime {
  const env = getAppEnv();
  return {
    storage: createStorageAdapter(env.databaseUrl),
    producer: createQueueProducer({ databaseUrl: env.databaseUrl, driver: env.queueDriver }),
    consumer: createQueueConsumer({ databaseUrl: env.databaseUrl, driver: env.queueDriver }),
    github: new GitHubExecutionService(),
    resolveGitHubToken: (encrypted: string | null) => (encrypted ? decryptSecret(encrypted) : null),
    workerStarted: false,
    activeRuns: new Set<string>()
  };
}

function getRuntime() {
  if (!globalThis.__WORKGATE_RUNTIME__) {
    globalThis.__WORKGATE_RUNTIME__ = createRuntime();
  }
  return globalThis.__WORKGATE_RUNTIME__;
}

async function buildDefaultSession(runtime: AppRuntime): Promise<Session> {
  const { workspace, defaultTeam } = await runtime.storage.ensureBootstrapWorkspace();
  return {
    authMode: "seed_admin",
    userId: "seed:operator",
    email: null,
    displayName: "operator",
    workspace,
    workspaceRole: "workspace_owner",
    teams: [{ ...defaultTeam, teamRole: "team_reviewer" }],
    activeTeamId: defaultTeam.id,
    activeTeam: { ...defaultTeam, teamRole: "team_reviewer" },
    canViewAllTeams: true
  };
}

async function getEffectiveSession(session?: Session) {
  return session ?? buildDefaultSession(getRuntime());
}

function resolveActiveTeam(session: Session, requestedTeamId?: string | null) {
  if (requestedTeamId) {
    return session.teams.find((team) => team.id === requestedTeamId) ?? null;
  }
  if (session.activeTeam) return session.activeTeam;
  if (session.activeTeamId) return session.teams.find((team) => team.id === session.activeTeamId) ?? null;
  return session.teams[0] ?? null;
}

function getTeamRole(session: Session, teamId: string) {
  return session.teams.find((team) => team.id === teamId)?.teamRole ?? null;
}

function assertTeamAccess(session: Session, teamId: string) {
  if (canViewAllTeams(session.workspaceRole)) return;
  if (!session.teams.some((team) => team.id === teamId)) {
    throw new Error("You do not have access to that team.");
  }
}

function getScopedTeamId(session: Session, includeAllTeams = false) {
  if (includeAllTeams && canViewAllTeams(session.workspaceRole)) {
    return null;
  }
  return resolveActiveTeam(session)?.id ?? null;
}

function getScope(session: Session, includeAllTeams = false) {
  return {
    workspaceId: session.workspace.id,
    teamId: getScopedTeamId(session, includeAllTeams)
  };
}

async function getTeamNameMap(runtime: AppRuntime, workspaceId: string) {
  const teams = await runtime.storage.listTeams(workspaceId);
  return new Map(teams.map((team) => [team.id, team.name]));
}

async function getAuthorizedRunDetail(runtime: AppRuntime, session: Session, runId: string) {
  const detail = await runtime.storage.getRunDetail(runId);
  if (!detail) return null;
  if (detail.run.workspaceId !== session.workspace.id) {
    throw new Error("Run not found.");
  }
  assertTeamAccess(session, detail.run.teamId);
  return detail;
}

async function resolveGitHubAppSettings(runtime: AppRuntime, teamId: string): Promise<{ settings: GitHubAppSettings; allowlist: GitHubRepoConnection[] }> {
  const settings = await runtime.storage.getGitHubSettings(teamId);
  const privateKeyPem = runtime.resolveGitHubToken?.(settings.privateKeyEncrypted) ?? null;
  if (!settings.appId || !settings.installationId || !privateKeyPem) {
    throw new Error("GitHub App settings are not configured for the active team.");
  }

  return {
    settings: GitHubAppSettingsSchema.parse({
      appId: settings.appId,
      installationId: settings.installationId,
      privateKeyPem,
      ...(settings.appSlug ? { appSlug: settings.appSlug } : {})
    }),
    allowlist: settings.allowedRepos
  };
}

async function assertWorkflowAccess(runtime: AppRuntime, session: Session, teamId: string, workflowTemplate: RunDetail["task"]["workflowTemplate"]) {
  assertTeamAccess(session, teamId);
  const allowed = await runtime.storage.getTeamWorkflowAccess(teamId);
  if (allowed.length > 0 && !allowed.includes(workflowTemplate)) {
    throw new Error("This workflow is not enabled for the selected team.");
  }
}

function requiredApprovals(policy: ApprovalPolicy, workflowTemplate: RunDetail["task"]["workflowTemplate"]) {
  if (isGitHubWorkflowTemplate(workflowTemplate) && policy.requireSecondApprovalForExternalWrite) {
    return Math.max(policy.minApprovals, 2);
  }
  return policy.minApprovals;
}

function assertApprovalPermission(session: Session, teamId: string, policy: ApprovalPolicy) {
  const teamRole = getTeamRole(session, teamId);
  if (!canReviewRuns(teamRole, session.workspaceRole)) {
    throw new Error("You do not have permission to review this run.");
  }
  if (!canManageWorkspace(session.workspaceRole) && (!teamRole || !policy.approverRoles.includes(teamRole))) {
    throw new Error("Your role is not allowed to approve this workflow.");
  }
}

export async function ensureWorkerStarted() {
  return startWorker(getRuntime());
}

export async function stopEmbeddedWorker() {
  return stopWorker(getRuntime());
}

export function installRuntimeForTests(runtime: {
  storage: StorageAdapter;
  github: GitHubExecutor;
  producer?: QueueProducer;
  consumer?: QueueConsumer;
  queue?: QueueAdapter;
  resolveGitHubToken?: (encrypted: string | null) => string | null;
  started?: boolean;
}) {
  globalThis.__WORKGATE_RUNTIME__ = {
    storage: runtime.storage,
    producer: runtime.producer ?? runtime.queue!,
    consumer: runtime.consumer ?? runtime.queue!,
    github: runtime.github,
    resolveGitHubToken: runtime.resolveGitHubToken ?? ((value) => value),
    workerStarted: false,
    activeRuns: new Set<string>()
  };

  if (runtime.started) {
    void startWorker(globalThis.__WORKGATE_RUNTIME__);
  }
}

export async function resetRuntimeForTests() {
  if (globalThis.__WORKGATE_RUNTIME__) {
    await stopWorker(globalThis.__WORKGATE_RUNTIME__);
  }
  globalThis.__WORKGATE_RUNTIME__ = undefined;
}

export function canRetryFailedOnly(detail: RunDetail) {
  return runtimeCanRetryFailedOnly(detail);
}

export async function createTask(input: unknown, session?: Session) {
  const runtime = getRuntime();
  const effectiveSession = await getEffectiveSession(session);
  const payload = CreateTaskPayloadSchema.parse(input);
  if (!isActiveWorkflowTemplate(payload.workflowTemplate)) {
    throw new Error("This workflow template is not active yet.");
  }

  await assertWorkflowAccess(runtime, effectiveSession, payload.teamId, payload.workflowTemplate);
  const teamRole = getTeamRole(effectiveSession, payload.teamId);
  if (!canCreateTasks(teamRole, effectiveSession.workspaceRole)) {
    throw new Error("You do not have permission to create tasks for this team.");
  }

  const task = normalizeCreateTaskPayload(payload, {
    workspaceId: effectiveSession.workspace.id,
    createdBy: effectiveSession.email ?? effectiveSession.userId
  });

  if (isGitHubWorkflowTemplate(task.workflowTemplate)) {
    if (!isValidGitHubRepoSlug(task.targetRepo)) {
      throw new Error("Software Delivery Team requires a valid GitHub repository slug.");
    }
    const { allowlist } = await resolveGitHubAppSettings(runtime, task.teamId);
    const repoAllowed = allowlist.some((repo) => repo.isAllowed && `${repo.owner}/${repo.repo}` === task.targetRepo);
    if (!repoAllowed) {
      throw new Error(`Repository ${task.targetRepo} is not allowlisted for the active team.`);
    }
  }

  const detail = await runtime.storage.createTaskAndRun(task);
  await runtime.producer.enqueueRun(detail.run.id);
  return detail;
}

export async function listRuns(session?: Session, includeAllTeams = false) {
  const effectiveSession = await getEffectiveSession(session);
  return getRuntime().storage.listRuns(getScope(effectiveSession, includeAllTeams));
}

export async function listPendingApprovalRuns(session?: Session, includeAllTeams = false) {
  const runtime = getRuntime();
  const effectiveSession = await getEffectiveSession(session);
  const runs = await runtime.storage.listPendingApprovalRuns(getScope(effectiveSession, includeAllTeams));
  const [details, teamNames] = await Promise.all([
    Promise.all(runs.map((run) => runtime.storage.getRunDetail(run.id))),
    getTeamNameMap(runtime, effectiveSession.workspace.id)
  ]);

  return details
    .filter((detail): detail is RunDetail => Boolean(detail))
    .map((detail) => {
      const item = buildApprovalQueueItem(detail);
      return {
        ...item,
        teamName: teamNames.get(detail.run.teamId) ?? null
      };
    });
}

export async function getRunDetail(runId: string, session?: Session) {
  const runtime = getRuntime();
  const effectiveSession = await getEffectiveSession(session);
  return getAuthorizedRunDetail(runtime, effectiveSession, runId);
}

export async function getDashboardData(session?: Session, includeAllTeams = false) {
  const runtime = getRuntime();
  const effectiveSession = await getEffectiveSession(session);
  const [summary, runs, approvals] = await Promise.all([
    runtime.storage.getDashboardSummary(getScope(effectiveSession, includeAllTeams)),
    runtime.storage.listRuns(getScope(effectiveSession, includeAllTeams)),
    listPendingApprovalRuns(effectiveSession, includeAllTeams)
  ]);
  return {
    summary,
    runs,
    approvals,
    runtime: {
      storageMode: runtime.storage.mode,
      queueMode: runtime.producer.mode
    }
  };
}

export async function getGitHubSettingsView(session?: Session): Promise<GitHubAppSettingsView> {
  const runtime = getRuntime();
  const effectiveSession = await getEffectiveSession(session);
  const teamId = resolveActiveTeam(effectiveSession)?.id ?? null;
  if (!teamId) {
    return GitHubAppSettingsViewSchema.parse({
      hasApp: false,
      appId: null,
      installationId: null,
      appSlug: null,
      maskedPrivateKey: null,
      allowedRepos: []
    });
  }

  const settings = await runtime.storage.getGitHubSettings(teamId);
  const privateKeyPem = runtime.resolveGitHubToken?.(settings.privateKeyEncrypted) ?? null;
  return GitHubAppSettingsViewSchema.parse({
    hasApp: Boolean(privateKeyPem && settings.appId && settings.installationId),
    appId: settings.appId,
    installationId: settings.installationId,
    appSlug: settings.appSlug,
    maskedPrivateKey: maskSecret(privateKeyPem),
    allowedRepos: settings.allowedRepos
  });
}

export async function getModelPoliciesView() {
  const runtime = getRuntime();
  const policies = await runtime.storage.getModelPolicies();
  return policies.length > 0 ? policies : defaultModelPolicies;
}

export async function saveGitHubSettings(
  input: GitHubAppSettings & { allowedRepos: string[]; teamId?: string | null },
  session?: Session
) {
  const runtime = getRuntime();
  const effectiveSession = await getEffectiveSession(session);
  if (!canManageWorkspace(effectiveSession.workspaceRole)) {
    throw new Error("Only workspace admins can manage GitHub App settings.");
  }

  const activeTeam = resolveActiveTeam(effectiveSession, input.teamId ?? null);
  if (!activeTeam) {
    throw new Error("Select a team before configuring GitHub access.");
  }

  const normalized = normalizeAllowedRepos(input.allowedRepos).map((repo) => ({
    ...repo,
    workspaceId: effectiveSession.workspace.id,
    teamId: activeTeam.id
  }));

  await runtime.storage.saveGitHubSettings(
    {
      appId: input.appId,
      installationId: input.installationId,
      appSlug: input.appSlug,
      privateKeyPem: encryptSecret(input.privateKeyPem)
    },
    normalized
  );
  return getGitHubSettingsView(effectiveSession);
}

export async function listTeamsView(session?: Session) {
  const effectiveSession = await getEffectiveSession(session);
  return getRuntime().storage.listTeams(effectiveSession.workspace.id);
}

export async function listTeamSettingsView(session?: Session) {
  const effectiveSession = await getEffectiveSession(session);
  const runtime = getRuntime();
  const teams = await runtime.storage.listTeams(effectiveSession.workspace.id);
  const workflows = await Promise.all(
    teams.map(async (team) => ({
      teamId: team.id,
      allowedWorkflows: await runtime.storage.getTeamWorkflowAccess(team.id)
    }))
  );
  const workflowMap = new Map(workflows.map((item) => [item.teamId, item.allowedWorkflows]));
  return teams.map((team) => ({
    ...team,
    allowedWorkflows: workflowMap.get(team.id) ?? []
  }));
}

export async function saveTeam(input: unknown, session?: Session) {
  const effectiveSession = await getEffectiveSession(session);
  if (!canManageWorkspace(effectiveSession.workspaceRole)) {
    throw new Error("Only workspace admins can manage teams.");
  }
  return getRuntime().storage.createTeam(effectiveSession.workspace.id, TeamManagementSchema.parse(input));
}

export async function saveTeamWorkflowAccess(input: unknown, session?: Session) {
  const effectiveSession = await getEffectiveSession(session);
  if (!canManageWorkspace(effectiveSession.workspaceRole)) {
    throw new Error("Only workspace admins can manage team workflow access.");
  }

  const payload = TeamWorkflowAccessInputSchema.parse(input);
  const runtime = getRuntime();
  const teams = await runtime.storage.listTeams(effectiveSession.workspace.id);
  if (!teams.some((team) => team.id === payload.teamId)) {
    throw new Error("Team not found.");
  }

  await runtime.storage.saveTeamWorkflowAccess(payload.teamId, payload.allowedWorkflows);
  return {
    teamId: payload.teamId,
    allowedWorkflows: await runtime.storage.getTeamWorkflowAccess(payload.teamId)
  };
}

export async function listWorkspaceMembersView(session?: Session) {
  const effectiveSession = await getEffectiveSession(session);
  if (!canManageWorkspace(effectiveSession.workspaceRole)) {
    throw new Error("Only workspace admins can manage workspace members.");
  }
  return getRuntime().storage.listWorkspaceMembers(effectiveSession.workspace.id);
}

export async function saveWorkspaceMember(input: unknown, session?: Session) {
  const effectiveSession = await getEffectiveSession(session);
  if (!canManageWorkspace(effectiveSession.workspaceRole)) {
    throw new Error("Only workspace admins can manage workspace members.");
  }
  return getRuntime().storage.upsertWorkspaceMember(effectiveSession.workspace.id, WorkspaceMemberInputSchema.parse(input));
}

export async function getApprovalPoliciesView(session?: Session, teamId?: string | null) {
  const effectiveSession = await getEffectiveSession(session);
  if (!canManageWorkspace(effectiveSession.workspaceRole)) {
    throw new Error("Only workspace admins can manage approval policies.");
  }
  return getRuntime().storage.getApprovalPolicies(effectiveSession.workspace.id, teamId);
}

export async function saveApprovalPolicy(input: unknown, session?: Session) {
  const effectiveSession = await getEffectiveSession(session);
  if (!canManageWorkspace(effectiveSession.workspaceRole)) {
    throw new Error("Only workspace admins can manage approval policies.");
  }
  return getRuntime().storage.saveApprovalPolicy(effectiveSession.workspace.id, SaveApprovalPolicySchema.parse(input));
}

export async function getUsageView(filters: unknown, session?: Session) {
  const effectiveSession = await getEffectiveSession(session);
  if (!canManageWorkspace(effectiveSession.workspaceRole)) {
    throw new Error("Only workspace admins can view usage analytics.");
  }
  return getRuntime().storage.getUsageSummary(effectiveSession.workspace.id, UsageFiltersSchema.parse(filters));
}

export async function listKnowledgeSourcesView(session?: Session, teamId?: string | null) {
  const effectiveSession = await getEffectiveSession(session);
  const resolvedTeamId = teamId ?? resolveActiveTeam(effectiveSession)?.id;
  if (!resolvedTeamId) return [];
  assertTeamAccess(effectiveSession, resolvedTeamId);
  return getRuntime().storage.listKnowledgeSources(effectiveSession.workspace.id, resolvedTeamId);
}

export async function saveKnowledgeSource(input: unknown, session?: Session) {
  const effectiveSession = await getEffectiveSession(session);
  const payload = KnowledgeSourceInputSchema.parse(input);
  assertTeamAccess(effectiveSession, payload.teamId);
  if (!canCreateTasks(getTeamRole(effectiveSession, payload.teamId), effectiveSession.workspaceRole)) {
    throw new Error("You do not have permission to manage knowledge packs for this team.");
  }
  return getRuntime().storage.saveKnowledgeSource(effectiveSession.workspace.id, effectiveSession.email ?? effectiveSession.userId, payload);
}

export async function approveRun(runId: string, reviewer: string, notes?: string | null, session?: Session) {
  const runtime = getRuntime();
  const effectiveSession = await getEffectiveSession(session);
  const detail = await getAuthorizedRunDetail(runtime, effectiveSession, runId);
  if (!detail) {
    throw new Error("Run not found.");
  }
  if (detail.run.status !== "pending_human") {
    throw new Error("Run is not waiting for approval.");
  }

  const policy = await runtime.storage.getEffectiveApprovalPolicy(effectiveSession.workspace.id, detail.run.teamId, detail.task.workflowTemplate);
  assertApprovalPermission(effectiveSession, detail.run.teamId, policy);

  const approvalsToDate = detail.approvals.filter((approval) => approval.action === "approve");
  const required = requiredApprovals(policy, detail.task.workflowTemplate);
  if (required > 1 && approvalsToDate.some((approval) => approval.reviewer === reviewer)) {
    throw new Error("A second approval must come from a different reviewer.");
  }

  const approval = await runtime.storage.setApproval(runId, "approve", reviewer, notes ?? null);
  if (approvalsToDate.length + 1 < required) {
    await runtime.storage.addRunEvent({
      runId,
      eventType: "approval.requested",
      status: "pending_human",
      summary: `Approval recorded from ${reviewer}. Waiting for ${required - approvalsToDate.length - 1} more approval(s).`
    });
    await runtime.storage.updateRun(runId, {
      status: "pending_human",
      finalSummary: `Approval ${approvalsToDate.length + 1}/${required} recorded. Waiting for additional reviewer approval.`
    });
    return { approval, pullRequest: null, awaitingAdditionalApproval: true };
  }

  if (!isGitHubWorkflowTemplate(detail.task.workflowTemplate)) {
    await runtime.storage.addToolCall({
      runId,
      toolName: "workflow.releasePacket",
      category: "write",
      status: "completed",
      input: detail.task.workflowTemplate,
      output: "Final response packet marked as approved without external repository writes."
    });
    await runtime.storage.addRunEvent({
      runId,
      eventType: "approval.approved",
      status: "completed",
      summary: `Approved by ${reviewer}.`
    });
    await runtime.storage.addRunEvent({
      runId,
      eventType: "workflow.packet.ready",
      status: "completed",
      summary: "Release packet is ready for delivery."
    });
    await runtime.storage.updateRun(runId, {
      status: "completed",
      finalSummary: `Approved by ${approval.reviewer}. Final response packet is ready for delivery.`
    });
    return { approval, pullRequest: null };
  }

  const { settings, allowlist } = await resolveGitHubAppSettings(runtime, detail.run.teamId);
  const workspace = await runtime.github.createManagedWorkspace({
    runId,
    title: detail.run.title,
    targetRepo: detail.run.targetRepo,
    targetBranch: detail.run.targetBranch,
    token: null,
    app: settings,
    allowlist
  });

  await runtime.storage.addToolCall({
    runId,
    toolName: "github.clone",
    category: "read",
    status: "completed",
    input: detail.run.targetRepo,
    output: workspace.workspacePath
  });

  const engineerPlan = extractEngineerPlan(detail);
  if (engineerPlan && engineerPlan.fileOperations.length > 0) {
    await runtime.github.applyFileOperations({
      workspacePath: workspace.workspacePath,
      operations: engineerPlan.fileOperations
    });
    await runtime.storage.addToolCall({
      runId,
      toolName: "workspace.applyFileOperations",
      category: "write",
      status: "completed",
      input: `${engineerPlan.fileOperations.length} operations`,
      output: engineerPlan.fileOperations.map((item) => `${item.type} ${item.path}`).join(", ")
    });
  }

  await runtime.github.writeRunArtifactsToWorkspace({
    workspacePath: workspace.workspacePath,
    runId,
    artifacts: detail.artifacts
  });

  await runtime.storage.addToolCall({
    runId,
    toolName: "github.writeRunArtifacts",
    category: "write",
    status: "completed",
    input: ".workgate/runs",
    output: `Prepared artifacts for ${runId}`
  });
  await runtime.storage.addRunEvent({
    runId,
    eventType: "github.branch.prepared",
    summary: `Managed branch ${workspace.branchName} prepared.`,
    payload: workspace.branchName
  });

  await runtime.github.commitAndPushWorkspace({
    workspacePath: workspace.workspacePath,
    branchName: workspace.branchName,
    runId,
    targetRepo: detail.run.targetRepo
  });

  await runtime.storage.addToolCall({
    runId,
    toolName: "git.push",
    category: "write",
    status: "completed",
    input: workspace.branchName,
    output: detail.run.targetRepo
  });

  const pullRequest = await runtime.github.createDraftPullRequest({
    token: null,
    app: settings,
    targetRepo: detail.run.targetRepo,
    targetBranch: detail.run.targetBranch,
    branchName: workspace.branchName,
    title: `[Workgate] ${detail.run.title}`,
    body: buildPullRequestBody(detail)
  });

  await runtime.storage.addToolCall({
    runId,
    toolName: "github.createDraftPullRequest",
    category: "write",
    status: "completed",
    input: workspace.branchName,
    output: pullRequest.pullRequestUrl
  });
  await runtime.storage.addRunEvent({
    runId,
    eventType: "approval.approved",
    status: "completed",
    summary: `Approved by ${reviewer}.`
  });
  await runtime.storage.addRunEvent({
    runId,
    eventType: "github.pr.opened",
    status: "completed",
    summary: "Draft pull request opened.",
    payload: pullRequest.pullRequestUrl
  });

  await runtime.storage.updateRun(runId, {
    status: "completed",
    branchName: workspace.branchName,
    finalSummary: `Approved by ${approval.reviewer}. Draft PR created: ${pullRequest.pullRequestUrl}`
  });

  return { approval, pullRequest };
}

export async function rejectRun(runId: string, reviewer: string, notes?: string | null, session?: Session) {
  const runtime = getRuntime();
  const effectiveSession = await getEffectiveSession(session);
  const detail = await getAuthorizedRunDetail(runtime, effectiveSession, runId);
  if (!detail) {
    throw new Error("Run not found.");
  }
  const policy = await runtime.storage.getEffectiveApprovalPolicy(effectiveSession.workspace.id, detail.run.teamId, detail.task.workflowTemplate);
  assertApprovalPermission(effectiveSession, detail.run.teamId, policy);
  if (policy.requireRejectNote && !notes?.trim()) {
    throw new Error("This workflow requires a rejection note.");
  }
  const approval = await runtime.storage.setApproval(runId, "reject", reviewer, notes ?? null);
  await runtime.storage.addRunEvent({
    runId,
    eventType: "approval.rejected",
    status: "cancelled",
    summary: `Rejected by ${reviewer}.`,
    payload: notes ?? null
  });
  await runtime.storage.updateRun(runId, {
    status: "cancelled",
    finalSummary: `Rejected by ${reviewer}.`
  });
  return approval;
}

export async function cancelRun(runId: string, session?: Session) {
  const runtime = getRuntime();
  const effectiveSession = await getEffectiveSession(session);
  const detail = await getAuthorizedRunDetail(runtime, effectiveSession, runId);
  if (!detail) {
    throw new Error("Run not found.");
  }
  if (!canOperateRuns(getTeamRole(effectiveSession, detail.run.teamId), effectiveSession.workspaceRole)) {
    throw new Error("You do not have permission to cancel this run.");
  }
  if (!canCancelRun(detail.run.status)) {
    throw new Error("Run can no longer be cancelled.");
  }
  await runtime.storage.updateRun(runId, {
    status: "cancelled",
    finalSummary: "Run cancelled by operator."
  });
}

export async function deleteRun(runId: string, session?: Session) {
  const runtime = getRuntime();
  const effectiveSession = await getEffectiveSession(session);
  const detail = await getAuthorizedRunDetail(runtime, effectiveSession, runId);
  if (!detail) {
    throw new Error("Run not found.");
  }
  if (!canOperateRuns(getTeamRole(effectiveSession, detail.run.teamId), effectiveSession.workspaceRole)) {
    throw new Error("You do not have permission to delete this run.");
  }
  if (!canDeleteRun(detail.run.status)) {
    throw new Error("Only completed, failed, or cancelled runs can be deleted.");
  }

  return runtime.storage.deleteRun(runId);
}

export async function retryRun(runId: string, payload: unknown, session?: Session) {
  const runtime = getRuntime();
  const effectiveSession = await getEffectiveSession(session);
  const detail = await getAuthorizedRunDetail(runtime, effectiveSession, runId);
  if (!detail) {
    throw new Error("Run not found.");
  }
  if (!canOperateRuns(getTeamRole(effectiveSession, detail.run.teamId), effectiveSession.workspaceRole)) {
    throw new Error("You do not have permission to retry this run.");
  }
  if (!canRetryRun(detail.run.status)) {
    throw new Error("Only completed, failed, or cancelled runs can be retried.");
  }

  const { mode } = RetryRunPayloadSchema.parse(payload);
  const retryTask = buildRetryTask(detail, mode);
  const seed = buildRetrySeed(detail, mode);

  const nextDetail = await runtime.storage.createTaskAndRun(retryTask);
  await runtime.storage.addToolCall({
    runId: nextDetail.run.id,
    toolName: "run.retry",
    category: "read",
    status: "completed",
    input: `${mode} retry requested for ${runId}`,
    output: mode === "failed_only" ? "Resume requested from failed stage." : "Fresh retry from router"
  });

  if (seed) {
    await seedRetryHistory(runtime, nextDetail.run.id, seed);
  }

  await runtime.producer.enqueueRun(nextDetail.run.id);
  return nextDetail;
}

export async function getRuntimeInfo() {
  const runtime = getRuntime();
  return {
    storageMode: runtime.storage.mode,
    queueMode: runtime.producer.mode,
    suggestedBranch: buildManagedBranchName("preview", "sample task")
  };
}

export async function saveGitHubSettingsFromPayload(payload: unknown, session?: Session) {
  const data = (payload ?? {}) as Record<string, unknown>;
  const allowedRepos = Array.isArray(data.allowedRepos) ? data.allowedRepos.filter((item): item is string => typeof item === "string") : [];
  const effectiveSession = await getEffectiveSession(session);
  const teamId = typeof data.teamId === "string" ? data.teamId : (resolveActiveTeam(effectiveSession)?.id ?? null);
  const existing = teamId ? await getRuntime().storage.getGitHubSettings(teamId) : null;
  const existingPrivateKeyPem = existing ? getRuntime().resolveGitHubToken?.(existing.privateKeyEncrypted) ?? null : null;
  const privateKeyPem =
    typeof data.privateKeyPem === "string" && data.privateKeyPem.trim().length > 0 ? data.privateKeyPem : existingPrivateKeyPem;

  const parsed = GitHubAppSettingsSchema.parse({
    appId: data.appId,
    installationId: data.installationId,
    privateKeyPem,
    ...(typeof data.appSlug === "string" && data.appSlug ? { appSlug: data.appSlug } : {})
  });
  return saveGitHubSettings({ ...parsed, allowedRepos, teamId }, session);
}

export async function applyApprovalAction(runId: string, action: ApprovalAction, reviewer: string, notes?: string | null, session?: Session) {
  return action === "approve" ? approveRun(runId, reviewer, notes, session) : rejectRun(runId, reviewer, notes, session);
}
