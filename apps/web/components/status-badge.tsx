"use client";

import type { RunStatus } from "@aiteams/shared";

import { cn } from "@/lib/cn";
import { getStatusLabel } from "@/lib/i18n";
import { statusTone } from "@/lib/format";

import { useLocale } from "./locale-provider";

export function StatusBadge({ status }: { status: RunStatus }) {
  const { messages } = useLocale();

  return (
    <span className={cn("inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium uppercase tracking-[0.12em]", statusTone(status))}>
      {getStatusLabel(status, messages)}
    </span>
  );
}
