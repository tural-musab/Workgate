import { Annotation, END, START, StateGraph } from "@langchain/langgraph";

import {
  type AgentDeliverable,
  type AgentRole,
  type ArtifactType,
  type ModelPolicy,
  type TaskRoute,
  type RunStatus,
  type TaskRequest,
  defaultModelPolicies
} from "@aiteams/shared";

import { invokeRoleDeliverable, providerFamily, routeTask, routeTaskDeterministic, type ResolvedTaskRoute } from "./models";

export type ArtifactDraft = {
  artifactType: ArtifactType;
  title: string;
  content: string;
};

type WorkflowState = {
  task: TaskRequest;
  status: RunStatus;
  resumeFrom: AgentRole;
  route: ResolvedTaskRoute | undefined;
  deliverables: Partial<Record<AgentRole, AgentDeliverable>>;
  artifacts: ArtifactDraft[];
  finalSummary: string | undefined;
  needsHuman: boolean;
};

const WorkflowAnnotation = Annotation.Root({
  task: Annotation<TaskRequest>(),
  status: Annotation<RunStatus>({
    reducer: (_, right) => right,
    default: () => "queued"
  }),
  resumeFrom: Annotation<AgentRole>({
    reducer: (_, right) => right,
    default: () => "router"
  }),
  route: Annotation<WorkflowState["route"]>({
    reducer: (_, right) => right,
    default: () => undefined
  }),
  deliverables: Annotation<WorkflowState["deliverables"]>({
    reducer: (left, right) => ({ ...left, ...right }),
    default: () => ({})
  }),
  artifacts: Annotation<ArtifactDraft[]>({
    reducer: (left, right) => left.concat(right),
    default: () => []
  }),
  finalSummary: Annotation<string | undefined>({
    reducer: (_, right) => right,
    default: () => undefined
  }),
  needsHuman: Annotation<boolean>({
    reducer: (left, right) => left || right,
    default: () => false
  })
});

function policyForRole(policies: ModelPolicy[], role: AgentRole) {
  return policies.find((policy) => policy.role === role) ?? defaultModelPolicies.find((policy) => policy.role === role)!;
}

