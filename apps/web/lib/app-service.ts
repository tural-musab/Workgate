import { createQueueAdapter, createStorageAdapter, type QueueAdapter, type StorageAdapter } from "@aiteams/db";
import { routeTaskDeterministic, streamWorkflow, type ArtifactDraft, type ResolvedTaskRoute, type WorkflowStartOptions } from "@aiteams/agents";
import { GitHubExecutionService, buildManagedBranchName } from "@aiteams/github";
import {
  agentRoles,
  canCancelRun,
  canDeleteRun,
  canRetryRun,
  type AgentDeliverable,
  type AgentRole,
  type ApprovalAction,
  type ArtifactType,
  type GitHubRepoConnection,
  type GitHubSettingsView,
  type RetryMode,
  type RunDetail,
  type RunRecord,
  type TaskRequest,
  GitHubSettingsViewSchema,
  RetryRunPayloadSchema,
  TaskRequestSchema,
  defaultModelPolicies
} from "@aiteams/shared";

import { decryptSecret, encryptSecret, maskSecret } from "./secrets";
import { getAppEnv } from "./env";

type GitHubExecutor = Pick<
  GitHubExecutionService,
  "fetchRepositoryContext" | "createManagedWorkspace" | "writeRunArtifactsToWorkspace" | "commitAndPushWorkspace" | "createDraftPullRequest"
>;

const RETRY_ATTACHMENT_NAME = ".aiteams-retry.json";

const artifactRoleMap: Record<ArtifactType, AgentRole> = {
  research_note: "research",
  prd: "pm",
  architecture_memo: "architect",
  patch_summary: "engineer",
  test_report: "docs",
  review_report: "reviewer",
  changelog: "docs"
};

type RetrySeed = {
  sourceRunId: string;
  mode: RetryMode;
  startAt: AgentRole;
  route?: ResolvedTaskRoute;
  deliverables: Partial<Record<AgentRole, AgentDeliverable>>;
  artifacts: ArtifactDraft[];
};

export type AppRuntime = {
  storage: StorageAdapter;
  queue: QueueAdapter;
  github: GitHubExecutor;
  started: boolean;
};

declare global {
  var __AITEAMS_RUNTIME__: AppRuntime | undefined;
}

function roleFromNode(node: string): AgentRole {
  if (node === "routerNode") return "router";
  return node as AgentRole;
}

function toTaskRequest(task: RunDetail["task"]): TaskRequest {
  return {
    title: task.title,
    goal: task.goal,
    taskType: task.taskType,
    targetRepo: task.targetRepo,
    targetBranch: task.targetBranch,
    constraints: task.constraints,
    acceptanceCriteria: task.acceptanceCriteria,
    attachments: task.attachments
  };
}

function isRetryAttachment(attachment: TaskRequest["attachments"][number]) {
  return attachment.name === RETRY_ATTACHMENT_NAME;
}

function buildRetryAttachment(seed: RetrySeed) {
  return {
    name: RETRY_ATTACHMENT_NAME,
    type: "json" as const,
    content: JSON.stringify(seed)
  };
}

function extractRetrySeed(task: TaskRequest): { task: TaskRequest; retrySeed?: RetrySeed } {
  const retryAttachment = task.attachments.find(isRetryAttachment);
  const filteredAttachments = task.attachments.filter((attachment) => !isRetryAttachment(attachment));

  if (!retryAttachment) {
    return {
      task: {
        ...task,
        attachments: filteredAttachments
      }
    };
  }

  try {
    return {
      task: {
        ...task,
        attachments: filteredAttachments
      },
      retrySeed: JSON.parse(retryAttachment.content) as RetrySeed
    };
  } catch {
    return {
      task: {
        ...task,
        attachments: filteredAttachments
      }
    };
  }
}

function roleIndex(role: AgentRole) {
  return agentRoles.indexOf(role);
}

function initialStatusForRole(role: AgentRole): RunRecord["status"] {
  if (role === "router") return "routing";
  if (role === "coordinator" || role === "research" || role === "pm") return "planning";
  if (role === "architect" || role === "engineer") return "executing";
  return "reviewing";
}

