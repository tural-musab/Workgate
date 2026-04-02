import { z } from "zod";

export const agentRoles = [
  "router",
  "coordinator",
  "research",
  "pm",
  "architect",
  "engineer",
  "reviewer",
  "docs"
] as const;

export const runStatuses = [
  "queued",
  "routing",
  "planning",
  "executing",
  "reviewing",
  "pending_human",
  "completed",
  "failed",
  "cancelled"
] as const;

export const stepStatuses = ["pending", "running", "completed", "failed"] as const;

export const artifactTypes = [
  "research_note",
  "prd",
  "architecture_memo",
  "patch_summary",
  "test_report",
  "review_report",
  "changelog"
] as const;

export const toolCategories = ["read", "write", "high-risk"] as const;

export const approvalActions = ["approve", "reject"] as const;
export const retryModes = ["full", "failed_only"] as const;

export const taskTypes = ["bugfix", "feature", "research", "ops"] as const;
export const workflowTemplates = ["software_delivery", "rfp_response", "social_media_ops", "security_questionnaire"] as const;
export const activeWorkflowTemplates = ["software_delivery", "rfp_response"] as const;

export const modelProviders = ["openai", "anthropic", "google", "mock"] as const;

export type AgentRole = (typeof agentRoles)[number];
export type RunStatus = (typeof runStatuses)[number];
export type StepStatus = (typeof stepStatuses)[number];
export type ArtifactType = (typeof artifactTypes)[number];
export type ToolCategory = (typeof toolCategories)[number];
export type ApprovalAction = (typeof approvalActions)[number];
export type RetryMode = (typeof retryModes)[number];
export type TaskType = (typeof taskTypes)[number];
export type WorkflowTemplateId = (typeof workflowTemplates)[number];
export type ModelProvider = (typeof modelProviders)[number];

export const AttachmentSchema = z.object({
  name: z.string().min(1),
  type: z.enum(["text", "markdown", "json"]).default("text"),
  content: z.string().min(1)
});

export const TaskRequestSchema = z.object({
  title: z.string().min(3).max(160),
  goal: z.string().min(10).max(8000),
  taskType: z.enum(taskTypes),
  workflowTemplate: z.enum(workflowTemplates).default("software_delivery"),
  targetRepo: z.string().min(1).max(255),
  targetBranch: z.string().min(1).max(255),
  constraints: z.array(z.string().min(1)).default([]),
  acceptanceCriteria: z.array(z.string().min(1)).default([]),
  attachments: z.array(AttachmentSchema).default([])
});

export const TaskRouteSchema = z.object({
  route: z.enum(["research", "pm", "architect", "engineer", "qa", "docs", "human"]),
  risk: z.enum(["low", "medium", "high"]),
  reason: z.string().min(1),
  needsHuman: z.boolean()
});

export const AgentDeliverableSchema = z.object({
  summary: z.string().min(1),
  deliverable: z.string().min(1),
  risks: z.array(z.string()).default([]),
  needsHuman: z.boolean().default(false),
  provider: z.enum(modelProviders).optional(),
  model: z.string().optional(),
  executionMode: z.enum(["live", "mock", "rule"]).optional()
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

export const RunDetailSchema = z.object({
  run: RunRecordSchema,
  task: TaskRequestSchema.extend({
    id: z.string(),
    createdAt: z.string()
  }),
  steps: z.array(StepRecordSchema),
  artifacts: z.array(ArtifactRecordSchema),
  approvals: z.array(ApprovalRecordSchema),
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
export type TaskRequest = z.infer<typeof TaskRequestSchema>;
export type TaskRoute = z.infer<typeof TaskRouteSchema>;
export type AgentDeliverable = z.infer<typeof AgentDeliverableSchema>;
export type ArtifactRecord = z.infer<typeof ArtifactRecordSchema>;
export type StepRecord = z.infer<typeof StepRecordSchema>;
export type ApprovalRecord = z.infer<typeof ApprovalRecordSchema>;
export type ToolCallRecord = z.infer<typeof ToolCallRecordSchema>;
export type RunRecord = z.infer<typeof RunRecordSchema>;
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
