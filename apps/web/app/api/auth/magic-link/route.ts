import { NextResponse } from "next/server";

import { createStorageAdapter } from "@workgate/db";

import { getAppEnv } from "@/lib/env";
import { createSupabaseServerClient, isSupabaseConfigured } from "@/lib/supabase";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { email?: string } | null;
  const email = body?.email?.trim().toLowerCase();
  if (!email) {
    return NextResponse.json({ error: "Email is required." }, { status: 400 });
  }
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase auth is not configured." }, { status: 400 });
  }

  const storage = createStorageAdapter(getAppEnv().databaseUrl);
  const context = await storage.getWorkspaceContextByEmail(email);
  if (!context) {
    return NextResponse.json({ error: "This email has not been invited to the workspace." }, { status: 403 });
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: `${getAppEnv().siteUrl}/auth/callback`
    }
  });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
