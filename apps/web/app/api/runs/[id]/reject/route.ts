import { NextResponse } from "next/server";

import { getSession } from "@/lib/auth";
import { rejectRun } from "@/lib/app-service";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  try {
    const body = (await request.json().catch(() => ({}))) as { notes?: string };
    const result = await rejectRun(id, session.username, body.notes ?? null);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Reject failed." }, { status: 400 });
  }
}

