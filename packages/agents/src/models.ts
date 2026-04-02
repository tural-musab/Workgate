import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { ChatAnthropic } from "@langchain/anthropic";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { ChatOpenAI } from "@langchain/openai";

import {
  EngineerPlanSchema,
  TaskRouteSchema,
  type AgentDeliverable,
  type AgentRole,
  type ModelPolicy,
  type ModelProvider,
  type TaskRequest,
  type TaskRoute
} from "@workgate/shared";

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
  inputTokens?: number;
  outputTokens?: number;
  costUsd?: number;
  executionMode?: AgentDeliverable["executionMode"];
}

function parseSection(tag: string, content: string) {
  const match = content.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return match?.[1]?.trim() ?? "";
}

function parseListSection(tag: string, content: string) {
  return parseSection(tag, content)
    .split("\n")
    .map((line) => line.replace(/^- /, "").trim())
    .filter(Boolean);
}

function parseJsonSection(tag: string, content: string) {
  const value = parseSection(tag, content);
  if (!value) return undefined;
  try {
    return JSON.parse(value);
  } catch {
    const fenced = value.match(/```json\s*([\s\S]*?)```/i)?.[1];
    if (!fenced) return undefined;
    try {
      return JSON.parse(fenced);
    } catch {
      return undefined;
    }
  }
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
  const engineerPlanCandidate = {
    summary: parseSection("engineer_summary", raw) || summary,
    changePlan: parseListSection("change_plan", raw),
    fileOperations: parseJsonSection("file_operations", raw),
    testPlan: parseListSection("test_plan", raw),
    rollbackPlan: parseListSection("rollback_plan", raw)
  };
  const hasEngineerSections =
    engineerPlanCandidate.changePlan.length > 0 ||
    Array.isArray(engineerPlanCandidate.fileOperations) ||
    engineerPlanCandidate.testPlan.length > 0 ||
    engineerPlanCandidate.rollbackPlan.length > 0;

  return {
    summary,
    deliverable,
    risks,
    needsHuman,
    ...(hasEngineerSections
      ? {
          engineerPlan: EngineerPlanSchema.parse({
            ...engineerPlanCandidate,
            fileOperations: Array.isArray(engineerPlanCandidate.fileOperations) ? engineerPlanCandidate.fileOperations : []
          })
        }
      : {})
  };
}

