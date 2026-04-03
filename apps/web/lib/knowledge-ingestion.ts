import { randomUUID } from "node:crypto";
import path from "node:path";

import JSZip from "jszip";
import mammoth from "mammoth";
import { PDFParse } from "pdf-parse";
import { utils as xlsxUtils, read as readWorkbook } from "xlsx";

import type { KnowledgeSourceInput, KnowledgeSourceType } from "@workgate/shared";

import { getAppEnv } from "./env";
import { createSupabaseAdminClient, isSupabaseStorageConfigured } from "./supabase";

const MAX_FILE_BYTES = 12 * 1024 * 1024;

const extensionMap: Record<string, KnowledgeSourceType> = {
  md: "markdown",
  txt: "text",
  json: "json",
  pdf: "pdf",
  docx: "docx",
  pptx: "pptx",
  xlsx: "xlsx"
};

function getExtension(filename: string) {
  return path.extname(filename).replace(/^\./, "").toLowerCase();
}

function sanitizeFilename(filename: string) {
  return filename.replace(/[^a-zA-Z0-9._-]+/g, "-");
}

function decodeXmlEntities(input: string) {
  return input
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function stripXmlTags(input: string) {
  return decodeXmlEntities(input.replace(/<[^>]+>/g, " "));
}

function normalizeText(input: string) {
  return input
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function ensureBucket(bucket: string) {
  const client = createSupabaseAdminClient();
  const { data, error } = await client.storage.getBucket(bucket);
  if (!error && data) {
    return client;
  }

  const { error: createError } = await client.storage.createBucket(bucket, {
    public: false
  });
  if (createError && !createError.message.toLowerCase().includes("already exists")) {
    throw createError;
  }

  return client;
}

async function uploadOriginalFile(file: File, teamId: string) {
  if (!isSupabaseStorageConfigured()) {
    throw new Error("File uploads require Supabase storage configuration.");
  }

  const env = getAppEnv();
  const bucket = env.supabaseStorageBucket;
  const client = await ensureBucket(bucket);
  const timestamp = Date.now();
  const storagePath = `${teamId}/${timestamp}-${randomUUID()}-${sanitizeFilename(file.name)}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  const { error } = await client.storage.from(bucket).upload(storagePath, buffer, {
    cacheControl: "3600",
    ...(file.type ? { contentType: file.type } : {}),
    upsert: false
  });

  if (error) {
    throw error;
  }

  return storagePath;
}

async function extractPdf(buffer: Buffer) {
  const parser = new PDFParse({ data: buffer });
  const result = await parser.getText();
  return normalizeText(result.text);
}

async function extractDocx(buffer: Buffer) {
  const result = await mammoth.extractRawText({ buffer });
  return normalizeText(result.value);
}

async function extractPptx(buffer: Buffer) {
  const zip = await JSZip.loadAsync(buffer);
  const slideNames = Object.keys(zip.files)
    .filter((name) => name.startsWith("ppt/slides/slide") && name.endsWith(".xml"))
    .sort((left, right) => left.localeCompare(right, undefined, { numeric: true }));

  const slides = await Promise.all(
    slideNames.map(async (name, index) => {
      const xml = await zip.files[name]?.async("text");
      const text = normalizeText(stripXmlTags(xml ?? ""));
      if (!text) return "";
      return `# Slide ${index + 1}\n\n${text}`;
    })
  );

  return normalizeText(slides.filter(Boolean).join("\n\n"));
}

async function extractXlsx(buffer: Buffer) {
  const workbook = readWorkbook(buffer, { type: "buffer" });
  const sections = workbook.SheetNames.map((sheetName) => {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) return "";
    const rows = xlsxUtils.sheet_to_json<Array<string | number | boolean | null>>(sheet, {
      header: 1,
      defval: ""
    });
    const body = rows
      .map((row) =>
        row
          .map((cell) => String(cell ?? "").trim())
          .filter(Boolean)
          .join(" | ")
      )
      .filter(Boolean)
      .join("\n");
    return body ? `# Sheet: ${sheetName}\n\n${body}` : "";
  });

  return normalizeText(sections.filter(Boolean).join("\n\n"));
}

async function extractContent(sourceType: KnowledgeSourceType, buffer: Buffer) {
  switch (sourceType) {
    case "markdown":
    case "text":
    case "json":
      return normalizeText(buffer.toString("utf8"));
    case "pdf":
      return extractPdf(buffer);
    case "docx":
      return extractDocx(buffer);
    case "pptx":
      return extractPptx(buffer);
    case "xlsx":
      return extractXlsx(buffer);
    default:
      return "";
  }
}

export function getKnowledgeSourceTypeFromFilename(filename: string): KnowledgeSourceType | null {
  const extension = getExtension(filename);
  return extensionMap[extension] ?? null;
}

export function getAcceptedKnowledgeUploadExtensions() {
  return Object.keys(extensionMap);
}

export async function extractKnowledgeUpload(file: File) {
  const sourceType = getKnowledgeSourceTypeFromFilename(file.name);
  if (!sourceType) {
    throw new Error("Unsupported knowledge pack file type.");
  }

  if (file.size === 0) {
    throw new Error("Uploaded knowledge pack is empty.");
  }

  if (file.size > MAX_FILE_BYTES) {
    throw new Error("Uploaded knowledge pack exceeds the 12 MB limit.");
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const content = await extractContent(sourceType, buffer);
  return {
    sourceType,
    content: content || null,
    mimeType: file.type || null,
    originalFilename: file.name
  };
}

export async function ingestKnowledgeUpload(input: {
  file: File;
  teamId: string;
  name: string;
  description?: string | null;
}): Promise<KnowledgeSourceInput> {
  const sourceType = getKnowledgeSourceTypeFromFilename(input.file.name);
  if (!sourceType) {
    throw new Error("Unsupported knowledge pack file type.");
  }

  if (input.file.size === 0) {
    throw new Error("Uploaded knowledge pack is empty.");
  }

  if (input.file.size > MAX_FILE_BYTES) {
    throw new Error("Uploaded knowledge pack exceeds the 12 MB limit.");
  }

  const storagePath = await uploadOriginalFile(input.file, input.teamId);

  try {
    const extracted = await extractKnowledgeUpload(input.file);
    const content = extracted.content;
    if (!content) {
      return {
        teamId: input.teamId,
        name: input.name,
        sourceType,
        description: input.description ?? null,
        content: null,
        storagePath,
        originalFilename: input.file.name,
        mimeType: input.file.type || null,
        ingestionStatus: "failed",
        ingestionNotes: "No readable text could be extracted from the uploaded document."
      };
    }

    return {
      teamId: input.teamId,
      name: input.name,
      sourceType,
      description: input.description ?? null,
      content,
      storagePath,
      originalFilename: extracted.originalFilename,
      mimeType: extracted.mimeType,
      ingestionStatus: "ready",
      ingestionNotes: `Imported from ${input.file.name}`
    };
  } catch (error) {
      return {
        teamId: input.teamId,
        name: input.name,
        sourceType,
        description: input.description ?? null,
        content: null,
        storagePath,
        originalFilename: input.file.name,
        mimeType: input.file.type || null,
        ingestionStatus: "failed",
        ingestionNotes: error instanceof Error ? error.message : "Document extraction failed."
      };
  }
}
