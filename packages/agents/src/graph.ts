import { Annotation, END, START, StateGraph } from "@langchain/langgraph";

import {
  type AgentDeliverable,
  type AgentRole,
  type ArtifactType,
  type ModelPolicy,
  type RunStatus,
  type TaskRequest,
  defaultModelPolicies
} from "@aiteams/shared";

import { invokeRoleDeliverable, providerFamily, routeTask } from "./models";

type ArtifactDraft = {
  artifactType: ArtifactType;
  title: string;
  content: string;
};

type WorkflowState = {
  task: TaskRequest;
  status: RunStatus;
  route: ReturnType<typeof routeTask> | undefined;
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
  const deliverable = await invokeRoleDeliverable({
    task: state.task,
    role,
    policy: policyForRole(policies, role),
    context,
    mockMode: process.env.AI_TEAMS_MOCK_MODE !== "false"
  });

  return {
    deliverables: { [role]: deliverable },
    needsHuman: deliverable.needsHuman
  };
}

function makeArtifact(artifactType: ArtifactType, title: string, content: string): ArtifactDraft[] {
  return [{ artifactType, title, content }];
}

export interface WorkflowResult {
  status: RunStatus;
  route: ReturnType<typeof routeTask>;
  deliverables: Partial<Record<AgentRole, AgentDeliverable>>;
  artifacts: ArtifactDraft[];
  finalSummary: string;
  needsHuman: boolean;
}

function buildWorkflowGraph(policies: ModelPolicy[]) {
  return new StateGraph(WorkflowAnnotation)
    .addNode("routerNode", async (state) => {
      const route = routeTask(state.task);
      return {
        route,
        status: route.route === "research" ? "planning" : "routing",
        deliverables: {
          router: {
            summary: route.reason,
            deliverable: `Route: ${route.route}\nRisk: ${route.risk}\nNeeds human: ${route.needsHuman}`,
            risks: route.risk === "high" ? ["High-risk route detected."] : [],
            needsHuman: route.needsHuman
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
    .addEdge(START, "routerNode")
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

export async function streamWorkflow(task: TaskRequest, policies: ModelPolicy[] = defaultModelPolicies) {
  const compiled = buildWorkflowGraph(policies);
  return compiled.stream(
    {
      task,
      status: "queued",
      route: undefined,
      deliverables: {},
      artifacts: [],
      finalSummary: undefined,
      needsHuman: false
    },
    { streamMode: "updates" }
  );
}

export async function runWorkflow(task: TaskRequest, policies: ModelPolicy[] = defaultModelPolicies): Promise<WorkflowResult> {
  const compiled = buildWorkflowGraph(policies);

  const result = await compiled.invoke({
    task,
    status: "queued",
    route: undefined,
    deliverables: {},
    artifacts: [],
    finalSummary: undefined,
    needsHuman: false
  });

  return {
    status: result.status,
    route: result.route ?? routeTask(task),
    deliverables: result.deliverables,
    artifacts: result.artifacts,
    finalSummary: result.finalSummary ?? "Run completed.",
    needsHuman: result.needsHuman
  };
}
