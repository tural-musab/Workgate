import { Bot } from "lucide-react";

import { LanguageSwitcher } from "@/components/language-switcher";
import { LoginForm } from "@/components/login-form";
import { getMessages } from "@/lib/i18n";
import { getServerLocale } from "@/lib/i18n-server";

export default async function LoginPage() {
  const locale = await getServerLocale();
  const messages = getMessages(locale);

  return (
    <main className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,_rgba(86,166,255,0.18),_transparent_38%),linear-gradient(180deg,_#07131d,_#081017_50%,_#050b10)] px-6 py-10 text-slate-100">
      <div className="grid w-full max-w-5xl gap-8 lg:grid-cols-[1.1fr_0.9fr]">
        <section className="space-y-6 rounded-[2.4rem] border border-white/10 bg-white/[0.04] px-8 py-10">
          <div className="flex items-center justify-between gap-4">
            <div className="inline-flex items-center gap-3 text-[0.72rem] uppercase tracking-[0.24em] text-cyan-200/70">
              <Bot className="h-4 w-4" />
              {messages.loginPage.eyebrow}
            </div>
            <LanguageSwitcher />
          </div>
          <div className="space-y-3">
            <h1 className="max-w-xl text-5xl font-semibold tracking-[-0.06em] text-white">{messages.loginPage.title}</h1>
            <p className="max-w-xl text-base leading-7 text-slate-300">{messages.loginPage.description}</p>
          </div>
          <div className="grid gap-4 text-sm leading-6 text-slate-300 sm:grid-cols-2">
            <div className="rounded-[1.5rem] border border-white/10 bg-slate-950/30 px-5 py-5">{messages.loginPage.featureOne}</div>
            <div className="rounded-[1.5rem] border border-white/10 bg-slate-950/30 px-5 py-5">{messages.loginPage.featureTwo}</div>
          </div>
        </section>
        <LoginForm />
      </div>
    </main>
  );
}
