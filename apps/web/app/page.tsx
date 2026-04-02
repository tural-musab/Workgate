import Link from "next/link";

import { Activity, ArrowRight, GitBranchPlus, ShieldCheck } from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { RunActions } from "@/components/run-actions";
import { StatusBadge } from "@/components/status-badge";
import { TaskComposer } from "@/components/task-composer";
import { requirePageSession } from "@/lib/auth";
import { getDashboardData } from "@/lib/app-service";
import { formatRelativeTime } from "@/lib/format";
import { getMessages, getTaskTypeLabel } from "@/lib/i18n";
import { getServerLocale } from "@/lib/i18n-server";
import { getWorkflowPresentation } from "@/lib/workflows";
import { canCancelRun, canDeleteRun, canRetryRun } from "@aiteams/shared";

export default async function DashboardPage() {
  const [session, data, locale] = await Promise.all([requirePageSession(), getDashboardData(), getServerLocale()]);
  const messages = getMessages(locale);

  return (
    <AppShell username={session.username} runtime={data.runtime}>
      <div className="space-y-8">
        <header className="space-y-3">
          <div className="text-[0.72rem] uppercase tracking-[0.22em] text-cyan-200/70">{messages.dashboard.eyebrow}</div>
          <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div className="space-y-2">
              <h1 className="text-4xl font-semibold tracking-[-0.05em] text-white">{messages.dashboard.title}</h1>
              <p className="max-w-3xl text-sm leading-7 text-slate-300">{messages.dashboard.description}</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.04] px-4 py-4">
                <div className="text-[0.68rem] uppercase tracking-[0.18em] text-slate-400">{messages.dashboard.totalRuns}</div>
                <div className="mt-3 text-3xl font-semibold tracking-[-0.05em] text-white">{data.summary.totalRuns}</div>
              </div>
              <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.04] px-4 py-4">
                <div className="text-[0.68rem] uppercase tracking-[0.18em] text-slate-400">{messages.dashboard.pendingApprovals}</div>
                <div className="mt-3 text-3xl font-semibold tracking-[-0.05em] text-white">{data.summary.pendingApprovals}</div>
              </div>
              <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.04] px-4 py-4">
                <div className="text-[0.68rem] uppercase tracking-[0.18em] text-slate-400">{messages.dashboard.failedRuns}</div>
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
                  <div className="text-[0.72rem] uppercase tracking-[0.2em] text-cyan-200/70">{messages.dashboard.runLedger}</div>
                  <h2 className="text-2xl font-semibold tracking-[-0.04em] text-white">{messages.dashboard.recentRuns}</h2>
                </div>
                <Link href="/approvals" className="inline-flex items-center gap-2 text-sm text-cyan-200 transition hover:text-cyan-100">
                  {messages.common.viewApprovalQueue}
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>

              <div className="mt-6 space-y-3">
                {data.runs.length === 0 ? (
                  <div className="rounded-[1.5rem] border border-dashed border-white/10 px-5 py-8 text-sm text-slate-400">{messages.dashboard.noRuns}</div>
                ) : (
                  data.runs.map((run) => {
                    const workflow = getWorkflowPresentation(run.workflowTemplate, locale);
                    return (
                      <div key={run.id} className="rounded-[1.5rem] border border-white/10 px-5 py-5 transition hover:bg-white/[0.035]">
                        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                          <div className="min-w-0 space-y-2">
                            <div className="flex flex-wrap items-center gap-3">
                              <StatusBadge status={run.status} />
                              <span className="font-[var(--font-mono)] text-xs text-slate-400">{run.id}</span>
                              <span className={`rounded-full border px-3 py-1 text-[0.68rem] uppercase tracking-[0.16em] ${workflow.accentBorder} ${workflow.accentText}`}>
                                {workflow.name}
                              </span>
                            </div>
                            <Link href={`/runs/${run.id}`} className="block text-lg font-medium text-white transition hover:text-cyan-100">
                              {run.title}
                            </Link>
                            <div className="text-sm leading-6 text-slate-400">
                              {workflow.targetPrimaryLabel}: {run.targetRepo} · {workflow.targetSecondaryLabel}: {run.targetBranch}
                            </div>
                          </div>
                          <div className="flex flex-col items-start gap-3 lg:items-end">
                            <div className="flex items-center gap-8 text-sm text-slate-300">
                              <span>{formatRelativeTime(run.updatedAt, locale)}</span>
                              <span className="font-[var(--font-mono)] text-xs uppercase tracking-[0.18em] text-slate-500">{getTaskTypeLabel(run.taskType, messages)}</span>
                            </div>
                            <RunActions
                              runId={run.id}
                              allowCancel={canCancelRun(run.status)}
                              allowDelete={canDeleteRun(run.status)}
                              allowRetry={canRetryRun(run.status)}
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </section>
          </div>

          <div className="space-y-6">
            <section className="rounded-[2rem] border border-white/10 bg-white/[0.04] px-6 py-6">
              <div className="space-y-1">
                <div className="text-[0.72rem] uppercase tracking-[0.2em] text-cyan-200/70">{messages.dashboard.controlNotes}</div>
                <h2 className="text-2xl font-semibold tracking-[-0.04em] text-white">{messages.dashboard.operatorReminders}</h2>
              </div>
              <div className="mt-6 space-y-4 text-sm leading-6 text-slate-300">
                <div className="flex items-start gap-3">
                  <ShieldCheck className="mt-0.5 h-4 w-4 text-cyan-200" />
                  <p>{messages.dashboard.noteOne}</p>
                </div>
                <div className="flex items-start gap-3">
                  <GitBranchPlus className="mt-0.5 h-4 w-4 text-cyan-200" />
                  <p>{messages.dashboard.noteTwo}</p>
                </div>
                <div className="flex items-start gap-3">
                  <Activity className="mt-0.5 h-4 w-4 text-cyan-200" />
                  <p>{messages.dashboard.noteThree}</p>
                </div>
              </div>
            </section>

            <section className="rounded-[2rem] border border-white/10 bg-white/[0.04] px-6 py-6">
              <div className="space-y-1">
                <div className="text-[0.72rem] uppercase tracking-[0.2em] text-cyan-200/70">{messages.dashboard.approvalQueue}</div>
                <h2 className="text-2xl font-semibold tracking-[-0.04em] text-white">{messages.dashboard.waitingOnYou}</h2>
              </div>

              <div className="mt-6 space-y-3">
                {data.approvals.length === 0 ? (
                  <div className="rounded-[1.5rem] border border-dashed border-white/10 px-5 py-7 text-sm text-slate-400">{messages.dashboard.noApprovals}</div>
                ) : (
                  data.approvals.map((run) => {
                    const workflow = getWorkflowPresentation(run.workflowTemplate, locale);
                    return (
                      <div key={run.id} className="rounded-[1.5rem] border border-white/10 px-5 py-4 transition hover:bg-white/[0.035]">
                        <div className="flex flex-col gap-3">
                          <div className="flex items-center justify-between gap-4">
                            <div className="space-y-1">
                              <Link href={`/runs/${run.id}`} className="text-sm font-medium text-white transition hover:text-cyan-100">
                                {run.title}
                              </Link>
                              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
                                <span>{run.targetRepo}</span>
                                <span className={`rounded-full border px-2 py-1 uppercase tracking-[0.14em] ${workflow.accentBorder} ${workflow.accentText}`}>
                                  {workflow.name}
                                </span>
                              </div>
                            </div>
                            <StatusBadge status={run.status} />
                          </div>
                          <RunActions runId={run.id} allowCancel={canCancelRun(run.status)} />
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </section>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
