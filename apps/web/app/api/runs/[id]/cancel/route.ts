import { NextResponse } from "next/server";

import { getSession } from "@/lib/auth";
import { cancelRun } from "@/lib/app-service";

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  await cancelRun(id);
  return NextResponse.json({ ok: true });
}

