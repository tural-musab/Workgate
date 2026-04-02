import { describe, expect, it } from "vitest";

import { buildManagedBranchName } from "@aiteams/github";
import { TaskRequestSchema, canTransitionRunStatus } from "@aiteams/shared";

describe("shared contracts", () => {
  it("validates task payloads", () => {
    const parsed = TaskRequestSchema.parse({
      title: "Fix CI drift",
      goal: "Align CI workflow output with the expected notification schema.",
      taskType: "bugfix",
      targetRepo: "owner/repo",
      targetBranch: "main",
      constraints: ["Do not change runtime dependencies"],
      acceptanceCriteria: ["Notifications still send", "Tests stay green"],
      attachments: []
    });

    expect(parsed.targetRepo).toBe("owner/repo");
  });

  it("rejects invalid repository slugs", () => {
    expect(() =>
      TaskRequestSchema.parse({
        title: "Broken task",
        goal: "This should fail because the repository slug is invalid.",
        taskType: "bugfix",
        targetRepo: "invalid-slug",
        targetBranch: "main",
        constraints: [],
        acceptanceCriteria: [],
        attachments: []
      })
    ).toThrow();
  });

  it("enforces the planned run state transitions", () => {
    expect(canTransitionRunStatus("queued", "routing")).toBe(true);
    expect(canTransitionRunStatus("reviewing", "pending_human")).toBe(true);
    expect(canTransitionRunStatus("queued", "completed")).toBe(false);
  });

  it("creates the managed branch naming pattern", () => {
    expect(buildManagedBranchName("run-123", "Fix build cache mismatch")).toContain("aiteams/run-123-fix-build-cache-mismatch");
  });
});
