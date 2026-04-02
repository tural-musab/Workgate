import { z } from "zod";

export const agentRoles = ["router", "coordinator", "research", "pm", "architect", "engineer", "reviewer", "docs"] as const;
export const runStatuses = ["queued", "routing", "planning", "executing", "reviewing", "pending_human", "completed", "failed", "cancelled"] as const;
export const stepStatuses = ["pending", "running", "completed", "failed"] as const;
export const artifactTypes = [
  "research_note",
  "prd",
  "architecture_memo",
  "patch_summary",
  "diff_preview",
  "test_report",
  "review_report",
  "approval_checklist",
  "release_packet",
  "changelog"
] as const;
export const runEventTypes = [
  "run.queued",
  "worker.claimed",
  "step.started",
  "step.completed",
  "step.failed",
  "approval.requested",
  "approval.approved",
  "approval.rejected",
  "github.branch.prepared",
  "github.pr.opened",
  "workflow.packet.ready"
] as const;
export const toolCategories = ["read", "write", "high-risk"] as const;
export const approvalActions = ["approve", "reject"] as const;
export const retryModes = ["full", "failed_only"] as const;
export const taskTypes = ["bugfix", "feature", "research", "ops"] as const;
export const workflowTemplates = ["software_delivery", "rfp_response", "social_media_ops", "security_questionnaire"] as const;
export const activeWorkflowTemplates = ["software_delivery", "rfp_response"] as const;
export const modelProviders = ["openai", "anthropic", "google", "mock"] as const;
export const executionModes = ["live", "mock", "rule", "reused"] as const;

export type AgentRole = (typeof agentRoles)[number];
export type RunStatus = (typeof runStatuses)[number];
export type StepStatus = (typeof stepStatuses)[number];
export type ArtifactType = (typeof artifactTypes)[number];
export type RunEventType = (typeof runEventTypes)[number];
export type ToolCategory = (typeof toolCategories)[number];
export type ApprovalAction = (typeof approvalActions)[number];
export type RetryMode = (typeof retryModes)[number];
export type TaskType = (typeof taskTypes)[number];
export type WorkflowTemplateId = (typeof workflowTemplates)[number];
export type ModelProvider = (typeof modelProviders)[number];
export type ExecutionMode = (typeof executionModes)[number];

export const AttachmentSchema = z.object({
  name: z.string().min(1),
  type: z.enum(["text", "markdown", "json"]).default("text"),
  content: z.string().min(1)
});

export const SoftwareDeliveryWorkflowInputSchema = z.object({
  repository: z.string().min(1).max(255),
  branch: z.string().min(1).max(255)
});

export const RfpResponseWorkflowInputSchema = z.object({
  accountName: z.string().min(1).max(255),
  knowledgeSource: z.string().min(1).max(255)
});

export const SocialMediaOpsWorkflowInputSchema = z.object({
  brandAccount: z.string().min(1).max(255),
  channelMix: z.string().min(1).max(255)
});

export const SecurityQuestionnaireWorkflowInputSchema = z.object({
  vendorProfile: z.string().min(1).max(255),
  evidenceSet: z.string().min(1).max(255)
});

const TaskBaseSchema = z.object({
  title: z.string().min(3).max(160),
  goal: z.string().min(10).max(8000),
  taskType: z.enum(taskTypes),
  constraints: z.array(z.string().min(1)).default([]),
  acceptanceCriteria: z.array(z.string().min(1)).default([]),
  attachments: z.array(AttachmentSchema).default([])
});

export const CreateTaskPayloadSchema = z.discriminatedUnion("workflowTemplate", [
  TaskBaseSchema.extend({
    workflowTemplate: z.literal("software_delivery"),
    workflowInput: SoftwareDeliveryWorkflowInputSchema
  }),
  TaskBaseSchema.extend({
    workflowTemplate: z.literal("rfp_response"),
    workflowInput: RfpResponseWorkflowInputSchema
  }),
  TaskBaseSchema.extend({
    workflowTemplate: z.literal("social_media_ops"),
    workflowInput: SocialMediaOpsWorkflowInputSchema
  }),
  TaskBaseSchema.extend({
    workflowTemplate: z.literal("security_questionnaire"),
    workflowInput: SecurityQuestionnaireWorkflowInputSchema
  })
]);

