import {
  AgentDeliverableSchema,
  type AgentDeliverable,
  type AgentRole,
  type ApprovalQueueItem,
  type ArtifactType,
  type EngineerPlan,
  type GitHubAppSettings,
  type GitHubRepoConnection,
  type ReleasePacketChecklistItem,
  type ReleasePacketView,
  type RetryMode,
  type RunDetail,
  type RunRecord,
  type TaskRequest,
  isGitHubWorkflowTemplate,
  type StepRecord
} from "@workgate/shared";
import { routeTaskDeterministic, streamWorkflow, type ArtifactDraft, type ResolvedTaskRoute, type WorkflowStartOptions } from "@workgate/agents";
import { type QueueConsumer, type QueueProducer, type StorageAdapter } from "@workgate/db";
import type { WorkspaceDiffResult, GitHubExecutionService } from "@workgate/github";

export type GitHubExecutor = Pick<
  GitHubExecutionService,
  | "fetchRepositoryContext"
  | "createManagedWorkspace"
  | "applyFileOperations"
  | "readWorkspaceDiff"
  | "writeRunArtifactsToWorkspace"
  | "commitAndPushWorkspace"
  | "createDraftPullRequest"
>;

type RetrySeed = {
  sourceRunId: string;
  mode: RetryMode;
  startAt: AgentRole;
  route?: ResolvedTaskRoute;
  deliverables: Partial<Record<AgentRole, AgentDeliverable>>;
  artifacts: ArtifactDraft[];
};

export type RuntimeServices = {
  storage: StorageAdapter;
  producer: QueueProducer;
  consumer: QueueConsumer;
  github: GitHubExecutor;
  resolveGitHubToken?: (encrypted: string | null) => string | null;
  workerStarted: boolean;
  activeRuns: Set<string>;
};

export const RETRY_ATTACHMENT_NAME = ".workgate-retry.json";

const artifactRoleMap: Record<ArtifactType, AgentRole> = {
  research_note: "research",
  prd: "pm",
  architecture_memo: "architect",
  patch_summary: "engineer",
  diff_preview: "engineer",
  test_report: "docs",
  review_report: "reviewer",
  approval_checklist: "docs",
  release_packet: "docs",
  changelog: "docs"
};

const recoverableStatuses: RunRecord["status"][] = ["queued", "routing", "planning", "executing", "reviewing"];

function roleFromNode(node: string): AgentRole {
  return node === "routerNode" ? "router" : (node as AgentRole);
}

function roleIndex(role: AgentRole) {
  return ["router", "coordinator", "research", "pm", "architect", "engineer", "reviewer", "docs"].indexOf(role);
}

function initialStatusForRole(role: AgentRole): RunRecord["status"] {
  if (role === "router") return "routing";
  if (role === "coordinator" || role === "research" || role === "pm") return "planning";
  if (role === "architect" || role === "engineer") return "executing";
  return "reviewing";
}

function toTaskRequest(task: RunDetail["task"]): TaskRequest {
  return {
    workspaceId: task.workspaceId,
    teamId: task.teamId,
    createdBy: task.createdBy,
    title: task.title,
    goal: task.goal,
    taskType: task.taskType,
    workflowTemplate: task.workflowTemplate,
    workflowInput: task.workflowInput,
    targetRepo: task.targetRepo,
    targetBranch: task.targetBranch,
    constraints: task.constraints,
    acceptanceCriteria: task.acceptanceCriteria,
    attachments: task.attachments
  };
}

function resolveGitHubAppSettings(
  runtime: RuntimeServices,
  settings: Awaited<ReturnType<StorageAdapter["getGitHubSettings"]>>
): GitHubAppSettings | null {
  if (!settings.appId || !settings.installationId || !settings.privateKeyEncrypted) {
    return null;
  }

  const privateKeyPem = runtime.resolveGitHubToken?.(settings.privateKeyEncrypted) ?? null;
  if (!privateKeyPem) {
    return null;
  }

  return {
    appId: settings.appId,
    installationId: settings.installationId,
    privateKeyPem,
    ...(settings.appSlug ? { appSlug: settings.appSlug } : {})
  };
}

function isRetryAttachment(attachment: TaskRequest["attachments"][number]) {
  return attachment.name === RETRY_ATTACHMENT_NAME;
}