function parseRouterStepOutput(output?: string | null): ResolvedTaskRoute | undefined {
  if (!output) return undefined;

  const route = output.match(/^Route:\s*(.+)$/im)?.[1]?.trim();
  const risk = output.match(/^Risk:\s*(.+)$/im)?.[1]?.trim();
  const needsHumanRaw = output.match(/^Needs human:\s*(.+)$/im)?.[1]?.trim();
  const source = output.match(/^Decision source:\s*(.+)$/im)?.[1]?.trim();
  const modelLine = output.match(/^Model:\s*(.+)$/im)?.[1]?.trim();

  if (
    (route !== "research" && route !== "pm" && route !== "architect" && route !== "engineer" && route !== "docs" && route !== "human") ||
    (risk !== "low" && risk !== "medium" && risk !== "high")
  ) {
    return undefined;
  }

  const [provider, model] = modelLine && modelLine !== "deterministic rules" ? modelLine.split("/") : [];
  return {
    route,
    risk,
    reason: "Recovered from previous router output.",
    needsHuman: needsHumanRaw === "true",
    source: source === "model" || source === "fallback" ? source : "rule",
    ...((provider ? { provider: provider as ResolvedTaskRoute["provider"] } : {}) as Partial<ResolvedTaskRoute>),
    ...(model ? { model } : {})
  };
}

function toDeliverable(step: RunDetail["steps"][number]): AgentDeliverable | null {
  if (!step.output) return null;
  return {
    summary: step.summary ?? `${step.role} reused from a previous run.`,
    deliverable: step.output,
    risks: [],
    needsHuman: step.role === "reviewer" || step.role === "docs"
  };
}

function getRetryResumeRole(detail: RunDetail): AgentRole | null {
  const failedRole = agentRoles.find((role) => detail.run.failureReason?.toLowerCase().startsWith(`${role} failed`));
  if (failedRole) return failedRole;

  const completedRoles = detail.steps
    .filter((step) => step.status === "completed" && step.output)
    .map((step) => step.role)
    .sort((left, right) => roleIndex(left) - roleIndex(right));

  if (completedRoles.length === 0) return detail.run.status === "failed" ? "router" : null;

  const lastCompletedRole = completedRoles[completedRoles.length - 1]!;
  const nextRole = agentRoles[roleIndex(lastCompletedRole) + 1];
  return nextRole ?? null;
}

function buildRetrySeed(detail: RunDetail, mode: RetryMode): RetrySeed | null {
  if (mode === "full") return null;

  const startAt = getRetryResumeRole(detail);
  if (!startAt) return null;

  const startIndex = roleIndex(startAt);
  const deliverables = Object.fromEntries(
    detail.steps
      .filter((step) => step.status === "completed" && roleIndex(step.role) < startIndex)
      .map((step) => [step.role, toDeliverable(step)])
      .filter((entry): entry is [AgentRole, AgentDeliverable] => Boolean(entry[1]))
  ) as Partial<Record<AgentRole, AgentDeliverable>>;

  const artifacts = detail.artifacts
    .filter((artifact) => roleIndex(artifactRoleMap[artifact.artifactType]) < startIndex)
    .map((artifact) => ({
      artifactType: artifact.artifactType,
      title: artifact.title,
      content: artifact.content
    }));

  const route = detail.steps.find((step) => step.role === "router")?.output
    ? parseRouterStepOutput(detail.steps.find((step) => step.role === "router")?.output)
    : undefined;

  return {
    sourceRunId: detail.run.id,
    mode,
    startAt,
    deliverables,
    artifacts,
    ...((route ?? (startIndex > 1 ? routeTaskDeterministic(toTaskRequest(detail.task)) : undefined))
      ? { route: route ?? routeTaskDeterministic(toTaskRequest(detail.task)) }
      : {})
  };
}

export function canRetryFailedOnly(detail: RunDetail) {
  if (!canRetryRun(detail.run.status)) {
    return false;
  }

  const seed = buildRetrySeed(detail, "failed_only");
  if (!seed) return false;
  return seed.startAt !== "router" || Object.keys(seed.deliverables).length > 0 || seed.artifacts.length > 0;
}

