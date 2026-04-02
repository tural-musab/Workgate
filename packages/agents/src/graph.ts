import { Annotation, END, START, StateGraph } from "@langchain/langgraph";

import {
  type AgentDeliverable,
  type AgentRole,
  type ArtifactType,
  type ModelPolicy,
  type RunStatus,
  type TaskRequest,
  type TaskRoute,
  type WorkflowTemplateId,
  defaultModelPolicies
} from "@workgate/shared";

import { invokeRoleDeliverable, providerFamily, routeTask, routeTaskDeterministic, type ResolvedTaskRoute } from "./models";

export type ArtifactDraft = {
  artifactType: ArtifactType;
  title: string;
  content: string;
};

export interface WorkflowObserver {
  onStepStart?(input: { role: AgentRole; provider?: string | null; model?: string | null; executionMode?: string | null }): Promise<void> | void;
  onStepComplete?(input: { role: AgentRole; deliverable: AgentDeliverable }): Promise<void> | void;
  onStepFailed?(input: { role: AgentRole; provider?: string | null; model?: string | null; executionMode?: string | null; error: string }): Promise<void> | void;
}

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

async function runRole(role: AgentRole, state: WorkflowState, policies: ModelPolicy[], context: string, observer?: WorkflowObserver) {
  const policy = policyForRole(policies, role);
  const mockMode = process.env.WORKGATE_MOCK_MODE !== "false";

  await observer?.onStepStart?.({
    role,
    provider: mockMode ? "mock" : policy.provider,
    model: mockMode ? `mock-${role}` : policy.model,
    executionMode: mockMode ? "mock" : "live"
  });

  try {
    const deliverable = await invokeRoleDeliverable({
      task: state.task,
      role,
      policy,
      context,
      mockMode
    });

    await observer?.onStepComplete?.({ role, deliverable });

    return {
      deliverables: { [role]: deliverable },
      needsHuman: deliverable.needsHuman
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown model invocation failure.";
    await observer?.onStepFailed?.({
      role,
      provider: policy.provider,
      model: policy.model,
      executionMode: mockMode ? "mock" : "live",
      error: message
    });
    throw new Error(`${role} failed with ${policy.provider}/${policy.model}: ${message}`);
  }
}

function makeArtifact(artifactType: ArtifactType, title: string, content: string): ArtifactDraft[] {
  return [{ artifactType, title, content }];
}

function titleForArtifact(template: WorkflowTemplateId, artifactType: ArtifactType) {
  if (template === "rfp_response") {
    const titles: Record<ArtifactType, string> = {
      research_note: "Capture research note",
      prd: "Response strategy brief",
      architecture_memo: "Solution positioning memo",
      patch_summary: "Response draft",
      diff_preview: "Draft evidence preview",
      test_report: "Response validation report",
      review_report: "Red-team review",
      approval_checklist: "Approval checklist",
      release_packet: "Release packet",
      changelog: "Response summary"
    };
    return titles[artifactType];
  }

  const titles: Record<ArtifactType, string> = {
    research_note: "Research note",
    prd: "Product brief",
    architecture_memo: "Architecture memo",
    patch_summary: "Patch summary",
    diff_preview: "Diff preview",
    test_report: "Test report",
    review_report: "Review report",
    approval_checklist: "Approval checklist",
    release_packet: "Release packet",
    changelog: "Change summary"
  };
  return titles[artifactType];
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
  observer?: WorkflowObserver;
}

function nodeForRole(role: AgentRole) {
  return role === "router" ? "routerNode" : role;
}

function buildWorkflowGraph(policies: ModelPolicy[], observer?: WorkflowObserver) {
  return new StateGraph(WorkflowAnnotation)
    .addNode("routerNode", async (state) => {
      const routerPolicy = policyForRole(policies, "router");
      const mockMode = process.env.WORKGATE_MOCK_MODE !== "false";
      await observer?.onStepStart?.({
        role: "router",
        provider: mockMode ? "mock" : routerPolicy.provider,
        model: mockMode ? "mock-router" : routerPolicy.model,
        executionMode: mockMode ? "mock" : "rule"
      });

      try {
        const route = await routeTask(state.task, routerPolicy, { mockMode });
        const routeLines = [
          `Route: ${route.route}`,
          `Risk: ${route.risk}`,
          `Needs human: ${route.needsHuman}`,
          `Decision source: ${route.source}`,
          route.provider && route.model ? `Model: ${route.provider}/${route.model}` : "Model: deterministic rules"
        ];
        const routerDeliverable: AgentDeliverable = {
          summary: route.reason,
          deliverable: routeLines.join("\n"),
          risks: route.risk === "high" ? ["High-risk route detected."] : [],
          needsHuman: route.needsHuman,
          provider: route.provider ?? "mock",
          model: route.model ?? "deterministic-router",
          executionMode: route.executionMode ?? (route.source === "model" ? "live" : route.source === "fallback" ? "mock" : "rule"),
          inputTokens: route.inputTokens,
          outputTokens: route.outputTokens,
          costUsd: route.costUsd
        };
        await observer?.onStepComplete?.({ role: "router", deliverable: routerDeliverable });

        return {
          route,
          status: route.route === "research" ? "planning" : "routing",
          deliverables: { router: routerDeliverable },
          needsHuman: route.needsHuman
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown router failure.";
        await observer?.onStepFailed?.({
          role: "router",
          provider: mockMode ? "mock" : routerPolicy.provider,
          model: mockMode ? "mock-router" : routerPolicy.model,
          executionMode: mockMode ? "mock" : "rule",
          error: message
        });
        throw error;
      }
    })
    .addNode("coordinator", async (state) => ({
      ...(await runRole("coordinator", state, policies, `Route decision: ${state.route?.route ?? "engineer"}`, observer)),
      status: "planning"
    }))
    .addNode("research", async (state) => {
      const result = await runRole("research", state, policies, state.deliverables.coordinator?.deliverable ?? "", observer);
      return {
        ...result,
        artifacts: makeArtifact("research_note", titleForArtifact(state.task.workflowTemplate, "research_note"), result.deliverables.research?.deliverable ?? "")
      };
    })
    .addNode("pm", async (state) => {
      const result = await runRole("pm", state, policies, state.deliverables.research?.deliverable ?? "", observer);
      return {
        ...result,
        artifacts: makeArtifact("prd", titleForArtifact(state.task.workflowTemplate, "prd"), result.deliverables.pm?.deliverable ?? "")
      };
    })
    .addNode("architect", async (state) => {
      const context = [state.deliverables.research?.deliverable, state.deliverables.pm?.deliverable].filter(Boolean).join("\n\n");
      const result = await runRole("architect", state, policies, context, observer);
      return {
        ...result,
        status: "executing",
        artifacts: makeArtifact(
          "architecture_memo",
          titleForArtifact(state.task.workflowTemplate, "architecture_memo"),
          result.deliverables.architect?.deliverable ?? ""
        )
      };
    })
    .addNode("engineer", async (state) => {
      const context = [state.deliverables.architect?.deliverable, state.deliverables.pm?.deliverable].filter(Boolean).join("\n\n");
      const result = await runRole("engineer", state, policies, context, observer);
      return {
        ...result,
        artifacts: makeArtifact("patch_summary", titleForArtifact(state.task.workflowTemplate, "patch_summary"), result.deliverables.engineer?.deliverable ?? "")
      };
    })
    .addNode("reviewer", async (state) => {
      const engineerPolicy = policyForRole(policies, "engineer");
      const reviewerPolicy = policyForRole(policies, "reviewer");
      if (providerFamily(engineerPolicy) === providerFamily(reviewerPolicy)) {
        throw new Error("Reviewer provider must differ from engineer provider.");
      }
      const context = [
        state.deliverables.engineer?.deliverable,
        state.deliverables.engineer?.engineerPlan ? `## Structured change plan\n${JSON.stringify(state.deliverables.engineer.engineerPlan, null, 2)}` : null,
        state.deliverables.architect?.deliverable
      ]
        .filter(Boolean)
        .join("\n\n");
      const result = await runRole("reviewer", state, policies, context, observer);
      return {
        ...result,
        status: "reviewing",
        artifacts: makeArtifact("review_report", titleForArtifact(state.task.workflowTemplate, "review_report"), result.deliverables.reviewer?.deliverable ?? ""),
        needsHuman: true
      };
    })
    .addNode("docs", async (state) => {
      const context = Object.entries(state.deliverables)
        .map(([role, deliverable]) => `## ${role}\n${deliverable?.deliverable ?? ""}`)
        .join("\n\n");
      const result = await runRole("docs", state, policies, context, observer);
      const docsBody = result.deliverables.docs?.deliverable ?? "";

      if (state.task.workflowTemplate === "rfp_response") {
        const approvalChecklist = [
          "## Approval checklist",
          "",
          "- Verify buyer requirements and any questionnaire responses.",
          "- Confirm pricing assumptions and proof points.",
          "- Confirm the release packet is ready for external delivery after approval."
        ].join("\n");

        return {
          ...result,
          status: "pending_human",
          finalSummary: result.deliverables.docs?.summary ?? "Proposal packet ready for approval.",
          artifacts: [
            { artifactType: "approval_checklist", title: titleForArtifact(state.task.workflowTemplate, "approval_checklist"), content: approvalChecklist },
            { artifactType: "release_packet", title: titleForArtifact(state.task.workflowTemplate, "release_packet"), content: docsBody }
          ],
          needsHuman: true
        };
      }

      const testReport = [
        "## Test report",
        "",
        "- Pipeline executed through router, coordinator, research, pm, architect, engineer, reviewer, and docs.",
        "- Human approval is required before branch push or draft pull request creation.",
        "- Operator should validate the generated diff preview before approving."
      ].join("\n");

      return {
        ...result,
        status: "pending_human",
        finalSummary: result.deliverables.docs?.summary ?? "Run completed and waiting for approval.",
        artifacts: [
          { artifactType: "test_report", title: titleForArtifact(state.task.workflowTemplate, "test_report"), content: testReport },
          { artifactType: "changelog", title: titleForArtifact(state.task.workflowTemplate, "changelog"), content: docsBody }
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
  const compiled = buildWorkflowGraph(policies, options?.observer);
  return compiled.stream(buildInitialState(task, options), { streamMode: "updates" });
}

export async function runWorkflow(task: TaskRequest, policies: ModelPolicy[] = defaultModelPolicies, options?: WorkflowStartOptions): Promise<WorkflowResult> {
  const compiled = buildWorkflowGraph(policies, options?.observer);

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
