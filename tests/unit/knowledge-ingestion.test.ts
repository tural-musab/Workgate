import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { utils as xlsxUtils, write as writeWorkbook } from "xlsx";

import { extractKnowledgeUpload, getKnowledgeSourceTypeFromFilename } from "@/lib/knowledge-ingestion";

function createPdfBuffer(text: string) {
  const stream = `BT\n/F1 18 Tf\n72 720 Td\n(${text.replace(/[()\\]/g, "\\$&")}) Tj\nET`;
  const objects = [
    "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj",
    "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj",
    "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj",
    `4 0 obj\n<< /Length ${stream.length} >>\nstream\n${stream}\nendstream\nendobj`,
    "5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj"
  ];

  let body = "%PDF-1.4\n";
  const offsets = [0];
  for (const object of objects) {
    offsets.push(Buffer.byteLength(body, "utf8"));
    body += `${object}\n`;
  }
  const xrefOffset = Buffer.byteLength(body, "utf8");
  body += `xref\n0 ${objects.length + 1}\n`;
  body += "0000000000 65535 f \n";
  for (const offset of offsets.slice(1)) {
    body += `${String(offset).padStart(10, "0")} 00000 n \n`;
  }
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return Buffer.from(body, "utf8");
}

async function createDocxBuffer(text: string) {
  const zip = new JSZip();
  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8"?>
    <Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
      <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
      <Default Extension="xml" ContentType="application/xml"/>
      <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
    </Types>`
  );
  zip.folder("_rels")?.file(
    ".rels",
    `<?xml version="1.0" encoding="UTF-8"?>
    <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
      <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
    </Relationships>`
  );
  zip.folder("word")?.file(
    "document.xml",
    `<?xml version="1.0" encoding="UTF-8"?>
    <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
      <w:body>
        <w:p><w:r><w:t>${text}</w:t></w:r></w:p>
      </w:body>
    </w:document>`
  );
  return zip.generateAsync({ type: "nodebuffer" });
}

async function createPptxBuffer(text: string) {
  const zip = new JSZip();
  zip.file(
    "ppt/slides/slide1.xml",
    `<?xml version="1.0" encoding="UTF-8"?>
    <p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
      <p:cSld>
        <p:spTree>
          <p:sp>
            <p:txBody>
              <a:p><a:r><a:t>${text}</a:t></a:r></a:p>
            </p:txBody>
          </p:sp>
        </p:spTree>
      </p:cSld>
    </p:sld>`
  );
  return zip.generateAsync({ type: "nodebuffer" });
}

function createXlsxBuffer(text: string) {
  const workbook = xlsxUtils.book_new();
  const worksheet = xlsxUtils.aoa_to_sheet([["Question", "Answer"], ["Hosting", text]]);
  xlsxUtils.book_append_sheet(workbook, worksheet, "RFP");
  return writeWorkbook(workbook, { type: "buffer", bookType: "xlsx" });
}

describe("knowledge ingestion", () => {
  it("maps supported filenames to source types", () => {
    expect(getKnowledgeSourceTypeFromFilename("brief.docx")).toBe("docx");
    expect(getKnowledgeSourceTypeFromFilename("brief.pptx")).toBe("pptx");
    expect(getKnowledgeSourceTypeFromFilename("brief.xlsx")).toBe("xlsx");
    expect(getKnowledgeSourceTypeFromFilename("brief.pdf")).toBe("pdf");
  });

  it("extracts markdown and json text directly", async () => {
    const markdown = await extractKnowledgeUpload(new File(["# Win themes\n\n- Fast onboarding"], "brief.md", { type: "text/markdown" }));
    const json = await extractKnowledgeUpload(new File(['{"hosting":"SOC 2 ready"}'], "answers.json", { type: "application/json" }));

    expect(markdown.sourceType).toBe("markdown");
    expect(markdown.content).toContain("Win themes");
    expect(json.sourceType).toBe("json");
    expect(json.content).toContain("SOC 2 ready");
  });

  it("extracts text from pdf, docx, pptx, and xlsx uploads", async () => {
    const [pdf, docx, pptx, xlsx] = await Promise.all([
      extractKnowledgeUpload(new File([createPdfBuffer("Proposal ready")], "proposal.pdf", { type: "application/pdf" })),
      createDocxBuffer("Approved differentiators").then((buffer) =>
        extractKnowledgeUpload(
          new File([buffer], "differentiators.docx", {
            type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          })
        )
      ),
      createPptxBuffer("Pricing guardrail").then((buffer) =>
        extractKnowledgeUpload(
          new File([buffer], "pricing.pptx", {
            type: "application/vnd.openxmlformats-officedocument.presentationml.presentation"
          })
        )
      ),
      extractKnowledgeUpload(
        new File([createXlsxBuffer("Premium support included")], "matrix.xlsx", {
          type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        })
      )
    ]);

    expect(pdf.content).toContain("Proposal ready");
    expect(docx.content).toContain("Approved differentiators");
    expect(pptx.content).toContain("Pricing guardrail");
    expect(xlsx.content).toContain("Premium support included");
  });
});