export function buildRetryAttachment(seed: RetrySeed) {
  return {
    name: RETRY_ATTACHMENT_NAME,
    type: "json" as const,
    content: JSON.stringify(seed)
  };
}

function buildWorkflowContextAttachment(task: TaskRequest) {
  if (task.workflowTemplate === "rfp_response") {
    return {
      name: "workflow-context.md",
      type: "markdown" as const,
      content: [
        "# Workflow context",
        "",
        "- Workflow: RFP Response Team",
        `- Account / opportunity: ${task.targetRepo}`,
        `- Knowledge source: ${task.targetBranch}`,
        "",
        "## Operating model",
        "- Produce capture-oriented, reviewable proposal work.",
        "- Optimize for clarity, bid compliance, and approval readiness.",
        "- Do not imply GitHub execution or source-code changes."
      ].join("\n")
    };
  }

  return {
    name: "workflow-context.md",
    type: "markdown" as const,
    content: [
      "# Workflow context",
      "",
      "- Workflow: Software Delivery Team",
      `- Target repository: ${task.targetRepo}`,
      `- Target branch: ${task.targetBranch}`,
      "",
      "## Operating model",
      "- Produce engineering-focused outputs and route them through human review.",
      "- Generate a managed diff preview before any GitHub push.",
      "- GitHub write operations remain blocked until approval."
    ].join("\n")
  };
}

export function extractRetrySeed(task: TaskRequest): { task: TaskRequest; retrySeed?: RetrySeed } {
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
    ...(provider ? { provider: provider as NonNullable<ResolvedTaskRoute["provider"]> } : {}),
    ...(model ? { model } : {})
  };
}

function slugifyExportFilename(input: string) {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function summarizeBody(input?: string | null) {
  if (!input) return null;
  const normalized = input.trim();
  if (!normalized) return null;
  const [firstParagraph] = normalized.split(/\n\s*\n/, 1);
  return (firstParagraph ?? normalized).slice(0, 220);
}

function checklistItemsFromArtifact(content?: string | null): ReleasePacketChecklistItem[] {
  if (!content) return [];
  return content
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      const completed = !/\[\s\]|pending|todo/i.test(line);
      const label = line.replace(/^[-*]\s*/, "").replace(/^\[(?:x|X|\s)\]\s*/, "").trim();
      return {
        id: `check-${index + 1}`,
        label: label || `Checklist item ${index + 1}`,
        completed
      };
    });
}

export function extractDeliverableFromEvents(detail: RunDetail, role: AgentRole): AgentDeliverable | null {
  const event = [...detail.events]
    .reverse()
    .find((item) => item.role === role && item.eventType === "step.completed" && typeof item.payload === "string" && item.payload.length > 0);
  if (!event?.payload) return null;
  try {
    return AgentDeliverableSchema.parse(JSON.parse(event.payload));
  } catch {
    return null;
  }
}

function toDeliverable(detail: RunDetail, role: AgentRole): AgentDeliverable | null {
  const fromEvents = extractDeliverableFromEvents(detail, role);
  if (fromEvents) return fromEvents;
  const step = detail.steps.find((item) => item.role === role && item.status === "completed" && item.output);
  if (!step?.output) return null;
  return {
    summary: step.summary ?? `${role} reused from a previous run.`,
    deliverable: step.output,
    risks: [],
    needsHuman: role === "reviewer" || role === "docs",
    provider: step.provider ?? undefined,
    model: step.model ?? undefined,
    executionMode: step.executionMode ?? undefined,
    inputTokens: step.inputTokens ?? undefined,
    outputTokens: step.outputTokens ?? undefined,
    costUsd: step.costUsd ?? undefined
  };
}

function getRetryResumeRole(detail: RunDetail): AgentRole | null {
  const failedRole = ["router", "coordinator", "research", "pm", "architect", "engineer", "reviewer", "docs"].find((role) =>
    detail.run.failureReason?.toLowerCase().startsWith(`${role} failed`)
  ) as AgentRole | undefined;
  if (failedRole) return failedRole;

  const completedRoles = detail.steps
    .filter((step) => step.status === "completed" && step.output)
    .map((step) => step.role)
    .sort((left, right) => roleIndex(left) - roleIndex(right));

  if (completedRoles.length === 0) return detail.run.status === "failed" ? "router" : null;

  const lastCompletedRole = completedRoles[completedRoles.length - 1]!;
  const nextRole = (["router", "coordinator", "research", "pm", "architect", "engineer", "reviewer", "docs"] as const)[roleIndex(lastCompletedRole) + 1];
  return nextRole ?? null;
}

