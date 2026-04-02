"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import type { GitHubSettingsView } from "@aiteams/shared";

export function GitHubSettingsForm({ initial }: { initial: GitHubSettingsView }) {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [repos, setRepos] = useState(initial.allowedRepos.map((repo) => `${repo.owner}/${repo.repo}`).join("\n"));
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);

    startTransition(async () => {
      const response = await fetch("/api/settings/github", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          token,
          allowedRepos: repos
            .split("\n")
            .map((item) => item.trim())
            .filter(Boolean)
        })
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(body?.error ?? "Unable to save settings.");
        return;
      }

      setMessage("GitHub settings saved.");
      setToken("");
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6 rounded-[2rem] border border-white/10 bg-white/[0.04] px-6 py-6">
      <div className="space-y-2">
        <div className="text-[0.72rem] uppercase tracking-[0.2em] text-cyan-200/70">GitHub</div>
        <h2 className="text-2xl font-semibold tracking-[-0.04em] text-white">Repository access</h2>
        <p className="text-sm leading-6 text-slate-300">
          Store a fine-grained PAT and an explicit repo allowlist. AI TeamS will refuse execution against repositories outside this list.
        </p>
      </div>

      <div className="rounded-[1.5rem] border border-white/10 bg-slate-950/30 px-4 py-3 text-sm text-slate-300">
        Current token: {initial.hasToken ? initial.maskedToken : "Not configured"}
      </div>

      <label className="space-y-2">
        <span className="text-sm text-slate-300">Fine-grained PAT</span>
        <input
          type="password"
          value={token}
          onChange={(event) => setToken(event.target.value)}
          className="w-full rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-sm text-white outline-none placeholder:text-slate-500 focus:border-cyan-400/40"
          placeholder="ghp_..."
        />
      </label>

      <label className="space-y-2">
        <span className="text-sm text-slate-300">Allowlisted repos</span>
        <textarea
          value={repos}
          onChange={(event) => setRepos(event.target.value)}
          className="min-h-36 w-full rounded-[1.5rem] border border-white/10 bg-slate-950/60 px-4 py-3 text-sm leading-6 text-white outline-none placeholder:text-slate-500 focus:border-cyan-400/40"
          placeholder={"owner/repo\nowner/another-repo"}
        />
      </label>

      <div className="flex items-center justify-between gap-4">
        <div className="text-sm">{error ? <span className="text-rose-300">{error}</span> : message ? <span className="text-emerald-300">{message}</span> : <span className="text-slate-400">Settings are encrypted before storage.</span>}</div>
        <button disabled={isPending} className="rounded-full bg-cyan-300 px-5 py-3 text-sm font-medium text-slate-950 transition hover:bg-cyan-200 disabled:opacity-60">
          {isPending ? "Saving..." : "Save settings"}
        </button>
      </div>
    </form>
  );
}