async function seedRetryHistory(runtime: AppRuntime, runId: string, seed: RetrySeed) {
  for (const role of agentRoles) {
    const deliverable = seed.deliverables[role];
    if (!deliverable) continue;
    const step = await runtime.storage.createRunStep({
      runId,
      role,
      status: "running",
      input: `Reused from run ${seed.sourceRunId} during failed-only retry.`
    });
    await runtime.storage.updateRunStep(step.id, {
      status: "completed",
      summary: deliverable.summary,
      output: deliverable.deliverable,
      endedAt: new Date().toISOString()
    });
  }

  for (const artifact of seed.artifacts) {
    await runtime.storage.addArtifact({
      runId,
      artifactType: artifact.artifactType,
      title: artifact.title,
      content: artifact.content
    });
  }
}

function createRuntime(): AppRuntime {
  const env = getAppEnv();
  return {
    storage: createStorageAdapter(env.databaseUrl),
    queue: createQueueAdapter({ databaseUrl: env.databaseUrl, driver: env.queueDriver }),
    github: new GitHubExecutionService(),
    started: false
  };
}

function getRuntime() {
  if (!globalThis.__AITEAMS_RUNTIME__) {
    globalThis.__AITEAMS_RUNTIME__ = createRuntime();
  }
  return globalThis.__AITEAMS_RUNTIME__;
}

