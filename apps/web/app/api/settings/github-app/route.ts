import { NextResponse } from "next/server";

import { getSession } from "@/lib/auth";
import { getGitHubSettingsView, saveGitHubSettingsFromPayload } from "@/lib/app-service";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const settings = await getGitHubSettingsView(session);
  return NextResponse.json(settings);
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const payload = await request.json();
    const settings = await saveGitHubSettingsFromPayload(payload, session);
    return NextResponse.json(settings);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to save GitHub App settings." }, { status: 400 });
  }
}
