import Link from "next/link";

import { Activity, ArrowRight, GitBranchPlus, ShieldCheck } from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { StatusBadge } from "@/components/status-badge";
import { TaskComposer } from "@/components/task-composer";
import { requirePageSession } from "@/lib/auth";
import { getDashboardData } from "@/lib/app-service";
import { formatRelativeTime } from "@/lib/format";

export default async function DashboardPage() {
  const session = await requirePageSession();
  const data = await getDashboardData();

  return (
    <AppShell username={session.username} runtime={data.runtime}>
      <div className="space-y-8">
        <header className="space-y-3">
          <div className="text-[0.72rem] uppercase tracking-[0.22em] text-cyan-200/70">AI software office</div>
          <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div className="space-y-2">
              <h1 className="text-4xl font-semibold tracking-[-0.05em] text-white">Runs, approvals, and repo output in one pane</h1>
              <p className="max-w-3xl text-sm leading-7 text-slate-300">
                Submit work against trusted repositories, inspect each role output, and stop every branch push behind an explicit operator gate.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.04] px-4 py-4">
                <div className="text-[0.68rem] uppercase tracking-[0.18em] text-slate-400">Total runs</div>
                <div className="mt-3 text-3xl font-semibold tracking-[-0.05em] text-white">{data.summary.totalRuns}</div>
              </div>
              <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.04] px-4 py-4">
                <div className="text-[0.68rem] uppercase tracking-[0.18em] text-slate-400">Pending approvals</div>
                <div className="mt-3 text-3xl font-semibold tracking-[-0.05em] text-white">{data.summary.pendingApprovals}</div>
              </div>
              <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.04] px-4 py-4">
                <div className="text-[0.68rem] uppercase tracking-[0.18em] text-slate-400">Failed runs</div>
                <div className="mt-3 text-3xl font-semibold tracking-[-0.05em] text-white">{data.summary.failedRuns}</div>
              </div>
            </div>
          </div>
        </header>

        <div className="operator-grid">
          <div className="space-y-6">
            <TaskComposer />

            <section className="rounded-[2rem] border border-white/10 bg-white/[0.04] px-6 py-6">
              <div className="flex items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="text-[0.72rem] uppercase tracking-[0.2em] text-cyan-200/70">Run ledger</div>
                  <h2 className="text-2xl font-semibold tracking-[-0.04em] text-white">Recent runs</h2>
                </div>
                <Link href="/approvals" className="inline-flex items-center gap-2 text-sm text-cyan-200 transition hover:text-cyan-100">
                  View approval queue
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>

              <div className="mt-6 space-y-3">
                {data.runs.length === 0 ? (
                  <div className="rounded-[1.5rem] border border-dashed border-white/10 px-5 py-8 text-sm text-slate-400">No runs yet. Launch the first task above.</div>
                ) : (
                  data.runs.map((run) => (
                    <Link
                      key={run.id}
                      href={`/runs/${run.id}`}
                      className="flex flex-col gap-4 rounded-[1.5rem] border border-white/10 px-5 py-5 transition hover:bg-white/[0.035] lg:flex-row lg:items-center lg:justify-between"
                    >
                      <div className="min-w-0 space-y-2">
                        <div className="flex flex-wrap items-center gap-3">
                          <StatusBadge status={run.status} />
                          <span className="font-[var(--font-mono)] text-xs text-slate-400">{run.id}</span>
                        </div>
                        <div className="text-lg font-medium text-white">{run.title}</div>
                        <div className="text-sm leading-6 text-slate-400">
                          {run.targetRepo} on {run.targetBranch}
                        </div>
                      </div>
                      <div className="flex items-center gap-8 text-sm text-slate-300">
                        <span>{formatRelativeTime(run.updatedAt)}</span>
                        <span className="font-[var(--font-mono)] text-xs uppercase tracking-[0.18em] text-slate-500">{run.taskType}</span>
                      </div>
                    </Link>
                  ))
                )}
              </div>
            </section>
          </div>

          <div className="space-y-6">
            <section className="rounded-[2rem] border border-white/10 bg-white/[0.04] px-6 py-6">
              <div className="space-y-1">
                <div className="text-[0.72rem] uppercase tracking-[0.2em] text-cyan-200/70">Control notes</div>
                <h2 className="text-2xl font-semibold tracking-[-0.04em] text-white">Operator reminders</h2>
              </div>
              <div className="mt-6 space-y-4 text-sm leading-6 text-slate-300">
                <div className="flex items-start gap-3">
                  <ShieldCheck className="mt-0.5 h-4 w-4 text-cyan-200" />
                  <p>Branch push and draft pull request creation are blocked until you approve a run.</p>
                </div>
                <div className="flex items-start gap-3">
                  <GitBranchPlus className="mt-0.5 h-4 w-4 text-cyan-200" />
                  <p>GitHub execution is limited to repositories on the explicit allowlist stored in settings.</p>
                </div>
                <div className="flex items-start gap-3">
                  <Activity className="mt-0.5 h-4 w-4 text-cyan-200" />
                  <p>Without live PostgreSQL, the product stays usable through in-memory storage and an inline queue driver.</p>
                </div>
              </div>
            </section>

            <section className="rounded-[2rem] border border-white/10 bg-white/[0.04] px-6 py-6">
              <div className="space-y-1">
                <div className="text-[0.72rem] uppercase tracking-[0.2em] text-cyan-200/70">Approval queue</div>
                <h2 className="text-2xl font-semibold tracking-[-0.04em] text-white">Waiting on you</h2>
              </div>

              <div className="mt-6 space-y-3">
                {data.approvals.length === 0 ? (
                  <div className="rounded-[1.5rem] border border-dashed border-white/10 px-5 py-7 text-sm text-slate-400">No runs are waiting for approval.</div>
                ) : (
                  data.approvals.map((run) => (
                    <Link key={run.id} href={`/runs/${run.id}`} className="block rounded-[1.5rem] border border-white/10 px-5 py-4 transition hover:bg-white/[0.035]">
                      <div className="flex items-center justify-between gap-4">
                        <div className="space-y-1">
                          <div className="text-sm font-medium text-white">{run.title}</div>
                          <div className="text-xs text-slate-400">{run.targetRepo}</div>
                        </div>
                        <StatusBadge status={run.status} />
                      </div>
                    </Link>
                  ))
                )}
              </div>
            </section>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

