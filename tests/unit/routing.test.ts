import { describe, expect, it } from "vitest";

import { routeTask, routeTaskDeterministic } from "@aiteams/agents";

describe("routing policy", () => {
  it("routes high-risk work to human oversight in deterministic mode", () => {
    const route = routeTaskDeterministic({
      title: "Production release security sign-off",
      goal: "Prepare the production release approval package with legal and security sign-off requirements.",
      taskType: "ops",
      targetRepo: "owner/repo",
      targetBranch: "main",
      constraints: [],
      acceptanceCriteria: [],
      attachments: []
    });

    expect(route.route).toBe("human");
    expect(route.risk).toBe("high");
    expect(route.needsHuman).toBe(true);
    expect(route.source).toBe("rule");
  });

  it("keeps straightforward research tasks on the research route", () => {
    const route = routeTaskDeterministic({
      title: "Repository audit",
      goal: "Research the repository structure and summarize the current architecture.",
      taskType: "research",
      targetRepo: "owner/repo",
      targetBranch: "main",
      constraints: [],
      acceptanceCriteria: [],
      attachments: []
    });

    expect(route.route).toBe("research");
    expect(route.source).toBe("rule");
  });

  it("does not invoke the router model while mock mode is enabled", async () => {
    const route = await routeTask(
      {
        title: "Plan a migration and implement follow-up tasks",
        goal: "Design the migration path and identify the required implementation work for the queue worker rollout.",
        taskType: "ops",
        targetRepo: "owner/repo",
        targetBranch: "main",
        constraints: [],
        acceptanceCriteria: [],
        attachments: []
      },
      { role: "router", provider: "google", model: "gemini-3.1-pro-preview" },
      { mockMode: true }
    );

    expect(route.source).toBe("rule");
    expect(route.provider).toBeUndefined();
  });
});
