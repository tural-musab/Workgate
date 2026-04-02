import { NextResponse } from "next/server";

import { getSession, setActiveTeam } from "@/lib/auth";

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as { teamId?: string | null } | null;
  const teamId = body?.teamId ?? null;
  if (teamId && !session.teams.some((team) => team.id === teamId)) {
    return NextResponse.json({ error: "You do not have access to that team." }, { status: 403 });
  }

  await setActiveTeam(teamId);
  return NextResponse.json({ ok: true });
}