export function buildRetrySeed(detail: RunDetail, mode: RetryMode): RetrySeed | null {
  if (mode === "full") return null;

  const startAt = getRetryResumeRole(detail);
  if (!startAt) return null;

  const startIndex = roleIndex(startAt);
  const roles = ["router", "coordinator", "research", "pm", "architect", "engineer", "reviewer", "docs"] as const;
  const deliverables = Object.fromEntries(
    roles
      .filter((role) => roleIndex(role) < startIndex)
      .map((role) => [role, toDeliverable(detail, role)])
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
    ...(route ?? (startIndex > 1 ? routeTaskDeterministic(toTaskRequest(detail.task)) : undefined)
      ? { route: route ?? routeTaskDeterministic(toTaskRequest(detail.task)) }
      : {})
  };
}

export function canRetryFailedOnly(detail: RunDetail) {
  const seed = buildRetrySeed(detail, "failed_only");
  if (!seed) return false;
  return seed.startAt !== "router" || Object.keys(seed.deliverables).length > 0 || seed.artifacts.length > 0;
}

export async function seedRetryHistory(runtime: RuntimeServices, runId: string, seed: RetrySeed) {
  const roles = ["router", "coordinator", "research", "pm", "architect", "engineer", "reviewer", "docs"] as const;
  for (const role of roles) {
    const deliverable = seed.deliverables[role];
    if (!deliverable) continue;
    const step = await runtime.storage.createRunStep({
      runId,
      role,
      status: "running",
      input: `Reused from run ${seed.sourceRunId} during failed-only retry.`,
      provider: deliverable.provider ?? null,
      model: deliverable.model ?? null,
      executionMode: deliverable.executionMode ?? "reused",
      inputTokens: deliverable.inputTokens ?? null,
      outputTokens: deliverable.outputTokens ?? null,
      costUsd: deliverable.costUsd ?? null
    });
    await runtime.storage.addRunEvent({
      runId,
      stepId: step.id,
      role,
      eventType: "step.started",
      status: initialStatusForRole(role),
      summary: `${role} reused from run ${seed.sourceRunId}.`,
      payload: JSON.stringify(deliverable)
    });
    await runtime.storage.updateRunStep(step.id, {
      status: "completed",
      summary: deliverable.summary,
      output: deliverable.deliverable,
      endedAt: new Date().toISOString(),
      provider: deliverable.provider ?? null,
      model: deliverable.model ?? null,
      executionMode: deliverable.executionMode ?? "reused",
      inputTokens: deliverable.inputTokens ?? null,
      outputTokens: deliverable.outputTokens ?? null,
      costUsd: deliverable.costUsd ?? null
    });
    await runtime.storage.addRunEvent({
      runId,
      stepId: step.id,
      role,
      eventType: "step.completed",
      summary: deliverable.summary,
      payload: JSON.stringify(deliverable)
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

async function buildWorkflowTask(detail: RunDetail, runtime: RuntimeServices): Promise<{ task: TaskRequest; startOptions?: WorkflowStartOptions }> {
  const githubSettings = await runtime.storage.getGitHubSettings(detail.run.teamId);
  const githubApp = resolveGitHubAppSettings(runtime, githubSettings);
  const { task: sanitizedTask, retrySeed } = extractRetrySeed(toTaskRequest(detail.task));
  const baseTask: TaskRequest = {
    ...sanitizedTask,
    attachments: [...sanitizedTask.attachments, buildWorkflowContextAttachment(sanitizedTask)]
  };
  const startOptions = retrySeed
    ? ({
        startAt: retrySeed.startAt,
        deliverables: retrySeed.deliverables,
        artifacts: retrySeed.artifacts,
        ...(retrySeed.route ? { route: retrySeed.route } : {})
      } satisfies WorkflowStartOptions)
    : undefined;

  if (!isGitHubWorkflowTemplate(detail.task.workflowTemplate)) {
    await runtime.storage.addToolCall({
      runId: detail.run.id,
      toolName: "workflow.context",
      category: "read",
      status: "completed",
      input: detail.task.workflowTemplate,
      output: `Using non-GitHub context for ${detail.task.workflowTemplate}.`
    });

    return {
      task: baseTask,
      ...(startOptions ? { startOptions } : {})
    };
  }

  try {
    const token = null;
    const repoContext = await runtime.github.fetchRepositoryContext({
      targetRepo: detail.task.targetRepo,
      targetBranch: detail.task.targetBranch,
      token,
      app: githubApp,
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

function formatDiffPreview(diffResult: WorkspaceDiffResult) {
  return [
    "## Changed files",
    "",
    diffResult.changedFiles.length > 0 ? diffResult.changedFiles.map((item) => `- ${item}`).join("\n") : "- No changed files reported",
    "",
    "## Git diff",
    "",
    "```diff",
    diffResult.diff || "# No diff output captured",
    "```"
  ].join("\n");
}

async function prepareSoftwareDiffPreview(runtime: RuntimeServices, detail: RunDetail, engineerDeliverable: AgentDeliverable) {
  const plan = engineerDeliverable.engineerPlan;
  if (!plan || plan.fileOperations.length === 0) {
    await runtime.storage.addArtifact({
      runId: detail.run.id,
      artifactType: "diff_preview",
      title: "Diff preview",
      content: "No concrete file operations were proposed, so Workgate could not prepare a managed diff preview."
    });
    return;
  }

  const githubSettings = await runtime.storage.getGitHubSettings(detail.run.teamId);
  const githubApp = resolveGitHubAppSettings(runtime, githubSettings);
  try {
    const workspace = await runtime.github.createManagedWorkspace({
      runId: detail.run.id,
      title: detail.run.title,
      targetRepo: detail.run.targetRepo,
      targetBranch: detail.run.targetBranch,
      token: null,
      app: githubApp,
      allowlist: githubSettings.allowedRepos
    });
    await runtime.storage.addToolCall({
      runId: detail.run.id,
      toolName: "workspace.prepare",
      category: "read",
      status: "completed",
      input: detail.run.targetRepo,
      output: workspace.workspacePath
    });

    await runtime.github.applyFileOperations({
      workspacePath: workspace.workspacePath,
      operations: plan.fileOperations
    });
    await runtime.storage.addToolCall({
      runId: detail.run.id,
      toolName: "workspace.applyFileOperations",
      category: "write",
      status: "completed",
      input: `${plan.fileOperations.length} operations`,
      output: plan.fileOperations.map((item) => `${item.type} ${item.path}`).join(", ")
    });

    const diffResult = await runtime.github.readWorkspaceDiff({
      workspacePath: workspace.workspacePath
    });
    await runtime.storage.addArtifact({
      runId: detail.run.id,
      artifactType: "diff_preview",
      title: "Diff preview",
      content: formatDiffPreview(diffResult)
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to prepare managed diff preview.";
    await runtime.storage.addToolCall({
      runId: detail.run.id,
      toolName: "workspace.applyFileOperations",
      category: "write",
      status: "failed",
      input: `${plan.fileOperations.length} operations`,
      output: message
    });
    await runtime.storage.addArtifact({
      runId: detail.run.id,
      artifactType: "diff_preview",
      title: "Diff preview",
      content: `Workgate could not prepare a managed diff preview.\n\nReason: ${message}`
    });
  }
}

export function extractEngineerPlan(detail: RunDetail): EngineerPlan | null {
  return extractDeliverableFromEvents(detail, "engineer")?.engineerPlan ?? null;
}

export async function processRun(runtime: RuntimeServices, runId: string) {
  if (runtime.activeRuns.has(runId)) {
    return;
  }

  const detail = await runtime.storage.getRunDetail(runId);
  if (!detail) return;
  if (!recoverableStatuses.includes(detail.run.status)) return;

  runtime.activeRuns.add(runId);
  try {
    await runtime.storage.addRunEvent({
      runId,
      eventType: "worker.claimed",
      status: detail.run.status,
      summary: "Worker claimed the run for execution."
    });

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
    const roleSteps = new Map<AgentRole, StepRecord>();
    const iterator = (await streamWorkflow(workflowTask, policies, {
      ...startOptions,
      observer: {
        onStepStart: async ({ role, provider, model, executionMode }) => {
          const liveRun = await runtime.storage.getRunDetail(runId);
          if (!liveRun || liveRun.run.status === "cancelled") return;
          const step = await runtime.storage.createRunStep({
            runId,
            role,
            status: "running",
            input: `Role ${role} executing.`,
            provider: (provider as StepRecord["provider"]) ?? null,
            model: model ?? null,
            executionMode: (executionMode as StepRecord["executionMode"]) ?? null
          });
          roleSteps.set(role, step);
          await runtime.storage.addRunEvent({
            runId,
            stepId: step.id,
            role,
            eventType: "step.started",
            status: initialStatusForRole(role),
            summary: `${role} started.`,
            payload: JSON.stringify({ provider, model, executionMode })
          });
        },
        onStepComplete: async ({ role, deliverable }) => {
          const step = roleSteps.get(role);
          if (!step) return;
          await runtime.storage.updateRunStep(step.id, {
            status: "completed",
            summary: deliverable.summary,
            output: deliverable.deliverable,
            endedAt: new Date().toISOString(),
            provider: deliverable.provider ?? null,
            model: deliverable.model ?? null,
            executionMode: deliverable.executionMode ?? null,
            inputTokens: deliverable.inputTokens ?? null,
            outputTokens: deliverable.outputTokens ?? null,
            costUsd: deliverable.costUsd ?? null
          });
          await runtime.storage.addRunEvent({
            runId,
            stepId: step.id,
            role,
            eventType: "step.completed",
            summary: deliverable.summary,
            payload: JSON.stringify(deliverable)
          });
          await runtime.storage.addToolCall({
            runId,
            stepId: step.id,
            toolName: role === "router" && deliverable.executionMode === "rule" ? "router.decision" : "model.invoke",
            category: "read",
            status: "completed",
            input: `${role} -> ${deliverable.provider ?? "rule-based"}/${deliverable.model ?? "deterministic"} (${deliverable.executionMode ?? "live"})`,
            output: deliverable.summary
          });
        },
        onStepFailed: async ({ role, error, provider, model, executionMode }) => {
          const existing = roleSteps.get(role);
          const step =
            existing ??
            (await runtime.storage.createRunStep({
              runId,
              role,
              status: "running",
              input: `Role ${role} executing.`,
              provider: (provider as StepRecord["provider"]) ?? null,
              model: model ?? null,
              executionMode: (executionMode as StepRecord["executionMode"]) ?? null
            }));
          roleSteps.set(role, step);
          await runtime.storage.updateRunStep(step.id, {
            status: "failed",
            error,
            endedAt: new Date().toISOString(),
            provider: (provider as StepRecord["provider"]) ?? null,
            model: model ?? null,
            executionMode: (executionMode as StepRecord["executionMode"]) ?? null
          });
          await runtime.storage.addRunEvent({
            runId,
            stepId: step.id,
            role,
            eventType: "step.failed",
            summary: error,
            payload: JSON.stringify({ provider, model, executionMode })
          });
        }
      }
    })) as unknown as AsyncIterable<Record<string, Record<string, unknown>>>;

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

        const deliverable = (update.deliverables as Record<string, AgentDeliverable> | undefined)?.[role];
        if (deliverable && role === "engineer" && liveRun.task.workflowTemplate === "software_delivery") {
          await prepareSoftwareDiffPreview(runtime, liveRun, deliverable);
        }

        const artifacts = Array.isArray(update.artifacts)
          ? (update.artifacts as Array<{ artifactType: ArtifactType; title: string; content: string }>)
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
    await runtime.storage.addRunEvent({
      runId,
      eventType: "approval.requested",
      status: "pending_human",
      summary: "Run is waiting for operator approval."
    });
    await runtime.storage.updateRun(runId, { status: "pending_human" });
  } catch (error) {
    const liveRun = await runtime.storage.getRunDetail(runId);
    if (!liveRun || liveRun.run.status === "cancelled") {
      return;
    }
    const message = error instanceof Error ? error.message : "Unknown workflow failure.";
    await runtime.storage.updateRun(runId, {
      status: "failed",
      failureReason: message
    });
  } finally {
    runtime.activeRuns.delete(runId);
  }
}

export async function startWorker(runtime: RuntimeServices) {
  if (!runtime.workerStarted) {
    await runtime.consumer.start(async (runId) => {
      await processRun(runtime, runId);
    });
    runtime.workerStarted = true;
  }

  const recoverableRuns = await runtime.storage.listRunsByStatus(recoverableStatuses);
  for (const run of recoverableRuns) {
    void processRun(runtime, run.id);
  }

  return runtime;
}

export async function stopWorker(runtime: RuntimeServices) {
  if (!runtime.workerStarted) return;
  await runtime.consumer.stop();
  runtime.workerStarted = false;
}

export function buildReleasePacketView(detail: RunDetail): ReleasePacketView | null {
  if (detail.run.workflowTemplate !== "rfp_response") {
    return null;
  }

  const artifactOrder: ArtifactType[] = ["research_note", "prd", "architecture_memo", "review_report", "approval_checklist", "release_packet"];
  const sections = artifactOrder
    .map((artifactType) => detail.artifacts.find((artifact) => artifact.artifactType === artifactType))
    .filter((artifact): artifact is NonNullable<typeof artifact> => Boolean(artifact))
    .map((artifact) => ({
      artifactType: artifact.artifactType,
      title: artifact.title,
      body: artifact.content
    }));

  const checklistArtifact = detail.artifacts.find((artifact) => artifact.artifactType === "approval_checklist");
  const packetArtifact = detail.artifacts.find((artifact) => artifact.artifactType === "release_packet");
  const reviewArtifact = detail.artifacts.find((artifact) => artifact.artifactType === "review_report");
  const workflowInput = detail.task.workflowInput as {
    accountName?: string;
    knowledgeSource?: string;
  };
  const accountName = workflowInput.accountName ?? detail.task.targetRepo;
  const knowledgeSourceSummary = workflowInput.knowledgeSource ?? detail.task.targetBranch;
  const packetSummary =
    summarizeBody(packetArtifact?.content) ??
    summarizeBody(reviewArtifact?.content) ??
    detail.run.finalSummary ??
    "Proposal packet is ready for operator review.";

  return {
    runId: detail.run.id,
    title: detail.run.title,
    workflowTemplate: "rfp_response",
    accountName,
    knowledgeSourceSummary,
    finalSummary: detail.run.finalSummary,
    packetSummary,
    exportFilename: `${slugifyExportFilename(detail.run.title || "proposal-packet")}.pdf`,
    checklistItems: checklistItemsFromArtifact(checklistArtifact?.content),
    sections
  };
}

export function buildApprovalQueueItem(detail: RunDetail): ApprovalQueueItem {
  const completedSteps = detail.steps.filter((step) => step.status === "completed");
  const lastCompletedRole = completedSteps.length > 0 ? completedSteps[completedSteps.length - 1]?.role ?? null : null;
  const reviewArtifact = detail.artifacts.find((artifact) => artifact.artifactType === "review_report");
  const releasePacket = buildReleasePacketView(detail);
  const readyReason =
    detail.run.workflowTemplate === "rfp_response"
      ? "Proposal packet, approval checklist, and print-ready export are ready."
      : "Diff preview, review report, and test report are ready.";
  const latestEventAt = detail.events.length > 0 ? detail.events[detail.events.length - 1]?.createdAt ?? null : null;

  return {
    ...detail.run,
    teamName: null,
    lastCompletedRole,
    approvalReadyReason: readyReason,
    quickRiskSummary: reviewArtifact?.content.slice(0, 160) ?? releasePacket?.packetSummary ?? "No review summary captured yet.",
    packetSummary: releasePacket?.packetSummary ?? null,
    sourceSummary: releasePacket?.knowledgeSourceSummary ?? null,
    latestEventAt
  };
}

export function buildRetryTask(detail: RunDetail, mode: RetryMode): TaskRequest {
  const baseTask = toTaskRequest(detail.task);
  const seed = buildRetrySeed(detail, mode);
  return {
    ...baseTask,
    attachments: seed
      ? [...baseTask.attachments.filter((attachment) => !isRetryAttachment(attachment)), buildRetryAttachment(seed)]
      : baseTask.attachments.filter((attachment) => !isRetryAttachment(attachment))
  };
}

export function normalizeAllowedRepos(items: string[]) {
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
