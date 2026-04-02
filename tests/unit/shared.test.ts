import { describe, expect, it } from "vitest";

import { buildManagedBranchName } from "@workgate/github";
import { CreateTaskPayloadSchema, canCancelRun, canDeleteRun, canRetryRun, canTransitionRunStatus, isValidGitHubRepoSlug, normalizeCreateTaskPayload } from "@workgate/shared";

describe("shared contracts", () => {
  it("validates task payloads", () => {
    const parsed = CreateTaskPayloadSchema.parse({
      title: "Fix CI drift",
      goal: "Align CI workflow output with the expected notification schema.",
      taskType: "bugfix",
      workflowTemplate: "software_delivery",
      workflowInput: {
        repository: "owner/repo",
        branch: "main"
      },
      constraints: ["Do not change runtime dependencies"],
      acceptanceCriteria: ["Notifications still send", "Tests stay green"],
      attachments: []
    });

    const normalized = normalizeCreateTaskPayload(parsed);
    expect(normalized.targetRepo).toBe("owner/repo");
    expect(normalized.workflowTemplate).toBe("software_delivery");
  });

  it("exposes GitHub slug validation for software workflows", () => {
    expect(isValidGitHubRepoSlug("owner/repo")).toBe(true);
    expect(isValidGitHubRepoSlug("invalid-slug")).toBe(false);
  });

  it("enforces the planned run state transitions", () => {
    expect(canTransitionRunStatus("queued", "routing")).toBe(true);
    expect(canTransitionRunStatus("reviewing", "pending_human")).toBe(true);
    expect(canTransitionRunStatus("queued", "completed")).toBe(false);
  });

  it("creates the managed branch naming pattern", () => {
    expect(buildManagedBranchName("run-123", "Fix build cache mismatch")).toContain("workgate/run-123-fix-build-cache-mismatch");
  });

  it("exposes run action guards for the operator UI", () => {
    expect(canCancelRun("queued")).toBe(true);
    expect(canCancelRun("pending_human")).toBe(true);
    expect(canDeleteRun("failed")).toBe(true);
    expect(canDeleteRun("executing")).toBe(false);
    expect(canRetryRun("completed")).toBe(true);
    expect(canRetryRun("planning")).toBe(false);
  });
});
