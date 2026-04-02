"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { resolveApiMessage } from "@/lib/i18n";

import { useLocale } from "./locale-provider";

export function ApprovalActions({ runId, approveLabel }: { runId: string; approveLabel?: string }) {
  const router = useRouter();
  const { messages } = useLocale();
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit(action: "approve" | "reject") {
    startTransition(async () => {
      setError(null);
      const response = await fetch(`/api/runs/${runId}/${action}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ notes })
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(resolveApiMessage(body?.error, messages, "actionFailed"));
        return;
      }

      router.refresh();
    });
  }

  return (
    <div className="space-y-4 rounded-[1.75rem] border border-white/10 bg-white/[0.04] px-5 py-5">
      <div className="space-y-1">
        <div className="text-[0.72rem] uppercase tracking-[0.2em] text-cyan-200/70">{messages.approvalActions.eyebrow}</div>
        <h3 className="text-lg font-semibold text-white">{messages.approvalActions.title}</h3>
      </div>
      <textarea
        value={notes}
        onChange={(event) => setNotes(event.target.value)}
        className="min-h-28 w-full rounded-[1.25rem] border border-white/10 bg-slate-950/60 px-4 py-3 text-sm leading-6 text-white outline-none placeholder:text-slate-500 focus:border-cyan-400/40"
        placeholder={messages.approvalActions.placeholder}
      />
      {error ? <div className="text-sm text-rose-300">{error}</div> : null}
      <div className="flex flex-wrap gap-3">
        <button
          disabled={isPending}
          onClick={() => submit("approve")}
          className="rounded-full bg-cyan-300 px-5 py-3 text-sm font-medium text-slate-950 transition hover:bg-cyan-200 disabled:opacity-60"
        >
          {approveLabel ?? messages.approvalActions.approve}
        </button>
        <button
          disabled={isPending}
          onClick={() => submit("reject")}
          className="rounded-full border border-white/15 px-5 py-3 text-sm text-slate-100 transition hover:bg-white/5 disabled:opacity-60"
        >
          {messages.approvalActions.reject}
        </button>
      </div>
    </div>
  );
}
