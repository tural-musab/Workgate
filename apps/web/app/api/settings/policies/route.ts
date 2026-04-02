import { NextResponse } from "next/server";

import { getSession } from "@/lib/auth";
import { getApprovalPoliciesView, saveApprovalPolicy } from "@/lib/app-service";

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const teamId = url.searchParams.get("teamId");
  try {
    const policies = await getApprovalPoliciesView(session, teamId);
    return NextResponse.json({ policies });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load approval policies." }, { status: 400 });
  }
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const payload = await request.json();
    const policy = await saveApprovalPolicy(payload, session);
    return NextResponse.json(policy);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to save approval policy." }, { status: 400 });
  }
}
