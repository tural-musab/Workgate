import { randomUUID } from "node:crypto";

import { desc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import {
  type AgentRole,
  type ApprovalAction,
  type ApprovalRecord,
  type ArtifactRecord,
  type ArtifactType,
  type DashboardSummary,
  type GitHubRepoConnection,
  type ModelPolicy,
  type RunDetail,
  type RunRecord,
  type RunStatus,
  type StepRecord,
  type StepStatus,
  type TaskRequest,
  type ToolCallRecord,
  defaultModelPolicies
} from "@aiteams/shared";

import { appSettings, approvals, artifacts, modelPolicies, repoConnections, runSteps, runs, taskRequests, toolCalls } from "./schema";

type PersistedTask = TaskRequest & { id: string; createdAt: string };
type StoredGitHubSettings = { tokenEncrypted: string | null; allowedRepos: GitHubRepoConnection[] };

export interface StorageAdapter {
  readonly mode: "memory" | "postgres";
  createTaskAndRun(task: TaskRequest): Promise<RunDetail>;
  listRuns(): Promise<RunRecord[]>;
  listPendingApprovalRuns(): Promise<RunRecord[]>;
  getRunDetail(runId: string): Promise<RunDetail | null>;
  deleteRun(runId: string): Promise<boolean>;
  updateRun(runId: string, patch: Partial<Pick<RunRecord, "status" | "branchName" | "failureReason" | "finalSummary">>): Promise<void>;
  createRunStep(input: { runId: string; role: AgentRole; status: StepStatus; input?: string | null }): Promise<StepRecord>;
  updateRunStep(stepId: string, patch: Partial<Pick<StepRecord, "status" | "summary" | "output" | "error" | "endedAt">>): Promise<void>;
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
  getGitHubSettings(): Promise<StoredGitHubSettings>;
  saveGitHubSettings(tokenEncrypted: string, allowedRepos: GitHubRepoConnection[]): Promise<void>;
  getDashboardSummary(): Promise<DashboardSummary>;
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

function hydrateRun(row: typeof runs.$inferSelect): RunRecord {
  return {
    id: row.id,
    taskRequestId: row.taskRequestId,
    status: row.status as RunStatus,
    title: row.title,
    taskType: row.taskType as TaskRequest["taskType"],
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
    title: row.title,
    goal: row.goal,
    taskType: row.taskType as TaskRequest["taskType"],
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

  private tasks = new Map<string, PersistedTask>();
  private runs = new Map<string, RunRecord>();
  private steps = new Map<string, StepRecord>();
  private artifacts = new Map<string, ArtifactRecord>();
  private approvals = new Map<string, ApprovalRecord>();
  private toolCalls = new Map<string, ToolCallRecord>();
  private githubSettings: StoredGitHubSettings = { tokenEncrypted: null, allowedRepos: [] };
  private policies = [...defaultModelPolicies];

  async createTaskAndRun(task: TaskRequest) {
    const taskId = randomUUID();
    const runId = randomUUID();
    const createdAt = nowIso();
    const persistedTask: PersistedTask = { ...task, id: taskId, createdAt };
    const run: RunRecord = {
      id: runId,
      taskRequestId: taskId,
      status: "queued",
      title: task.title,
      taskType: task.taskType,
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
    return { run, task: persistedTask, steps: [], artifacts: [], approvals: [], toolCalls: [] };
  }

  async listRuns() {
    return [...this.runs.values()].sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  async listPendingApprovalRuns() {
    return [...this.runs.values()].filter((run) => run.status === "pending_human");
  }

  async getRunDetail(runId: string) {
    const run = this.runs.get(runId);
    if (!run) return null;
    const task = this.tasks.get(run.taskRequestId);
    if (!task) return null;
    return {
      run,
      task,
      steps: [...this.steps.values()].filter((step) => step.runId === runId),
      artifacts: [...this.artifacts.values()].filter((artifact) => artifact.runId === runId),
      approvals: [...this.approvals.values()].filter((approval) => approval.runId === runId),
      toolCalls: [...this.toolCalls.values()].filter((toolCall) => toolCall.runId === runId)
    };
  }

  async deleteRun(runId: string) {
    const run = this.runs.get(runId);
    if (!run) return false;

    for (const [id, step] of this.steps.entries()) {
      if (step.runId === runId) this.steps.delete(id);
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

  async createRunStep(input: { runId: string; role: AgentRole; status: StepStatus; input?: string | null }) {
    const step: StepRecord = {
      id: randomUUID(),
      runId: input.runId,
      role: input.role,
      status: input.status,
      summary: null,
      input: input.input ?? null,
      output: null,
      error: null,
      startedAt: nowIso(),
      endedAt: null
    };
    this.steps.set(step.id, step);
    return step;
  }

  async updateRunStep(stepId: string, patch: Partial<Pick<StepRecord, "status" | "summary" | "output" | "error" | "endedAt">>) {
    const step = this.steps.get(stepId);
    if (!step) return;
    this.steps.set(stepId, { ...step, ...patch });
  }

  async addArtifact(input: { runId: string; artifactType: ArtifactType; title: string; content: string }) {
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
    const approval = [...this.approvals.values()].reverse().find((item) => item.runId === runId && item.action === null);
    const record: ApprovalRecord = {
      id: approval?.id ?? randomUUID(),
      runId,
      action,
      reviewer,
      notes: notes ?? null,
      createdAt: approval?.createdAt ?? nowIso(),
      updatedAt: nowIso()
    };
    this.approvals.set(record.id, record);
    return record;
  }

  async getGitHubSettings() {
    return this.githubSettings;
  }

  async saveGitHubSettings(tokenEncrypted: string, allowedRepos: GitHubRepoConnection[]) {
    this.githubSettings = { tokenEncrypted, allowedRepos };
  }

  async getDashboardSummary() {
    const runs = [...this.runs.values()];
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

  constructor(databaseUrl: string) {
    this.client = postgres(databaseUrl, { prepare: false });
    this.database = drizzle(this.client, {
      schema: { appSettings, approvals, artifacts, modelPolicies, repoConnections, runSteps, runs, taskRequests, toolCalls }
    });
  }

  async createTaskAndRun(task: TaskRequest) {
    const taskId = randomUUID();
    const runId = randomUUID();
    const createdAt = new Date();

    await this.database.insert(taskRequests).values({
      id: taskId,
      title: task.title,
      goal: task.goal,
      taskType: task.taskType,
      targetRepo: task.targetRepo,
      targetBranch: task.targetBranch,
      constraints: task.constraints,
      acceptanceCriteria: task.acceptanceCriteria,
      attachments: task.attachments,
      createdAt
    });

    await this.database.insert(runs).values({
      id: runId,
      taskRequestId: taskId,
      status: "queued",
      title: task.title,
      taskType: task.taskType,
      targetRepo: task.targetRepo,
      targetBranch: task.targetBranch,
      branchName: null,
      failureReason: null,
      finalSummary: null,
      createdAt,
      updatedAt: createdAt
    });

    const detail = await this.getRunDetail(runId);
    if (!detail) {
      throw new Error("Unable to hydrate run after insert.");
    }
    return detail;
  }

  async listRuns() {
    const rows = await this.database.select().from(runs).orderBy(desc(runs.createdAt));
    return rows.map(hydrateRun);
  }

  async listPendingApprovalRuns() {
    const rows = await this.database.select().from(runs).where(eq(runs.status, "pending_human")).orderBy(desc(runs.updatedAt));
    return rows.map(hydrateRun);
  }

  async getRunDetail(runId: string) {
    const runRow = await this.database.query.runs.findFirst({ where: eq(runs.id, runId) });
    if (!runRow) return null;
    const taskRow = await this.database.query.taskRequests.findFirst({ where: eq(taskRequests.id, runRow.taskRequestId) });
    if (!taskRow) return null;
    const [stepRows, artifactRows, approvalRows, toolRows] = await Promise.all([
      this.database.select().from(runSteps).where(eq(runSteps.runId, runId)),
      this.database.select().from(artifacts).where(eq(artifacts.runId, runId)),
      this.database.select().from(approvals).where(eq(approvals.runId, runId)),
      this.database.select().from(toolCalls).where(eq(toolCalls.runId, runId))
    ]);
    return {
      run: hydrateRun(runRow),
      task: hydrateTask(taskRow),
      steps: stepRows.map(hydrateStep),
      artifacts: artifactRows.map(hydrateArtifact),
      approvals: approvalRows.map(hydrateApproval),
      toolCalls: toolRows.map(hydrateToolCall)
    };
  }

  async deleteRun(runId: string) {
    const runRow = await this.database.query.runs.findFirst({ where: eq(runs.id, runId) });
    if (!runRow) return false;

    await this.database.transaction(async (tx) => {
      await tx.delete(toolCalls).where(eq(toolCalls.runId, runId));
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

  async createRunStep(input: { runId: string; role: AgentRole; status: StepStatus; input?: string | null }) {
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
      startedAt: startedAt.toISOString(),
      endedAt: null
    };
  }

  async updateRunStep(stepId: string, patch: Partial<Pick<StepRecord, "status" | "summary" | "output" | "error" | "endedAt">>) {
    await this.database
      .update(runSteps)
      .set({
        status: patch.status,
        summary: patch.summary,
        output: patch.output,
        error: patch.error,
        endedAt: patch.endedAt ? new Date(patch.endedAt) : undefined
      })
      .where(eq(runSteps.id, stepId));
  }

  async addArtifact(input: { runId: string; artifactType: ArtifactType; title: string; content: string }) {
    const id = randomUUID();
    const createdAt = new Date();
    await this.database.insert(artifacts).values({
      id,
      runId: input.runId,
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
    const id = randomUUID();
    const createdAt = new Date();
    await this.database.insert(toolCalls).values({
      id,
      runId: input.runId,
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
    const id = randomUUID();
    const createdAt = new Date();
    await this.database.insert(approvals).values({
      id,
      runId,
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
    const pending = (
      await this.database
        .select()
        .from(approvals)
        .where(eq(approvals.runId, runId))
        .orderBy(desc(approvals.createdAt))
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

  async getGitHubSettings() {
    const tokenRow = await this.database.query.appSettings.findFirst({ where: eq(appSettings.key, "github") });
    const allowedRows = await this.database.select().from(repoConnections).where(eq(repoConnections.provider, "github"));
    return {
      tokenEncrypted: (tokenRow?.value.tokenEncrypted as string | undefined) ?? null,
      allowedRepos: allowedRows.map((row) => ({
        id: row.id,
        provider: "github" as const,
        owner: row.owner,
        repo: row.repo,
        isAllowed: fromBooleanText(row.isAllowed),
        createdAt: row.createdAt.toISOString()
      }))
    };
  }

  async saveGitHubSettings(tokenEncrypted: string, allowedRepos: GitHubRepoConnection[]) {
    await this.database
      .insert(appSettings)
      .values({
        key: "github",
        value: { tokenEncrypted },
        updatedAt: new Date()
      })
      .onConflictDoUpdate({
        target: appSettings.key,
        set: {
          value: { tokenEncrypted },
          updatedAt: new Date()
        }
      });

    const existing = await this.database.select().from(repoConnections).where(eq(repoConnections.provider, "github"));
    await Promise.all(existing.map((row) => this.database.delete(repoConnections).where(eq(repoConnections.id, row.id))));

    if (allowedRepos.length > 0) {
      await this.database.insert(repoConnections).values(
        allowedRepos.map((repo) => ({
          id: repo.id ?? randomUUID(),
          provider: "github",
          owner: repo.owner,
          repo: repo.repo,
          isAllowed: toBooleanText(repo.isAllowed),
          createdAt: new Date()
        }))
      );
    }
  }

  async getDashboardSummary() {
    const allRuns = await this.listRuns();
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

    const routerDefault = defaultModelPolicies.find((policy) => policy.role === "router");
    const legacyRouter = routerDefault
      ? rows.find((row) => row.role === "router" && row.provider === "google" && row.model === "gemini-3.1-flash-lite-preview")
      : undefined;

    if (legacyRouter && routerDefault) {
      await this.database
        .update(modelPolicies)
        .set({
          provider: routerDefault.provider,
          model: routerDefault.model,
          reviewerProvider: routerDefault.reviewerProvider ?? null,
          reviewerModel: routerDefault.reviewerModel ?? null
        })
        .where(eq(modelPolicies.role, "router"));
      rows = await this.database.select().from(modelPolicies);
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
