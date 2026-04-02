import { NextResponse } from "next/server";

import { createSession } from "@/lib/auth";
import { getAppEnv } from "@/lib/env";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { username?: string; password?: string } | null;
  const env = getAppEnv();

  if (body?.username !== env.adminUsername || body.password !== env.adminPassword) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }

  await createSession(env.adminUsername);
  return NextResponse.json({ ok: true });
}

