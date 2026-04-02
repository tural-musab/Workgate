import type { RunStatus } from "@aiteams/shared";

import { cn } from "@/lib/cn";
import { statusTone } from "@/lib/format";

export function StatusBadge({ status }: { status: RunStatus }) {
  return (
    <span className={cn("inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium uppercase tracking-[0.12em]", statusTone(status))}>
      {status.replace("_", " ")}
    </span>
  );
}

