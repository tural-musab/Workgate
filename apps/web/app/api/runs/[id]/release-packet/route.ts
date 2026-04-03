import { NextResponse } from "next/server";

import { getSession } from "@/lib/auth";
import { getReleasePacket } from "@/lib/app-service";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const packet = await getReleasePacket(id, session);
    if (!packet) {
      return NextResponse.json({ error: "Release packet not found." }, { status: 404 });
    }
    return NextResponse.json(packet);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load release packet." }, { status: 400 });
  }
}
