import { jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const taskRequests = pgTable("task_requests", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  goal: text("goal").notNull(),
  taskType: text("task_type").notNull(),
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
  status: text("status").notNull(),
  title: text("title").notNull(),
  taskType: text("task_type").notNull(),
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
  startedAt: timestamp("started_at", { withTimezone: true }),
  endedAt: timestamp("ended_at", { withTimezone: true })
});

export const artifacts = pgTable("artifacts", {
  id: text("id").primaryKey(),
  runId: text("run_id").notNull(),
  artifactType: text("artifact_type").notNull(),
  title: text("title").notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull()
});

export const approvals = pgTable("approvals", {
  id: text("id").primaryKey(),
  runId: text("run_id").notNull(),
  action: text("action"),
  reviewer: text("reviewer"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull()
});

export const toolCalls = pgTable("tool_calls", {
  id: text("id").primaryKey(),
  runId: text("run_id").notNull(),
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

