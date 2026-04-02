import Link from "next/link";

import { AppShell } from "@/components/app-shell";
import { StatusBadge } from "@/components/status-badge";
import { requirePageSession } from "@/lib/auth";
import { getRuntimeInfo, listPendingApprovalRuns } from "@/lib/app-service";
import { getMessages } from "@/lib/i18n";
import { getServerLocale } from "@/lib/i18n-server";
import { getWorkflowPresentation } from "@/lib/workflows";

export default async function ApprovalsPage() {
  const [session, runs, runtime, locale] = await Promise.all([requirePageSession(), listPendingApprovalRuns(), getRuntimeInfo(), getServerLocale()]);
  const messages = getMessages(locale);

  return (
    <AppShell username={session.username} runtime={runtime}>
      <div className="space-y-8">
        <header className="space-y-3">
          <div className="text-[0.72rem] uppercase tracking-[0.22em] text-cyan-200/70">{messages.approvalsPage.eyebrow}</div>
          <h1 className="text-4xl font-semibold tracking-[-0.05em] text-white">{messages.approvalsPage.title}</h1>
          <p className="max-w-3xl text-sm leading-7 text-slate-300">{messages.approvalsPage.description}</p>
        </header>

        <section className="rounded-[2rem] border border-white/10 bg-white/[0.04] px-6 py-6">
          <div className="space-y-4">
            {runs.length === 0 ? (
              <div className="rounded-[1.5rem] border border-dashed border-white/10 px-5 py-8 text-sm text-slate-400">{messages.approvalsPage.empty}</div>
            ) : (
              runs.map((run) => {
                const workflow = getWorkflowPresentation(run.workflowTemplate, locale);
                return (
                  <Link key={run.id} href={`/runs/${run.id}`} className="flex flex-col gap-3 rounded-[1.5rem] border border-white/10 px-5 py-5 transition hover:bg-white/[0.035] lg:flex-row lg:items-center lg:justify-between">
                    <div className="space-y-2">
                      <StatusBadge status={run.status} />
                      <div className="text-xl font-medium text-white">{run.title}</div>
                      <div className="flex flex-wrap items-center gap-2 text-sm text-slate-400">
                        <span>{workflow.targetPrimaryLabel}: {run.targetRepo}</span>
                        <span>{workflow.targetSecondaryLabel}: {run.targetBranch}</span>
                        <span className={`rounded-full border px-3 py-1 text-[0.68rem] uppercase tracking-[0.14em] ${workflow.accentBorder} ${workflow.accentText}`}>
                          {workflow.name}
                        </span>
                      </div>
                    </div>
                    <div className="text-sm text-cyan-200">{messages.common.openRunDetail}</div>
                  </Link>
                );
              })
            )}
          </div>
        </section>
      </div>
    </AppShell>
  );
}
