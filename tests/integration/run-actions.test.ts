import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createQueueAdapter, createStorageAdapter, type QueueAdapter, type StorageAdapter } from "@aiteams/db";

import { cancelRun, createTask, deleteRun, getRunDetail, installRuntimeForTests, resetRuntimeForTests, retryRun } from "@/lib/app-service";

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
        branchName: `aiteams/${runId}-workflow`
      };
    },
    async writeRunArtifactsToWorkspace() {},
    async commitAndPushWorkspace() {},
    async createDraftPullRequest() {
      return {
        branchName: "aiteams/test-workflow",
        pullRequestUrl: "https://github.com/example/repo/pull/1"
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

function installRuntime(storage: StorageAdapter, queue?: QueueAdapter) {
  installRuntimeForTests({
    storage,
    queue: queue ?? createQueueAdapter({ databaseUrl: undefined, driver: "inline" }),
    github: createMockGithub(),
    started: false
  });
}

function createManualQueue() {
  let handler: ((runId: string) => Promise<void>) | null = null;
  const queuedRunIds: string[] = [];

  return {
    adapter: {
      mode: "inline" as const,
      async start(nextHandler: (runId: string) => Promise<void>) {
        handler = nextHandler;
      },
      async enqueueRun(runId: string) {
        queuedRunIds.push(runId);
      },
      async stop() {}
    } satisfies QueueAdapter,
    async drain() {
      while (queuedRunIds.length > 0) {
        const runId = queuedRunIds.shift();
        if (runId && handler) {
          await handler(runId);
        }
      }
    }
  };
}

beforeEach(() => {
  process.env.AI_TEAMS_MOCK_MODE = "true";
});

afterEach(() => {
  resetRuntimeForTests();
});

describe("run actions", () => {
  it("keeps a cancelled queued run from ever starting", async () => {
    const storage = createStorageAdapter(undefined);
    const queue = createManualQueue();
    installRuntime(storage, queue.adapter);

    const detail = await createTask({
      title: "Cancel me before execution",
      goal: "Queue a run and cancel it before the worker starts processing any node.",
      taskType: "ops",
      targetRepo: "owner/repo",
      targetBranch: "main",
      constraints: [],
      acceptanceCriteria: ["The run never starts any workflow step"],
      attachments: []
    });

    await cancelRun(detail.run.id);
    await queue.drain();

    const cancelled = await getRunDetail(detail.run.id);
    expect(cancelled?.run.status).toBe("cancelled");
    expect(cancelled?.steps).toHaveLength(0);
  });

  it("deletes a terminal run and its associated records", async () => {
    const storage = createStorageAdapter(undefined);
    installRuntime(storage);

    const detail = await createTask({
      title: "Delete after cancel",
      goal: "Reach approval, cancel the run, and then remove it from the run ledger.",
      taskType: "bugfix",
      targetRepo: "owner/repo",
      targetBranch: "main",
      constraints: [],
      acceptanceCriteria: ["The run can be deleted once terminal"],
      attachments: []
    });

    await waitFor(
      async () => getRunDetail(detail.run.id),
      (run): run is NonNullable<typeof run> => Boolean(run && run.run.status === "pending_human")
    );

    await cancelRun(detail.run.id);
    await deleteRun(detail.run.id);

    expect(await getRunDetail(detail.run.id)).toBeNull();
  });

  it("creates a fresh run for a full retry", async () => {
    const storage = createStorageAdapter(undefined);
    installRuntime(storage);

    const original = await createTask({
      title: "Retry full pipeline",
      goal: "Finish one run, then create a brand-new run that restarts the whole pipeline.",
      taskType: "feature",
      targetRepo: "owner/repo",
      targetBranch: "main",
      constraints: [],
      acceptanceCriteria: ["A new run restarts from the beginning"],
      attachments: []
    });

    await waitFor(
      async () => getRunDetail(original.run.id),
      (run): run is NonNullable<typeof run> => Boolean(run && run.run.status === "pending_human")
    );

    await cancelRun(original.run.id);
    const retried = await retryRun(original.run.id, { mode: "full" });
    const retriedDetail = await waitFor(
      async () => getRunDetail(retried.run.id),
      (run): run is NonNullable<typeof run> => Boolean(run && run.run.status === "pending_human")
    );

    expect(retried.run.id).not.toBe(original.run.id);
    expect(retriedDetail.steps.some((step) => step.input?.includes("Reused from run"))).toBe(false);
  });

  it("reuses completed work when retrying only the failed stages", async () => {
    const baseStorage = createStorageAdapter(undefined);
    let forceReviewerFailure = true;
    const storage = Object.assign(Object.create(baseStorage), baseStorage, {
      async getModelPolicies() {
        const policies = await baseStorage.getModelPolicies();
        return policies.map((policy) =>
          forceReviewerFailure && policy.role === "reviewer"
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

    const failedRun = await createTask({
      title: "Retry failed reviewer stage",
      goal: "Fail during reviewer execution, then resume only the missing stages in a new run.",
      taskType: "bugfix",
      targetRepo: "owner/repo",
      targetBranch: "main",
      constraints: [],
      acceptanceCriteria: ["The new run reuses completed work from the failed run"],
      attachments: []
    });

    const failedDetail = await waitFor(
      async () => getRunDetail(failedRun.run.id),
      (run): run is NonNullable<typeof run> => Boolean(run && run.run.status === "failed")
    );

    expect(failedDetail.run.failureReason).toContain("Reviewer provider must differ");

    forceReviewerFailure = false;
    const resumed = await retryRun(failedRun.run.id, { mode: "failed_only" });
    const resumedDetail = await waitFor(
      async () => getRunDetail(resumed.run.id),
      (run): run is NonNullable<typeof run> => Boolean(run && run.run.status === "pending_human")
    );

    const engineerSteps = resumedDetail.steps.filter((step) => step.role === "engineer");
    const reviewerSteps = resumedDetail.steps.filter((step) => step.role === "reviewer");

    expect(engineerSteps).toHaveLength(1);
    expect(engineerSteps[0]?.input).toContain(`Reused from run ${failedRun.run.id}`);
    expect(reviewerSteps).toHaveLength(1);
    expect(reviewerSteps[0]?.input).not.toContain("Reused from run");
    expect(resumedDetail.artifacts.some((artifact) => artifact.artifactType === "patch_summary")).toBe(true);
    expect(resumedDetail.artifacts.some((artifact) => artifact.artifactType === "review_report")).toBe(true);
  });
});
