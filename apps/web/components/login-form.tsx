"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { resolveApiMessage } from "@/lib/i18n";

import { useLocale } from "./locale-provider";

export function LoginForm({ authMode }: { authMode: "seed_admin" | "supabase" }) {
  const router = useRouter();
  const { messages } = useLocale();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const formData = new FormData(event.currentTarget);
    const username = String(formData.get("username") ?? "");
    const password = String(formData.get("password") ?? "");
    const email = String(formData.get("email") ?? "");

    startTransition(async () => {
      const response = await fetch(authMode === "supabase" ? "/api/auth/magic-link" : "/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(authMode === "supabase" ? { email } : { username, password })
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(resolveApiMessage(body?.error, messages, "invalidCredentials"));
        return;
      }

      if (authMode === "supabase") {
        setError(null);
        return;
      }

      router.push("/");
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5 rounded-[2rem] border border-white/10 bg-white/[0.05] px-6 py-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-[-0.04em] text-white">{messages.loginForm.title}</h1>
        <p className="text-sm leading-6 text-slate-300">{messages.loginForm.description}</p>
      </div>
      {authMode === "supabase" ? (
        <label className="space-y-2">
          <span className="text-sm text-slate-300">Invited email</span>
          <input
            name="email"
            type="email"
            required
            className="w-full rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-sm text-white outline-none focus:border-cyan-400/40"
          />
        </label>
      ) : (
        <>
          <label className="space-y-2">
            <span className="text-sm text-slate-300">{messages.loginForm.username}</span>
            <input name="username" required className="w-full rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-sm text-white outline-none focus:border-cyan-400/40" />
          </label>
          <label className="space-y-2">
            <span className="text-sm text-slate-300">{messages.loginForm.password}</span>
            <input
              name="password"
              type="password"
              required
              className="w-full rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-sm text-white outline-none focus:border-cyan-400/40"
            />
          </label>
        </>
      )}
      <div className="flex items-center justify-between gap-4">
        <span className="text-sm text-rose-300">{error ?? (authMode === "supabase" ? "Invite-only magic link sign-in." : "")}</span>
        <button className="rounded-full bg-cyan-300 px-5 py-3 text-sm font-medium text-slate-950 transition hover:bg-cyan-200 disabled:opacity-60">
          {isPending ? messages.loginForm.pending : authMode === "supabase" ? "Send magic link" : messages.loginForm.submit}
        </button>
      </div>
    </form>
  );
}