export const WorkflowInputSchema = z.union([
  SoftwareDeliveryWorkflowInputSchema,
  RfpResponseWorkflowInputSchema,
  SocialMediaOpsWorkflowInputSchema,
  SecurityQuestionnaireWorkflowInputSchema
]);

export const TaskRequestSchema = TaskBaseSchema.extend({
  workflowTemplate: z.enum(workflowTemplates).default("software_delivery"),
  workflowInput: WorkflowInputSchema,
  targetRepo: z.string().min(1).max(255),
  targetBranch: z.string().min(1).max(255)
});

export const TaskRouteSchema = z.object({
  route: z.enum(["research", "pm", "architect", "engineer", "qa", "docs", "human"]),
  risk: z.enum(["low", "medium", "high"]),
  reason: z.string().min(1),
  needsHuman: z.boolean()
});

export const EngineerFileOperationSchema = z.object({
  type: z.enum(["write", "append", "delete"]),
  path: z.string().min(1),
  content: z.string().optional(),
  rationale: z.string().optional()
});

export const EngineerPlanSchema = z.object({
  summary: z.string().min(1),
  changePlan: z.array(z.string().min(1)).default([]),
  fileOperations: z.array(EngineerFileOperationSchema).default([]),
  testPlan: z.array(z.string().min(1)).default([]),
  rollbackPlan: z.array(z.string().min(1)).default([])
});

export const AgentDeliverableSchema = z.object({
  summary: z.string().min(1),
  deliverable: z.string().min(1),
  risks: z.array(z.string()).default([]),
  needsHuman: z.boolean().default(false),
  provider: z.enum(modelProviders).optional(),
  model: z.string().optional(),
  executionMode: z.enum(executionModes).optional(),
  inputTokens: z.number().nonnegative().optional(),
  outputTokens: z.number().nonnegative().optional(),
  costUsd: z.number().nonnegative().optional(),
  engineerPlan: EngineerPlanSchema.optional()
});

export const ArtifactRecordSchema = z.object({
  id: z.string(),
  runId: z.string(),
  artifactType: z.enum(artifactTypes),
  title: z.string(),
  content: z.string(),
  createdAt: z.string()
});

export const StepRecordSchema = z.object({
  id: z.string(),
  runId: z.string(),
  role: z.enum(agentRoles),
  status: z.enum(stepStatuses),
  summary: z.string().nullable(),
  input: z.string().nullable(),
  output: z.string().nullable(),
  error: z.string().nullable(),
  provider: z.enum(modelProviders).nullable(),
  model: z.string().nullable(),
  executionMode: z.enum(executionModes).nullable(),
  inputTokens: z.number().nullable(),
  outputTokens: z.number().nullable(),
  costUsd: z.number().nullable(),
  startedAt: z.string().nullable(),
  endedAt: z.string().nullable()
});

export const ApprovalRecordSchema = z.object({
  id: z.string(),
  runId: z.string(),
  action: z.enum(approvalActions).nullable(),
  reviewer: z.string().nullable(),
  notes: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string()
});

export const RunEventRecordSchema = z.object({
  id: z.string(),
  runId: z.string(),
  stepId: z.string().nullable(),
  role: z.enum(agentRoles).nullable(),
  eventType: z.enum(runEventTypes),
  status: z.enum(runStatuses).nullable(),
  summary: z.string(),
  payload: z.string().nullable(),
  createdAt: z.string()
});

export const ToolCallRecordSchema = z.object({
  id: z.string(),
  runId: z.string(),
  stepId: z.string().nullable(),
  toolName: z.string(),
  category: z.enum(toolCategories),
  status: z.enum(["planned", "completed", "blocked", "failed"]),
  input: z.string().nullable(),
  output: z.string().nullable(),
  createdAt: z.string()
});

