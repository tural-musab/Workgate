import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { ChatAnthropic } from "@langchain/anthropic";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { ChatOpenAI } from "@langchain/openai";

import { TaskRouteSchema, type AgentDeliverable, type AgentRole, type ModelPolicy, type ModelProvider, type TaskRequest, type TaskRoute } from "@aiteams/shared";

import { buildRoleSystemPrompt, buildRoleUserPrompt } from "./prompts";

export interface AgentRuntimeContext {
  task: TaskRequest;
  role: AgentRole;
  policy: ModelPolicy;
  context: string;
  mockMode?: boolean;
}

export interface ResolvedTaskRoute extends TaskRoute {
  source: "rule" | "model" | "fallback";
  provider?: ModelProvider;
  model?: string;
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
    needsHuman: role === "reviewer" || role === "docs",
    provider: "mock",
    model: `mock-${role}`,
    executionMode: "mock"
  };
}

function extractMessageText(content: unknown) {
  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (typeof item === "string") {
          return item;
        }

        if (typeof item === "object" && item && "text" in item && typeof item.text === "string") {
          return item.text;
        }

        return JSON.stringify(item);
      })
      .join("\n");
  }

  return JSON.stringify(content);
}

function parseFirstJsonObject(raw: string) {
  const fenced = raw.match(/```json\s*([\s\S]*?)```/i)?.[1];
  const candidate = fenced ?? raw.match(/\{[\s\S]*\}/)?.[0] ?? raw;
  return JSON.parse(candidate);
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

  return {
    ...parseDeliverable(extractMessageText(response.content)),
    provider: input.policy.provider,
    model: input.policy.model,
    executionMode: "live"
  };
}

function buildRouterSystemPrompt() {
  return `You are the routing layer for an AI software office.
Return strict JSON only with these keys:
{
  "route": "research|pm|architect|engineer|docs|human",
  "risk": "low|medium|high",
  "reason": "short operational reason",
  "needsHuman": true
}

Rules:
- Prefer "human" for security sign-off, legal, finance, payment, production release approval, hiring, firing, or contract work.
- Prefer "research" for audits, investigation, discovery, analysis, and repository understanding.
- Prefer "architect" for system design, migration planning, architecture choices, and implementation planning.
- Prefer "engineer" for execution, bugfix, implementation, and concrete change work.
- Keep the reason concise and factual.`;
}

function buildRouterUserPrompt(task: TaskRequest, deterministic: ResolvedTaskRoute, shouldEscalate: boolean) {
  return `Task title: ${task.title}
Task type: ${task.taskType}
Target repo: ${task.targetRepo}
Target branch: ${task.targetBranch}

Goal:
${task.goal}

Constraints:
${task.constraints.length > 0 ? task.constraints.map((item) => `- ${item}`).join("\n") : "- None provided"}

Acceptance criteria:
${task.acceptanceCriteria.length > 0 ? task.acceptanceCriteria.map((item) => `- ${item}`).join("\n") : "- None provided"}

Deterministic baseline:
- Route: ${deterministic.route}
- Risk: ${deterministic.risk}
- Needs human: ${deterministic.needsHuman}
- Reason: ${deterministic.reason}
- Escalation requested: ${shouldEscalate}

Use the deterministic baseline unless the task clearly needs a different route or risk level.`;
}

function buildRoutingHeuristics(task: TaskRequest) {
  const text = `${task.title}\n${task.goal}\n${task.constraints.join("\n")}\n${task.acceptanceCriteria.join("\n")}`.toLowerCase();
  const hasAny = (terms: string[]) => terms.some((term) => text.includes(term));

  const highRiskTerms = [
    "payment",
    "contract",
    "invoice",
    "billing",
    "security sign-off",
    "security review",
    "legal",
    "lawsuit",
    "privacy",
    "customer data",
    "prod release",
    "production release",
    "merge to production",
    "hire",
    "fire"
  ];

  const researchTerms = ["audit", "investigate", "research", "analyze", "analysis", "discover", "explore", "evaluate"];
  const architectureTerms = ["architecture", "architect", "migration", "design", "system design", "plan", "roadmap", "refactor"];
  const implementationTerms = ["implement", "build", "fix", "bug", "repair", "update", "change", "add"];

  const highRisk = hasAny(highRiskTerms);
  const researchSignal = task.taskType === "research" || hasAny(researchTerms);
  const architectureSignal = task.taskType === "feature" || hasAny(architectureTerms);
  const implementationSignal = task.taskType === "bugfix" || task.taskType === "ops" || hasAny(implementationTerms);
  const ambiguous = [researchSignal, architectureSignal, implementationSignal].filter(Boolean).length > 1 || task.taskType === "ops";

  return {
    highRisk,
    researchSignal,
    architectureSignal,
    implementationSignal,
    ambiguous
  };
}

export function routeTaskDeterministic(task: TaskRequest): ResolvedTaskRoute {
  const signals = buildRoutingHeuristics(task);

  if (signals.highRisk) {
    return {
      route: "human",
      risk: "high",
      reason: "Detected high-risk terms that require explicit human supervision.",
      needsHuman: true,
      source: "rule"
    };
  }

  if (task.taskType === "research") {
    return {
      route: "research",
      risk: signals.ambiguous ? "medium" : "low",
      reason: "Task type research is treated as analysis-first work unless explicit human gating is required.",
      needsHuman: signals.ambiguous,
      source: "rule"
    };
  }

  if (signals.researchSignal && !signals.architectureSignal && !signals.implementationSignal) {
    return {
      route: "research",
      risk: "low",
      reason: `Task type ${task.taskType} maps cleanly to repository or product analysis work.`,
      needsHuman: false,
      source: "rule"
    };
  }

  if (signals.architectureSignal && !signals.implementationSignal) {
    return {
      route: "architect",
      risk: "medium",
      reason: `Task type ${task.taskType} points to planning or architecture-first work.`,
      needsHuman: false,
      source: "rule"
    };
  }

  return {
    route: "engineer",
    risk: signals.ambiguous ? "medium" : "low",
    reason: signals.ambiguous
      ? "Task contains mixed planning and implementation signals, so it defaults to execution with review."
      : `Task type ${task.taskType} maps to execution-oriented engineering work.`,
    needsHuman: signals.ambiguous,
    source: "rule"
  };
}

export async function routeTask(task: TaskRequest, policy?: ModelPolicy, options?: { mockMode?: boolean }): Promise<ResolvedTaskRoute> {
  const deterministic = routeTaskDeterministic(task);
  const signals = buildRoutingHeuristics(task);
  const shouldEscalate = signals.highRisk || signals.ambiguous;

  if (!policy || options?.mockMode || !shouldEscalate) {
    return deterministic;
  }

  const model = chooseProvider(policy);
  if (!model) {
    return {
      ...deterministic,
      source: "fallback",
      reason: `${deterministic.reason} Deterministic fallback used because the configured router model is unavailable.`
    };
  }

  try {
    const response = await model.invoke([
      new SystemMessage(buildRouterSystemPrompt()),
      new HumanMessage(buildRouterUserPrompt(task, deterministic, shouldEscalate))
    ]);

    const validated = TaskRouteSchema.parse(parseFirstJsonObject(extractMessageText(response.content)));
    return {
      ...validated,
      source: "model",
      provider: policy.provider,
      model: policy.model
    };
  } catch {
    return {
      ...deterministic,
      source: "fallback",
      reason: `${deterministic.reason} Deterministic fallback used because router escalation did not return valid output.`
    };
  }
}

export function providerFamily(policy: ModelPolicy): ModelProvider {
  return policy.provider;
}
