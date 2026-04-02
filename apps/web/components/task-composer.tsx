"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

const initialState = {
  title: "",
  goal: "",
  taskType: "bugfix",
  targetRepo: "",
  targetBranch: "main",
  constraints: "",
  acceptanceCriteria: "",
  attachmentName: "",
  attachmentContent: ""
};

export function TaskComposer() {
  const router = useRouter();
  const [form, setForm] = useState(initialState);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function updateField(name: string, value: string) {
    setForm((current) => ({ ...current, [name]: value }));
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const payload = {
      title: form.title,
      goal: form.goal,
      taskType: form.taskType,
      targetRepo: form.targetRepo,
      targetBranch: form.targetBranch,
      constraints: form.constraints
        .split("\n")
        .map((item) => item.trim())
        .filter(Boolean),
      acceptanceCriteria: form.acceptanceCriteria
        .split("\n")
        .map((item) => item.trim())
        .filter(Boolean),
      attachments: form.attachmentContent
        ? [
            {
              name: form.attachmentName || "brief.md",
              type: "markdown",
              content: form.attachmentContent
            }
          ]
        : []
    };

    startTransition(async () => {
      const response = await fetch("/api/tasks", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(body?.error ?? "Unable to start the run.");
        return;
      }

      const body = (await response.json()) as { runId: string };
      router.push(`/runs/${body.runId}`);
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6 rounded-[2rem] border border-white/10 bg-white/[0.04] px-6 py-6">
      <div className="space-y-2">
        <div className="text-[0.72rem] uppercase tracking-[0.2em] text-cyan-200/70">New task</div>
        <h2 className="text-2xl font-semibold tracking-[-0.04em] text-white">Launch a software-office run</h2>
        <p className="max-w-2xl text-sm leading-6 text-slate-300">
          Submit a repository target, the job to be done, and the acceptance bar. The fixed pipeline will route, plan, review, and hold for approval before any external write action.
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.3fr_0.8fr]">
        <label className="space-y-2">
          <span className="text-sm text-slate-300">Title</span>
          <input
            required
            value={form.title}
            onChange={(event) => updateField("title", event.target.value)}
            className="w-full rounded-2xl border border-white/10 bg-slate-950/50 px-4 py-3 text-sm text-white outline-none placeholder:text-slate-500 focus:border-cyan-400/40"
            placeholder="Fix flaky CI notifications"
          />
        </label>
        <label className="space-y-2">
          <span className="text-sm text-slate-300">Task type</span>
          <select
            value={form.taskType}
            onChange={(event) => updateField("taskType", event.target.value)}
            className="w-full rounded-2xl border border-white/10 bg-slate-950/50 px-4 py-3 text-sm text-white outline-none focus:border-cyan-400/40"
          >
            <option value="bugfix">Bugfix</option>
            <option value="feature">Feature</option>
            <option value="research">Research</option>
            <option value="ops">Ops</option>
          </select>
        </label>
      </div>

      <label className="space-y-2">
        <span className="text-sm text-slate-300">Goal</span>
        <textarea
          required
          value={form.goal}
          onChange={(event) => updateField("goal", event.target.value)}
          className="min-h-36 w-full rounded-[1.5rem] border border-white/10 bg-slate-950/50 px-4 py-3 text-sm leading-6 text-white outline-none placeholder:text-slate-500 focus:border-cyan-400/40"
          placeholder="Describe the desired outcome, context, and why the work matters."
        />
      </label>

      <div className="grid gap-5 lg:grid-cols-2">
        <label className="space-y-2">
          <span className="text-sm text-slate-300">Target repo</span>
          <input
            required
            value={form.targetRepo}
            onChange={(event) => updateField("targetRepo", event.target.value)}
            className="w-full rounded-2xl border border-white/10 bg-slate-950/50 px-4 py-3 text-sm text-white outline-none placeholder:text-slate-500 focus:border-cyan-400/40"
            placeholder="owner/repo"
          />
        </label>
        <label className="space-y-2">
          <span className="text-sm text-slate-300">Target branch</span>
          <input
            required
            value={form.targetBranch}
            onChange={(event) => updateField("targetBranch", event.target.value)}
            className="w-full rounded-2xl border border-white/10 bg-slate-950/50 px-4 py-3 text-sm text-white outline-none placeholder:text-slate-500 focus:border-cyan-400/40"
            placeholder="main"
          />
        </label>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <label className="space-y-2">
          <span className="text-sm text-slate-300">Constraints</span>
          <textarea
            value={form.constraints}
            onChange={(event) => updateField("constraints", event.target.value)}
            className="min-h-32 w-full rounded-[1.5rem] border border-white/10 bg-slate-950/50 px-4 py-3 text-sm leading-6 text-white outline-none placeholder:text-slate-500 focus:border-cyan-400/40"
            placeholder="One constraint per line"
          />
        </label>
        <label className="space-y-2">
          <span className="text-sm text-slate-300">Acceptance criteria</span>
          <textarea
            value={form.acceptanceCriteria}
            onChange={(event) => updateField("acceptanceCriteria", event.target.value)}
            className="min-h-32 w-full rounded-[1.5rem] border border-white/10 bg-slate-950/50 px-4 py-3 text-sm leading-6 text-white outline-none placeholder:text-slate-500 focus:border-cyan-400/40"
            placeholder="One acceptance criterion per line"
          />
        </label>
      </div>

      <div className="grid gap-5 lg:grid-cols-[0.7fr_1.3fr]">
        <label className="space-y-2">
          <span className="text-sm text-slate-300">Attachment name</span>
          <input
            value={form.attachmentName}
            onChange={(event) => updateField("attachmentName", event.target.value)}
            className="w-full rounded-2xl border border-white/10 bg-slate-950/50 px-4 py-3 text-sm text-white outline-none placeholder:text-slate-500 focus:border-cyan-400/40"
            placeholder="brief.md"
          />
        </label>
        <label className="space-y-2">
          <span className="text-sm text-slate-300">Attachment content</span>
          <textarea
            value={form.attachmentContent}
            onChange={(event) => updateField("attachmentContent", event.target.value)}
            className="min-h-28 w-full rounded-[1.5rem] border border-white/10 bg-slate-950/50 px-4 py-3 text-sm leading-6 text-white outline-none placeholder:text-slate-500 focus:border-cyan-400/40"
            placeholder="Optional supporting context, logs, or issue notes"
          />
        </label>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="text-sm text-slate-400">{error ? <span className="text-rose-300">{error}</span> : "The run will stop for approval before any push or PR action."}</div>
        <button
          type="submit"
          disabled={isPending}
          className="rounded-full bg-cyan-300 px-5 py-3 text-sm font-medium text-slate-950 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isPending ? "Starting..." : "Start run"}
        </button>
      </div>
    </form>
  );
}

