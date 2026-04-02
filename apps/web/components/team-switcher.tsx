"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

import type { Session } from "@workgate/shared";

export function TeamSwitcher({ session }: { session: Session }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  if (session.teams.length <= 1) {
    return (
      <div className="space-y-1">
        <div className="text-[0.68rem] uppercase tracking-[0.16em] text-slate-500">Active team</div>
        <div className="text-sm text-slate-200">{session.activeTeam?.name ?? "No active team"}</div>
      </div>
    );
  }

  return (
    <label className="space-y-1">
      <span className="text-[0.68rem] uppercase tracking-[0.16em] text-slate-500">Active team</span>
      <select
        defaultValue={session.activeTeamId ?? ""}
        disabled={isPending}
        onChange={(event) => {
          startTransition(async () => {
            await fetch("/api/auth/team", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ teamId: event.target.value || null })
            });
            router.refresh();
          });
        }}
        className="rounded-2xl border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-white outline-none focus:border-cyan-400/40"
      >
        {session.teams.map((team) => (
          <option key={team.id} value={team.id}>
            {team.name}
          </option>
        ))}
      </select>
    </label>
  );
}
