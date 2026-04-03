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
export const workspaceRoles = ["workspace_owner", "workspace_admin"] as const;
export const teamRoles = ["team_operator", "team_reviewer", "team_viewer"] as const;
export const approvalPolicyScopeTypes = ["workspace_default", "team_override"] as const;
export const authModes = ["seed_admin", "supabase"] as const;
export const executionBackends = ["local", "remote_sandbox"] as const;

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
export type WorkspaceRole = (typeof workspaceRoles)[number];
export type TeamRole = (typeof teamRoles)[number];
export type ApprovalPolicyScopeType = (typeof approvalPolicyScopeTypes)[number];
export type AuthMode = (typeof authModes)[number];
export type ExecutionBackend = (typeof executionBackends)[number];

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
  knowledgeSource: z.string().min(1).max(255),
  knowledgeSourceId: z.string().min(1).optional()
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
    teamId: z.string().min(1),
    workflowTemplate: z.literal("software_delivery"),
    workflowInput: SoftwareDeliveryWorkflowInputSchema
  }),
  TaskBaseSchema.extend({
    teamId: z.string().min(1),
    workflowTemplate: z.literal("rfp_response"),
    workflowInput: RfpResponseWorkflowInputSchema
  }),
  TaskBaseSchema.extend({
    teamId: z.string().min(1),
    workflowTemplate: z.literal("social_media_ops"),
    workflowInput: SocialMediaOpsWorkflowInputSchema
  }),
  TaskBaseSchema.extend({
    teamId: z.string().min(1),
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
  workspaceId: z.string().min(1),
  teamId: z.string().min(1),
  createdBy: z.string().min(1),
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
  workspaceId: z.string(),
  teamId: z.string(),
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
  teamName: z.string().nullable(),
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
  workspaceId: z.string().optional(),
  teamId: z.string().optional(),
  provider: z.literal("github").default("github"),
  owner: z.string().min(1),
  repo: z.string().min(1),
  isAllowed: z.boolean().default(true),
  createdAt: z.string().optional()
});

export const GitHubAppSettingsSchema = z.object({
  appId: z.string().min(1),
  installationId: z.string().min(1),
  privateKeyPem: z.string().min(1),
  appSlug: z.string().min(1).optional()
});

export const GitHubAppSettingsViewSchema = z.object({
  hasApp: z.boolean(),
  appId: z.string().nullable(),
  installationId: z.string().nullable(),
  appSlug: z.string().nullable(),
  maskedPrivateKey: z.string().nullable(),
  allowedRepos: z.array(GitHubRepoConnectionSchema)
});

export const WorkspaceRecordSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  createdAt: z.string()
});

export const TeamRecordSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  name: z.string(),
  slug: z.string(),
  description: z.string().nullable(),
  createdAt: z.string()
});

export const WorkspaceMemberRecordSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  email: z.string().email(),
  displayName: z.string().nullable(),
  workspaceRole: z.enum(workspaceRoles).nullable(),
  createdAt: z.string()
});

export const TeamMembershipRecordSchema = z.object({
  id: z.string(),
  teamId: z.string(),
  workspaceMemberId: z.string(),
  teamRole: z.enum(teamRoles),
  createdAt: z.string()
});

export const TeamWorkflowAccessRecordSchema = z.object({
  id: z.string(),
  teamId: z.string(),
  workflowTemplate: z.enum(workflowTemplates),
  createdAt: z.string()
});

export const TeamWorkflowAccessInputSchema = z.object({
  teamId: z.string().min(1),
  allowedWorkflows: z.array(z.enum(workflowTemplates)).default([])
});

export const SessionTeamSchema = TeamRecordSchema.extend({
  teamRole: z.enum(teamRoles)
});

