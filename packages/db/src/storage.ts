import { randomUUID } from "node:crypto";

import { asc, desc, eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import {
  type AgentRole,
  type ApprovalAction,
  type ApprovalPolicy,
  type ApprovalRecord,
  type ArtifactRecord,
  type ArtifactType,
  type DashboardSummary,
  type ExecutionMode,
  type GitHubAppSettings,
  type GitHubRepoConnection,
  type KnowledgeSource,
  type KnowledgeSourceInput,
  type ModelPolicy,
  type ModelProvider,
  type SaveApprovalPolicyInput,
  type RunDetail,
  type RunEventRecord,
  type RunEventType,
  type RunRecord,
  type RunStatus,
  type SessionTeam,
  type StepRecord,
  type StepStatus,
  type TaskRequest,
  type TeamManagementInput,
  type TeamRecord,
  type ToolCallRecord,
  type UsageFilters,
  type UsageSummary,
  type WorkflowTemplateId,
  type WorkspaceMemberInput,
  type WorkspaceMemberRecord,
  type WorkspaceRecord,
  activeWorkflowTemplates,
  defaultApprovalPolicies,
  defaultModelPolicies
} from "@workgate/shared";

import {
  appSettings,
  approvalPolicies,
  approvals,
  artifacts,
  knowledgeSources,
  modelPolicies,
  repoConnections,
  runEvents,
  runSteps,
  runs,
  taskRequests,
  teamMembers,
  teamWorkflowAccess,
  teams,
  toolCalls,
  workspaceMembers,
  workspaces
} from "./schema";

type PersistedTask = TaskRequest & { id: string; createdAt: string };
type StoredGitHubSettings = {
  appId: string | null;
  installationId: string | null;
  appSlug: string | null;
  privateKeyEncrypted: string | null;
  allowedRepos: GitHubRepoConnection[];
};
type WorkspaceContext = {
  workspace: WorkspaceRecord;
  member: WorkspaceMemberRecord;
  teams: SessionTeam[];
};

type StepWriteFields = {
  provider?: ModelProvider | null;
  model?: string | null;
  executionMode?: ExecutionMode | null;
  inputTokens?: number | null;
  outputTokens?: number | null;
  costUsd?: number | null;
};

export interface StorageAdapter {
  readonly mode: "memory" | "postgres";
  ensureBootstrapWorkspace(): Promise<{ workspace: WorkspaceRecord; defaultTeam: TeamRecord }>;
  getWorkspaceContextByEmail(email: string): Promise<WorkspaceContext | null>;
  listTeams(workspaceId: string): Promise<TeamRecord[]>;
  createTeam(workspaceId: string, input: TeamManagementInput): Promise<TeamRecord>;
  listWorkspaceMembers(
    workspaceId: string
  ): Promise<Array<WorkspaceMemberRecord & { teamMemberships: Array<{ teamId: string; teamName: string; teamRole: SessionTeam["teamRole"] }> }>>;
  upsertWorkspaceMember(workspaceId: string, input: WorkspaceMemberInput): Promise<WorkspaceMemberRecord>;
  getTeamWorkflowAccess(teamId: string): Promise<WorkflowTemplateId[]>;
  saveTeamWorkflowAccess(teamId: string, workflows: WorkflowTemplateId[]): Promise<void>;
  getApprovalPolicies(workspaceId: string, teamId?: string | null): Promise<ApprovalPolicy[]>;
  getEffectiveApprovalPolicy(workspaceId: string, teamId: string, workflowTemplate: WorkflowTemplateId): Promise<ApprovalPolicy>;
  saveApprovalPolicy(workspaceId: string, input: SaveApprovalPolicyInput): Promise<ApprovalPolicy>;
  getUsageSummary(workspaceId: string, filters: UsageFilters): Promise<UsageSummary>;
  listKnowledgeSources(workspaceId: string, teamId: string): Promise<KnowledgeSource[]>;
  saveKnowledgeSource(workspaceId: string, createdBy: string, input: KnowledgeSourceInput): Promise<KnowledgeSource>;
  createTaskAndRun(task: TaskRequest): Promise<RunDetail>;
  listRuns(scope?: { workspaceId?: string; teamId?: string | null }): Promise<RunRecord[]>;
  listRunsByStatus(statuses: RunStatus[], scope?: { workspaceId?: string; teamId?: string | null }): Promise<RunRecord[]>;
  listPendingApprovalRuns(scope?: { workspaceId?: string; teamId?: string | null }): Promise<RunRecord[]>;
  getRunDetail(runId: string): Promise<RunDetail | null>;
  deleteRun(runId: string): Promise<boolean>;
  updateRun(runId: string, patch: Partial<Pick<RunRecord, "status" | "branchName" | "failureReason" | "finalSummary">>): Promise<void>;
  createRunStep(input: { runId: string; role: AgentRole; status: StepStatus; input?: string | null } & StepWriteFields): Promise<StepRecord>;
  updateRunStep(stepId: string, patch: Partial<Pick<StepRecord, "status" | "summary" | "output" | "error" | "endedAt"> & StepWriteFields>): Promise<void>;
  addRunEvent(input: {
    runId: string;
    stepId?: string | null;
    role?: AgentRole | null;
    eventType: RunEventType;
    status?: RunStatus | null;
    summary: string;
    payload?: string | null;
  }): Promise<RunEventRecord>;
  addArtifact(input: { runId: string; artifactType: ArtifactType; title: string; content: string }): Promise<ArtifactRecord>;
  addToolCall(input: {
    runId: string;
    stepId?: string | null;
    toolName: string;
    category: "read" | "write" | "high-risk";
    status: "planned" | "completed" | "blocked" | "failed";
    input?: string | null;
    output?: string | null;
  }): Promise<ToolCallRecord>;
  requestApproval(runId: string): Promise<ApprovalRecord>;
  setApproval(runId: string, action: ApprovalAction, reviewer: string, notes?: string | null): Promise<ApprovalRecord>;
  getGitHubSettings(teamId?: string | null): Promise<StoredGitHubSettings>;
  saveGitHubSettings(settings: GitHubAppSettings, allowedRepos: GitHubRepoConnection[]): Promise<void>;
  getDashboardSummary(scope?: { workspaceId?: string; teamId?: string | null }): Promise<DashboardSummary>;
  getModelPolicies(): Promise<ModelPolicy[]>;
}

function nowIso() {
  return new Date().toISOString();
}

function toBooleanText(value: boolean) {
  return value ? "true" : "false";
}

function fromBooleanText(value: string) {
  return value === "true";
}

function parseNullableNumber(value: number | string | null | undefined) {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return value;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function sortByCreatedAtAsc<T extends { createdAt: string }>(items: T[]) {
  return [...items].sort((left, right) => left.createdAt.localeCompare(right.createdAt));
}

function sortSteps(items: StepRecord[]) {
  return [...items].sort((left, right) => (left.startedAt ?? "").localeCompare(right.startedAt ?? ""));
}

function hydrateRun(row: typeof runs.$inferSelect): RunRecord {
  return {
    id: row.id,
    taskRequestId: row.taskRequestId,
    workspaceId: row.workspaceId,
    teamId: row.teamId,
    status: row.status as RunStatus,
    title: row.title,
    taskType: row.taskType as TaskRequest["taskType"],
    workflowTemplate: row.workflowTemplate as TaskRequest["workflowTemplate"],
    targetRepo: row.targetRepo,
    targetBranch: row.targetBranch,
    branchName: row.branchName,
    failureReason: row.failureReason,
    finalSummary: row.finalSummary,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  };
}

function hydrateTask(row: typeof taskRequests.$inferSelect): PersistedTask {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    teamId: row.teamId,
    createdBy: row.createdBy,
    title: row.title,
    goal: row.goal,
    taskType: row.taskType as TaskRequest["taskType"],
    workflowTemplate: row.workflowTemplate as TaskRequest["workflowTemplate"],
    workflowInput: row.workflowInput as TaskRequest["workflowInput"],
    targetRepo: row.targetRepo,
    targetBranch: row.targetBranch,
    constraints: row.constraints,
    acceptanceCriteria: row.acceptanceCriteria,
    attachments: row.attachments as PersistedTask["attachments"],
    createdAt: row.createdAt.toISOString()
  };
}

function hydrateStep(row: typeof runSteps.$inferSelect): StepRecord {
  return {
    id: row.id,
    runId: row.runId,
    role: row.role as AgentRole,
    status: row.status as StepStatus,
    summary: row.summary,
    input: row.input,
    output: row.output,
    error: row.error,
    provider: (row.provider as ModelProvider | null) ?? null,
    model: row.model,
    executionMode: (row.executionMode as ExecutionMode | null) ?? null,
    inputTokens: row.inputTokens ?? null,
    outputTokens: row.outputTokens ?? null,
    costUsd: parseNullableNumber(row.costUsd),
    startedAt: row.startedAt?.toISOString() ?? null,
    endedAt: row.endedAt?.toISOString() ?? null
  };
}

function hydrateArtifact(row: typeof artifacts.$inferSelect): ArtifactRecord {
  return {
    id: row.id,
    runId: row.runId,
    artifactType: row.artifactType as ArtifactType,
    title: row.title,
    content: row.content,
    createdAt: row.createdAt.toISOString()
  };
}

function hydrateApproval(row: typeof approvals.$inferSelect): ApprovalRecord {
  return {
    id: row.id,
    runId: row.runId,
    action: (row.action as ApprovalAction | null) ?? null,
    reviewer: row.reviewer,
    notes: row.notes,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  };
}

function hydrateWorkspace(row: typeof workspaces.$inferSelect): WorkspaceRecord {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    createdAt: row.createdAt.toISOString()
  };
}

