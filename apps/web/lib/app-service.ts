import { createQueueAdapter, createStorageAdapter, type QueueAdapter, type StorageAdapter } from "@aiteams/db";
import { streamWorkflow } from "@aiteams/agents";
import { GitHubExecutionService, buildManagedBranchName } from "@aiteams/github";
import {
  type AgentRole,
  type ApprovalAction,
  type GitHubRepoConnection,
  type GitHubSettingsView,
  type RunDetail,
  type RunRecord,
  type TaskRequest,
  GitHubSettingsViewSchema,
  TaskRequestSchema,
  defaultModelPolicies
} from "@aiteams/shared";

import { decryptSecret, encryptSecret, maskSecret } from "./secrets";
import { getAppEnv } from "./env";

type GitHubExecutor = Pick<
  GitHubExecutionService,
  "fetchRepositoryContext" | "createManagedWorkspace" | "writeRunArtifactsToWorkspace" | "commitAndPushWorkspace" | "createDraftPullRequest"
>;

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

async function buildWorkflowTask(detail: RunDetail, runtime: AppRuntime): Promise<TaskRequest> {
  const githubSettings = await runtime.storage.getGitHubSettings();
  const baseTask: TaskRequest = {
    title: detail.task.title,
    goal: detail.task.goal,
    taskType: detail.task.taskType,
    targetRepo: detail.task.targetRepo,
    targetBranch: detail.task.targetBranch,
    constraints: detail.task.constraints,
    acceptanceCriteria: detail.task.acceptanceCriteria,
    attachments: detail.task.attachments
  };

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
      ...baseTask,
      attachments: [
        ...baseTask.attachments,
        {
          name: "repo-context.md",
          type: "markdown",
          content: repoContext.markdown
        }
      ]
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
      ...baseTask,
      attachments: [
        ...baseTask.attachments,
        {
          name: "repo-context.md",
          type: "markdown",
          content: `# Repository context unavailable\n\nThe workflow could not retrieve live GitHub data for \`${detail.task.targetRepo}\` on \`${detail.task.targetBranch}\`.\n\nReason: ${message}`
        }
      ]
    };
  }
}

async function processRun(runId: string) {
  const runtime = getRuntime();
  const detail = await runtime.storage.getRunDetail(runId);
  if (!detail) return;

  try {
    const workflowTask = await buildWorkflowTask(detail, runtime);
    await runtime.storage.updateRun(runId, { status: "routing", failureReason: null });
    const policies = await runtime.storage.getModelPolicies();
    const iterator = (await streamWorkflow(workflowTask, policies.length > 0 ? policies : defaultModelPolicies)) as unknown as AsyncIterable<
      Record<string, Record<string, unknown>>
    >;

    for await (const updateChunk of iterator) {
      for (const [node, update] of Object.entries(updateChunk)) {
        const role = roleFromNode(node);
        const nextStatus = typeof update.status === "string" ? update.status : undefined;
        if (nextStatus) {
          await runtime.storage.updateRun(runId, { status: nextStatus as RunRecord["status"] });
        }

        const deliverable = (update.deliverables as Record<string, { summary?: string; deliverable?: string }> | undefined)?.[role];
        if (deliverable) {
          const step = await runtime.storage.createRunStep({
            runId,
            role,
            status: "running",
            input: `Role ${role} executed.`
          });
          await runtime.storage.updateRunStep(step.id, {
            status: "completed",
            summary: deliverable.summary ?? null,
            output: deliverable.deliverable ?? "",
            endedAt: new Date().toISOString()
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

    await runtime.storage.requestApproval(runId);
    await runtime.storage.updateRun(runId, { status: "pending_human" });
  } catch (error) {
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
  const detail = await runtime.storage.createTaskAndRun(task);
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
  await runtime.storage.updateRun(runId, {
    status: "cancelled",
    finalSummary: "Run cancelled by operator."
  });
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
