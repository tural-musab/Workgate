import { NextResponse } from "next/server";

import { getSession } from "@/lib/auth";
import { getRunDetail } from "@/lib/app-service";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const detail = await getRunDetail(id);
  if (!detail) {
    return NextResponse.json({ error: "Run not found" }, { status: 404 });
  }

  return NextResponse.json(detail);
}