async function buildWorkflowTask(detail: RunDetail, runtime: AppRuntime): Promise<{ task: TaskRequest; startOptions?: WorkflowStartOptions }> {
  const githubSettings = await runtime.storage.getGitHubSettings();
  const { task: sanitizedTask, retrySeed } = extractRetrySeed(toTaskRequest(detail.task));
  const baseTask: TaskRequest = sanitizedTask;
  const startOptions = retrySeed
    ? ({
        startAt: retrySeed.startAt,
        deliverables: retrySeed.deliverables,
        artifacts: retrySeed.artifacts,
        ...(retrySeed.route ? { route: retrySeed.route } : {})
      } satisfies WorkflowStartOptions)
    : undefined;

  try {
    const token = githubSettings.tokenEncrypted ? decryptSecret(githubSettings.tokenEncrypted) : null;
    const repoContext = await runtime.github.fetchRepositoryContext({
      targetRepo: detail.task.targetRepo,
      targetBranch: detail.task.targetBranch,
      token,
      allowlist: githubSettings.allowedRepos
    });

    await runtime.storage.addToolCall({
      runId: detail.run.id,
      toolName: "github.fetchRepositoryContext",
      category: "read",
      status: "completed",
      input: `${detail.task.targetRepo}@${detail.task.targetBranch}`,
      output: `Loaded ${repoContext.topLevelEntries.length} top-level entries and ${repoContext.selectedFiles.length} file excerpts from branch ${repoContext.resolvedBranch}.`
    });

    return {
      task: {
        ...baseTask,
        attachments: [
          ...baseTask.attachments,
          {
            name: "repo-context.md",
            type: "markdown",
            content: repoContext.markdown
          }
        ]
      },
      ...(startOptions ? { startOptions } : {})
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Repository context retrieval failed.";
    await runtime.storage.addToolCall({
      runId: detail.run.id,
      toolName: "github.fetchRepositoryContext",
      category: "read",
      status: message.includes("allowlisted") ? "blocked" : "failed",
      input: `${detail.task.targetRepo}@${detail.task.targetBranch}`,
      output: message
    });

    return {
      task: {
        ...baseTask,
        attachments: [
          ...baseTask.attachments,
          {
            name: "repo-context.md",
            type: "markdown",
            content: `# Repository context unavailable\n\nThe workflow could not retrieve live GitHub data for \`${detail.task.targetRepo}\` on \`${detail.task.targetBranch}\`.\n\nReason: ${message}`
          }
        ]
      },
      ...(startOptions ? { startOptions } : {})
    };
  }
}

async function processRun(runId: string) {
  const runtime = getRuntime();
  const detail = await runtime.storage.getRunDetail(runId);
  if (!detail) return;
  if (!["queued", "routing", "planning", "executing", "reviewing"].includes(detail.run.status)) return;

  try {
    const { task: workflowTask, startOptions } = await buildWorkflowTask(detail, runtime);
    const liveBeforeStart = await runtime.storage.getRunDetail(runId);
    if (!liveBeforeStart || liveBeforeStart.run.status === "cancelled") {
      return;
    }

    await runtime.storage.updateRun(runId, {
      status: initialStatusForRole(startOptions?.startAt ?? "router"),
      failureReason: null
    });
    const policies = await runtime.storage.getModelPolicies();
    const iterator = (await streamWorkflow(workflowTask, policies.length > 0 ? policies : defaultModelPolicies, startOptions)) as unknown as AsyncIterable<
      Record<string, Record<string, unknown>>
    >;

    for await (const updateChunk of iterator) {
      const liveRun = await runtime.storage.getRunDetail(runId);
      if (!liveRun || liveRun.run.status === "cancelled") {
        return;
      }

      for (const [node, update] of Object.entries(updateChunk)) {
        const role = roleFromNode(node);
        const nextStatus = typeof update.status === "string" ? update.status : undefined;
        if (nextStatus) {
          await runtime.storage.updateRun(runId, { status: nextStatus as RunRecord["status"] });
        }

        const deliverable = (
          update.deliverables as
            | Record<string, { summary?: string; deliverable?: string; provider?: string; model?: string; executionMode?: string }>
            | undefined
        )?.[role];
        if (deliverable) {
          const step = await runtime.storage.createRunStep({
            runId,
            role,
            status: "running",
            input: `Role ${role} executed with ${deliverable.provider ?? "rule-based"}/${deliverable.model ?? "deterministic"} in ${deliverable.executionMode ?? "live"} mode.`
          });
          await runtime.storage.updateRunStep(step.id, {
            status: "completed",
            summary: deliverable.summary ?? null,
            output: deliverable.deliverable ?? "",
            endedAt: new Date().toISOString()
          });
          await runtime.storage.addToolCall({
            runId,
            stepId: step.id,
            toolName: role === "router" && deliverable.executionMode === "rule" ? "router.decision" : "model.invoke",
            category: "read",
            status: "completed",
            input: `${role} -> ${deliverable.provider ?? "rule-based"}/${deliverable.model ?? "deterministic"} (${deliverable.executionMode ?? "live"})`,
            output: deliverable.summary ?? ""
          });
        }

        const artifacts = Array.isArray(update.artifacts)
          ? (update.artifacts as Array<{ artifactType: RunDetail["artifacts"][number]["artifactType"]; title: string; content: string }>)
          : [];
        for (const artifact of artifacts) {
          await runtime.storage.addArtifact({
            runId,
            artifactType: artifact.artifactType,
            title: artifact.title,
            content: artifact.content
          });
        }

        if (typeof update.finalSummary === "string") {
          await runtime.storage.updateRun(runId, { finalSummary: update.finalSummary });
        }
      }
    }

    const liveAfterWorkflow = await runtime.storage.getRunDetail(runId);
    if (!liveAfterWorkflow || liveAfterWorkflow.run.status === "cancelled") {
      return;
    }

    await runtime.storage.requestApproval(runId);
    await runtime.storage.updateRun(runId, { status: "pending_human" });
  } catch (error) {
    const liveRun = await runtime.storage.getRunDetail(runId);
    if (!liveRun || liveRun.run.status === "cancelled") {
      return;
    }
    await runtime.storage.updateRun(runId, {
      status: "failed",
      failureReason: error instanceof Error ? error.message : "Unknown workflow failure."
    });
  }
}

export async function ensureRuntimeStarted() {
  const runtime = getRuntime();
  if (!runtime.started) {
    await runtime.queue.start(processRun);
    runtime.started = true;
  }
  return runtime;
}

export function installRuntimeForTests(runtime: AppRuntime) {
  globalThis.__AITEAMS_RUNTIME__ = runtime;
}

export function resetRuntimeForTests() {
  globalThis.__AITEAMS_RUNTIME__ = undefined;
}

function normalizeAllowedRepos(items: string[]) {
  return items
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => {
      const [owner, repo] = item.split("/");
      if (!owner || !repo) {
        throw new Error(`Invalid repository allowlist entry: ${item}`);
      }
      return {
        provider: "github" as const,
        owner,
        repo,
        isAllowed: true
      } satisfies GitHubRepoConnection;
    });
}

