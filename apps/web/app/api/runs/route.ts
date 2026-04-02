import { NextResponse } from "next/server";

import { getSession } from "@/lib/auth";
import { listRuns } from "@/lib/app-service";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const runs = await listRuns();
  return NextResponse.json({ runs });
}

