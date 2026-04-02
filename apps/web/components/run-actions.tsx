"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { resolveApiMessage } from "@/lib/i18n";

import { useLocale } from "./locale-provider";

type RunActionsProps = {
  runId: string;
  allowCancel?: boolean;
  allowDelete?: boolean;
  allowRetry?: boolean;
  allowRetryFailedOnly?: boolean;
  redirectOnDeleteTo?: string;
  variant?: "detail" | "inline";
};

export function RunActions({
  runId,
  allowCancel = false,
  allowDelete = false,
  allowRetry = false,
  allowRetryFailedOnly = false,
  redirectOnDeleteTo,
  variant = "inline"
}: RunActionsProps) {
  const router = useRouter();
  const { messages } = useLocale();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [pendingAction, setPendingAction] = useState<"cancel" | "delete" | "retry" | null>(null);
  const [showRetryOptions, setShowRetryOptions] = useState(false);

  if (!allowCancel && !allowDelete && !allowRetry) {
    return null;
  }

  function refreshOrRedirect(path?: string) {
    if (path) {
      router.push(path);
    }
    router.refresh();
  }

  function runMutation(input: { path: string; method: "POST" | "DELETE"; body?: Record<string, unknown>; redirectOnSuccess?: string }) {
    startTransition(async () => {
      try {
        setError(null);

        const requestInit: RequestInit = {
          method: input.method,
          ...(input.body ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(input.body) } : {})
        };

        const response = await fetch(input.path, {
          ...requestInit
        });

        if (!response.ok) {
          const body = (await response.json().catch(() => null)) as { error?: string } | null;
          setError(resolveApiMessage(body?.error, messages, "actionFailed"));
          return;
        }

        const body = (await response.json().catch(() => ({}))) as { runId?: string };
        refreshOrRedirect(body.runId ? `/runs/${body.runId}` : input.redirectOnSuccess);
      } catch {
        setError(messages.apiMessages.actionFailed);
      } finally {
        setPendingAction(null);
      }
    });
  }

  function handleCancel() {
    if (!window.confirm(messages.runActions.confirmCancel)) return;
    setPendingAction("cancel");
    runMutation({
      path: `/api/runs/${runId}/cancel`,
      method: "POST"
    });
  }

  function handleDelete() {
    if (!window.confirm(messages.runActions.confirmDelete)) return;
    setPendingAction("delete");
    runMutation({
      path: `/api/runs/${runId}`,
      method: "DELETE",
      ...(redirectOnDeleteTo ? { redirectOnSuccess: redirectOnDeleteTo } : {})
    });
  }

  function handleRetry(mode: "full" | "failed_only") {
    setPendingAction("retry");
    runMutation({
      path: `/api/runs/${runId}/retry`,
      method: "POST",
      body: { mode }
    });
  }

  const buttonClass =
    variant === "detail"
      ? "rounded-full border border-white/12 px-4 py-2 text-sm text-slate-100 transition hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-60"
      : "rounded-full border border-white/12 px-3 py-2 text-xs uppercase tracking-[0.16em] text-slate-200 transition hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-60";

  return (
    <div className={variant === "detail" ? "space-y-4 rounded-[1.75rem] border border-white/10 bg-white/[0.04] px-5 py-5" : "space-y-3"}>
      {variant === "detail" ? (
        <div className="space-y-1">
          <div className="text-[0.72rem] uppercase tracking-[0.2em] text-cyan-200/70">{messages.runActions.eyebrow}</div>
          <h3 className="text-lg font-semibold text-white">{messages.runActions.title}</h3>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {allowRetry ? (
          <button disabled={isPending} onClick={() => setShowRetryOptions((current) => !current)} className={buttonClass}>
            {isPending && pendingAction === "retry" ? messages.runActions.retrying : messages.common.retry}
          </button>
        ) : null}
        {allowCancel ? (
          <button disabled={isPending} onClick={handleCancel} className={buttonClass}>
            {isPending && pendingAction === "cancel" ? messages.runActions.cancelling : messages.runActions.cancel}
          </button>
        ) : null}
        {allowDelete ? (
          <button disabled={isPending} onClick={handleDelete} className={buttonClass}>
            {isPending && pendingAction === "delete" ? messages.runActions.deleting : messages.runActions.delete}
          </button>
        ) : null}
      </div>

      {showRetryOptions ? (
        <div className="space-y-3 rounded-[1.25rem] border border-white/10 bg-slate-950/40 px-4 py-4">
          <p className="text-sm leading-6 text-slate-300">{messages.runActions.retryHint}</p>
          <div className="flex flex-wrap gap-2">
            <button disabled={isPending} onClick={() => handleRetry("full")} className={buttonClass}>
              {messages.runActions.retryFull}
            </button>
            {allowRetryFailedOnly ? (
              <button disabled={isPending} onClick={() => handleRetry("failed_only")} className={buttonClass}>
                {messages.runActions.retryFailedOnly}
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      {error ? <div className="text-sm text-rose-300">{error}</div> : null}
    </div>
  );
}
