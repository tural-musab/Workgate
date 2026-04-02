import { NextResponse } from "next/server";

import { getSession } from "@/lib/auth";
import { listWorkspaceMembersView, saveWorkspaceMember } from "@/lib/app-service";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const members = await listWorkspaceMembersView(session);
    return NextResponse.json({ members });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load workspace members." }, { status: 400 });
  }
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const payload = await request.json();
    const member = await saveWorkspaceMember(payload, session);
    return NextResponse.json(member);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to save workspace member." }, { status: 400 });
  }
}
