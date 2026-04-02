import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { execFile } from "node:child_process";

import { Octokit } from "octokit";
import slugify from "slugify";

import type { ArtifactRecord, GitHubRepoConnection } from "@aiteams/shared";

const execFileAsync = promisify(execFile);

export interface DraftPullRequestResult {
  branchName: string;
  pullRequestUrl: string;
}

export interface ManagedWorkspace {
  workspacePath: string;
  branchName: string;
}

type RepositoryTreeEntry = {
  path: string;
  type: "blob" | "tree" | "commit";
};

type RepositorySelectedFile = {
  path: string;
  content: string;
};

export interface RepositoryContextResult {
  markdown: string;
  resolvedBranch: string;
  topLevelEntries: string[];
  selectedFiles: string[];
}

function parseRepoSlug(targetRepo: string) {
  const [owner, repo] = targetRepo.split("/");
  if (!owner || !repo) {
    throw new Error(`Invalid GitHub repository slug: ${targetRepo}`);
  }
  return { owner, repo };
}

function repositoryIsAllowed(targetRepo: string, allowlist: GitHubRepoConnection[]) {
  return allowlist.some((repo) => repo.isAllowed && `${repo.owner}/${repo.repo}` === targetRepo);
}

async function runGit(args: string[], cwd?: string) {
  await execFileAsync("git", args, cwd ? { cwd } : undefined);
}

function truncateText(value: string, limit: number) {
  if (value.length <= limit) return value;
  return `${value.slice(0, limit)}\n...<truncated>`;
}

function decodeFileContent(encoded: string) {
  return Buffer.from(encoded.replace(/\n/g, ""), "base64").toString("utf8");
}

function dedupe<T>(items: T[]) {
  return [...new Set(items)];
}

function codeFenceLanguage(filePath: string) {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case ".md":
      return "md";
    case ".json":
      return "json";
    case ".ts":
    case ".tsx":
      return "ts";
    case ".js":
    case ".jsx":
      return "js";
    case ".yml":
    case ".yaml":
      return "yaml";
    case ".toml":
      return "toml";
    case ".sh":
      return "bash";
    default:
      return "";
  }
}

function buildTopLevelEntries(tree: RepositoryTreeEntry[]) {
  const items = new Map<string, "blob" | "tree" | "commit">();
  for (const entry of tree) {
    const [head] = entry.path.split("/");
    if (!head) continue;
    if (!items.has(head)) {
      items.set(head, entry.path.includes("/") ? "tree" : entry.type);
    }
  }

  return [...items.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([name, type]) => `${name}${type === "tree" ? "/" : ""}`);
}

export function selectRepositoryAuditFiles(tree: RepositoryTreeEntry[]) {
  const blobPaths = tree.filter((entry) => entry.type === "blob").map((entry) => entry.path);
  const lowerToPath = new Map(blobPaths.map((item) => [item.toLowerCase(), item]));
  const selected: string[] = [];

  const rootCandidates = [
    "readme.md",
    "package.json",
    "pnpm-workspace.yaml",
    "turbo.json",
    "tsconfig.json",
    ".env.example",
    "dockerfile",
    "docker-compose.yml",
    "docker-compose.yaml"
  ];

  for (const candidate of rootCandidates) {
    const match = lowerToPath.get(candidate);
    if (match) {
      selected.push(match);
    }
  }

  const workflowFiles = blobPaths
    .filter((item) => item.startsWith(".github/workflows/") && /\.(ya?ml)$/i.test(item))
    .sort()
    .slice(0, 4);
  selected.push(...workflowFiles);

  const packageManifests = blobPaths
    .filter((item) => /^(apps|packages)\/[^/]+\/package\.json$/i.test(item))
    .sort()
    .slice(0, 8);
  selected.push(...packageManifests);

  const keyDocs = blobPaths
    .filter((item) => /^(docs\/[^/]+\.(md|mdx)|CONTRIBUTING\.md|LICENSE)$/i.test(item))
    .sort()
    .slice(0, 6);
  selected.push(...keyDocs);

  return dedupe(selected).slice(0, 16);
}

function selectNotablePaths(tree: RepositoryTreeEntry[]) {
  const preferred = tree
    .filter((entry) => {
      return (
        /^(apps|packages|docs|tests|test|infra|deploy|scripts|\.github)(\/|$)/.test(entry.path) ||
        /^(README\.md|package\.json|pnpm-workspace\.yaml|turbo\.json|tsconfig\.json|Dockerfile)$/i.test(entry.path)
      );
    })
    .map((entry) => `${entry.path}${entry.type === "tree" ? "/" : ""}`);

  return dedupe(preferred).slice(0, 32);
}

