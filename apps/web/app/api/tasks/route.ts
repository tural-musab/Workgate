import { NextResponse } from "next/server";

import { getSession } from "@/lib/auth";
import { createTask } from "@/lib/app-service";

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const payload = await request.json();
    const detail = await createTask(payload, session);
    return NextResponse.json({ runId: detail.run.id, taskId: detail.task.id });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to create task." }, { status: 400 });
  }
}