export const RunRecordSchema = z.object({
  id: z.string(),
  taskRequestId: z.string(),
  status: z.enum(runStatuses),
  title: z.string(),
  taskType: z.enum(taskTypes),
  workflowTemplate: z.enum(workflowTemplates),
  targetRepo: z.string(),
  targetBranch: z.string(),
  branchName: z.string().nullable(),
  failureReason: z.string().nullable(),
  finalSummary: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string()
});

export const ApprovalQueueItemSchema = RunRecordSchema.extend({
  lastCompletedRole: z.enum(agentRoles).nullable(),
  approvalReadyReason: z.string(),
  quickRiskSummary: z.string(),
  latestEventAt: z.string().nullable()
});

export const RunDetailSchema = z.object({
  run: RunRecordSchema,
  task: TaskRequestSchema.extend({
    id: z.string(),
    createdAt: z.string()
  }),
  steps: z.array(StepRecordSchema),
  artifacts: z.array(ArtifactRecordSchema),
  approvals: z.array(ApprovalRecordSchema),
  events: z.array(RunEventRecordSchema),
  toolCalls: z.array(ToolCallRecordSchema)
});

export const GitHubRepoConnectionSchema = z.object({
  id: z.string().optional(),
  provider: z.literal("github").default("github"),
  owner: z.string().min(1),
  repo: z.string().min(1),
  isAllowed: z.boolean().default(true),
  createdAt: z.string().optional()
});

export const GitHubSettingsSchema = z.object({
  token: z.string().min(1),
  allowedRepos: z.array(GitHubRepoConnectionSchema).default([])
});

export const GitHubSettingsViewSchema = z.object({
  hasToken: z.boolean(),
  maskedToken: z.string().nullable(),
  allowedRepos: z.array(GitHubRepoConnectionSchema)
});

export const RetryRunPayloadSchema = z.object({
  mode: z.enum(retryModes)
});

export const ModelPolicySchema = z.object({
  role: z.enum(agentRoles),
  provider: z.enum(modelProviders),
  model: z.string().min(1),
  reviewerProvider: z.enum(modelProviders).optional(),
  reviewerModel: z.string().optional()
});

export const DashboardSummarySchema = z.object({
  totalRuns: z.number().int().nonnegative(),
  pendingApprovals: z.number().int().nonnegative(),
  activeRuns: z.number().int().nonnegative(),
  failedRuns: z.number().int().nonnegative()
});

export type Attachment = z.infer<typeof AttachmentSchema>;
export type SoftwareDeliveryWorkflowInput = z.infer<typeof SoftwareDeliveryWorkflowInputSchema>;
export type RfpResponseWorkflowInput = z.infer<typeof RfpResponseWorkflowInputSchema>;
export type SocialMediaOpsWorkflowInput = z.infer<typeof SocialMediaOpsWorkflowInputSchema>;
export type SecurityQuestionnaireWorkflowInput = z.infer<typeof SecurityQuestionnaireWorkflowInputSchema>;
export type WorkflowInput = z.infer<typeof WorkflowInputSchema>;
export type CreateTaskPayload = z.infer<typeof CreateTaskPayloadSchema>;
export type TaskRequest = z.infer<typeof TaskRequestSchema>;
export type TaskRoute = z.infer<typeof TaskRouteSchema>;
export type EngineerFileOperation = z.infer<typeof EngineerFileOperationSchema>;
export type EngineerPlan = z.infer<typeof EngineerPlanSchema>;
export type AgentDeliverable = z.infer<typeof AgentDeliverableSchema>;
export type ArtifactRecord = z.infer<typeof ArtifactRecordSchema>;
export type StepRecord = z.infer<typeof StepRecordSchema>;
export type ApprovalRecord = z.infer<typeof ApprovalRecordSchema>;
export type RunEventRecord = z.infer<typeof RunEventRecordSchema>;
export type ToolCallRecord = z.infer<typeof ToolCallRecordSchema>;
export type RunRecord = z.infer<typeof RunRecordSchema>;
export type ApprovalQueueItem = z.infer<typeof ApprovalQueueItemSchema>;
export type RunDetail = z.infer<typeof RunDetailSchema>;
export type GitHubRepoConnection = z.infer<typeof GitHubRepoConnectionSchema>;
export type GitHubSettings = z.infer<typeof GitHubSettingsSchema>;
export type GitHubSettingsView = z.infer<typeof GitHubSettingsViewSchema>;
export type RetryRunPayload = z.infer<typeof RetryRunPayloadSchema>;
export type ModelPolicy = z.infer<typeof ModelPolicySchema>;
export type DashboardSummary = z.infer<typeof DashboardSummarySchema>;

