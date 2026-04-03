import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createQueueAdapter, createStorageAdapter } from "@workgate/db";

import { installRuntimeForTests, resetRuntimeForTests, createTask, getRunDetail, saveGitHubSettings, approveRun, saveKnowledgeSource } from "@/lib/app-service";

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
        markdown: `# GitHub repository context\n\n- Repository: ${targetRepo}\n- Branch requested: ${targetBranch}\n\n## Top-level entries\n- README.md\n- apps/\n- packages/\n`,
        resolvedBranch: targetBranch,
        topLevelEntries: ["README.md", "apps/", "packages/"],
        selectedFiles: ["README.md", "packages/agents/package.json"]
      };
    },
    async createManagedWorkspace({
      runId,
      title,
      targetRepo,
      allowlist
    }: {
      runId: string;
      title: string;
      targetRepo: string;
      allowlist: Array<{ owner: string; repo: string; isAllowed: boolean }>;
    }) {
      if (!allowlist.some((repo) => repo.isAllowed && `${repo.owner}/${repo.repo}` === targetRepo)) {
        throw new Error(`Repository ${targetRepo} is not allowlisted.`);
      }
      return {
        workspacePath: `/tmp/${runId}`,
        branchName: `workgate/${runId}-${title.toLowerCase().replace(/\s+/g, "-")}`
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
    async createDraftPullRequest({ branchName }: { branchName: string }) {
      return {
        branchName,
        pullRequestUrl: `https://github.com/example/repo/pull/${branchName.length}`
      };
    }
  };
}

async function waitFor<T>(producer: () => Promise<T>, predicate: (value: T) => boolean, timeoutMs = 4000): Promise<T> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const value = await producer();
    if (predicate(value)) {
      return value;
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  return producer();
}

function installMemoryRuntime() {
  installRuntimeForTests({
    storage: createStorageAdapter(undefined),
    queue: createQueueAdapter({ databaseUrl: undefined, driver: "inline" }),
    github: createMockGithub(),
    started: true
  });
}

beforeEach(async () => {
  process.env.WORKGATE_MOCK_MODE = "true";
  installMemoryRuntime();
  await configureGitHubApp();
});

afterEach(async () => {
  await resetRuntimeForTests();
});

describe("run orchestration", () => {
  it("creates a run and emits review artefacts", async () => {
    const detail = await createTask({
      teamId: "team_default",
      title: "Fix build cache mismatch",
      goal: "Repair the build cache metadata path and produce the documentation needed for approval.",
      taskType: "bugfix",
      workflowTemplate: "software_delivery",
      workflowInput: {
        repository: "owner/repo",
        branch: "main"
      },
      constraints: ["Keep the change set minimal"],
      acceptanceCriteria: ["Run reaches approval gate"],
      attachments: []
    });

    const completed = await waitFor(
      async () => getRunDetail(detail.run.id),
      (run): run is NonNullable<typeof run> => Boolean(run && run.run.status === "pending_human")
    );

    expect(completed.toolCalls.some((toolCall) => toolCall.toolName === "github.fetchRepositoryContext")).toBe(true);
    expect(completed.artifacts.some((artifact) => artifact.artifactType === "review_report")).toBe(true);
    expect(completed.artifacts.some((artifact) => artifact.artifactType === "test_report")).toBe(true);
    expect(completed.steps.length).toBeGreaterThanOrEqual(8);
  });

  it("approves a run and creates a draft pull request", async () => {
    const detail = await createTask({
      teamId: "team_default",
      title: "Fix notification drift",
      goal: "Adjust notification output and prepare a draft pull request after approval.",
      taskType: "bugfix",
      workflowTemplate: "software_delivery",
      workflowInput: {
        repository: "owner/repo",
        branch: "main"
      },
      constraints: [],
      acceptanceCriteria: ["Draft PR is created after approval"],
      attachments: []
    });

    await waitFor(
      async () => getRunDetail(detail.run.id),
      (run): run is NonNullable<typeof run> => Boolean(run && run.run.status === "pending_human")
    );

    const result = await approveRun(detail.run.id, "operator");
    const approved = await getRunDetail(detail.run.id);

    expect(result.pullRequest.pullRequestUrl).toContain("github.com");
    expect(approved?.run.status).toBe("completed");
    expect(approved?.toolCalls.some((toolCall) => toolCall.toolName === "github.createDraftPullRequest")).toBe(true);
  });

  it("blocks approval when the repository is not allowlisted", async () => {
    const detail = await createTask({
      teamId: "team_default",
      title: "Attempt disallowed repo write",
      goal: "Verify that an unallowlisted repository cannot be pushed during approval.",
      taskType: "bugfix",
      workflowTemplate: "software_delivery",
      workflowInput: {
        repository: "owner/repo",
        branch: "main"
      },
      constraints: [],
      acceptanceCriteria: ["Approval should fail without matching allowlist entry"],
      attachments: []
    });

    await waitFor(
      async () => getRunDetail(detail.run.id),
      (run): run is NonNullable<typeof run> => Boolean(run && run.run.status === "pending_human")
    );

    await configureGitHubApp(["someone-else/repo"]);

    await expect(approveRun(detail.run.id, "operator")).rejects.toThrow("not allowlisted");
  });

  it("approves an RFP workflow without requiring GitHub writes", async () => {
    const source = await saveKnowledgeSource({
      teamId: "team_default",
      name: "Renewal baseline",
      sourceType: "markdown",
      description: "Approved capture themes and pricing guardrails.",
      content: "# Renewal baseline\n\n- Keep claims grounded.\n- Emphasize implementation speed.",
      ingestionStatus: "ready"
    });

    const detail = await createTask({
      teamId: "team_default",
      title: "Prepare renewal response",
      goal: "Draft and review a response pack for a renewal RFP and stop at human approval before external delivery.",
      taskType: "research",
      workflowTemplate: "rfp_response",
      workflowInput: {
        accountName: "Acme Corp renewal",
        knowledgeSource: "Renewal baseline",
        knowledgeSourceId: source.id
      },
      constraints: ["Do not invent unsupported claims"],
      acceptanceCriteria: ["Run reaches approval gate with proposal artefacts"],
      attachments: []
    });

    await waitFor(
      async () => getRunDetail(detail.run.id),
      (run): run is NonNullable<typeof run> => Boolean(run && run.run.status === "pending_human")
    );

    const result = await approveRun(detail.run.id, "operator");
    const approved = await getRunDetail(detail.run.id);

    expect(result.pullRequest).toBeNull();
    expect(approved?.run.status).toBe("completed");
    expect(approved?.toolCalls.some((toolCall) => toolCall.toolName === "github.createDraftPullRequest")).toBe(false);
    expect(approved?.toolCalls.some((toolCall) => toolCall.toolName === "workflow.releasePacket")).toBe(true);
  });
});