export async function createTask(input: unknown) {
  const runtime = await ensureRuntimeStarted();
  const task = TaskRequestSchema.parse(input);
  const sanitizedTask: TaskRequest = {
    ...task,
    attachments: task.attachments.filter((attachment) => !isRetryAttachment(attachment))
  };
  const detail = await runtime.storage.createTaskAndRun(sanitizedTask);
  await runtime.queue.enqueueRun(detail.run.id);
  return detail;
}

export async function listRuns() {
  const runtime = await ensureRuntimeStarted();
  return runtime.storage.listRuns();
}

export async function listPendingApprovalRuns() {
  const runtime = await ensureRuntimeStarted();
  return runtime.storage.listPendingApprovalRuns();
}

export async function getRunDetail(runId: string) {
  const runtime = await ensureRuntimeStarted();
  return runtime.storage.getRunDetail(runId);
}

export async function getDashboardData() {
  const runtime = await ensureRuntimeStarted();
  const [summary, runs, approvals] = await Promise.all([
    runtime.storage.getDashboardSummary(),
    runtime.storage.listRuns(),
    runtime.storage.listPendingApprovalRuns()
  ]);
  return {
    summary,
    runs,
    approvals,
    runtime: {
      storageMode: runtime.storage.mode,
      queueMode: runtime.queue.mode
    }
  };
}

export async function getGitHubSettingsView(): Promise<GitHubSettingsView> {
  const runtime = await ensureRuntimeStarted();
  const settings = await runtime.storage.getGitHubSettings();
  const token = settings.tokenEncrypted ? decryptSecret(settings.tokenEncrypted) : null;
  return GitHubSettingsViewSchema.parse({
    hasToken: Boolean(token),
    maskedToken: maskSecret(token),
    allowedRepos: settings.allowedRepos
  });
}

export async function getModelPoliciesView() {
  const runtime = await ensureRuntimeStarted();
  return runtime.storage.getModelPolicies();
}

export async function saveGitHubSettings(input: { token: string; allowedRepos: string[] }) {
  const runtime = await ensureRuntimeStarted();
  const normalized = normalizeAllowedRepos(input.allowedRepos);
  await runtime.storage.saveGitHubSettings(encryptSecret(input.token), normalized);
  return getGitHubSettingsView();
}

function buildPullRequestBody(detail: RunDetail) {
  const artifactSections = detail.artifacts
    .map((artifact) => `## ${artifact.title}\n\n${artifact.content}`)
    .join("\n\n");

  return [
    "AI TeamS created this draft pull request after operator approval.",
    "",
    "### Run metadata",
    `- Run ID: ${detail.run.id}`,
    `- Task: ${detail.run.title}`,
    `- Target repo: ${detail.run.targetRepo}`,
    "",
    artifactSections
  ].join("\n");
}

export async function approveRun(runId: string, reviewer: string, notes?: string | null) {
  const runtime = await ensureRuntimeStarted();
  const detail = await runtime.storage.getRunDetail(runId);
  if (!detail) {
    throw new Error("Run not found.");
  }
  if (detail.run.status !== "pending_human") {
    throw new Error("Run is not waiting for approval.");
  }

  const githubSettings = await runtime.storage.getGitHubSettings();
  if (!githubSettings.tokenEncrypted) {
    throw new Error("GitHub token is not configured.");
  }

  const token = decryptSecret(githubSettings.tokenEncrypted);
  const approval = await runtime.storage.setApproval(runId, "approve", reviewer, notes ?? null);
  const workspace = await runtime.github.createManagedWorkspace({
    runId,
    title: detail.run.title,
    targetRepo: detail.run.targetRepo,
    targetBranch: detail.run.targetBranch,
    token,
    allowlist: githubSettings.allowedRepos
  });

  await runtime.storage.addToolCall({
    runId,
    toolName: "github.clone",
    category: "read",
    status: "completed",
    input: detail.run.targetRepo,
    output: workspace.workspacePath
  });

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
    input: ".aiteams/runs",
    output: `Prepared artifacts for ${runId}`
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
    token,
    targetRepo: detail.run.targetRepo,
    targetBranch: detail.run.targetBranch,
    branchName: workspace.branchName,
    title: `[AI TeamS] ${detail.run.title}`,
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

  await runtime.storage.updateRun(runId, {
    status: "completed",
    branchName: workspace.branchName,
    finalSummary: `Approved by ${approval.reviewer}. Draft PR created: ${pullRequest.pullRequestUrl}`
  });

  return { approval, pullRequest };
}

