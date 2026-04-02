import { NextResponse } from "next/server";

import { getSession } from "@/lib/auth";
import { retryRun } from "@/lib/app-service";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  try {
    const payload = await request.json().catch(() => ({}));
    const detail = await retryRun(id, payload, session);
    return NextResponse.json({ runId: detail.run.id, taskId: detail.task.id });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Action failed." }, { status: 400 });
  }
}