function hydrateTeam(row: typeof teams.$inferSelect): TeamRecord {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    name: row.name,
    slug: row.slug,
    description: row.description,
    createdAt: row.createdAt.toISOString()
  };
}

function hydrateWorkspaceMember(row: typeof workspaceMembers.$inferSelect): WorkspaceMemberRecord {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    email: row.email,
    displayName: row.displayName,
    workspaceRole: (row.workspaceRole as WorkspaceMemberRecord["workspaceRole"]) ?? null,
    createdAt: row.createdAt.toISOString()
  };
}

function createDefaultApprovalPolicy(
  workspaceId: string,
  workflowTemplate: WorkflowTemplateId,
  teamId?: string | null
): ApprovalPolicy {
  const base =
    defaultApprovalPolicies.find((policy) => policy.workflowTemplate === workflowTemplate) ??
    defaultApprovalPolicies[0]!;
  const now = nowIso();
  return {
    id: randomUUID(),
    workspaceId,
    teamId: teamId ?? null,
    scopeType: teamId ? "team_override" : "workspace_default",
    workflowTemplate,
    minApprovals: base.minApprovals,
    approverRoles: base.approverRoles,
    requireRejectNote: base.requireRejectNote,
    requireSecondApprovalForExternalWrite: base.requireSecondApprovalForExternalWrite,
    createdAt: now,
    updatedAt: now
  };
}

function hydrateRunEvent(row: typeof runEvents.$inferSelect): RunEventRecord {
  return {
    id: row.id,
    runId: row.runId,
    stepId: row.stepId,
    role: (row.role as AgentRole | null) ?? null,
    eventType: row.eventType as RunEventType,
    status: (row.status as RunStatus | null) ?? null,
    summary: row.summary,
    payload: row.payload,
    createdAt: row.createdAt.toISOString()
  };
}

function hydrateToolCall(row: typeof toolCalls.$inferSelect): ToolCallRecord {
  return {
    id: row.id,
    runId: row.runId,
    stepId: row.stepId,
    toolName: row.toolName,
    category: row.category as ToolCallRecord["category"],
    status: row.status as ToolCallRecord["status"],
    input: row.input,
    output: row.output,
    createdAt: row.createdAt.toISOString()
  };
}

class MemoryStorage implements StorageAdapter {
  readonly mode = "memory" as const;

  private workspace: WorkspaceRecord | null = null;
  private teams = new Map<string, TeamRecord>();
  private workspaceMembers = new Map<string, WorkspaceMemberRecord>();
  private teamMemberships = new Map<string, { id: string; teamId: string; workspaceMemberId: string; teamRole: SessionTeam["teamRole"]; createdAt: string }>();
  private teamAccess = new Map<string, WorkflowTemplateId[]>();
  private approvalPolicies = new Map<string, ApprovalPolicy>();
  private knowledgeSources = new Map<string, KnowledgeSource>();
  private tasks = new Map<string, PersistedTask>();
  private runs = new Map<string, RunRecord>();
  private steps = new Map<string, StepRecord>();
  private events = new Map<string, RunEventRecord>();
  private artifacts = new Map<string, ArtifactRecord>();
  private approvals = new Map<string, ApprovalRecord>();
  private toolCalls = new Map<string, ToolCallRecord>();
  private githubSettings: StoredGitHubSettings = {
    appId: null,
    installationId: null,
    appSlug: null,
    privateKeyEncrypted: null,
    allowedRepos: []
  };
  private policies = [...defaultModelPolicies];

  private ensureBootstrapState() {
    if (this.workspace) return;

    const createdAt = nowIso();
    this.workspace = {
      id: "workspace_default",
      name: "Default Workspace",
      slug: "default-workspace",
      createdAt
    };

    const defaultTeam: TeamRecord = {
      id: "team_default",
      workspaceId: this.workspace.id,
      name: "Operations",
      slug: "operations",
      description: "Default team for Workgate bootstrap.",
      createdAt
    };
    this.teams.set(defaultTeam.id, defaultTeam);
    this.teamAccess.set(defaultTeam.id, [...activeWorkflowTemplates]);

    for (const workflowTemplate of activeWorkflowTemplates) {
      const policy = createDefaultApprovalPolicy(this.workspace.id, workflowTemplate);
      this.approvalPolicies.set(policy.id, policy);
    }
  }

  async ensureBootstrapWorkspace() {
    this.ensureBootstrapState();
    return {
      workspace: this.workspace!,
      defaultTeam: this.teams.get("team_default")!
    };
  }

  async getWorkspaceContextByEmail(email: string) {
    this.ensureBootstrapState();
    const member = [...this.workspaceMembers.values()].find((item) => item.workspaceId === this.workspace!.id && item.email.toLowerCase() === email.toLowerCase());
    if (!member) return null;

    const teams = [...this.teamMemberships.values()]
      .filter((membership) => membership.workspaceMemberId === member.id)
      .map((membership) => {
        const team = this.teams.get(membership.teamId);
        if (!team) return null;
        return {
          ...team,
          teamRole: membership.teamRole
        } satisfies SessionTeam;
      })
      .filter((item): item is SessionTeam => Boolean(item));

    return {
      workspace: this.workspace!,
      member,
      teams
    };
  }

  async listTeams(workspaceId: string) {
    this.ensureBootstrapState();
    return [...this.teams.values()].filter((team) => team.workspaceId === workspaceId).sort((left, right) => left.name.localeCompare(right.name));
  }

  async createTeam(workspaceId: string, input: TeamManagementInput) {
    this.ensureBootstrapState();
    const team: TeamRecord = {
      id: randomUUID(),
      workspaceId,
      name: input.name,
      slug: input.slug,
      description: input.description ?? null,
      createdAt: nowIso()
    };
    this.teams.set(team.id, team);
    this.teamAccess.set(team.id, [...input.allowedWorkflows]);
    return team;
  }

  async listWorkspaceMembers(workspaceId: string) {
    this.ensureBootstrapState();
    return [...this.workspaceMembers.values()]
      .filter((member) => member.workspaceId === workspaceId)
      .map((member) => ({
        ...member,
        teamMemberships: [...this.teamMemberships.values()]
          .filter((membership) => membership.workspaceMemberId === member.id)
          .map((membership) => ({
            teamId: membership.teamId,
            teamName: this.teams.get(membership.teamId)?.name ?? membership.teamId,
            teamRole: membership.teamRole
          }))
      }))
      .sort((left, right) => left.email.localeCompare(right.email));
  }

  async upsertWorkspaceMember(workspaceId: string, input: WorkspaceMemberInput) {
    this.ensureBootstrapState();
    const existing = [...this.workspaceMembers.values()].find((member) => member.workspaceId === workspaceId && member.email.toLowerCase() === input.email.toLowerCase());
    const record: WorkspaceMemberRecord = {
      id: existing?.id ?? randomUUID(),
      workspaceId,
      email: input.email,
      displayName: input.displayName ?? null,
      workspaceRole: input.workspaceRole ?? null,
      createdAt: existing?.createdAt ?? nowIso()
    };
    this.workspaceMembers.set(record.id, record);

    for (const [id, membership] of this.teamMemberships.entries()) {
      if (membership.workspaceMemberId === record.id) {
        this.teamMemberships.delete(id);
      }
    }

    for (const membership of input.teamMemberships) {
      this.teamMemberships.set(randomUUID(), {
        id: randomUUID(),
        teamId: membership.teamId,
        workspaceMemberId: record.id,
        teamRole: membership.teamRole,
        createdAt: nowIso()
      });
    }

    return record;
  }

  async getTeamWorkflowAccess(teamId: string) {
    this.ensureBootstrapState();
    return this.teamAccess.get(teamId) ?? [];
  }

  async saveTeamWorkflowAccess(teamId: string, workflows: WorkflowTemplateId[]) {
    this.ensureBootstrapState();
    this.teamAccess.set(teamId, [...workflows]);
  }