export async function rejectRun(runId: string, reviewer: string, notes?: string | null) {
  const runtime = await ensureRuntimeStarted();
  const detail = await runtime.storage.getRunDetail(runId);
  if (!detail) {
    throw new Error("Run not found.");
  }
  const approval = await runtime.storage.setApproval(runId, "reject", reviewer, notes ?? null);
  await runtime.storage.updateRun(runId, {
    status: "cancelled",
    finalSummary: `Rejected by ${reviewer}.`
  });
  return approval;
}

export async function cancelRun(runId: string) {
  const runtime = await ensureRuntimeStarted();
  const detail = await runtime.storage.getRunDetail(runId);
  if (!detail) {
    throw new Error("Run not found.");
  }
  if (!canCancelRun(detail.run.status)) {
    throw new Error("Run can no longer be cancelled.");
  }
  await runtime.storage.updateRun(runId, {
    status: "cancelled",
    finalSummary: "Run cancelled by operator."
  });
}

export async function deleteRun(runId: string) {
  const runtime = await ensureRuntimeStarted();
  const detail = await runtime.storage.getRunDetail(runId);
  if (!detail) {
    throw new Error("Run not found.");
  }
  if (!canDeleteRun(detail.run.status)) {
    throw new Error("Only completed, failed, or cancelled runs can be deleted.");
  }

  return runtime.storage.deleteRun(runId);
}

export async function retryRun(runId: string, payload: unknown) {
  const runtime = await ensureRuntimeStarted();
  const detail = await runtime.storage.getRunDetail(runId);
  if (!detail) {
    throw new Error("Run not found.");
  }
  if (!canRetryRun(detail.run.status)) {
    throw new Error("Only completed, failed, or cancelled runs can be retried.");
  }

  const { mode } = RetryRunPayloadSchema.parse(payload);
  const baseTask = toTaskRequest(detail.task);
  const seed = buildRetrySeed(detail, mode);
  const retryTask: TaskRequest = {
    ...baseTask,
    attachments: seed ? [...baseTask.attachments.filter((attachment) => !isRetryAttachment(attachment)), buildRetryAttachment(seed)] : baseTask.attachments.filter((attachment) => !isRetryAttachment(attachment))
  };

  const nextDetail = await runtime.storage.createTaskAndRun(retryTask);
  await runtime.storage.addToolCall({
    runId: nextDetail.run.id,
    toolName: "run.retry",
    category: "read",
    status: "completed",
    input: `${mode} retry requested for ${runId}`,
    output: seed ? `Resume from ${seed.startAt}` : "Fresh retry from router"
  });

  if (seed) {
    await seedRetryHistory(runtime, nextDetail.run.id, seed);
  }

  await runtime.queue.enqueueRun(nextDetail.run.id);
  return nextDetail;
}

export async function getRuntimeInfo() {
  const runtime = await ensureRuntimeStarted();
  return {
    storageMode: runtime.storage.mode,
    queueMode: runtime.queue.mode,
    suggestedBranch: buildManagedBranchName("preview", "sample task")
  };
}

export async function saveGitHubSettingsFromPayload(payload: unknown) {
  const data = payload as { token?: string; allowedRepos?: string[] };
  if (!data.token || !Array.isArray(data.allowedRepos)) {
    throw new Error("GitHub settings payload is invalid.");
  }
  return saveGitHubSettings({ token: data.token, allowedRepos: data.allowedRepos });
}

export async function applyApprovalAction(runId: string, action: ApprovalAction, reviewer: string, notes?: string | null) {
  return action === "approve" ? approveRun(runId, reviewer, notes) : rejectRun(runId, reviewer, notes);
}