async function runRole(role: AgentRole, state: WorkflowState, policies: ModelPolicy[], context: string) {
  const policy = policyForRole(policies, role);

  try {
    const deliverable = await invokeRoleDeliverable({
      task: state.task,
      role,
      policy,
      context,
      mockMode: process.env.AI_TEAMS_MOCK_MODE !== "false"
    });

    return {
      deliverables: { [role]: deliverable },
      needsHuman: deliverable.needsHuman
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown model invocation failure.";
    throw new Error(`${role} failed with ${policy.provider}/${policy.model}: ${message}`);
  }
}

function makeArtifact(artifactType: ArtifactType, title: string, content: string): ArtifactDraft[] {
  return [{ artifactType, title, content }];
}

export interface WorkflowResult {
  status: RunStatus;
  route: TaskRoute;
  deliverables: Partial<Record<AgentRole, AgentDeliverable>>;
  artifacts: ArtifactDraft[];
  finalSummary: string;
  needsHuman: boolean;
}

export interface WorkflowStartOptions {
  startAt?: AgentRole;
  route?: ResolvedTaskRoute;
  deliverables?: Partial<Record<AgentRole, AgentDeliverable>>;
  artifacts?: ArtifactDraft[];
  needsHuman?: boolean;
}

function nodeForRole(role: AgentRole) {
  return role === "router" ? "routerNode" : role;
}

function buildWorkflowGraph(policies: ModelPolicy[]) {
  return new StateGraph(WorkflowAnnotation)
    .addNode("routerNode", async (state) => {
      const route = await routeTask(state.task, policyForRole(policies, "router"), {
        mockMode: process.env.AI_TEAMS_MOCK_MODE !== "false"
      });
      const routeLines = [
        `Route: ${route.route}`,
        `Risk: ${route.risk}`,
        `Needs human: ${route.needsHuman}`,
        `Decision source: ${route.source}`,
        route.provider && route.model ? `Model: ${route.provider}/${route.model}` : "Model: deterministic rules"
      ];

      return {
        route,
        status: route.route === "research" ? "planning" : "routing",
        deliverables: {
          router: {
            summary: route.reason,
            deliverable: routeLines.join("\n"),
            risks: route.risk === "high" ? ["High-risk route detected."] : [],
            needsHuman: route.needsHuman,
            provider: route.provider ?? "mock",
            model: route.model ?? "deterministic-router",
            executionMode: route.source === "model" ? "live" : route.source === "fallback" ? "mock" : "rule"
          }
        },
        needsHuman: route.needsHuman
      };
    })
    .addNode("coordinator", async (state) => {
      return {
        ...(await runRole("coordinator", state, policies, `Route decision: ${state.route?.route ?? "engineer"}`)),
        status: "planning"
      };
    })
    .addNode("research", async (state) => {
      const result = await runRole("research", state, policies, state.deliverables.coordinator?.deliverable ?? "");
      return {
        ...result,
        artifacts: makeArtifact("research_note", "Research note", result.deliverables.research?.deliverable ?? "")
      };
    })
    .addNode("pm", async (state) => {
      const result = await runRole("pm", state, policies, state.deliverables.research?.deliverable ?? "");
      return {
        ...result,
        artifacts: makeArtifact("prd", "Product brief", result.deliverables.pm?.deliverable ?? "")
      };
    })
    .addNode("architect", async (state) => {
      const context = [state.deliverables.research?.deliverable, state.deliverables.pm?.deliverable].filter(Boolean).join("\n\n");
      const result = await runRole("architect", state, policies, context);
      return {
        ...result,
        status: "executing",
        artifacts: makeArtifact("architecture_memo", "Architecture memo", result.deliverables.architect?.deliverable ?? "")
      };
    })
    .addNode("engineer", async (state) => {
      const context = [state.deliverables.architect?.deliverable, state.deliverables.pm?.deliverable].filter(Boolean).join("\n\n");
      const result = await runRole("engineer", state, policies, context);
      return {
        ...result,
        artifacts: makeArtifact("patch_summary", "Patch summary", result.deliverables.engineer?.deliverable ?? "")
      };
    })
    .addNode("reviewer", async (state) => {
      const engineerPolicy = policyForRole(policies, "engineer");
      const reviewerPolicy = policyForRole(policies, "reviewer");
      if (providerFamily(engineerPolicy) === providerFamily(reviewerPolicy)) {
        throw new Error("Reviewer provider must differ from engineer provider.");
      }
      const context = [state.deliverables.engineer?.deliverable, state.deliverables.architect?.deliverable].filter(Boolean).join("\n\n");
      const result = await runRole("reviewer", state, policies, context);
      return {
        ...result,
        status: "reviewing",
        artifacts: makeArtifact("review_report", "Review report", result.deliverables.reviewer?.deliverable ?? ""),
        needsHuman: true
      };
    })
    .addNode("docs", async (state) => {
      const context = Object.entries(state.deliverables)
        .map(([role, deliverable]) => `## ${role}\n${deliverable?.deliverable ?? ""}`)
        .join("\n\n");
      const result = await runRole("docs", state, policies, context);
      const changelog = result.deliverables.docs?.deliverable ?? "";
      const testReport = [
        "## Test report",
        "",
        "- Pipeline executed through router, coordinator, research, pm, architect, engineer, reviewer, docs.",
        "- Human approval is required before branch push or draft pull request creation.",
        "- Operator should validate repository diff before approving."
      ].join("\n");

      return {
        ...result,
        status: "pending_human",
        finalSummary: result.deliverables.docs?.summary ?? "Run completed and waiting for approval.",
        artifacts: [
          { artifactType: "test_report", title: "Test report", content: testReport },
          { artifactType: "changelog", title: "Change summary", content: changelog }
        ],
        needsHuman: true
      };
    })
    .addConditionalEdges(START, (state) => nodeForRole(state.resumeFrom ?? "router"), {
      routerNode: "routerNode",
      coordinator: "coordinator",
      research: "research",
      pm: "pm",
      architect: "architect",
      engineer: "engineer",
      reviewer: "reviewer",
      docs: "docs"
    })
    .addEdge("routerNode", "coordinator")
    .addEdge("coordinator", "research")
    .addEdge("research", "pm")
    .addEdge("pm", "architect")
    .addEdge("architect", "engineer")
    .addEdge("engineer", "reviewer")
    .addEdge("reviewer", "docs")
    .addEdge("docs", END)
    .compile();
}

function buildInitialState(task: TaskRequest, options?: WorkflowStartOptions): WorkflowState {
  return {
    task,
    status: "queued",
    resumeFrom: options?.startAt ?? "router",
    route: options?.route,
    deliverables: options?.deliverables ?? {},
    artifacts: options?.artifacts ?? [],
    finalSummary: undefined,
    needsHuman: options?.needsHuman ?? false
  };
}

export async function streamWorkflow(task: TaskRequest, policies: ModelPolicy[] = defaultModelPolicies, options?: WorkflowStartOptions) {
  const compiled = buildWorkflowGraph(policies);
  return compiled.stream(buildInitialState(task, options), { streamMode: "updates" });
}

export async function runWorkflow(task: TaskRequest, policies: ModelPolicy[] = defaultModelPolicies, options?: WorkflowStartOptions): Promise<WorkflowResult> {
  const compiled = buildWorkflowGraph(policies);

  const result = await compiled.invoke(buildInitialState(task, options));

  return {
    status: result.status,
    route: result.route ?? routeTaskDeterministic(task),
    deliverables: result.deliverables,
    artifacts: result.artifacts,
    finalSummary: result.finalSummary ?? "Run completed.",
    needsHuman: result.needsHuman
  };
}