  async getApprovalPolicies(workspaceId: string, teamId?: string | null) {
    this.ensureBootstrapState();
    return [...this.approvalPolicies.values()]
      .filter((policy) => policy.workspaceId === workspaceId && (teamId === undefined ? true : policy.teamId === (teamId ?? null)))
      .sort((left, right) => left.workflowTemplate.localeCompare(right.workflowTemplate));
  }

  async getEffectiveApprovalPolicy(workspaceId: string, teamId: string, workflowTemplate: WorkflowTemplateId) {
    this.ensureBootstrapState();
    const teamPolicy = [...this.approvalPolicies.values()].find(
      (policy) => policy.workspaceId === workspaceId && policy.teamId === teamId && policy.workflowTemplate === workflowTemplate
    );
    if (teamPolicy) return teamPolicy;

    const workspacePolicy = [...this.approvalPolicies.values()].find(
      (policy) => policy.workspaceId === workspaceId && policy.teamId === null && policy.workflowTemplate === workflowTemplate
    );
    if (workspacePolicy) return workspacePolicy;

    const fallback = createDefaultApprovalPolicy(workspaceId, workflowTemplate);
    this.approvalPolicies.set(fallback.id, fallback);
    return fallback;
  }

  async saveApprovalPolicy(workspaceId: string, input: SaveApprovalPolicyInput) {
    this.ensureBootstrapState();
    const existing = [...this.approvalPolicies.values()].find(
      (policy) => policy.workspaceId === workspaceId && policy.teamId === (input.teamId ?? null) && policy.workflowTemplate === input.workflowTemplate
    );
    const record: ApprovalPolicy = {
      id: existing?.id ?? randomUUID(),
      workspaceId,
      teamId: input.teamId ?? null,
      scopeType: input.scopeType,
      workflowTemplate: input.workflowTemplate,
      minApprovals: input.minApprovals,
      approverRoles: [...input.approverRoles],
      requireRejectNote: input.requireRejectNote,
      requireSecondApprovalForExternalWrite: input.requireSecondApprovalForExternalWrite,
      createdAt: existing?.createdAt ?? nowIso(),
      updatedAt: nowIso()
    };
    this.approvalPolicies.set(record.id, record);
    return record;
  }

  async getUsageSummary(workspaceId: string, filters: UsageFilters): Promise<UsageSummary> {
    this.ensureBootstrapState();
    const since = Date.now() - filters.windowDays * 24 * 60 * 60 * 1000;
    const scopedRuns = [...this.runs.values()].filter((run) => {
      if (run.workspaceId !== workspaceId) return false;
      if (filters.teamId && run.teamId !== filters.teamId) return false;
      if (filters.workflowTemplate && run.workflowTemplate !== filters.workflowTemplate) return false;
      return new Date(run.updatedAt).getTime() >= since;
    });

    const scopedRunIds = new Set(scopedRuns.map((run) => run.id));
    const steps = [...this.steps.values()].filter((step) => {
      if (!scopedRunIds.has(step.runId)) return false;
      if (filters.provider && step.provider !== filters.provider) return false;
      if (filters.model && step.model !== filters.model) return false;
      return true;
    });

    const byProvider = new Map<string, UsageSummary["byProvider"][number]>();
    const byTeam = new Map<string, UsageSummary["byTeam"][number]>();
    for (const step of steps) {
      const run = this.runs.get(step.runId);
      if (!run) continue;

      const providerKey = `${step.provider ?? "none"}::${step.model ?? "none"}`;
      const providerEntry = byProvider.get(providerKey) ?? {
        provider: step.provider ?? null,
        model: step.model ?? null,
        runs: 0,
        inputTokens: 0,
        outputTokens: 0,
        costUsd: 0
      };
      providerEntry.runs += 1;
      providerEntry.inputTokens += step.inputTokens ?? 0;
      providerEntry.outputTokens += step.outputTokens ?? 0;
      providerEntry.costUsd += step.costUsd ?? 0;
      byProvider.set(providerKey, providerEntry);

      const team = this.teams.get(run.teamId);
      const teamEntry = byTeam.get(run.teamId) ?? {
        teamId: run.teamId,
        teamName: team?.name ?? run.teamId,
        runs: 0,
        inputTokens: 0,
        outputTokens: 0,
        costUsd: 0
      };
      teamEntry.runs += 1;
      teamEntry.inputTokens += step.inputTokens ?? 0;
      teamEntry.outputTokens += step.outputTokens ?? 0;
      teamEntry.costUsd += step.costUsd ?? 0;
      byTeam.set(run.teamId, teamEntry);
    }

    return {
      filters,
      totalRuns: new Set(steps.map((step) => step.runId)).size,
      totalInputTokens: steps.reduce((sum, step) => sum + (step.inputTokens ?? 0), 0),
      totalOutputTokens: steps.reduce((sum, step) => sum + (step.outputTokens ?? 0), 0),
      totalCostUsd: steps.reduce((sum, step) => sum + (step.costUsd ?? 0), 0),
      byProvider: [...byProvider.values()].sort((left, right) => right.costUsd - left.costUsd),
      byTeam: [...byTeam.values()].sort((left, right) => right.costUsd - left.costUsd)
    };
  }

