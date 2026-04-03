import { NextResponse } from "next/server";

import { getSession } from "@/lib/auth";
import { getReleasePacket } from "@/lib/app-service";
import { renderReleasePacketHtml } from "@/lib/release-packet";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  try {
    const { id } = await params;
    const packet = await getReleasePacket(id, session);
    if (!packet) {
      return new NextResponse("Release packet not found.", { status: 404 });
    }

    return new NextResponse(renderReleasePacketHtml(packet), {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8"
      }
    });
  } catch (error) {
    return new NextResponse(error instanceof Error ? error.message : "Unable to render release packet.", {
      status: 400,
      headers: {
        "Content-Type": "text/plain; charset=utf-8"
      }
    });
  }
}
