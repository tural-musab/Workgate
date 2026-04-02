import { NextResponse } from "next/server";

import { getSession } from "@/lib/auth";
import { getUsageView } from "@/lib/app-service";

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const filters = {
    teamId: url.searchParams.get("teamId"),
    workflowTemplate: url.searchParams.get("workflowTemplate"),
    provider: url.searchParams.get("provider"),
    model: url.searchParams.get("model"),
    windowDays: Number(url.searchParams.get("windowDays") ?? 30)
  };

  try {
    const usage = await getUsageView(filters, session);
    return NextResponse.json(usage);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load usage analytics." }, { status: 400 });
  }
}
