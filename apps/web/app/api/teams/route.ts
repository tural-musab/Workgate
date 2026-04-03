import { NextResponse } from "next/server";

import { getSession } from "@/lib/auth";
import { listTeamSettingsView, saveTeam, saveTeamWorkflowAccess } from "@/lib/app-service";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const teams = await listTeamSettingsView(session);
    return NextResponse.json({ teams });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load teams." }, { status: 400 });
  }
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const payload = await request.json();
    const team = await saveTeam(payload, session);
    return NextResponse.json(team);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to save team." }, { status: 400 });
  }
}

export async function PATCH(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const payload = await request.json();
    const access = await saveTeamWorkflowAccess(payload, session);
    return NextResponse.json(access);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to update team workflow access." }, { status: 400 });
  }
}
