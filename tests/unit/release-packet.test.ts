import { describe, expect, it } from "vitest";

import { buildReleasePacketView } from "@workgate/runtime";
import type { RunDetail } from "@workgate/shared";

function createRfpRunDetail(): RunDetail {
  return {
    run: {
      id: "run_1",
      taskRequestId: "task_1",
      workspaceId: "workspace_default",
      teamId: "team_default",
      status: "pending_human",
      title: "Acme renewal response",
      taskType: "research",
      workflowTemplate: "rfp_response",
      targetRepo: "Acme renewal",
      targetBranch: "Renewal baseline — Emphasize time to value",
      branchName: null,
      failureReason: null,
      finalSummary: "Final response packet is ready for operator review.",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    },
    task: {
      id: "task_1",
      workspaceId: "workspace_default",
      teamId: "team_default",
      createdBy: "operator@example.com",
      title: "Acme renewal response",
      goal: "Prepare the renewal proposal.",
      taskType: "research",
      workflowTemplate: "rfp_response",
      workflowInput: {
        accountName: "Acme renewal",
        knowledgeSource: "Renewal baseline — Emphasize time to value",
        knowledgeSourceId: "ks_1"
      },
      targetRepo: "Acme renewal",
      targetBranch: "Renewal baseline — Emphasize time to value",
      constraints: [],
      acceptanceCriteria: [],
      attachments: [],
      createdAt: new Date().toISOString()
    },
    steps: [],
    approvals: [],
    events: [],
    toolCalls: [],
    artifacts: [
      {
        id: "a1",
        runId: "run_1",
        artifactType: "research_note",
        title: "Capture research note",
        content: "Buyer priority: low-friction rollout.",
        createdAt: new Date().toISOString()
      },
      {
        id: "a2",
        runId: "run_1",
        artifactType: "prd",
        title: "Response strategy brief",
        content: "Lead with implementation speed.",
        createdAt: new Date().toISOString()
      },
      {
        id: "a3",
        runId: "run_1",
        artifactType: "architecture_memo",
        title: "Solution positioning memo",
        content: "Position managed onboarding as the main differentiator.",
        createdAt: new Date().toISOString()
      },
      {
        id: "a4",
        runId: "run_1",
        artifactType: "review_report",
        title: "Red-team review",
        content: "Avoid unsupported migration claims.",
        createdAt: new Date().toISOString()
      },
      {
        id: "a5",
        runId: "run_1",
        artifactType: "approval_checklist",
        title: "Approval checklist",
        content: "- Legal copy reviewed\n- Pricing approved\n- Delivery timeline confirmed",
        createdAt: new Date().toISOString()
      },
      {
        id: "a6",
        runId: "run_1",
        artifactType: "release_packet",
        title: "Release packet",
        content: "Acme can launch in two weeks with no replatforming.\n\nAll claims align with approved proof points.",
        createdAt: new Date().toISOString()
      }
    ]
  };
}

describe("release packet builder", () => {
  it("builds a structured RFP release packet view from artifacts", () => {
    const packet = buildReleasePacketView(createRfpRunDetail());

    expect(packet).not.toBeNull();
    expect(packet?.accountName).toBe("Acme renewal");
    expect(packet?.knowledgeSourceSummary).toContain("Renewal baseline");
    expect(packet?.packetSummary).toContain("Acme can launch");
    expect(packet?.sections).toHaveLength(6);
    expect(packet?.checklistItems.map((item) => item.label)).toEqual([
      "Legal copy reviewed",
      "Pricing approved",
      "Delivery timeline confirmed"
    ]);
    expect(packet?.exportFilename).toBe("acme-renewal-response.pdf");
  });
});
