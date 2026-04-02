import { notFound } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import { ApprovalActions } from "@/components/approval-actions";
import { RunActions } from "@/components/run-actions";
import { StatusBadge } from "@/components/status-badge";
import { requirePageSession } from "@/lib/auth";
import { canRetryFailedOnly, getRunDetail, getRuntimeInfo } from "@/lib/app-service";
import { formatRelativeTime } from "@/lib/format";
import { getArtifactTypeLabel, getMessages, getRoleLabel } from "@/lib/i18n";
import { getServerLocale } from "@/lib/i18n-server";
import { getWorkflowPresentation } from "@/lib/workflows";
import { canCancelRun, canDeleteRun, canRetryRun } from "@workgate/shared";

export default async function RunDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [session, detail, runtime, locale] = await Promise.all([requirePageSession(), getRunDetail(id), getRuntimeInfo(), getServerLocale()]);
  if (!detail) notFound();
  const messages = getMessages(locale);
  const allowFailedOnlyRetry = canRetryFailedOnly(detail);
  const workflow = getWorkflowPresentation(detail.run.workflowTemplate, locale);

  return (
    <AppShell username={session.username} runtime={runtime}>
      <div className="space-y-8">
        <header className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <StatusBadge status={detail.run.status} />
            <span className="font-[var(--font-mono)] text-xs text-slate-400">{detail.run.id}</span>
            <span className="text-sm text-slate-500">{formatRelativeTime(detail.run.updatedAt, locale)}</span>
          </div>
          <div className="space-y-2">
            <h1 className="text-4xl font-semibold tracking-[-0.05em] text-white">{detail.run.title}</h1>
            <p className="max-w-4xl text-sm leading-7 text-slate-300">{detail.task.goal}</p>
          </div>
          <div className="flex flex-wrap gap-3 text-sm text-slate-400">
            <span className={`rounded-full border px-3 py-1 text-[0.7rem] uppercase tracking-[0.16em] ${workflow.accentBorder} ${workflow.accentText}`}>
              {messages.runDetail.workflowLabel}: {workflow.name}
            </span>
            <span>{workflow.targetPrimaryLabel}: {detail.run.targetRepo}</span>
            <span>{workflow.targetSecondaryLabel}: {detail.run.targetBranch}</span>
            {detail.run.branchName ? <span>{messages.runDetail.managedBranchLabel}: {detail.run.branchName}</span> : null}
          </div>
        </header>

        <div className="operator-grid">
          <div className="space-y-6">
            <section className="rounded-[2rem] border border-white/10 bg-white/[0.04] px-6 py-6">
              <div className="space-y-1">
                <div className="text-[0.72rem] uppercase tracking-[0.2em] text-cyan-200/70">{messages.runDetail.executionTimeline}</div>
                <h2 className="text-2xl font-semibold tracking-[-0.04em] text-white">{messages.runDetail.completedSteps}</h2>
              </div>
              <div className="mt-6 space-y-4">
                {detail.steps.length === 0 ? (
                  <div className="rounded-[1.5rem] border border-dashed border-white/10 px-5 py-6 text-sm text-slate-400">{messages.runDetail.noCompletedSteps}</div>
                ) : (
                  detail.steps.map((step) => (
                    <div key={step.id} className="rounded-[1.5rem] border border-white/10 px-5 py-5">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="space-y-1">
                          <div className="text-[0.72rem] uppercase tracking-[0.2em] text-slate-400">{getRoleLabel(step.role, messages)}</div>
                          <div className="text-sm text-white">{step.summary ?? messages.runDetail.completed}</div>
                        </div>
                        <div className="text-xs text-slate-500">{step.endedAt ? formatRelativeTime(step.endedAt, locale) : messages.runDetail.inProgress}</div>
                      </div>
                      {step.output ? <pre className="mt-4 overflow-x-auto whitespace-pre-wrap rounded-[1.25rem] bg-slate-950/50 px-4 py-4 font-[var(--font-mono)] text-xs leading-6 text-slate-300">{step.output}</pre> : null}
                    </div>
                  ))
                )}
              </div>
            </section>

            <section className="rounded-[2rem] border border-white/10 bg-white/[0.04] px-6 py-6">
              <div className="space-y-1">
                <div className="text-[0.72rem] uppercase tracking-[0.2em] text-cyan-200/70">{messages.runDetail.artefacts}</div>
                <h2 className="text-2xl font-semibold tracking-[-0.04em] text-white">{messages.runDetail.generatedOutputs}</h2>
              </div>
              <div className="mt-6 space-y-4">
                {detail.artifacts.length === 0 ? (
                  <div className="rounded-[1.5rem] border border-dashed border-white/10 px-5 py-6 text-sm text-slate-400">{messages.runDetail.noArtifacts}</div>
                ) : (
                  detail.artifacts.map((artifact) => (
                    <article key={artifact.id} className="rounded-[1.5rem] border border-white/10 px-5 py-5">
                      <div className="space-y-1">
                        <div className="text-[0.72rem] uppercase tracking-[0.2em] text-slate-400">{getArtifactTypeLabel(artifact.artifactType, messages)}</div>
                        <h3 className="text-lg font-medium text-white">{artifact.title}</h3>
                      </div>
                      <pre className="mt-4 overflow-x-auto whitespace-pre-wrap rounded-[1.25rem] bg-slate-950/50 px-4 py-4 font-[var(--font-mono)] text-xs leading-6 text-slate-300">{artifact.content}</pre>
                    </article>
                  ))
                )}
              </div>
            </section>
          </div>

          <div className="space-y-6">
            <RunActions
              runId={detail.run.id}
              allowCancel={canCancelRun(detail.run.status)}
              allowDelete={canDeleteRun(detail.run.status)}
              allowRetry={canRetryRun(detail.run.status)}
              allowRetryFailedOnly={allowFailedOnlyRetry}
              redirectOnDeleteTo="/"
              variant="detail"
            />

            {detail.run.status === "pending_human" ? <ApprovalActions runId={detail.run.id} /> : null}

            <section className="rounded-[2rem] border border-white/10 bg-white/[0.04] px-6 py-6">
              <div className="space-y-1">
                <div className="text-[0.72rem] uppercase tracking-[0.2em] text-cyan-200/70">{messages.runDetail.approvals}</div>
                <h2 className="text-2xl font-semibold tracking-[-0.04em] text-white">{messages.runDetail.decisionLog}</h2>
              </div>
              <div className="mt-6 space-y-3">
                {detail.approvals.length === 0 ? (
                  <div className="rounded-[1.5rem] border border-dashed border-white/10 px-5 py-6 text-sm text-slate-400">{messages.runDetail.noApprovals}</div>
                ) : (
                  detail.approvals.map((approval) => (
                    <div key={approval.id} className="rounded-[1.5rem] border border-white/10 px-5 py-4">
                      <div className="flex items-center justify-between gap-4">
                        <span className="text-sm text-white">{approval.action ?? messages.runDetail.pending}</span>
                        <span className="text-xs text-slate-500">{formatRelativeTime(approval.updatedAt, locale)}</span>
                      </div>
                      {approval.notes ? <p className="mt-3 text-sm leading-6 text-slate-300">{approval.notes}</p> : null}
                    </div>
                  ))
                )}
              </div>
            </section>

            <section className="rounded-[2rem] border border-white/10 bg-white/[0.04] px-6 py-6">
              <div className="space-y-1">
                <div className="text-[0.72rem] uppercase tracking-[0.2em] text-cyan-200/70">{messages.runDetail.taskSource}</div>
                <h2 className="text-2xl font-semibold tracking-[-0.04em] text-white">{messages.runDetail.inputs}</h2>
              </div>
              <div className="mt-5 space-y-4 text-sm leading-6 text-slate-300">
                <div>
                  <div className="text-slate-500">{workflow.targetPrimaryLabel}</div>
                  <div className="mt-2 rounded-[1.25rem] bg-slate-950/40 px-4 py-3 text-white">{detail.task.targetRepo}</div>
                </div>
                <div>
                  <div className="text-slate-500">{workflow.targetSecondaryLabel}</div>
                  <div className="mt-2 rounded-[1.25rem] bg-slate-950/40 px-4 py-3 text-white">{detail.task.targetBranch}</div>
                </div>
                <div>
                  <div className="text-slate-500">{messages.runDetail.constraints}</div>
                  <ul className="mt-2 list-disc space-y-1 pl-5">
                    {detail.task.constraints.length === 0 ? <li>{messages.common.none}</li> : detail.task.constraints.map((item) => <li key={item}>{item}</li>)}
                  </ul>
                </div>
                <div>
                  <div className="text-slate-500">{messages.runDetail.acceptanceCriteria}</div>
                  <ul className="mt-2 list-disc space-y-1 pl-5">
                    {detail.task.acceptanceCriteria.length === 0 ? (
                      <li>{messages.common.none}</li>
                    ) : (
                      detail.task.acceptanceCriteria.map((item) => <li key={item}>{item}</li>)
                    )}
                  </ul>
                </div>
              </div>
            </section>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