export const defaultModelPolicies: ModelPolicy[] = [
  { role: "router", provider: "google", model: "gemini-3.1-pro-preview" },
  { role: "coordinator", provider: "openai", model: "gpt-5.4" },
  { role: "research", provider: "google", model: "gemini-3.1-pro-preview" },
  { role: "pm", provider: "google", model: "gemini-3.1-pro-preview" },
  { role: "architect", provider: "openai", model: "gpt-5.4" },
  { role: "engineer", provider: "openai", model: "gpt-5.4", reviewerProvider: "anthropic", reviewerModel: "claude-sonnet-4-6" },
  { role: "reviewer", provider: "anthropic", model: "claude-sonnet-4-6" },
  { role: "docs", provider: "anthropic", model: "claude-sonnet-4-6" }
];

export function deriveWorkflowTargets(workflowTemplate: WorkflowTemplateId, workflowInput: WorkflowInput) {
  switch (workflowTemplate) {
    case "rfp_response": {
      const input = RfpResponseWorkflowInputSchema.parse(workflowInput);
      return {
        targetRepo: input.accountName,
        targetBranch: input.knowledgeSource
      };
    }
    case "social_media_ops": {
      const input = SocialMediaOpsWorkflowInputSchema.parse(workflowInput);
      return {
        targetRepo: input.brandAccount,
        targetBranch: input.channelMix
      };
    }
    case "security_questionnaire": {
      const input = SecurityQuestionnaireWorkflowInputSchema.parse(workflowInput);
      return {
        targetRepo: input.vendorProfile,
        targetBranch: input.evidenceSet
      };
    }
    case "software_delivery":
    default: {
      const input = SoftwareDeliveryWorkflowInputSchema.parse(workflowInput);
      return {
        targetRepo: input.repository,
        targetBranch: input.branch
      };
    }
  }
}

export function normalizeCreateTaskPayload(input: CreateTaskPayload): TaskRequest {
  const targets = deriveWorkflowTargets(input.workflowTemplate, input.workflowInput);
  return TaskRequestSchema.parse({
    ...input,
    ...targets
  });
}

export function isPlanningStatus(status: RunStatus) {
  return ["routing", "planning", "executing", "reviewing"].includes(status);
}

export function isActiveRunStatus(status: RunStatus) {
  return ["queued", "routing", "planning", "executing", "reviewing", "pending_human"].includes(status);
}

export function isTerminalRunStatus(status: RunStatus) {
  return ["completed", "failed", "cancelled"].includes(status);
}

export function canCancelRun(status: RunStatus) {
  return isActiveRunStatus(status);
}

export function canDeleteRun(status: RunStatus) {
  return isTerminalRunStatus(status);
}

export function canRetryRun(status: RunStatus) {
  return isTerminalRunStatus(status);
}

export function isActiveWorkflowTemplate(template: WorkflowTemplateId) {
  return (activeWorkflowTemplates as readonly string[]).includes(template);
}

export function isGitHubWorkflowTemplate(template: WorkflowTemplateId) {
  return template === "software_delivery";
}

export function isValidGitHubRepoSlug(value: string) {
  return /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(value);
}

const runTransitions: Record<RunStatus, RunStatus[]> = {
  queued: ["routing", "cancelled", "failed"],
  routing: ["planning", "failed", "cancelled"],
  planning: ["executing", "failed", "cancelled"],
  executing: ["reviewing", "failed", "cancelled"],
  reviewing: ["pending_human", "failed", "cancelled"],
  pending_human: ["completed", "failed", "cancelled"],
  completed: [],
  failed: [],
  cancelled: []
};

export function canTransitionRunStatus(from: RunStatus, to: RunStatus) {
  return runTransitions[from].includes(to);
}