function buildMockDeliverable({ role, task, context }: AgentRuntimeContext): AgentDeliverable {
  const software = task.workflowTemplate === "software_delivery";
  const roleHeadlines: Record<AgentRole, string> = software
    ? {
        router: "Routed toward the software delivery pipeline with a review gate.",
        coordinator: "Execution brief assembled for the software workflow.",
        research: "Repository and product context summarized for the operator.",
        pm: "Scoped delivery brief prepared with explicit boundaries.",
        architect: "Architecture memo focused on safe, reviewable implementation.",
        engineer: "Structured change plan drafted with a managed repository diff preview path.",
        reviewer: "Independent review flagged remaining risks and missing validations.",
        docs: "Run closure documents prepared for operator review."
      }
    : {
        router: "Routed toward the proposal response workflow with an approval gate.",
        coordinator: "Proposal execution brief assembled for the selected opportunity.",
        research: "Buyer, context, and source material summarized for the operator.",
        pm: "Response strategy drafted with scope boundaries and evaluation focus.",
        architect: "Solution-positioning memo prepared with trade-offs and response risks.",
        engineer: "Response package drafted in a reviewable, client-facing structure.",
        reviewer: "Independent review flagged weak claims, missing evidence, and approval risks.",
        docs: "Final response documents prepared for operator approval."
      };

  const body = [
    `## ${role.toUpperCase()} deliverable`,
    "",
    roleHeadlines[role],
    "",
    "### Task",
    `- Title: ${task.title}`,
    `- Target: ${task.targetRepo}`,
    `- Source lane: ${task.targetBranch}`,
    "",
    "### Context",
    context,
    "",
    "### Recommended next action",
    role === "reviewer" ? "Pause for operator approval before any external release action." : "Continue to the next workflow stage."
  ].join("\n");

  const engineerPlan =
    software && role === "engineer"
      ? {
          summary: roleHeadlines[role],
          changePlan: [
            "Prepare a safe repository-owned file change for operator preview.",
            "Generate a diff preview in a managed workspace before approval.",
            "Hold GitHub push until the operator approves the prepared branch."
          ],
          fileOperations: [
            {
              type: "write" as const,
              path: "docs/workgate-managed-change.md",
              content: [
                "# Workgate managed change preview",
                "",
                `- Task: ${task.title}`,
                `- Repository: ${task.targetRepo}`,
                `- Branch: ${task.targetBranch}`,
                "",
                "This file was prepared inside a managed workspace so the operator can inspect a real diff preview before approval."
              ].join("\n"),
              rationale: "Create a safe file-level repository diff for the approval gate."
            }
          ],
          testPlan: ["Inspect the diff preview for correctness.", "Confirm approval still gates any external repository write."],
          rollbackPlan: ["Discard the managed branch if the operator rejects the run.", "Delete the generated file in a follow-up cleanup change if it is no longer needed."]
        }
      : undefined;

  return {
    summary: roleHeadlines[role],
    deliverable: body,
    risks: role === "engineer" ? ["Generated in mock mode; manual validation still required."] : [],
    needsHuman: role === "reviewer" || role === "docs",
    provider: "mock",
    model: `mock-${role}`,
    executionMode: "mock",
    ...(engineerPlan ? { engineerPlan } : {})
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

function extractUsageMetadata(response: { usage_metadata?: unknown } | { usageMetadata?: unknown }) {
  const maybeSnake = (response as { usage_metadata?: unknown }).usage_metadata;
  const maybeCamel = (response as { usageMetadata?: unknown }).usageMetadata;
  const usage = (maybeSnake ?? maybeCamel) as
    | {
        input_tokens?: number;
        output_tokens?: number;
        inputTokens?: number;
        outputTokens?: number;
      }
    | undefined;

  if (!usage) {
    return { inputTokens: undefined, outputTokens: undefined, costUsd: undefined };
  }

  return {
    inputTokens: usage.input_tokens ?? usage.inputTokens,
    outputTokens: usage.output_tokens ?? usage.outputTokens,
    costUsd: undefined
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
    new SystemMessage(buildRoleSystemPrompt(input.role, input.task.workflowTemplate)),
    new HumanMessage(buildRoleUserPrompt(input.role, input.task, input.context))
  ]);
  const usage = extractUsageMetadata(response as { usage_metadata?: unknown });

  return {
    ...parseDeliverable(extractMessageText(response.content)),
    provider: input.policy.provider,
    model: input.policy.model,
    executionMode: "live",
    ...(usage.inputTokens !== undefined ? { inputTokens: usage.inputTokens } : {}),
    ...(usage.outputTokens !== undefined ? { outputTokens: usage.outputTokens } : {}),
    ...(usage.costUsd !== undefined ? { costUsd: usage.costUsd } : {})
  };
}

function buildRouterSystemPrompt() {
  return `You are the routing layer for a controlled AI workflow platform.
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
- Prefer "architect" for system design, migration planning, architecture choices, proposal strategy, and implementation planning.
- Prefer "engineer" for execution, bugfix, implementation, concrete change work, or response package drafting.
- Keep the reason concise and factual.`;
}

function buildRouterUserPrompt(task: TaskRequest, deterministic: ResolvedTaskRoute, shouldEscalate: boolean) {
  return `Workflow template: ${task.workflowTemplate}
Task title: ${task.title}
Task type: ${task.taskType}
Primary target: ${task.targetRepo}
Source lane: ${task.targetBranch}

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
  const architectureTerms = ["architecture", "architect", "migration", "design", "system design", "plan", "roadmap", "refactor", "proposal strategy", "win theme"];
  const implementationTerms = ["implement", "build", "fix", "bug", "repair", "update", "change", "add", "draft response", "proposal", "rfp", "questionnaire"];

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
      source: "rule",
      executionMode: "rule"
    };
  }

  if (task.taskType === "research") {
    return {
      route: "research",
      risk: signals.ambiguous ? "medium" : "low",
      reason: "Task type research is treated as analysis-first work unless explicit human gating is required.",
      needsHuman: signals.ambiguous,
      source: "rule",
      executionMode: "rule"
    };
  }

  if (signals.researchSignal && !signals.architectureSignal && !signals.implementationSignal) {
    return {
      route: "research",
      risk: "low",
      reason: `Task type ${task.taskType} maps cleanly to analysis-oriented workflow work.`,
      needsHuman: false,
      source: "rule",
      executionMode: "rule"
    };
  }

  if (signals.architectureSignal && !signals.implementationSignal) {
    return {
      route: "architect",
      risk: "medium",
      reason: `Task type ${task.taskType} points to planning or architecture-first work.`,
      needsHuman: false,
      source: "rule",
      executionMode: "rule"
    };
  }

  return {
    route: "engineer",
    risk: signals.ambiguous ? "medium" : "low",
    reason: signals.ambiguous
      ? "Task contains mixed planning and implementation signals, so it defaults to execution with review."
      : `Task type ${task.taskType} maps to execution-oriented engineering work.`,
    needsHuman: signals.ambiguous,
    source: "rule",
    executionMode: "rule"
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
      reason: `${deterministic.reason} Deterministic fallback used because the configured router model is unavailable.`,
      executionMode: "mock"
    };
  }

  try {
    const response = await model.invoke([
      new SystemMessage(buildRouterSystemPrompt()),
      new HumanMessage(buildRouterUserPrompt(task, deterministic, shouldEscalate))
    ]);
    const usage = extractUsageMetadata(response as { usage_metadata?: unknown });
    const validated = TaskRouteSchema.parse(parseFirstJsonObject(extractMessageText(response.content)));
    return {
      ...validated,
      source: "model",
      provider: policy.provider,
      model: policy.model,
      executionMode: "live",
      ...(usage.inputTokens !== undefined ? { inputTokens: usage.inputTokens } : {}),
      ...(usage.outputTokens !== undefined ? { outputTokens: usage.outputTokens } : {}),
      ...(usage.costUsd !== undefined ? { costUsd: usage.costUsd } : {})
    };
  } catch {
    return {
      ...deterministic,
      source: "fallback",
      reason: `${deterministic.reason} Deterministic fallback used because router escalation did not return valid output.`,
      executionMode: "mock"
    };
  }
}

export function providerFamily(policy: ModelPolicy): ModelProvider {
  return policy.provider;
}
