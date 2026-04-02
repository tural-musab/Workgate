import { formatDistanceToNowStrict } from "date-fns";

import type { RunStatus } from "@aiteams/shared";

export function formatRelativeTime(value: string) {
  return formatDistanceToNowStrict(new Date(value), { addSuffix: true });
}

export function statusTone(status: RunStatus) {
  switch (status) {
    case "completed":
      return "bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/25";
    case "failed":
      return "bg-rose-500/15 text-rose-300 ring-1 ring-rose-500/25";
    case "pending_human":
      return "bg-amber-500/15 text-amber-200 ring-1 ring-amber-400/25";
    case "cancelled":
      return "bg-slate-500/15 text-slate-300 ring-1 ring-slate-400/20";
    default:
      return "bg-cyan-500/15 text-cyan-200 ring-1 ring-cyan-400/20";
  }
}