export const SessionSchema = z.object({
  authMode: z.enum(authModes),
  userId: z.string(),
  email: z.string().email().nullable(),
  displayName: z.string(),
  workspace: WorkspaceRecordSchema,
  workspaceRole: z.enum(workspaceRoles).nullable(),
  teams: z.array(SessionTeamSchema),
  activeTeamId: z.string().nullable(),
  activeTeam: SessionTeamSchema.nullable(),
  canViewAllTeams: z.boolean()
});

export const ApprovalPolicySchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  teamId: z.string().nullable(),
  scopeType: z.enum(approvalPolicyScopeTypes),
  workflowTemplate: z.enum(workflowTemplates),
  minApprovals: z.number().int().positive(),
  approverRoles: z.array(z.enum(teamRoles)),
  requireRejectNote: z.boolean(),
  requireSecondApprovalForExternalWrite: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string()
});

export const SaveApprovalPolicySchema = z.object({
  teamId: z.string().nullable(),
  scopeType: z.enum(approvalPolicyScopeTypes),
  workflowTemplate: z.enum(workflowTemplates),
  minApprovals: z.number().int().positive(),
  approverRoles: z.array(z.enum(teamRoles)).min(1),
  requireRejectNote: z.boolean().default(false),
  requireSecondApprovalForExternalWrite: z.boolean().default(false)
});

export const TeamManagementSchema = z.object({
  name: z.string().min(2).max(120),
  slug: z.string().min(2).max(120),
  description: z.string().max(280).nullable().default(null),
  allowedWorkflows: z.array(z.enum(workflowTemplates)).default(activeWorkflowTemplates as unknown as WorkflowTemplateId[])
});

export const WorkspaceMemberInputSchema = z.object({
  email: z.string().email(),
  displayName: z.string().min(1).max(160).nullable().default(null),
  workspaceRole: z.enum(workspaceRoles).nullable().default(null),
  teamMemberships: z
    .array(
      z.object({
        teamId: z.string().min(1),
        teamRole: z.enum(teamRoles)
      })
    )
    .min(1)
});

export const UsageFiltersSchema = z.object({
  teamId: z.string().nullable().default(null),
  workflowTemplate: z.enum(workflowTemplates).nullable().default(null),
  provider: z.enum(modelProviders).nullable().default(null),
  model: z.string().nullable().default(null),
  windowDays: z.union([z.literal(7), z.literal(30), z.literal(90)]).default(30)
});

export const UsageProviderBreakdownSchema = z.object({
  provider: z.enum(modelProviders).nullable(),
  model: z.string().nullable(),
  runs: z.number().int().nonnegative(),
  inputTokens: z.number().nonnegative(),
  outputTokens: z.number().nonnegative(),
  costUsd: z.number().nonnegative()
});

export const UsageTeamBreakdownSchema = z.object({
  teamId: z.string(),
  teamName: z.string(),
  runs: z.number().int().nonnegative(),
  inputTokens: z.number().nonnegative(),
  outputTokens: z.number().nonnegative(),
  costUsd: z.number().nonnegative()
});

export const UsageSummarySchema = z.object({
  filters: UsageFiltersSchema,
  totalRuns: z.number().int().nonnegative(),
  totalInputTokens: z.number().nonnegative(),
  totalOutputTokens: z.number().nonnegative(),
  totalCostUsd: z.number().nonnegative(),
  byProvider: z.array(UsageProviderBreakdownSchema),
  byTeam: z.array(UsageTeamBreakdownSchema)
});

export const KnowledgeSourceSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  teamId: z.string(),
  name: z.string(),
  sourceType: z.enum(["markdown", "text", "json"]),
  description: z.string().nullable(),
  storagePath: z.string().nullable(),
  content: z.string().nullable(),
  createdBy: z.string(),
  createdAt: z.string()
});

