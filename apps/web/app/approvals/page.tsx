import Link from "next/link";

import { AppShell } from "@/components/app-shell";
import { StatusBadge } from "@/components/status-badge";
import { requirePageSession } from "@/lib/auth";
import { getRuntimeInfo, listPendingApprovalRuns } from "@/lib/app-service";

export default async function ApprovalsPage() {
  const session = await requirePageSession();
  const [runs, runtime] = await Promise.all([listPendingApprovalRuns(), getRuntimeInfo()]);

  return (
    <AppShell username={session.username} runtime={runtime}>
      <div className="space-y-8">
        <header className="space-y-3">
          <div className="text-[0.72rem] uppercase tracking-[0.22em] text-cyan-200/70">Approval queue</div>
          <h1 className="text-4xl font-semibold tracking-[-0.05em] text-white">Runs blocked behind human review</h1>
          <p className="max-w-3xl text-sm leading-7 text-slate-300">This queue is the last safeguard before AI TeamS writes branches or opens draft pull requests on GitHub.</p>
        </header>

        <section className="rounded-[2rem] border border-white/10 bg-white/[0.04] px-6 py-6">
          <div className="space-y-4">
            {runs.length === 0 ? (
              <div className="rounded-[1.5rem] border border-dashed border-white/10 px-5 py-8 text-sm text-slate-400">No pending approvals right now.</div>
            ) : (
              runs.map((run) => (
                <Link key={run.id} href={`/runs/${run.id}`} className="flex flex-col gap-3 rounded-[1.5rem] border border-white/10 px-5 py-5 transition hover:bg-white/[0.035] lg:flex-row lg:items-center lg:justify-between">
                  <div className="space-y-2">
                    <StatusBadge status={run.status} />
                    <div className="text-xl font-medium text-white">{run.title}</div>
                    <div className="text-sm text-slate-400">
                      {run.targetRepo} on {run.targetBranch}
                    </div>
                  </div>
                  <div className="text-sm text-cyan-200">Open run detail</div>
                </Link>
              ))
            )}
          </div>
        </section>
      </div>
    </AppShell>
  );
}

