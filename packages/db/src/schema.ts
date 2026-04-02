import { boolean, integer, jsonb, numeric, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const workspaces = pgTable("workspaces", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull()
});

export const workspaceMembers = pgTable("workspace_members", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  email: text("email").notNull(),
  displayName: text("display_name"),
  workspaceRole: text("workspace_role"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull()
});

export const teams = pgTable("teams", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  description: text("description"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull()
});

export const teamMembers = pgTable("team_members", {
  id: text("id").primaryKey(),
  teamId: text("team_id").notNull(),
  workspaceMemberId: text("workspace_member_id").notNull(),
  teamRole: text("team_role").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull()
});

export const teamWorkflowAccess = pgTable("team_workflow_access", {
  id: text("id").primaryKey(),
  teamId: text("team_id").notNull(),
  workflowTemplate: text("workflow_template").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull()
});

export const approvalPolicies = pgTable("approval_policies", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  teamId: text("team_id"),
  scopeType: text("scope_type").notNull(),
  workflowTemplate: text("workflow_template").notNull(),
  minApprovals: integer("min_approvals").notNull(),
  approverRoles: jsonb("approver_roles").$type<string[]>().notNull(),
  requireRejectNote: boolean("require_reject_note").notNull(),
  requireSecondApprovalForExternalWrite: boolean("require_second_approval_for_external_write").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull()
});

export const knowledgeSources = pgTable("knowledge_sources", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  teamId: text("team_id").notNull(),
  name: text("name").notNull(),
  sourceType: text("source_type").notNull(),
  description: text("description"),
  storagePath: text("storage_path"),
  content: text("content"),
  createdBy: text("created_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull()
});

export const taskRequests = pgTable("task_requests", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").default("workspace_default").notNull(),
  teamId: text("team_id").default("team_default").notNull(),
  createdBy: text("created_by").notNull(),
  title: text("title").notNull(),
  goal: text("goal").notNull(),
  taskType: text("task_type").notNull(),
  workflowTemplate: text("workflow_template").default("software_delivery").notNull(),
  workflowInput: jsonb("workflow_input").$type<Record<string, unknown>>().notNull(),
  targetRepo: text("target_repo").notNull(),
  targetBranch: text("target_branch").notNull(),
  constraints: jsonb("constraints").$type<string[]>().notNull(),
  acceptanceCriteria: jsonb("acceptance_criteria").$type<string[]>().notNull(),
  attachments: jsonb("attachments").$type<Array<{ name: string; type: string; content: string }>>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull()
});

export const runs = pgTable("runs", {
  id: text("id").primaryKey(),
  taskRequestId: text("task_request_id").notNull(),
  workspaceId: text("workspace_id").default("workspace_default").notNull(),
  teamId: text("team_id").default("team_default").notNull(),
  status: text("status").notNull(),
  title: text("title").notNull(),
  taskType: text("task_type").notNull(),
  workflowTemplate: text("workflow_template").default("software_delivery").notNull(),
  targetRepo: text("target_repo").notNull(),
  targetBranch: text("target_branch").notNull(),
  branchName: text("branch_name"),
  failureReason: text("failure_reason"),
  finalSummary: text("final_summary"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull()
});

export const runSteps = pgTable("run_steps", {
  id: text("id").primaryKey(),
  runId: text("run_id").notNull(),
  role: text("role").notNull(),
  status: text("status").notNull(),
  summary: text("summary"),
  input: text("input"),
  output: text("output"),
  error: text("error"),
  provider: text("provider"),
  model: text("model"),
  executionMode: text("execution_mode"),
  inputTokens: integer("input_tokens"),
  outputTokens: integer("output_tokens"),
  costUsd: numeric("cost_usd", { precision: 12, scale: 6 }),
  startedAt: timestamp("started_at", { withTimezone: true }),
  endedAt: timestamp("ended_at", { withTimezone: true })
});

export const runEvents = pgTable("run_events", {
  id: text("id").primaryKey(),
  runId: text("run_id").notNull(),
  workspaceId: text("workspace_id").default("workspace_default").notNull(),
  teamId: text("team_id").default("team_default").notNull(),
  stepId: text("step_id"),
  role: text("role"),
  eventType: text("event_type").notNull(),
  status: text("status"),
  summary: text("summary").notNull(),
  payload: text("payload"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull()
});

export const artifacts = pgTable("artifacts", {
  id: text("id").primaryKey(),
  runId: text("run_id").notNull(),
  workspaceId: text("workspace_id").default("workspace_default").notNull(),
  teamId: text("team_id").default("team_default").notNull(),
  artifactType: text("artifact_type").notNull(),
  title: text("title").notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull()
});

export const approvals = pgTable("approvals", {
  id: text("id").primaryKey(),
  runId: text("run_id").notNull(),
  workspaceId: text("workspace_id").default("workspace_default").notNull(),
  teamId: text("team_id").default("team_default").notNull(),
  action: text("action"),
  reviewer: text("reviewer"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull()
});

export const toolCalls = pgTable("tool_calls", {
  id: text("id").primaryKey(),
  runId: text("run_id").notNull(),
  workspaceId: text("workspace_id").default("workspace_default").notNull(),
  teamId: text("team_id").default("team_default").notNull(),
  stepId: text("step_id"),
  toolName: text("tool_name").notNull(),
  category: text("category").notNull(),
  status: text("status").notNull(),
  input: text("input"),
  output: text("output"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull()
});

export const repoConnections = pgTable("repo_connections", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").default("workspace_default").notNull(),
  teamId: text("team_id").default("team_default").notNull(),
  provider: text("provider").notNull(),
  owner: text("owner").notNull(),
  repo: text("repo").notNull(),
  isAllowed: text("is_allowed").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull()
});

export const modelPolicies = pgTable("model_policies", {
  role: text("role").primaryKey(),
  provider: text("provider").notNull(),
  model: text("model").notNull(),
  reviewerProvider: text("reviewer_provider"),
  reviewerModel: text("reviewer_model")
});

export const appSettings = pgTable("app_settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").$type<Record<string, unknown>>().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull()
});
