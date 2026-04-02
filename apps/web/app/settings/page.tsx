import { AppShell } from "@/components/app-shell";
import { GitHubSettingsForm } from "@/components/github-settings-form";
import { requirePageSession } from "@/lib/auth";
import { getGitHubSettingsView, getRuntimeInfo } from "@/lib/app-service";
import { defaultModelPolicies } from "@aiteams/shared";

export default async function SettingsPage() {
  const session = await requirePageSession();
  const [settings, runtime] = await Promise.all([getGitHubSettingsView(), getRuntimeInfo()]);

  return (
    <AppShell username={session.username} runtime={runtime}>
      <div className="space-y-8">
        <header className="space-y-3">
          <div className="text-[0.72rem] uppercase tracking-[0.22em] text-cyan-200/70">Settings</div>
          <h1 className="text-4xl font-semibold tracking-[-0.05em] text-white">Runtime and integration controls</h1>
          <p className="max-w-3xl text-sm leading-7 text-slate-300">GitHub is the only external integration in v1. Providers remain multi-model by policy, but branch push and draft PR creation stay behind a single operator account.</p>
        </header>

        <div className="operator-grid">
          <div className="space-y-6">
            <GitHubSettingsForm initial={settings} />
          </div>

          <div className="space-y-6">
            <section className="rounded-[2rem] border border-white/10 bg-white/[0.04] px-6 py-6">
              <div className="space-y-1">
                <div className="text-[0.72rem] uppercase tracking-[0.2em] text-cyan-200/70">Runtime</div>
                <h2 className="text-2xl font-semibold tracking-[-0.04em] text-white">Local execution</h2>
              </div>
              <div className="mt-5 space-y-3 text-sm leading-6 text-slate-300">
                <p>Storage mode: {runtime.storageMode}</p>
                <p>Queue mode: {runtime.queueMode}</p>
                <p>Suggested branch template: {runtime.suggestedBranch}</p>
              </div>
            </section>

            <section className="rounded-[2rem] border border-white/10 bg-white/[0.04] px-6 py-6">
              <div className="space-y-1">
                <div className="text-[0.72rem] uppercase tracking-[0.2em] text-cyan-200/70">Model policy</div>
                <h2 className="text-2xl font-semibold tracking-[-0.04em] text-white">Default routing map</h2>
              </div>
              <div className="mt-5 space-y-3">
                {defaultModelPolicies.map((policy) => (
                  <div key={policy.role} className="rounded-[1.5rem] border border-white/10 px-4 py-4">
                    <div className="text-sm font-medium text-white">{policy.role}</div>
                    <div className="mt-2 text-sm text-slate-400">
                      {policy.provider} / {policy.model}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

