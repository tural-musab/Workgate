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
  GitHubSettingsViewSchema,
  RetryRunPayloadSchema,
  canCancelRun,
  canDeleteRun,
  canRetryRun,
  defaultModelPolicies,
  type ApprovalAction,
  type GitHubSettingsView,
  type RunDetail,
  isActiveWorkflowTemplate,
  isGitHubWorkflowTemplate,
  isValidGitHubRepoSlug,
  normalizeCreateTaskPayload
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

export async function createTask(input: unknown) {
  const runtime = getRuntime();
  const payload = CreateTaskPayloadSchema.parse(input);
  if (!isActiveWorkflowTemplate(payload.workflowTemplate)) {
    throw new Error("This workflow template is not active yet.");
  }

  const task = normalizeCreateTaskPayload(payload);
  if (isGitHubWorkflowTemplate(task.workflowTemplate) && !isValidGitHubRepoSlug(task.targetRepo)) {
    throw new Error("Software Delivery Team requires a valid GitHub repository slug.");
  }

  const detail = await runtime.storage.createTaskAndRun(task);
  await runtime.producer.enqueueRun(detail.run.id);
  return detail;
}

export async function listRuns() {
  return getRuntime().storage.listRuns();
}

export async function listPendingApprovalRuns() {
  const runs = await getRuntime().storage.listPendingApprovalRuns();
  const details = await Promise.all(runs.map((run) => getRuntime().storage.getRunDetail(run.id)));
  return details.filter((detail): detail is RunDetail => Boolean(detail)).map(buildApprovalQueueItem);
}

export async function getRunDetail(runId: string) {
  return getRuntime().storage.getRunDetail(runId);
}

export async function getDashboardData() {
  const runtime = getRuntime();
  const [summary, runs, approvals] = await Promise.all([runtime.storage.getDashboardSummary(), runtime.storage.listRuns(), listPendingApprovalRuns()]);
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

export async function getGitHubSettingsView(): Promise<GitHubSettingsView> {
  const runtime = getRuntime();
  const settings = await runtime.storage.getGitHubSettings();
  const token = runtime.resolveGitHubToken?.(settings.tokenEncrypted) ?? null;
  return GitHubSettingsViewSchema.parse({
    hasToken: Boolean(token),
    maskedToken: maskSecret(token),
    allowedRepos: settings.allowedRepos
  });
}

export async function getModelPoliciesView() {
  const runtime = getRuntime();
  const policies = await runtime.storage.getModelPolicies();
  return policies.length > 0 ? policies : defaultModelPolicies;
}

export async function saveGitHubSettings(input: { token: string; allowedRepos: string[] }) {
  const runtime = getRuntime();
  const normalized = normalizeAllowedRepos(input.allowedRepos);
  await runtime.storage.saveGitHubSettings(encryptSecret(input.token), normalized);
  return getGitHubSettingsView();
}

export async function approveRun(runId: string, reviewer: string, notes?: string | null) {
  const runtime = getRuntime();
  const detail = await runtime.storage.getRunDetail(runId);
  if (!detail) {
    throw new Error("Run not found.");
  }
  if (detail.run.status !== "pending_human") {
    throw new Error("Run is not waiting for approval.");
  }

  if (!isGitHubWorkflowTemplate(detail.task.workflowTemplate)) {
    const approval = await runtime.storage.setApproval(runId, "approve", reviewer, notes ?? null);
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

  const githubSettings = await runtime.storage.getGitHubSettings();
  const token = runtime.resolveGitHubToken?.(githubSettings.tokenEncrypted) ?? null;
  if (!token) {
    throw new Error("GitHub token is not configured.");
  }

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
    token,
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

export async function rejectRun(runId: string, reviewer: string, notes?: string | null) {
  const runtime = getRuntime();
  const detail = await runtime.storage.getRunDetail(runId);
  if (!detail) {
    throw new Error("Run not found.");
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

export async function cancelRun(runId: string) {
  const runtime = getRuntime();
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
  const runtime = getRuntime();
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
  const runtime = getRuntime();
  const detail = await runtime.storage.getRunDetail(runId);
  if (!detail) {
    throw new Error("Run not found.");
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
