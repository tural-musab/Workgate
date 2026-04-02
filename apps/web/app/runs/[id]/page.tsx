import { notFound } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import { ApprovalActions } from "@/components/approval-actions";
import { StatusBadge } from "@/components/status-badge";
import { requirePageSession } from "@/lib/auth";
import { getRunDetail, getRuntimeInfo } from "@/lib/app-service";
import { formatRelativeTime } from "@/lib/format";

export default async function RunDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requirePageSession();
  const [detail, runtime] = await Promise.all([getRunDetail(id), getRuntimeInfo()]);
  if (!detail) notFound();

  return (
    <AppShell username={session.username} runtime={runtime}>
      <div className="space-y-8">
        <header className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <StatusBadge status={detail.run.status} />
            <span className="font-[var(--font-mono)] text-xs text-slate-400">{detail.run.id}</span>
            <span className="text-sm text-slate-500">{formatRelativeTime(detail.run.updatedAt)}</span>
          </div>
          <div className="space-y-2">
            <h1 className="text-4xl font-semibold tracking-[-0.05em] text-white">{detail.run.title}</h1>
            <p className="max-w-4xl text-sm leading-7 text-slate-300">{detail.task.goal}</p>
          </div>
          <div className="flex flex-wrap gap-3 text-sm text-slate-400">
            <span>{detail.run.targetRepo}</span>
            <span>Branch: {detail.run.targetBranch}</span>
            {detail.run.branchName ? <span>Managed branch: {detail.run.branchName}</span> : null}
          </div>
        </header>

        <div className="operator-grid">
          <div className="space-y-6">
            <section className="rounded-[2rem] border border-white/10 bg-white/[0.04] px-6 py-6">
              <div className="space-y-1">
                <div className="text-[0.72rem] uppercase tracking-[0.2em] text-cyan-200/70">Execution timeline</div>
                <h2 className="text-2xl font-semibold tracking-[-0.04em] text-white">Completed steps</h2>
              </div>
              <div className="mt-6 space-y-4">
                {detail.steps.length === 0 ? (
                  <div className="rounded-[1.5rem] border border-dashed border-white/10 px-5 py-6 text-sm text-slate-400">The run has not emitted completed steps yet.</div>
                ) : (
                  detail.steps.map((step) => (
                    <div key={step.id} className="rounded-[1.5rem] border border-white/10 px-5 py-5">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="space-y-1">
                          <div className="text-[0.72rem] uppercase tracking-[0.2em] text-slate-400">{step.role}</div>
                          <div className="text-sm text-white">{step.summary ?? "Completed"}</div>
                        </div>
                        <div className="text-xs text-slate-500">{step.endedAt ? formatRelativeTime(step.endedAt) : "In progress"}</div>
                      </div>
                      {step.output ? <pre className="mt-4 overflow-x-auto whitespace-pre-wrap rounded-[1.25rem] bg-slate-950/50 px-4 py-4 font-[var(--font-mono)] text-xs leading-6 text-slate-300">{step.output}</pre> : null}
                    </div>
                  ))
                )}
              </div>
            </section>

            <section className="rounded-[2rem] border border-white/10 bg-white/[0.04] px-6 py-6">
              <div className="space-y-1">
                <div className="text-[0.72rem] uppercase tracking-[0.2em] text-cyan-200/70">Artefacts</div>
                <h2 className="text-2xl font-semibold tracking-[-0.04em] text-white">Generated outputs</h2>
              </div>
              <div className="mt-6 space-y-4">
                {detail.artifacts.map((artifact) => (
                  <article key={artifact.id} className="rounded-[1.5rem] border border-white/10 px-5 py-5">
                    <div className="space-y-1">
                      <div className="text-[0.72rem] uppercase tracking-[0.2em] text-slate-400">{artifact.artifactType}</div>
                      <h3 className="text-lg font-medium text-white">{artifact.title}</h3>
                    </div>
                    <pre className="mt-4 overflow-x-auto whitespace-pre-wrap rounded-[1.25rem] bg-slate-950/50 px-4 py-4 font-[var(--font-mono)] text-xs leading-6 text-slate-300">{artifact.content}</pre>
                  </article>
                ))}
              </div>
            </section>
          </div>

          <div className="space-y-6">
            {detail.run.status === "pending_human" ? <ApprovalActions runId={detail.run.id} /> : null}

            <section className="rounded-[2rem] border border-white/10 bg-white/[0.04] px-6 py-6">
              <div className="space-y-1">
                <div className="text-[0.72rem] uppercase tracking-[0.2em] text-cyan-200/70">Approvals</div>
                <h2 className="text-2xl font-semibold tracking-[-0.04em] text-white">Decision log</h2>
              </div>
              <div className="mt-6 space-y-3">
                {detail.approvals.length === 0 ? (
                  <div className="rounded-[1.5rem] border border-dashed border-white/10 px-5 py-6 text-sm text-slate-400">No approval records yet.</div>
                ) : (
                  detail.approvals.map((approval) => (
                    <div key={approval.id} className="rounded-[1.5rem] border border-white/10 px-5 py-4">
                      <div className="flex items-center justify-between gap-4">
                        <span className="text-sm text-white">{approval.action ?? "pending"}</span>
                        <span className="text-xs text-slate-500">{formatRelativeTime(approval.updatedAt)}</span>
                      </div>
                      {approval.notes ? <p className="mt-3 text-sm leading-6 text-slate-300">{approval.notes}</p> : null}
                    </div>
                  ))
                )}
              </div>
            </section>

            <section className="rounded-[2rem] border border-white/10 bg-white/[0.04] px-6 py-6">
              <div className="space-y-1">
                <div className="text-[0.72rem] uppercase tracking-[0.2em] text-cyan-200/70">Task source</div>
                <h2 className="text-2xl font-semibold tracking-[-0.04em] text-white">Inputs</h2>
              </div>
              <div className="mt-5 space-y-4 text-sm leading-6 text-slate-300">
                <div>
                  <div className="text-slate-500">Constraints</div>
                  <ul className="mt-2 list-disc space-y-1 pl-5">
                    {detail.task.constraints.length === 0 ? <li>None</li> : detail.task.constraints.map((item) => <li key={item}>{item}</li>)}
                  </ul>
                </div>
                <div>
                  <div className="text-slate-500">Acceptance criteria</div>
                  <ul className="mt-2 list-disc space-y-1 pl-5">
                    {detail.task.acceptanceCriteria.length === 0 ? (
                      <li>None</li>
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

