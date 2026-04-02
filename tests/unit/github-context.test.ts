import { describe, expect, it } from "vitest";

import { buildRepositoryContextMarkdown, selectRepositoryAuditFiles } from "@workgate/github";

describe("repository context helpers", () => {
  it("selects high-signal files for repository audits", () => {
    const files = selectRepositoryAuditFiles([
      { path: "README.md", type: "blob" },
      { path: "package.json", type: "blob" },
      { path: "pnpm-workspace.yaml", type: "blob" },
      { path: ".github/workflows/ci.yml", type: "blob" },
      { path: "apps/web/package.json", type: "blob" },
      { path: "packages/agents/package.json", type: "blob" },
      { path: "packages/agents/src/graph.ts", type: "blob" }
    ]);

    expect(files).toContain("README.md");
    expect(files).toContain(".github/workflows/ci.yml");
    expect(files).toContain("apps/web/package.json");
  });

  it("renders repository context into compact markdown", () => {
    const markdown = buildRepositoryContextMarkdown({
      targetRepo: "tural-musab/Workgate",
      targetBranch: "main",
      resolvedBranch: "master",
      description: "AI office control plane",
      defaultBranch: "main",
      visibility: "private",
      languages: { TypeScript: 1200, CSS: 200 },
      topLevelEntries: ["README.md", "apps/", "packages/"],
      notablePaths: ["apps/web/", "packages/agents/"],
      selectedFiles: [
        {
          path: "README.md",
          content: "# Workgate\n\nA control plane for workflow-based AI team orchestration."
        }
      ]
    });

    expect(markdown).toContain("Repository: tural-musab/Workgate");
    expect(markdown).toContain("Branch resolved: master");
    expect(markdown).toContain("TypeScript");
    expect(markdown).toContain("## Selected file excerpts");
    expect(markdown).toContain("README.md");
  });
});