  async listKnowledgeSources(workspaceId: string, teamId: string) {
    this.ensureBootstrapState();
    return [...this.knowledgeSources.values()]
      .filter((source) => source.workspaceId === workspaceId && source.teamId === teamId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  async saveKnowledgeSource(workspaceId: string, createdBy: string, input: KnowledgeSourceInput) {
    this.ensureBootstrapState();
    const record: KnowledgeSource = {
      id: randomUUID(),
      workspaceId,
      teamId: input.teamId,
      name: input.name,
      sourceType: input.sourceType,
      description: input.description ?? null,
      storagePath: input.storagePath ?? null,
      originalFilename: input.originalFilename ?? null,
      mimeType: input.mimeType ?? null,
      content: input.content ?? null,
      ingestionStatus: input.ingestionStatus ?? "ready",
      ingestionNotes: input.ingestionNotes ?? null,
      createdBy,
      createdAt: nowIso()
    };
    this.knowledgeSources.set(record.id, record);
    return record;
  }

  async createTaskAndRun(task: TaskRequest) {
    this.ensureBootstrapState();
    const taskId = randomUUID();
    const runId = randomUUID();
    const createdAt = nowIso();
    const persistedTask: PersistedTask = { ...task, id: taskId, createdAt };
    const run: RunRecord = {
      id: runId,
      taskRequestId: taskId,
      workspaceId: task.workspaceId,
      teamId: task.teamId,
      status: "queued",
      title: task.title,
      taskType: task.taskType,
      workflowTemplate: task.workflowTemplate,
      targetRepo: task.targetRepo,
      targetBranch: task.targetBranch,
      branchName: null,
      failureReason: null,
      finalSummary: null,
      createdAt,
      updatedAt: createdAt
    };
    this.tasks.set(taskId, persistedTask);
    this.runs.set(runId, run);
    await this.addRunEvent({
      runId,
      eventType: "run.queued",
      status: "queued",
      summary: "Run accepted and queued for worker execution."
    });
    return this.getRunDetail(runId).then((detail) => {
      if (!detail) throw new Error("Unable to hydrate run after insert.");
      return detail;
    });
  }

  async listRuns(scope?: { workspaceId?: string; teamId?: string | null }) {
    return [...this.runs.values()]
      .filter((run) => {
        if (scope?.workspaceId && run.workspaceId !== scope.workspaceId) return false;
        if (scope?.teamId && run.teamId !== scope.teamId) return false;
        return true;
      })
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  async listRunsByStatus(statuses: RunStatus[], scope?: { workspaceId?: string; teamId?: string | null }) {
    return [...this.runs.values()].filter((run) => {
      if (!statuses.includes(run.status)) return false;
      if (scope?.workspaceId && run.workspaceId !== scope.workspaceId) return false;
      if (scope?.teamId && run.teamId !== scope.teamId) return false;
      return true;
    });
  }

  async listPendingApprovalRuns(scope?: { workspaceId?: string; teamId?: string | null }) {
    return [...this.runs.values()]
      .filter((run) => {
        if (run.status !== "pending_human") return false;
        if (scope?.workspaceId && run.workspaceId !== scope.workspaceId) return false;
        if (scope?.teamId && run.teamId !== scope.teamId) return false;
        return true;
      })
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  async getRunDetail(runId: string) {
    const run = this.runs.get(runId);
    if (!run) return null;
    const task = this.tasks.get(run.taskRequestId);
    if (!task) return null;
    return {
      run,
      task,
      steps: sortSteps([...this.steps.values()].filter((step) => step.runId === runId)),
      artifacts: sortByCreatedAtAsc([...this.artifacts.values()].filter((artifact) => artifact.runId === runId)),
      approvals: sortByCreatedAtAsc([...this.approvals.values()].filter((approval) => approval.runId === runId)),
      events: sortByCreatedAtAsc([...this.events.values()].filter((event) => event.runId === runId)),
      toolCalls: sortByCreatedAtAsc([...this.toolCalls.values()].filter((toolCall) => toolCall.runId === runId))
    };
  }

  async deleteRun(runId: string) {
    const run = this.runs.get(runId);
    if (!run) return false;

    for (const [id, step] of this.steps.entries()) {
      if (step.runId === runId) this.steps.delete(id);
    }
    for (const [id, event] of this.events.entries()) {
      if (event.runId === runId) this.events.delete(id);
    }
    for (const [id, artifact] of this.artifacts.entries()) {
      if (artifact.runId === runId) this.artifacts.delete(id);
    }
    for (const [id, approval] of this.approvals.entries()) {
      if (approval.runId === runId) this.approvals.delete(id);
    }
    for (const [id, toolCall] of this.toolCalls.entries()) {
      if (toolCall.runId === runId) this.toolCalls.delete(id);
    }

    this.runs.delete(runId);
    this.tasks.delete(run.taskRequestId);
    return true;
  }

  async updateRun(runId: string, patch: Partial<Pick<RunRecord, "status" | "branchName" | "failureReason" | "finalSummary">>) {
    const run = this.runs.get(runId);
    if (!run) return;
    this.runs.set(runId, {
      ...run,
      ...patch,
      updatedAt: nowIso()
    });
  }

  async createRunStep(input: { runId: string; role: AgentRole; status: StepStatus; input?: string | null } & StepWriteFields) {
    const step: StepRecord = {
      id: randomUUID(),
      runId: input.runId,
      role: input.role,
      status: input.status,
      summary: null,
      input: input.input ?? null,
      output: null,
      error: null,
      provider: input.provider ?? null,
      model: input.model ?? null,
      executionMode: input.executionMode ?? null,
      inputTokens: input.inputTokens ?? null,
      outputTokens: input.outputTokens ?? null,
      costUsd: input.costUsd ?? null,
      startedAt: nowIso(),
      endedAt: null
    };
    this.steps.set(step.id, step);
    return step;
  }

  async updateRunStep(stepId: string, patch: Partial<Pick<StepRecord, "status" | "summary" | "output" | "error" | "endedAt"> & StepWriteFields>) {
    const step = this.steps.get(stepId);
    if (!step) return;
    this.steps.set(stepId, {
      ...step,
      ...patch,
      provider: patch.provider === undefined ? step.provider : patch.provider,
      model: patch.model === undefined ? step.model : patch.model,
      executionMode: patch.executionMode === undefined ? step.executionMode : patch.executionMode,
      inputTokens: patch.inputTokens === undefined ? step.inputTokens : patch.inputTokens,
      outputTokens: patch.outputTokens === undefined ? step.outputTokens : patch.outputTokens,
      costUsd: patch.costUsd === undefined ? step.costUsd : patch.costUsd
    });
  }

  async addRunEvent(input: {
    runId: string;
    stepId?: string | null;
    role?: AgentRole | null;
    eventType: RunEventType;
    status?: RunStatus | null;
    summary: string;
    payload?: string | null;
  }) {
    const event: RunEventRecord = {
      id: randomUUID(),
      runId: input.runId,
      stepId: input.stepId ?? null,
      role: input.role ?? null,
      eventType: input.eventType,
      status: input.status ?? null,
      summary: input.summary,
      payload: input.payload ?? null,
      createdAt: nowIso()
    };
    this.events.set(event.id, event);
    return event;
  }

  async addArtifact(input: { runId: string; artifactType: ArtifactType; title: string; content: string }) {
    const run = this.runs.get(input.runId);
    if (!run) {
      throw new Error(`Run not found for artifact: ${input.runId}`);
    }
    const artifact: ArtifactRecord = {
      id: randomUUID(),
      runId: input.runId,
      artifactType: input.artifactType,
      title: input.title,
      content: input.content,
      createdAt: nowIso()
    };
    this.artifacts.set(artifact.id, artifact);
    return artifact;
  }

  async addToolCall(input: {
    runId: string;
    stepId?: string | null;
    toolName: string;
    category: "read" | "write" | "high-risk";
    status: "planned" | "completed" | "blocked" | "failed";
    input?: string | null;
    output?: string | null;
  }) {
    const run = this.runs.get(input.runId);
    if (!run) {
      throw new Error(`Run not found for tool call: ${input.runId}`);
    }
    const toolCall: ToolCallRecord = {
      id: randomUUID(),
      runId: input.runId,
      stepId: input.stepId ?? null,
      toolName: input.toolName,
      category: input.category,
      status: input.status,
      input: input.input ?? null,
      output: input.output ?? null,
      createdAt: nowIso()
    };
    this.toolCalls.set(toolCall.id, toolCall);
    return toolCall;
  }

  async requestApproval(runId: string) {
    const run = this.runs.get(runId);
    if (!run) {
      throw new Error(`Run not found for approval: ${runId}`);
    }
    const approval: ApprovalRecord = {
      id: randomUUID(),
      runId,
      action: null,
      reviewer: null,
      notes: null,
      createdAt: nowIso(),
      updatedAt: nowIso()
    };
    this.approvals.set(approval.id, approval);
    return approval;
  }

  async setApproval(runId: string, action: ApprovalAction, reviewer: string, notes?: string | null) {
    const pending = [...this.approvals.values()].reverse().find((approval) => approval.runId === runId && approval.action === null);
    const record: ApprovalRecord = {
      id: pending?.id ?? randomUUID(),
      runId,
      action,
      reviewer,
      notes: notes ?? null,
      createdAt: pending?.createdAt ?? nowIso(),
      updatedAt: nowIso()
    };
    this.approvals.set(record.id, record);
    return record;
  }

  async getGitHubSettings(teamId?: string | null) {
    return {
      ...this.githubSettings,
      allowedRepos: teamId ? this.githubSettings.allowedRepos.filter((repo) => repo.teamId === teamId) : this.githubSettings.allowedRepos
    };
  }

  async saveGitHubSettings(settings: GitHubAppSettings, allowedRepos: GitHubRepoConnection[]) {
    this.githubSettings = {
      appId: settings.appId,
      installationId: settings.installationId,
      appSlug: settings.appSlug ?? null,
      privateKeyEncrypted: settings.privateKeyPem,
      allowedRepos
    };
  }

  async getDashboardSummary(scope?: { workspaceId?: string; teamId?: string | null }) {
    const runs = await this.listRuns(scope);
    return {
      totalRuns: runs.length,
      pendingApprovals: runs.filter((run) => run.status === "pending_human").length,
      activeRuns: runs.filter((run) => ["routing", "planning", "executing", "reviewing"].includes(run.status)).length,
      failedRuns: runs.filter((run) => run.status === "failed").length
    };
  }

  async getModelPolicies() {
    return this.policies;
  }
}

class PostgresStorage implements StorageAdapter {
  readonly mode = "postgres" as const;

  private client;
  private database;
  private bootstrapReady = false;

  constructor(databaseUrl: string) {
    this.client = postgres(databaseUrl, { prepare: false });
    this.database = drizzle(this.client, {
      schema: {
        appSettings,
        approvalPolicies,
        approvals,
        artifacts,
        knowledgeSources,
        modelPolicies,
        repoConnections,
        runEvents,
        runSteps,
        runs,
        taskRequests,
        teamMembers,
        teamWorkflowAccess,
        teams,
        toolCalls,
        workspaceMembers,
        workspaces
      }
    });
  }

  private async ensureBootstrapState() {
    if (this.bootstrapReady) return;

    const workspaceRow = await this.database.query.workspaces.findFirst();
    if (!workspaceRow) {
      const createdAt = new Date();
      await this.database.transaction(async (tx) => {
        await tx.insert(workspaces).values({
          id: "workspace_default",
          name: "Default Workspace",
          slug: "default-workspace",
          createdAt
        });

        await tx.insert(teams).values({
          id: "team_default",
          workspaceId: "workspace_default",
          name: "Operations",
          slug: "operations",
          description: "Default team for Workgate bootstrap.",
          createdAt
        });

        await tx.insert(teamWorkflowAccess).values(
          activeWorkflowTemplates.map((workflowTemplate) => ({
            id: randomUUID(),
            teamId: "team_default",
            workflowTemplate,
            createdAt
          }))
        );

        await tx.insert(approvalPolicies).values(
          defaultApprovalPolicies.map((policy) => ({
            id: randomUUID(),
            workspaceId: "workspace_default",
            teamId: null,
            scopeType: policy.scopeType,
            workflowTemplate: policy.workflowTemplate,
            minApprovals: policy.minApprovals,
            approverRoles: policy.approverRoles,
            requireRejectNote: policy.requireRejectNote,
            requireSecondApprovalForExternalWrite: policy.requireSecondApprovalForExternalWrite,
            createdAt,
            updatedAt: createdAt
          }))
        );
      });
    } else {
      const defaultTeam = await this.database.query.teams.findFirst({ where: eq(teams.id, "team_default") });
      if (!defaultTeam) {
        const createdAt = new Date();
        await this.database.insert(teams).values({
          id: "team_default",
          workspaceId: workspaceRow.id,
          name: "Operations",
          slug: "operations",
          description: "Default team for Workgate bootstrap.",
          createdAt
        });
      }
    }

    this.bootstrapReady = true;
  }

  async ensureBootstrapWorkspace() {
    await this.ensureBootstrapState();
    const workspaceRow = (await this.database.query.workspaces.findFirst())!;
    const defaultTeamRow =
      (await this.database.query.teams.findFirst({ where: eq(teams.id, "team_default") })) ??
      (await this.database.query.teams.findFirst({ where: eq(teams.workspaceId, workspaceRow.id) }))!;
    return {
      workspace: hydrateWorkspace(workspaceRow),
      defaultTeam: hydrateTeam(defaultTeamRow)
    };
  }

  async getWorkspaceContextByEmail(email: string) {
    await this.ensureBootstrapState();
    const workspaceRow = await this.database.query.workspaces.findFirst();
    if (!workspaceRow) return null;
    const members = await this.database.select().from(workspaceMembers).where(eq(workspaceMembers.workspaceId, workspaceRow.id));
    const memberRow = members.find((member) => member.email.toLowerCase() === email.toLowerCase());
    if (!memberRow) return null;

    const membershipRows = await this.database.select().from(teamMembers).where(eq(teamMembers.workspaceMemberId, memberRow.id));
    const teamRows =
      membershipRows.length > 0 ? await this.database.select().from(teams).where(inArray(teams.id, membershipRows.map((membership) => membership.teamId))) : [];
    const teamsById = new Map(teamRows.map((team) => [team.id, team]));

    return {
      workspace: hydrateWorkspace(workspaceRow),
      member: hydrateWorkspaceMember(memberRow),
      teams: membershipRows
        .map((membership) => {
          const team = teamsById.get(membership.teamId);
          if (!team) return null;
          return {
            ...hydrateTeam(team),
            teamRole: membership.teamRole as SessionTeam["teamRole"]
          } satisfies SessionTeam;
        })
        .filter((item): item is SessionTeam => Boolean(item))
    };
  }

  async listTeams(workspaceId: string) {
    await this.ensureBootstrapState();
    const rows = await this.database.select().from(teams).where(eq(teams.workspaceId, workspaceId)).orderBy(asc(teams.name));
    return rows.map(hydrateTeam);
  }

  async createTeam(workspaceId: string, input: TeamManagementInput) {
    await this.ensureBootstrapState();
    const id = randomUUID();
    const createdAt = new Date();
    await this.database.insert(teams).values({
      id,
      workspaceId,
      name: input.name,
      slug: input.slug,
      description: input.description ?? null,
      createdAt
    });
    if (input.allowedWorkflows.length > 0) {
      await this.database.insert(teamWorkflowAccess).values(
        input.allowedWorkflows.map((workflowTemplate) => ({
          id: randomUUID(),
          teamId: id,
          workflowTemplate,
          createdAt
        }))
      );
    }
    return {
      id,
      workspaceId,
      name: input.name,
      slug: input.slug,
      description: input.description ?? null,
      createdAt: createdAt.toISOString()
    };
  }

  async listWorkspaceMembers(workspaceId: string) {
    await this.ensureBootstrapState();
    const [memberRows, membershipRows, teamRows] = await Promise.all([
      this.database.select().from(workspaceMembers).where(eq(workspaceMembers.workspaceId, workspaceId)),
      this.database.select().from(teamMembers),
      this.database.select().from(teams).where(eq(teams.workspaceId, workspaceId))
    ]);
    const teamsById = new Map(teamRows.map((team) => [team.id, team]));

    return memberRows
      .map((member) => ({
        ...hydrateWorkspaceMember(member),
        teamMemberships: membershipRows
          .filter((membership) => membership.workspaceMemberId === member.id)
          .map((membership) => ({
            teamId: membership.teamId,
            teamName: teamsById.get(membership.teamId)?.name ?? membership.teamId,
            teamRole: membership.teamRole as SessionTeam["teamRole"]
          }))
      }))
      .sort((left, right) => left.email.localeCompare(right.email));
  }

  async upsertWorkspaceMember(workspaceId: string, input: WorkspaceMemberInput) {
    await this.ensureBootstrapState();
    const existingRows = await this.database.select().from(workspaceMembers).where(eq(workspaceMembers.workspaceId, workspaceId));
    const existing = existingRows.find((row) => row.email.toLowerCase() === input.email.toLowerCase());
    const createdAt = existing?.createdAt ?? new Date();
    const memberId = existing?.id ?? randomUUID();

    if (existing) {
      await this.database
        .update(workspaceMembers)
        .set({
          email: input.email,
          displayName: input.displayName ?? null,
          workspaceRole: input.workspaceRole ?? null
        })
        .where(eq(workspaceMembers.id, memberId));
    } else {
      await this.database.insert(workspaceMembers).values({
        id: memberId,
        workspaceId,
        email: input.email,
        displayName: input.displayName ?? null,
        workspaceRole: input.workspaceRole ?? null,
        createdAt
      });
    }

    const existingMemberships = await this.database.select().from(teamMembers).where(eq(teamMembers.workspaceMemberId, memberId));
    await Promise.all(existingMemberships.map((membership) => this.database.delete(teamMembers).where(eq(teamMembers.id, membership.id))));

    await this.database.insert(teamMembers).values(
      input.teamMemberships.map((membership) => ({
        id: randomUUID(),
        teamId: membership.teamId,
        workspaceMemberId: memberId,
        teamRole: membership.teamRole,
        createdAt: new Date()
      }))
    );

    return {
      id: memberId,
      workspaceId,
      email: input.email,
      displayName: input.displayName ?? null,
      workspaceRole: input.workspaceRole ?? null,
      createdAt: createdAt.toISOString()
    };
  }

  async getTeamWorkflowAccess(teamId: string) {
    await this.ensureBootstrapState();
    const rows = await this.database.select().from(teamWorkflowAccess).where(eq(teamWorkflowAccess.teamId, teamId));
    return rows.map((row) => row.workflowTemplate as WorkflowTemplateId);
  }

  async saveTeamWorkflowAccess(teamId: string, workflows: WorkflowTemplateId[]) {
    await this.ensureBootstrapState();
    const existing = await this.database.select().from(teamWorkflowAccess).where(eq(teamWorkflowAccess.teamId, teamId));
    await Promise.all(existing.map((row) => this.database.delete(teamWorkflowAccess).where(eq(teamWorkflowAccess.id, row.id))));
    if (workflows.length > 0) {
      await this.database.insert(teamWorkflowAccess).values(
        workflows.map((workflowTemplate) => ({
          id: randomUUID(),
          teamId,
          workflowTemplate,
          createdAt: new Date()
        }))
      );
    }
  }

  async getApprovalPolicies(workspaceId: string, teamId?: string | null) {
    await this.ensureBootstrapState();
    const rows = await this.database.select().from(approvalPolicies).where(eq(approvalPolicies.workspaceId, workspaceId));
    return rows
      .filter((row) => (teamId === undefined ? true : row.teamId === (teamId ?? null)))
      .map((row) => ({
        id: row.id,
        workspaceId: row.workspaceId,
        teamId: row.teamId,
        scopeType: row.scopeType as ApprovalPolicy["scopeType"],
        workflowTemplate: row.workflowTemplate as ApprovalPolicy["workflowTemplate"],
        minApprovals: row.minApprovals,
        approverRoles: row.approverRoles as ApprovalPolicy["approverRoles"],
        requireRejectNote: row.requireRejectNote,
        requireSecondApprovalForExternalWrite: row.requireSecondApprovalForExternalWrite,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString()
      }));
  }

  async getEffectiveApprovalPolicy(workspaceId: string, teamId: string, workflowTemplate: WorkflowTemplateId) {
    await this.ensureBootstrapState();
    const policies = await this.getApprovalPolicies(workspaceId);
    const teamPolicy = policies.find((policy) => policy.teamId === teamId && policy.workflowTemplate === workflowTemplate);
    if (teamPolicy) return teamPolicy;
    const workspacePolicy = policies.find((policy) => policy.teamId === null && policy.workflowTemplate === workflowTemplate);
    if (workspacePolicy) return workspacePolicy;
    const fallback = createDefaultApprovalPolicy(workspaceId, workflowTemplate);
    await this.database.insert(approvalPolicies).values({
      id: fallback.id,
      workspaceId: fallback.workspaceId,
      teamId: null,
      scopeType: fallback.scopeType,
      workflowTemplate: fallback.workflowTemplate,
      minApprovals: fallback.minApprovals,
      approverRoles: fallback.approverRoles,
      requireRejectNote: fallback.requireRejectNote,
      requireSecondApprovalForExternalWrite: fallback.requireSecondApprovalForExternalWrite,
      createdAt: new Date(fallback.createdAt),
      updatedAt: new Date(fallback.updatedAt)
    });
    return fallback;
  }

  async saveApprovalPolicy(workspaceId: string, input: SaveApprovalPolicyInput) {
    await this.ensureBootstrapState();
    const existing = (
      await this.database.select().from(approvalPolicies).where(eq(approvalPolicies.workspaceId, workspaceId))
    ).find((policy) => policy.teamId === (input.teamId ?? null) && policy.workflowTemplate === input.workflowTemplate);

    const createdAt = existing?.createdAt ?? new Date();
    const id = existing?.id ?? randomUUID();
    if (existing) {
      await this.database
        .update(approvalPolicies)
        .set({
          scopeType: input.scopeType,
          workflowTemplate: input.workflowTemplate,
          minApprovals: input.minApprovals,
          approverRoles: input.approverRoles,
          requireRejectNote: input.requireRejectNote,
          requireSecondApprovalForExternalWrite: input.requireSecondApprovalForExternalWrite,
          updatedAt: new Date()
        })
        .where(eq(approvalPolicies.id, id));
    } else {
      await this.database.insert(approvalPolicies).values({
        id,
        workspaceId,
        teamId: input.teamId ?? null,
        scopeType: input.scopeType,
        workflowTemplate: input.workflowTemplate,
        minApprovals: input.minApprovals,
        approverRoles: input.approverRoles,
        requireRejectNote: input.requireRejectNote,
        requireSecondApprovalForExternalWrite: input.requireSecondApprovalForExternalWrite,
        createdAt,
        updatedAt: new Date()
      });
    }

    return {
      id,
      workspaceId,
      teamId: input.teamId ?? null,
      scopeType: input.scopeType,
      workflowTemplate: input.workflowTemplate,
      minApprovals: input.minApprovals,
      approverRoles: input.approverRoles,
      requireRejectNote: input.requireRejectNote,
      requireSecondApprovalForExternalWrite: input.requireSecondApprovalForExternalWrite,
      createdAt: createdAt.toISOString(),
      updatedAt: new Date().toISOString()
    };
  }

  async getUsageSummary(workspaceId: string, filters: UsageFilters): Promise<UsageSummary> {
    await this.ensureBootstrapState();
    const since = new Date(Date.now() - filters.windowDays * 24 * 60 * 60 * 1000);
    const runRows = await this.database.select().from(runs).where(eq(runs.workspaceId, workspaceId));
    const scopedRuns = runRows.filter((run) => {
      if (filters.teamId && run.teamId !== filters.teamId) return false;
      if (filters.workflowTemplate && run.workflowTemplate !== filters.workflowTemplate) return false;
      return run.updatedAt >= since;
    });
    const runIds = scopedRuns.map((run) => run.id);
    if (runIds.length === 0) {
      return {
        filters,
        totalRuns: 0,
        totalInputTokens: 0,
        totalOutputTokens: 0,
        totalCostUsd: 0,
        byProvider: [],
        byTeam: []
      };
    }

    const [stepRows, teamRows] = await Promise.all([
      this.database.select().from(runSteps).where(inArray(runSteps.runId, runIds)),
      this.database.select().from(teams).where(eq(teams.workspaceId, workspaceId))
    ]);

    const scopedSteps = stepRows.filter((step) => {
      if (filters.provider && step.provider !== filters.provider) return false;
      if (filters.model && step.model !== filters.model) return false;
      return true;
    });

    const teamNames = new Map(teamRows.map((team) => [team.id, team.name]));
    const byProvider = new Map<string, UsageSummary["byProvider"][number]>();
    const byTeam = new Map<string, UsageSummary["byTeam"][number]>();
    for (const step of scopedSteps) {
      const run = scopedRuns.find((item) => item.id === step.runId);
      if (!run) continue;
      const providerKey = `${step.provider ?? "none"}::${step.model ?? "none"}`;
      const providerEntry = byProvider.get(providerKey) ?? {
        provider: (step.provider as UsageSummary["byProvider"][number]["provider"]) ?? null,
        model: step.model ?? null,
        runs: 0,
        inputTokens: 0,
        outputTokens: 0,
        costUsd: 0
      };
      providerEntry.runs += 1;
      providerEntry.inputTokens += step.inputTokens ?? 0;
      providerEntry.outputTokens += step.outputTokens ?? 0;
      providerEntry.costUsd += parseNullableNumber(step.costUsd) ?? 0;
      byProvider.set(providerKey, providerEntry);

      const teamEntry = byTeam.get(run.teamId) ?? {
        teamId: run.teamId,
        teamName: teamNames.get(run.teamId) ?? run.teamId,
        runs: 0,
        inputTokens: 0,
        outputTokens: 0,
        costUsd: 0
      };
      teamEntry.runs += 1;
      teamEntry.inputTokens += step.inputTokens ?? 0;
      teamEntry.outputTokens += step.outputTokens ?? 0;
      teamEntry.costUsd += parseNullableNumber(step.costUsd) ?? 0;
      byTeam.set(run.teamId, teamEntry);
    }

    return {
      filters,
      totalRuns: new Set(scopedSteps.map((step) => step.runId)).size,
      totalInputTokens: scopedSteps.reduce((sum, step) => sum + (step.inputTokens ?? 0), 0),
      totalOutputTokens: scopedSteps.reduce((sum, step) => sum + (step.outputTokens ?? 0), 0),
      totalCostUsd: scopedSteps.reduce((sum, step) => sum + (parseNullableNumber(step.costUsd) ?? 0), 0),
      byProvider: [...byProvider.values()].sort((left, right) => right.costUsd - left.costUsd),
      byTeam: [...byTeam.values()].sort((left, right) => right.costUsd - left.costUsd)
    };
  }

  async listKnowledgeSources(workspaceId: string, teamId: string) {
    await this.ensureBootstrapState();
    const rows = await this.database
      .select()
      .from(knowledgeSources)
      .where(eq(knowledgeSources.workspaceId, workspaceId))
      .orderBy(desc(knowledgeSources.createdAt));
    return rows
      .filter((row) => row.teamId === teamId)
      .map((row) => ({
        id: row.id,
        workspaceId: row.workspaceId,
        teamId: row.teamId,
        name: row.name,
        sourceType: row.sourceType as KnowledgeSource["sourceType"],
        description: row.description,
        storagePath: row.storagePath,
        originalFilename: row.originalFilename,
        mimeType: row.mimeType,
        content: row.content,
        ingestionStatus: row.ingestionStatus as KnowledgeSource["ingestionStatus"],
        ingestionNotes: row.ingestionNotes,
        createdBy: row.createdBy,
        createdAt: row.createdAt.toISOString()
      }));
  }

  async saveKnowledgeSource(workspaceId: string, createdBy: string, input: KnowledgeSourceInput) {
    await this.ensureBootstrapState();
    const id = randomUUID();
    const createdAt = new Date();
    await this.database.insert(knowledgeSources).values({
      id,
      workspaceId,
      teamId: input.teamId,
      name: input.name,
      sourceType: input.sourceType,
      description: input.description ?? null,
      storagePath: input.storagePath ?? null,
      originalFilename: input.originalFilename ?? null,
      mimeType: input.mimeType ?? null,
      content: input.content ?? null,
      ingestionStatus: input.ingestionStatus ?? "ready",
      ingestionNotes: input.ingestionNotes ?? null,
      createdBy,
      createdAt
    });
    return {
      id,
      workspaceId,
      teamId: input.teamId,
      name: input.name,
      sourceType: input.sourceType,
      description: input.description ?? null,
      storagePath: input.storagePath ?? null,
      originalFilename: input.originalFilename ?? null,
      mimeType: input.mimeType ?? null,
      content: input.content ?? null,
      ingestionStatus: input.ingestionStatus ?? "ready",
      ingestionNotes: input.ingestionNotes ?? null,
      createdBy,
      createdAt: createdAt.toISOString()
    };
  }

  async createTaskAndRun(task: TaskRequest) {
    await this.ensureBootstrapState();
    const taskId = randomUUID();
    const runId = randomUUID();
    const createdAt = new Date();

    await this.database.transaction(async (tx) => {
      await tx.insert(taskRequests).values({
        id: taskId,
        workspaceId: task.workspaceId,
        teamId: task.teamId,
        createdBy: task.createdBy,
        title: task.title,
        goal: task.goal,
        taskType: task.taskType,
        workflowTemplate: task.workflowTemplate,
        workflowInput: task.workflowInput as Record<string, unknown>,
        targetRepo: task.targetRepo,
        targetBranch: task.targetBranch,
        constraints: task.constraints,
        acceptanceCriteria: task.acceptanceCriteria,
        attachments: task.attachments,
        createdAt
      });

      await tx.insert(runs).values({
        id: runId,
        taskRequestId: taskId,
        workspaceId: task.workspaceId,
        teamId: task.teamId,
        status: "queued",
        title: task.title,
        taskType: task.taskType,
        workflowTemplate: task.workflowTemplate,
        targetRepo: task.targetRepo,
        targetBranch: task.targetBranch,
        branchName: null,
        failureReason: null,
        finalSummary: null,
        createdAt,
        updatedAt: createdAt
      });

      await tx.insert(runEvents).values({
        id: randomUUID(),
        runId,
        workspaceId: task.workspaceId,
        teamId: task.teamId,
        stepId: null,
        role: null,
        eventType: "run.queued",
        status: "queued",
        summary: "Run accepted and queued for worker execution.",
        payload: null,
        createdAt
      });
    });

    const detail = await this.getRunDetail(runId);
    if (!detail) {
      throw new Error("Unable to hydrate run after insert.");
    }
    return detail;
  }

  async listRuns(scope?: { workspaceId?: string; teamId?: string | null }) {
    await this.ensureBootstrapState();
    let rows = await this.database.select().from(runs).orderBy(desc(runs.createdAt));
    if (scope?.workspaceId) {
      rows = rows.filter((row) => row.workspaceId === scope.workspaceId);
    }
    if (scope?.teamId) {
      rows = rows.filter((row) => row.teamId === scope.teamId);
    }
    return rows.map(hydrateRun);
  }

  async listRunsByStatus(statuses: RunStatus[], scope?: { workspaceId?: string; teamId?: string | null }) {
    if (statuses.length === 0) return [];
    let rows = await this.database.select().from(runs).where(inArray(runs.status, statuses)).orderBy(desc(runs.updatedAt));
    if (scope?.workspaceId) {
      rows = rows.filter((row) => row.workspaceId === scope.workspaceId);
    }
    if (scope?.teamId) {
      rows = rows.filter((row) => row.teamId === scope.teamId);
    }
    return rows.map(hydrateRun);
  }

  async listPendingApprovalRuns(scope?: { workspaceId?: string; teamId?: string | null }) {
    let rows = await this.database.select().from(runs).where(eq(runs.status, "pending_human")).orderBy(desc(runs.updatedAt));
    if (scope?.workspaceId) {
      rows = rows.filter((row) => row.workspaceId === scope.workspaceId);
    }
    if (scope?.teamId) {
      rows = rows.filter((row) => row.teamId === scope.teamId);
    }
    return rows.map(hydrateRun);
  }

  async getRunDetail(runId: string) {
    const runRow = await this.database.query.runs.findFirst({ where: eq(runs.id, runId) });
    if (!runRow) return null;
    const taskRow = await this.database.query.taskRequests.findFirst({ where: eq(taskRequests.id, runRow.taskRequestId) });
    if (!taskRow) return null;
    const [stepRows, artifactRows, approvalRows, eventRows, toolRows] = await Promise.all([
      this.database.select().from(runSteps).where(eq(runSteps.runId, runId)).orderBy(asc(runSteps.startedAt), asc(runSteps.id)),
      this.database.select().from(artifacts).where(eq(artifacts.runId, runId)).orderBy(asc(artifacts.createdAt), asc(artifacts.id)),
      this.database.select().from(approvals).where(eq(approvals.runId, runId)).orderBy(asc(approvals.createdAt), asc(approvals.id)),
      this.database.select().from(runEvents).where(eq(runEvents.runId, runId)).orderBy(asc(runEvents.createdAt), asc(runEvents.id)),
      this.database.select().from(toolCalls).where(eq(toolCalls.runId, runId)).orderBy(asc(toolCalls.createdAt), asc(toolCalls.id))
    ]);
    return {
      run: hydrateRun(runRow),
      task: hydrateTask(taskRow),
      steps: stepRows.map(hydrateStep),
      artifacts: artifactRows.map(hydrateArtifact),
      approvals: approvalRows.map(hydrateApproval),
      events: eventRows.map(hydrateRunEvent),
      toolCalls: toolRows.map(hydrateToolCall)
    };
  }

  async deleteRun(runId: string) {
    const runRow = await this.database.query.runs.findFirst({ where: eq(runs.id, runId) });
    if (!runRow) return false;

    await this.database.transaction(async (tx) => {
      await tx.delete(toolCalls).where(eq(toolCalls.runId, runId));
      await tx.delete(runEvents).where(eq(runEvents.runId, runId));
      await tx.delete(approvals).where(eq(approvals.runId, runId));
      await tx.delete(artifacts).where(eq(artifacts.runId, runId));
      await tx.delete(runSteps).where(eq(runSteps.runId, runId));
      await tx.delete(runs).where(eq(runs.id, runId));
      await tx.delete(taskRequests).where(eq(taskRequests.id, runRow.taskRequestId));
    });

    return true;
  }

  async updateRun(runId: string, patch: Partial<Pick<RunRecord, "status" | "branchName" | "failureReason" | "finalSummary">>) {
    await this.database
      .update(runs)
      .set({
        status: patch.status,
        branchName: patch.branchName,
        failureReason: patch.failureReason,
        finalSummary: patch.finalSummary,
        updatedAt: new Date()
      })
      .where(eq(runs.id, runId));
  }

  async createRunStep(input: { runId: string; role: AgentRole; status: StepStatus; input?: string | null } & StepWriteFields) {
    const run = await this.database.query.runs.findFirst({ where: eq(runs.id, input.runId) });
    if (!run) {
      throw new Error(`Run not found for step insert: ${input.runId}`);
    }
    const id = randomUUID();
    const startedAt = new Date();
    await this.database.insert(runSteps).values({
      id,
      runId: input.runId,
      role: input.role,
      status: input.status,
      summary: null,
      input: input.input ?? null,
      output: null,
      error: null,
      provider: input.provider ?? null,
      model: input.model ?? null,
      executionMode: input.executionMode ?? null,
      inputTokens: input.inputTokens ?? null,
      outputTokens: input.outputTokens ?? null,
      costUsd: input.costUsd === null || input.costUsd === undefined ? null : input.costUsd.toFixed(6),
      startedAt,
      endedAt: null
    });
    return {
      id,
      runId: input.runId,
      role: input.role,
      status: input.status,
      summary: null,
      input: input.input ?? null,
      output: null,
      error: null,
      provider: input.provider ?? null,
      model: input.model ?? null,
      executionMode: input.executionMode ?? null,
      inputTokens: input.inputTokens ?? null,
      outputTokens: input.outputTokens ?? null,
      costUsd: input.costUsd ?? null,
      startedAt: startedAt.toISOString(),
      endedAt: null
    };
  }

  async updateRunStep(stepId: string, patch: Partial<Pick<StepRecord, "status" | "summary" | "output" | "error" | "endedAt"> & StepWriteFields>) {
    await this.database
      .update(runSteps)
      .set({
        status: patch.status,
        summary: patch.summary,
        output: patch.output,
        error: patch.error,
        provider: patch.provider ?? undefined,
        model: patch.model ?? undefined,
        executionMode: patch.executionMode ?? undefined,
        inputTokens: patch.inputTokens ?? undefined,
        outputTokens: patch.outputTokens ?? undefined,
        costUsd: patch.costUsd === undefined ? undefined : patch.costUsd === null ? null : patch.costUsd.toFixed(6),
        endedAt: patch.endedAt ? new Date(patch.endedAt) : undefined
      })
      .where(eq(runSteps.id, stepId));
  }

  async addRunEvent(input: {
    runId: string;
    stepId?: string | null;
    role?: AgentRole | null;
    eventType: RunEventType;
    status?: RunStatus | null;
    summary: string;
    payload?: string | null;
  }) {
    const run = await this.database.query.runs.findFirst({ where: eq(runs.id, input.runId) });
    if (!run) {
      throw new Error(`Run not found for event insert: ${input.runId}`);
    }
    const id = randomUUID();
    const createdAt = new Date();
    await this.database.insert(runEvents).values({
      id,
      runId: input.runId,
      workspaceId: run.workspaceId,
      teamId: run.teamId,
      stepId: input.stepId ?? null,
      role: input.role ?? null,
      eventType: input.eventType,
      status: input.status ?? null,
      summary: input.summary,
      payload: input.payload ?? null,
      createdAt
    });
    return {
      id,
      runId: input.runId,
      stepId: input.stepId ?? null,
      role: input.role ?? null,
      eventType: input.eventType,
      status: input.status ?? null,
      summary: input.summary,
      payload: input.payload ?? null,
      createdAt: createdAt.toISOString()
    };
  }

  async addArtifact(input: { runId: string; artifactType: ArtifactType; title: string; content: string }) {
    const run = await this.database.query.runs.findFirst({ where: eq(runs.id, input.runId) });
    if (!run) {
      throw new Error(`Run not found for artifact insert: ${input.runId}`);
    }
    const id = randomUUID();
    const createdAt = new Date();
    await this.database.insert(artifacts).values({
      id,
      runId: input.runId,
      workspaceId: run.workspaceId,
      teamId: run.teamId,
      artifactType: input.artifactType,
      title: input.title,
      content: input.content,
      createdAt
    });
    return {
      id,
      runId: input.runId,
      artifactType: input.artifactType,
      title: input.title,
      content: input.content,
      createdAt: createdAt.toISOString()
    };
  }

  async addToolCall(input: {
    runId: string;
    stepId?: string | null;
    toolName: string;
    category: "read" | "write" | "high-risk";
    status: "planned" | "completed" | "blocked" | "failed";
    input?: string | null;
    output?: string | null;
  }) {
    const run = await this.database.query.runs.findFirst({ where: eq(runs.id, input.runId) });
    if (!run) {
      throw new Error(`Run not found for tool call insert: ${input.runId}`);
    }
    const id = randomUUID();
    const createdAt = new Date();
    await this.database.insert(toolCalls).values({
      id,
      runId: input.runId,
      workspaceId: run.workspaceId,
      teamId: run.teamId,
      stepId: input.stepId ?? null,
      toolName: input.toolName,
      category: input.category,
      status: input.status,
      input: input.input ?? null,
      output: input.output ?? null,
      createdAt
    });
    return {
      id,
      runId: input.runId,
      stepId: input.stepId ?? null,
      toolName: input.toolName,
      category: input.category,
      status: input.status,
      input: input.input ?? null,
      output: input.output ?? null,
      createdAt: createdAt.toISOString()
    };
  }

  async requestApproval(runId: string) {
    const run = await this.database.query.runs.findFirst({ where: eq(runs.id, runId) });
    if (!run) {
      throw new Error(`Run not found for approval: ${runId}`);
    }
    const id = randomUUID();
    const createdAt = new Date();
    await this.database.insert(approvals).values({
      id,
      runId,
      workspaceId: run.workspaceId,
      teamId: run.teamId,
      action: null,
      reviewer: null,
      notes: null,
      createdAt,
      updatedAt: createdAt
    });
    return {
      id,
      runId,
      action: null,
      reviewer: null,
      notes: null,
      createdAt: createdAt.toISOString(),
      updatedAt: createdAt.toISOString()
    };
  }

  async setApproval(runId: string, action: ApprovalAction, reviewer: string, notes?: string | null) {
    const run = await this.database.query.runs.findFirst({ where: eq(runs.id, runId) });
    if (!run) {
      throw new Error(`Run not found for approval update: ${runId}`);
    }
    const pending = (
      await this.database
        .select()
        .from(approvals)
        .where(eq(approvals.runId, runId))
        .orderBy(desc(approvals.createdAt), desc(approvals.id))
    ).find((row) => row.action === null);
    const updatedAt = new Date();
    if (pending) {
      await this.database
        .update(approvals)
        .set({ action, reviewer, notes: notes ?? null, updatedAt })
        .where(eq(approvals.id, pending.id));
      return {
        id: pending.id,
        runId,
        action,
        reviewer,
        notes: notes ?? null,
        createdAt: pending.createdAt.toISOString(),
        updatedAt: updatedAt.toISOString()
      };
    }
    const id = randomUUID();
    await this.database.insert(approvals).values({
      id,
      runId,
      workspaceId: run.workspaceId,
      teamId: run.teamId,
      action,
      reviewer,
      notes: notes ?? null,
      createdAt: updatedAt,
      updatedAt
    });
    return {
      id,
      runId,
      action,
      reviewer,
      notes: notes ?? null,
      createdAt: updatedAt.toISOString(),
      updatedAt: updatedAt.toISOString()
    };
  }

  async getGitHubSettings(teamId?: string | null) {
    const settingsRow = await this.database.query.appSettings.findFirst({ where: eq(appSettings.key, "github_app") });
    let allowedRows = await this.database.select().from(repoConnections).where(eq(repoConnections.provider, "github"));
    if (teamId) {
      allowedRows = allowedRows.filter((row) => row.teamId === teamId);
    }
    return {
      appId: (settingsRow?.value.appId as string | undefined) ?? null,
      installationId: (settingsRow?.value.installationId as string | undefined) ?? null,
      appSlug: (settingsRow?.value.appSlug as string | undefined) ?? null,
      privateKeyEncrypted: (settingsRow?.value.privateKeyEncrypted as string | undefined) ?? null,
      allowedRepos: allowedRows.map((row) => ({
        id: row.id,
        workspaceId: row.workspaceId,
        teamId: row.teamId,
        provider: "github" as const,
        owner: row.owner,
        repo: row.repo,
        isAllowed: fromBooleanText(row.isAllowed),
        createdAt: row.createdAt.toISOString()
      }))
    };
  }

  async saveGitHubSettings(settings: GitHubAppSettings, allowedRepos: GitHubRepoConnection[]) {
    const bootstrap = await this.ensureBootstrapWorkspace();
    await this.database
      .insert(appSettings)
      .values({
        key: "github_app",
        value: {
          appId: settings.appId,
          installationId: settings.installationId,
          appSlug: settings.appSlug ?? null,
          privateKeyEncrypted: settings.privateKeyPem
        },
        updatedAt: new Date()
      })
      .onConflictDoUpdate({
        target: appSettings.key,
        set: {
          value: {
            appId: settings.appId,
            installationId: settings.installationId,
            appSlug: settings.appSlug ?? null,
            privateKeyEncrypted: settings.privateKeyPem
          },
          updatedAt: new Date()
        }
      });

    const existing = await this.database.select().from(repoConnections).where(eq(repoConnections.provider, "github"));
    await Promise.all(existing.map((row) => this.database.delete(repoConnections).where(eq(repoConnections.id, row.id))));

    if (allowedRepos.length > 0) {
      await this.database.insert(repoConnections).values(
        allowedRepos.map((repo) => ({
          id: repo.id ?? randomUUID(),
          workspaceId: repo.workspaceId ?? bootstrap.workspace.id,
          teamId: repo.teamId ?? bootstrap.defaultTeam.id,
          provider: "github",
          owner: repo.owner,
          repo: repo.repo,
          isAllowed: toBooleanText(repo.isAllowed),
          createdAt: new Date()
        }))
      );
    }
  }

  async getDashboardSummary(scope?: { workspaceId?: string; teamId?: string | null }) {
    const allRuns = await this.listRuns(scope);
    return {
      totalRuns: allRuns.length,
      pendingApprovals: allRuns.filter((run) => run.status === "pending_human").length,
      activeRuns: allRuns.filter((run) => ["routing", "planning", "executing", "reviewing"].includes(run.status)).length,
      failedRuns: allRuns.filter((run) => run.status === "failed").length
    };
  }

  async getModelPolicies() {
    let rows = await this.database.select().from(modelPolicies);
    if (rows.length === 0) {
      await this.database.insert(modelPolicies).values(
        defaultModelPolicies.map((policy) => ({
          role: policy.role,
          provider: policy.provider,
          model: policy.model,
          reviewerProvider: policy.reviewerProvider ?? null,
          reviewerModel: policy.reviewerModel ?? null
        }))
      );
      return defaultModelPolicies;
    }

    const existingRoles = new Set(rows.map((row) => row.role));
    const missingPolicies = defaultModelPolicies.filter((policy) => !existingRoles.has(policy.role));
    if (missingPolicies.length > 0) {
      await this.database.insert(modelPolicies).values(
        missingPolicies.map((policy) => ({
          role: policy.role,
          provider: policy.provider,
          model: policy.model,
          reviewerProvider: policy.reviewerProvider ?? null,
          reviewerModel: policy.reviewerModel ?? null
        }))
      );
      rows = await this.database.select().from(modelPolicies);
    }

    const normalized = new Map(
      rows.map((row) => [
        row.role,
        {
          role: row.role as AgentRole,
          provider: row.provider as ModelPolicy["provider"],
          model: row.model,
          reviewerProvider: (row.reviewerProvider as ModelPolicy["reviewerProvider"]) ?? undefined,
          reviewerModel: row.reviewerModel ?? undefined
        }
      ])
    );

    return defaultModelPolicies.map((policy) => normalized.get(policy.role) ?? policy);
  }
}

export function createStorageAdapter(databaseUrl?: string): StorageAdapter {
  if (!databaseUrl) {
    return new MemoryStorage();
  }
  return new PostgresStorage(databaseUrl);
}
