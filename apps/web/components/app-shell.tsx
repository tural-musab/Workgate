"use client";

import Link from "next/link";

import { Bot, CheckCheck, FolderGit2, Gauge, LogOut, Settings2 } from "lucide-react";

import { cn } from "@/lib/cn";

import { LanguageSwitcher } from "./language-switcher";
import { useLocale } from "./locale-provider";

export function AppShell({
  children,
  username,
  runtime
}: {
  children: React.ReactNode;
  username: string;
  runtime: { storageMode: string; queueMode: string };
}) {
  const { messages } = useLocale();

  const navigation = [
    { href: "/", label: messages.nav.dashboard, icon: Gauge },
    { href: "/approvals", label: messages.nav.approvals, icon: CheckCheck },
    { href: "/settings", label: messages.nav.settings, icon: Settings2 }
  ];

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(86,166,255,0.16),_transparent_36%),linear-gradient(180deg,_#07131d,_#081017_45%,_#050b10)] text-slate-100">
      <div className="mx-auto flex min-h-screen max-w-[1600px] gap-10 px-6 py-8 lg:px-10">
        <aside className="hidden w-64 shrink-0 flex-col justify-between border-r border-white/10 pr-8 lg:flex">
          <div className="space-y-8">
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-4">
                <div className="inline-flex items-center gap-3 text-[0.72rem] uppercase tracking-[0.24em] text-cyan-200/70">
                  <Bot className="h-4 w-4" />
                  {messages.common.brand}
                </div>
                <LanguageSwitcher />
              </div>
              <div className="space-y-1">
                <h1 className="text-3xl font-semibold tracking-[-0.04em] text-white">{messages.appShell.title}</h1>
                <p className="max-w-[18rem] text-sm leading-6 text-slate-300">{messages.appShell.description}</p>
              </div>
            </div>

            <nav className="space-y-2">
              {navigation.map((item) => {
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "group flex items-center justify-between rounded-2xl border border-transparent px-4 py-3 text-sm text-slate-300 transition hover:border-white/10 hover:bg-white/5 hover:text-white"
                    )}
                  >
                    <span className="flex items-center gap-3">
                      <Icon className="h-4 w-4 text-cyan-200/80" />
                      {item.label}
                    </span>
                  </Link>
                );
              })}
            </nav>

            <div className="space-y-4 rounded-[1.75rem] border border-white/10 bg-white/[0.035] px-5 py-5">
              <div className="inline-flex items-center gap-2 text-[0.68rem] uppercase tracking-[0.18em] text-slate-400">
                <FolderGit2 className="h-3.5 w-3.5" />
                {messages.common.runtime}
              </div>
              <div className="space-y-2 text-sm text-slate-200">
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">{messages.common.storage}</span>
                  <span>{runtime.storageMode}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">{messages.common.queue}</span>
                  <span>{runtime.queueMode}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-4 pb-4">
            <div className="text-xs uppercase tracking-[0.18em] text-slate-500">{messages.common.signedInAs}</div>
            <div className="text-sm text-slate-200">{username}</div>
            <form action="/api/auth/logout" method="post">
              <button className="inline-flex items-center gap-2 rounded-full border border-white/10 px-4 py-2 text-sm text-slate-200 transition hover:border-white/20 hover:bg-white/5">
                <LogOut className="h-4 w-4" />
                {messages.common.signOut}
              </button>
            </form>
          </div>
        </aside>

        <main className="min-w-0 flex-1 space-y-6">
          <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.04] px-4 py-4 lg:hidden">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="inline-flex items-center gap-2 text-[0.72rem] uppercase tracking-[0.22em] text-cyan-200/70">
                  <Bot className="h-4 w-4" />
                  {messages.common.brand}
                </div>
                <div className="text-sm text-slate-300">{messages.appShell.title}</div>
              </div>
              <LanguageSwitcher />
            </div>
            <nav className="mt-4 flex flex-wrap gap-2">
              {navigation.map((item) => (
                <Link key={item.href} href={item.href} className="rounded-full border border-white/10 px-3 py-2 text-sm text-slate-200 transition hover:bg-white/5">
                  {item.label}
                </Link>
              ))}
              <form action="/api/auth/logout" method="post">
                <button className="rounded-full border border-white/10 px-3 py-2 text-sm text-slate-200 transition hover:bg-white/5">
                  {messages.common.signOut}
                </button>
              </form>
            </nav>
          </div>

          {children}
        </main>
      </div>
    </div>
  );
}