export function buildRepositoryContextMarkdown(input: {
  targetRepo: string;
  targetBranch: string;
  resolvedBranch: string;
  description: string | null;
  defaultBranch: string;
  visibility: string;
  languages: Record<string, number>;
  topLevelEntries: string[];
  notablePaths: string[];
  selectedFiles: RepositorySelectedFile[];
  note?: string;
}) {
  const languageSummary = Object.entries(input.languages)
    .sort((left, right) => right[1] - left[1])
    .slice(0, 6)
    .map(([language, size]) => `- ${language}: ${size}`)
    .join("\n");

  const fileSections = input.selectedFiles
    .map((file) => {
      const language = codeFenceLanguage(file.path);
      return `## ${file.path}\n\`\`\`${language}\n${truncateText(file.content, 4000)}\n\`\`\``;
    })
    .join("\n\n");

  return [
    "# GitHub repository context",
    "",
    `- Repository: ${input.targetRepo}`,
    `- Branch requested: ${input.targetBranch}`,
    `- Branch resolved: ${input.resolvedBranch}`,
    `- Default branch: ${input.defaultBranch}`,
    `- Visibility: ${input.visibility}`,
    `- Description: ${input.description ?? "None"}`,
    "",
    input.note ? `## Repository state\n${input.note}\n` : "",
    input.note ? "" : "",
    "## Languages",
    languageSummary || "- None reported",
    "",
    "## Top-level entries",
    input.topLevelEntries.length > 0 ? input.topLevelEntries.map((item) => `- ${item}`).join("\n") : "- None discovered",
    "",
    "## Notable paths",
    input.notablePaths.length > 0 ? input.notablePaths.map((item) => `- ${item}`).join("\n") : "- None selected",
    "",
    "## Selected file excerpts",
    fileSections || "No file excerpts were retrieved."
  ].join("\n");
}

function buildEmptyRepositoryContext(input: {
  targetRepo: string;
  targetBranch: string;
  description: string | null;
  defaultBranch: string;
  visibility: string;
  languages: Record<string, number>;
  note: string;
}): RepositoryContextResult {
  return {
    markdown: buildRepositoryContextMarkdown({
      targetRepo: input.targetRepo,
      targetBranch: input.targetBranch,
      resolvedBranch: "(none)",
      description: input.description,
      defaultBranch: input.defaultBranch || "(none)",
      visibility: input.visibility,
      languages: input.languages,
      topLevelEntries: [],
      notablePaths: [],
      selectedFiles: [],
      note: input.note
    }),
    resolvedBranch: "(none)",
    topLevelEntries: [],
    selectedFiles: []
  };
}

export function buildManagedBranchName(runId: string, title: string) {
  const slug = slugify(title, { lower: true, strict: true }).slice(0, 48) || "task";
  return `workgate/${runId}-${slug}`;
}

export class GitHubExecutionService {
  async fetchRepositoryContext(input: {
    targetRepo: string;
    targetBranch: string;
    token?: string | null;
    allowlist: GitHubRepoConnection[];
  }): Promise<RepositoryContextResult> {
    if (!repositoryIsAllowed(input.targetRepo, input.allowlist)) {
      throw new Error(`Repository ${input.targetRepo} is not allowlisted.`);
    }

    const { owner, repo } = parseRepoSlug(input.targetRepo);
    const octokit = new Octokit(input.token ? { auth: input.token } : undefined);

    const repoResponse = await octokit.request("GET /repos/{owner}/{repo}", { owner, repo });
    const languagesResponse = await octokit.request("GET /repos/{owner}/{repo}/languages", { owner, repo });
    const defaultBranch = repoResponse.data.default_branch?.trim() ?? "";

    if (!defaultBranch) {
      return buildEmptyRepositoryContext({
        targetRepo: input.targetRepo,
        targetBranch: input.targetBranch,
        description: repoResponse.data.description,
        defaultBranch: "(none)",
        visibility: repoResponse.data.private ? "private" : "public",
        languages: languagesResponse.data,
        note: "The repository does not currently expose a default branch. This usually means the repository is empty or has not received its first commit yet."
      });
    }

    let resolvedBranch = input.targetBranch;
    let branchResponse;
    try {
      branchResponse = await octokit.request("GET /repos/{owner}/{repo}/branches/{branch}", {
        owner,
        repo,
        branch: input.targetBranch
      });
    } catch (error) {
      const status = typeof error === "object" && error && "status" in error ? Number((error as { status?: number }).status) : undefined;
      if (status === 404 && Number(repoResponse.data.size ?? 0) === 0) {
        return buildEmptyRepositoryContext({
          targetRepo: input.targetRepo,
          targetBranch: input.targetBranch,
          description: repoResponse.data.description,
          defaultBranch,
          visibility: repoResponse.data.private ? "private" : "public",
          languages: languagesResponse.data,
          note: `The repository declares \`${defaultBranch}\` as its default branch, but GitHub does not yet expose that branch ref. This usually means the repository is empty and has not received its first commit.`
        });
      }
      if (!defaultBranch || defaultBranch === input.targetBranch || status !== 404) {
        throw error;
      }
      resolvedBranch = defaultBranch;
      branchResponse = await octokit.request("GET /repos/{owner}/{repo}/branches/{branch}", {
        owner,
        repo,
        branch: defaultBranch
      });
    }

    const treeSha = branchResponse.data.commit.commit.tree.sha;
    const treeResponse = await octokit.request("GET /repos/{owner}/{repo}/git/trees/{tree_sha}", {
      owner,
      repo,
      tree_sha: treeSha,
      recursive: "1"
    });

    const tree = (treeResponse.data.tree ?? [])
      .filter((entry) => typeof entry.path === "string" && (entry.type === "blob" || entry.type === "tree" || entry.type === "commit"))
      .map((entry) => ({
        path: entry.path!,
        type: entry.type as RepositoryTreeEntry["type"]
      }));

    const selectedFilePaths = selectRepositoryAuditFiles(tree);
    const selectedFiles: RepositorySelectedFile[] = [];

    for (const filePath of selectedFilePaths) {
      try {
        const response = await octokit.request("GET /repos/{owner}/{repo}/contents/{path}", {
          owner,
          repo,
          path: filePath,
          ref: resolvedBranch
        });

        const payload = response.data as { type?: string; content?: string; encoding?: string } | { type?: string }[];
        if (Array.isArray(payload) || payload.type !== "file" || typeof payload.content !== "string") {
          continue;
        }

        const content = payload.encoding === "base64" ? decodeFileContent(payload.content) : payload.content;
        selectedFiles.push({
          path: filePath,
          content: truncateText(content, 6000)
        });
      } catch {
        continue;
      }
    }

    const topLevelEntries = buildTopLevelEntries(tree);
    const notablePaths = selectNotablePaths(tree);
    const markdown = buildRepositoryContextMarkdown({
      targetRepo: input.targetRepo,
      targetBranch: input.targetBranch,
      resolvedBranch,
      description: repoResponse.data.description,
      defaultBranch,
      visibility: repoResponse.data.private ? "private" : "public",
      languages: languagesResponse.data,
      topLevelEntries,
      notablePaths,
      selectedFiles
    });

    return {
      markdown,
      resolvedBranch,
      topLevelEntries,
      selectedFiles: selectedFiles.map((file) => file.path)
    };
  }

