"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

export function LoginForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const formData = new FormData(event.currentTarget);
    const username = String(formData.get("username") ?? "");
    const password = String(formData.get("password") ?? "");

    startTransition(async () => {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ username, password })
      });

      if (!response.ok) {
        setError("Invalid credentials.");
        return;
      }

      router.push("/");
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5 rounded-[2rem] border border-white/10 bg-white/[0.05] px-6 py-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-[-0.04em] text-white">Operator sign-in</h1>
        <p className="text-sm leading-6 text-slate-300">Use the seeded admin credentials from your environment file.</p>
      </div>
      <label className="space-y-2">
        <span className="text-sm text-slate-300">Username</span>
        <input name="username" required className="w-full rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-sm text-white outline-none focus:border-cyan-400/40" />
      </label>
      <label className="space-y-2">
        <span className="text-sm text-slate-300">Password</span>
        <input
          name="password"
          type="password"
          required
          className="w-full rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-sm text-white outline-none focus:border-cyan-400/40"
        />
      </label>
      <div className="flex items-center justify-between gap-4">
        <span className="text-sm text-rose-300">{error}</span>
        <button className="rounded-full bg-cyan-300 px-5 py-3 text-sm font-medium text-slate-950 transition hover:bg-cyan-200 disabled:opacity-60">
          {isPending ? "Signing in..." : "Sign in"}
        </button>
      </div>
    </form>
  );
}

