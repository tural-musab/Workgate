import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createQueueAdapter, createStorageAdapter, type StorageAdapter } from "@workgate/db";

import { createTask, installRuntimeForTests, rejectRun, resetRuntimeForTests, saveGitHubSettings } from "@/lib/app-service";

async function configureGitHubApp(allowedRepos: string[] = ["owner/repo"]) {
  await saveGitHubSettings({
    appId: "123456",
    installationId: "654321",
    privateKeyPem: "-----BEGIN PRIVATE KEY-----\nmock\n-----END PRIVATE KEY-----",
    allowedRepos
  });
}

function createMockGithub() {
  return {
    async fetchRepositoryContext({ targetRepo, targetBranch }: { targetRepo: string; targetBranch: string }) {
      return {
        markdown: `# GitHub repository context\n\n- Repository: ${targetRepo}\n- Branch requested: ${targetBranch}\n`,
        resolvedBranch: targetBranch,
        topLevelEntries: ["README.md"],
        selectedFiles: ["README.md"]
      };
    },
    async createManagedWorkspace({ runId }: { runId: string }) {
      return {
        workspacePath: `/tmp/${runId}`,
        branchName: `workgate/${runId}-workflow`
      };
    },
    async applyFileOperations() {},
    async readWorkspaceDiff() {
      return {
        diff: "diff --git a/docs/workgate-managed-change.md b/docs/workgate-managed-change.md",
        changedFiles: ["docs/workgate-managed-change.md"]
      };
    },
    async writeRunArtifactsToWorkspace() {},
    async commitAndPushWorkspace() {},
    async createDraftPullRequest() {
      return {
        branchName: "workgate/test-workflow",
        pullRequestUrl: "https://github.com/example/repo/pull/1"
      };
    }
  };
}

async function waitForStatus(storage: StorageAdapter, runId: string, expected: string, timeoutMs = 4000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const detail = await storage.getRunDetail(runId);
    if (detail?.run.status === expected) return detail;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  return storage.getRunDetail(runId);
}

function installRuntime(storage: StorageAdapter) {
  installRuntimeForTests({
    storage,
    queue: createQueueAdapter({ databaseUrl: undefined, driver: "inline" }),
    github: createMockGithub(),
    started: true
  });
}

beforeEach(() => {
  process.env.WORKGATE_MOCK_MODE = "true";
});

afterEach(async () => {
  await resetRuntimeForTests();
});

describe("workflow scenarios", () => {
  it("executes a feature request through research, PM, and architecture artefacts", async () => {
    const storage = createStorageAdapter(undefined);
    installRuntime(storage);
    await configureGitHubApp();

    const detail = await createTask({
      teamId: "team_default",
      title: "Add approval queue filters",
      goal: "Plan and prepare the work needed to filter the operator approval queue by repository and status.",
      taskType: "feature",
      workflowTemplate: "software_delivery",
      workflowInput: {
        repository: "owner/repo",
        branch: "main"
      },
      constraints: ["Do not expand scope beyond queue filtering"],
      acceptanceCriteria: ["Research, PRD, and architecture artefacts are generated"],
      attachments: []
    });

    const completed = await waitForStatus(storage, detail.run.id, "pending_human");
    expect(completed?.artifacts.some((artifact) => artifact.artifactType === "research_note")).toBe(true);
    expect(completed?.artifacts.some((artifact) => artifact.artifactType === "prd")).toBe(true);
    expect(completed?.artifacts.some((artifact) => artifact.artifactType === "architecture_memo")).toBe(true);
  });

  it("marks the run as failed when the reviewer provider matches the engineer provider", async () => {
    const baseStorage = createStorageAdapter(undefined);
    const storage = Object.assign(Object.create(baseStorage), baseStorage, {
      async getModelPolicies() {
        const policies = await baseStorage.getModelPolicies();
        return policies.map((policy) =>
          policy.role === "reviewer"
            ? {
                ...policy,
                provider: "openai",
                model: "gpt-5.4"
              }
            : policy
        );
      }
    }) as StorageAdapter;
    installRuntime(storage);
    await configureGitHubApp();

    const detail = await createTask({
      teamId: "team_default",
      title: "Break reviewer isolation",
      goal: "Trigger the failure path when reviewer and engineer share the same provider family.",
      taskType: "bugfix",
      workflowTemplate: "software_delivery",
      workflowInput: {
        repository: "owner/repo",
        branch: "main"
      },
      constraints: [],
      acceptanceCriteria: ["Run fails with a reviewer provider error"],
      attachments: []
    });

    const failed = await waitForStatus(storage, detail.run.id, "failed");
    expect(failed?.run.failureReason).toContain("Reviewer provider must differ");
  });

  it("cancels the run when the operator rejects it", async () => {
    const storage = createStorageAdapter(undefined);
    installRuntime(storage);
    await configureGitHubApp();

    const detail = await createTask({
      teamId: "team_default",
      title: "Reject this run",
      goal: "Exercise the operator rejection path after the workflow reaches approval.",
      taskType: "bugfix",
      workflowTemplate: "software_delivery",
      workflowInput: {
        repository: "owner/repo",
        branch: "main"
      },
      constraints: [],
      acceptanceCriteria: ["Run can be rejected cleanly"],
      attachments: []
    });

    await waitForStatus(storage, detail.run.id, "pending_human");
    await rejectRun(detail.run.id, "operator", "Not ready for repo write.");

    const rejected = await storage.getRunDetail(detail.run.id);
    expect(rejected?.run.status).toBe("cancelled");
    expect(rejected?.toolCalls.some((toolCall) => toolCall.toolName === "git.push")).toBe(false);
  });
});