  async createManagedWorkspace(input: {
    runId: string;
    title: string;
    targetRepo: string;
    targetBranch: string;
    token: string;
    allowlist: GitHubRepoConnection[];
  }): Promise<ManagedWorkspace> {
    if (!repositoryIsAllowed(input.targetRepo, input.allowlist)) {
      throw new Error(`Repository ${input.targetRepo} is not allowlisted.`);
    }

    const { owner, repo } = parseRepoSlug(input.targetRepo);
    const workspacePath = await mkdtemp(path.join(tmpdir(), "workgate-"));
    const branchName = buildManagedBranchName(input.runId, input.title);
    const remoteUrl = `https://x-access-token:${input.token}@github.com/${owner}/${repo}.git`;

    await runGit(["clone", "--depth", "1", "--branch", input.targetBranch, remoteUrl, workspacePath]);
    await runGit(["checkout", "-b", branchName], workspacePath);

    return { workspacePath, branchName };
  }

  async writeRunArtifactsToWorkspace(input: {
    workspacePath: string;
    runId: string;
    artifacts: Pick<ArtifactRecord, "title" | "content" | "artifactType">[];
  }) {
    const basePath = path.join(input.workspacePath, ".workgate", "runs", input.runId);
    await mkdir(basePath, { recursive: true });

    const writes = input.artifacts.map((artifact) => {
      const filename = `${artifact.artifactType}.md`;
      return writeFile(path.join(basePath, filename), `# ${artifact.title}\n\n${artifact.content}\n`, "utf8");
    });
    await Promise.all(writes);
  }

  async commitAndPushWorkspace(input: {
    workspacePath: string;
    branchName: string;
    runId: string;
    targetRepo: string;
  }) {
    await runGit(["config", "user.name", "Workgate"], input.workspacePath);
    await runGit(["config", "user.email", "bot@workgate.local"], input.workspacePath);
    await runGit(["add", ".workgate"], input.workspacePath);
    await runGit(["commit", "-m", `chore: Workgate run ${input.runId}`], input.workspacePath);
    await runGit(["push", "--set-upstream", "origin", input.branchName], input.workspacePath);
  }

  async createDraftPullRequest(input: {
    token: string;
    targetRepo: string;
    targetBranch: string;
    branchName: string;
    title: string;
    body: string;
  }): Promise<DraftPullRequestResult> {
    const { owner, repo } = parseRepoSlug(input.targetRepo);
    const octokit = new Octokit({ auth: input.token });
    const response = await octokit.request("POST /repos/{owner}/{repo}/pulls", {
      owner,
      repo,
      title: input.title,
      head: input.branchName,
      base: input.targetBranch,
      body: input.body,
      draft: true
    });

    return {
      branchName: input.branchName,
      pullRequestUrl: response.data.html_url
    };
  }
}
