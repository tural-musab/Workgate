import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { ChatAnthropic } from "@langchain/anthropic";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { ChatOpenAI } from "@langchain/openai";

import type { AgentDeliverable, AgentRole, ModelPolicy, ModelProvider, TaskRequest, TaskRoute } from "@aiteams/shared";

import { buildRoleSystemPrompt, buildRoleUserPrompt } from "./prompts";

export interface AgentRuntimeContext {
  task: TaskRequest;
  role: AgentRole;
  policy: ModelPolicy;
  context: string;
  mockMode?: boolean;
}

function parseSection(tag: string, content: string) {
  const match = content.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return match?.[1]?.trim() ?? "";
}

function parseDeliverable(raw: string): AgentDeliverable {
  const summary = parseSection("summary", raw) || raw.slice(0, 200);
  const deliverable = parseSection("deliverable", raw) || raw;
  const risksRaw = parseSection("risks", raw);
  const risks = risksRaw
    .split("\n")
    .map((line) => line.replace(/^- /, "").trim())
    .filter((line) => line.length > 0 && line.toLowerCase() !== "none");
  const needsHuman = parseSection("needs_human", raw).toLowerCase() === "true";

  return { summary, deliverable, risks, needsHuman };
}

function buildMockDeliverable({ role, task, context }: AgentRuntimeContext): AgentDeliverable {
  const roleHeadlines: Record<AgentRole, string> = {
    router: "Routed toward the software-office pipeline with a review gate.",
    coordinator: "Execution brief assembled for the fixed v1 pipeline.",
    research: "Repository and product context summarized for the operator.",
    pm: "Scoped product brief prepared with explicit MVP boundaries.",
    architect: "Architecture memo focused on safe, reviewable implementation.",
    engineer: "Patch summary drafted with a safe `.aiteams` repository artefact path.",
    reviewer: "Independent review flagged remaining risks and missing validations.",
    docs: "Run closure documents prepared for operator review."
  };

  const body = [
    `## ${role.toUpperCase()} deliverable`,
    "",
    roleHeadlines[role],
    "",
    "### Task",
    `- Title: ${task.title}`,
    `- Repo: ${task.targetRepo}`,
    `- Branch: ${task.targetBranch}`,
    "",
    "### Context",
    context,
    "",
    "### Recommended next action",
    role === "reviewer" ? "Pause for operator approval before any external write action." : "Continue to the next fixed workflow stage."
  ].join("\n");

  return {
    summary: roleHeadlines[role],
    deliverable: body,
    risks: role === "engineer" ? ["Generated in mock mode; manual validation still required."] : [],
    needsHuman: role === "reviewer" || role === "docs"
  };
}

function chooseProvider(policy: ModelPolicy) {
  switch (policy.provider) {
    case "openai":
      if (!process.env.OPENAI_API_KEY) return null;
      return new ChatOpenAI({
        apiKey: process.env.OPENAI_API_KEY,
        model: policy.model
      });
    case "anthropic":
      if (!process.env.ANTHROPIC_API_KEY) return null;
      return new ChatAnthropic({
        apiKey: process.env.ANTHROPIC_API_KEY,
        model: policy.model
      });
    case "google":
      if (!process.env.GOOGLE_API_KEY) return null;
      return new ChatGoogleGenerativeAI({
        apiKey: process.env.GOOGLE_API_KEY,
        model: policy.model
      });
    default:
      return null;
  }
}

export async function invokeRoleDeliverable(input: AgentRuntimeContext): Promise<AgentDeliverable> {
  if (input.mockMode) {
    return buildMockDeliverable(input);
  }

  const model = chooseProvider(input.policy);
  if (!model) {
    return buildMockDeliverable({ ...input, mockMode: true });
  }

  const response = await model.invoke([
    new SystemMessage(buildRoleSystemPrompt(input.role)),
    new HumanMessage(buildRoleUserPrompt(input.role, input.task, input.context))
  ]);

  return parseDeliverable(typeof response.content === "string" ? response.content : JSON.stringify(response.content));
}

export function routeTask(task: TaskRequest): TaskRoute {
  const highRiskTerms = ["payment", "contract", "production", "security sign-off", "legal"];
  const goal = `${task.title} ${task.goal}`.toLowerCase();
  const risk = highRiskTerms.some((term) => goal.includes(term)) ? "high" : task.taskType === "ops" ? "medium" : "low";

  return {
    route: task.taskType === "research" ? "research" : task.taskType === "feature" ? "architect" : "engineer",
    reason: `Task type ${task.taskType} maps to the fixed software-office workflow.`,
    risk,
    needsHuman: risk !== "low"
  };
}

export function providerFamily(policy: ModelPolicy): ModelProvider {
  return policy.provider;
}

