import { NextResponse } from "next/server";

import { getSession } from "@/lib/auth";
import { ingestKnowledgeUpload } from "@/lib/knowledge-ingestion";
import { listKnowledgeSourcesView, saveKnowledgeSource } from "@/lib/app-service";

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const teamId = url.searchParams.get("teamId");
  try {
    const sources = await listKnowledgeSourcesView(session, teamId);
    return NextResponse.json({ sources });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load knowledge sources." }, { status: 400 });
  }
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const contentType = request.headers.get("content-type") ?? "";
    let payload: unknown;

    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      const teamId = String(formData.get("teamId") ?? "");
      const name = String(formData.get("name") ?? "");
      const descriptionValue = formData.get("description");
      const file = formData.get("file");

      if (!(file instanceof File)) {
        throw new Error("Knowledge pack upload is missing a file.");
      }

      payload = await ingestKnowledgeUpload({
        file,
        teamId,
        name,
        description: typeof descriptionValue === "string" && descriptionValue.trim() ? descriptionValue : null
      });
    } else {
      payload = await request.json();
    }

    const source = await saveKnowledgeSource(payload, session);
    return NextResponse.json(source);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to save knowledge source." }, { status: 400 });
  }
}
