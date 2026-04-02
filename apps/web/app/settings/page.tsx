import { AppShell } from "@/components/app-shell";
import { GitHubSettingsForm } from "@/components/github-settings-form";
import { requirePageSession } from "@/lib/auth";
import { getGitHubSettingsView, getModelPoliciesView, getRuntimeInfo } from "@/lib/app-service";
import { getMessages, getRoleLabel } from "@/lib/i18n";
import { getServerLocale } from "@/lib/i18n-server";

export default async function SettingsPage() {
  const [session, settings, runtime, policies, locale] = await Promise.all([
    requirePageSession(),
    getGitHubSettingsView(),
    getRuntimeInfo(),
    getModelPoliciesView(),
    getServerLocale()
  ]);
  const messages = getMessages(locale);

  return (
    <AppShell username={session.username} runtime={runtime}>
      <div className="space-y-8">
        <header className="space-y-3">
          <div className="text-[0.72rem] uppercase tracking-[0.22em] text-cyan-200/70">{messages.settingsPage.eyebrow}</div>
          <h1 className="text-4xl font-semibold tracking-[-0.05em] text-white">{messages.settingsPage.title}</h1>
          <p className="max-w-3xl text-sm leading-7 text-slate-300">{messages.settingsPage.description}</p>
        </header>

        <div className="operator-grid">
          <div className="space-y-6">
            <GitHubSettingsForm initial={settings} />
          </div>

          <div className="space-y-6">
            <section className="rounded-[2rem] border border-white/10 bg-white/[0.04] px-6 py-6">
              <div className="space-y-1">
                <div className="text-[0.72rem] uppercase tracking-[0.2em] text-cyan-200/70">{messages.settingsPage.runtimeEyebrow}</div>
                <h2 className="text-2xl font-semibold tracking-[-0.04em] text-white">{messages.settingsPage.runtimeTitle}</h2>
              </div>
              <div className="mt-5 space-y-3 text-sm leading-6 text-slate-300">
                <p>{messages.settingsPage.storageMode}: {runtime.storageMode}</p>
                <p>{messages.settingsPage.queueMode}: {runtime.queueMode}</p>
                <p>{messages.settingsPage.suggestedBranch}: {runtime.suggestedBranch}</p>
              </div>
            </section>

            <section className="rounded-[2rem] border border-white/10 bg-white/[0.04] px-6 py-6">
              <div className="space-y-1">
                <div className="text-[0.72rem] uppercase tracking-[0.2em] text-cyan-200/70">{messages.settingsPage.modelPolicyEyebrow}</div>
                <h2 className="text-2xl font-semibold tracking-[-0.04em] text-white">{messages.settingsPage.modelPolicyTitle}</h2>
              </div>
              <div className="mt-5 space-y-3">
                {policies.map((policy) => (
                  <div key={policy.role} className="rounded-[1.5rem] border border-white/10 px-4 py-4">
                    <div className="text-sm font-medium text-white">{getRoleLabel(policy.role, messages)}</div>
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