export const KnowledgeSourceInputSchema = z.object({
  teamId: z.string().min(1),
  name: z.string().min(2).max(160),
  sourceType: z.enum(["markdown", "text", "json"]).default("markdown"),
  description: z.string().max(280).nullable().default(null),
  content: z.string().min(1)
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
export type GitHubAppSettings = z.infer<typeof GitHubAppSettingsSchema>;
export type GitHubAppSettingsView = z.infer<typeof GitHubAppSettingsViewSchema>;
export type WorkspaceRecord = z.infer<typeof WorkspaceRecordSchema>;
export type TeamRecord = z.infer<typeof TeamRecordSchema>;
export type WorkspaceMemberRecord = z.infer<typeof WorkspaceMemberRecordSchema>;
export type TeamMembershipRecord = z.infer<typeof TeamMembershipRecordSchema>;
export type TeamWorkflowAccessRecord = z.infer<typeof TeamWorkflowAccessRecordSchema>;
export type TeamWorkflowAccessInput = z.infer<typeof TeamWorkflowAccessInputSchema>;
export type SessionTeam = z.infer<typeof SessionTeamSchema>;
export type Session = z.infer<typeof SessionSchema>;
export type ApprovalPolicy = z.infer<typeof ApprovalPolicySchema>;
export type SaveApprovalPolicyInput = z.infer<typeof SaveApprovalPolicySchema>;
export type TeamManagementInput = z.infer<typeof TeamManagementSchema>;
export type WorkspaceMemberInput = z.infer<typeof WorkspaceMemberInputSchema>;
export type UsageFilters = z.infer<typeof UsageFiltersSchema>;
export type UsageProviderBreakdown = z.infer<typeof UsageProviderBreakdownSchema>;
export type UsageTeamBreakdown = z.infer<typeof UsageTeamBreakdownSchema>;
export type UsageSummary = z.infer<typeof UsageSummarySchema>;
export type KnowledgeSource = z.infer<typeof KnowledgeSourceSchema>;
export type KnowledgeSourceInput = z.infer<typeof KnowledgeSourceInputSchema>;
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

export const defaultApprovalPolicies: Array<Omit<ApprovalPolicy, "id" | "workspaceId" | "teamId" | "createdAt" | "updatedAt">> = [
  {
    scopeType: "workspace_default",
    workflowTemplate: "software_delivery",
    minApprovals: 1,
    approverRoles: ["team_reviewer"],
    requireRejectNote: true,
    requireSecondApprovalForExternalWrite: false
  },
  {
    scopeType: "workspace_default",
    workflowTemplate: "rfp_response",
    minApprovals: 1,
    approverRoles: ["team_reviewer"],
    requireRejectNote: true,
    requireSecondApprovalForExternalWrite: false
  }
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

export function normalizeCreateTaskPayload(
  input: CreateTaskPayload,
  context: { workspaceId: string; createdBy: string }
): TaskRequest {
  const targets = deriveWorkflowTargets(input.workflowTemplate, input.workflowInput);
  return TaskRequestSchema.parse({
    ...input,
    workspaceId: context.workspaceId,
    createdBy: context.createdBy,
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

export function canManageWorkspace(workspaceRole: WorkspaceRole | null) {
  return workspaceRole === "workspace_owner" || workspaceRole === "workspace_admin";
}

export function canViewAllTeams(workspaceRole: WorkspaceRole | null) {
  return canManageWorkspace(workspaceRole);
}

export function canCreateTasks(teamRole: TeamRole | null, workspaceRole: WorkspaceRole | null) {
  if (canManageWorkspace(workspaceRole)) return true;
  return teamRole === "team_operator" || teamRole === "team_reviewer";
}

export function canReviewRuns(teamRole: TeamRole | null, workspaceRole: WorkspaceRole | null) {
  if (canManageWorkspace(workspaceRole)) return true;
  return teamRole === "team_reviewer";
}

export function canOperateRuns(teamRole: TeamRole | null, workspaceRole: WorkspaceRole | null) {
  if (canManageWorkspace(workspaceRole)) return true;
  return teamRole === "team_operator" || teamRole === "team_reviewer";
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
