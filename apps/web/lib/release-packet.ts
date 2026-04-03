import type { ReleasePacketView } from "@workgate/shared";

function escapeHtml(input: string) {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function paragraphize(input: string) {
  return escapeHtml(input)
    .split(/\n{2,}/)
    .map((chunk) => `<p>${chunk.replace(/\n/g, "<br />")}</p>`)
    .join("");
}

export function renderReleasePacketHtml(packet: ReleasePacketView) {
  const checklist = packet.checklistItems
    .map(
      (item) => `
        <li class="${item.completed ? "complete" : "pending"}">
          <span class="mark">${item.completed ? "Done" : "Pending"}</span>
          <span>${escapeHtml(item.label)}</span>
        </li>
      `
    )
    .join("");

  const sections = packet.sections
    .map(
      (section) => `
        <section class="packet-section">
          <div class="eyebrow">${escapeHtml(section.artifactType.replace(/_/g, " "))}</div>
          <h2>${escapeHtml(section.title)}</h2>
          <div class="body">${paragraphize(section.body)}</div>
        </section>
      `
    )
    .join("");

  return `<!DOCTYPE html>
  <html lang="en">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>${escapeHtml(packet.title)} - Release Packet</title>
      <style>
        :root {
          color-scheme: light;
          --ink: #102039;
          --muted: #5d6a80;
          --line: #d9e1ea;
          --panel: #f5f7fb;
          --accent: #9a5b14;
          --accent-bg: #fff2df;
        }
        * { box-sizing: border-box; }
        body {
          margin: 0;
          font-family: "Iowan Old Style", "Palatino Linotype", "Book Antiqua", Georgia, serif;
          color: var(--ink);
          background: white;
        }
        .shell {
          max-width: 920px;
          margin: 0 auto;
          padding: 48px 40px 80px;
        }
        .toolbar {
          display: flex;
          justify-content: flex-end;
          margin-bottom: 24px;
        }
        .toolbar button {
          border: 0;
          border-radius: 999px;
          padding: 12px 18px;
          background: #102039;
          color: white;
          font: inherit;
          cursor: pointer;
        }
        .hero {
          border: 1px solid var(--line);
          border-radius: 28px;
          padding: 28px 30px;
          background: linear-gradient(180deg, #fff8ef, white);
        }
        .hero .eyebrow,
        .packet-section .eyebrow {
          font-family: ui-monospace, "SFMono-Regular", monospace;
          text-transform: uppercase;
          letter-spacing: 0.18em;
          font-size: 11px;
          color: var(--muted);
        }
        h1 {
          margin: 16px 0 10px;
          font-size: 38px;
          line-height: 1.05;
        }
        .summary {
          color: var(--muted);
          font-size: 16px;
          line-height: 1.7;
        }
        .meta {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 14px;
          margin-top: 22px;
        }
        .meta-card {
          border-radius: 20px;
          background: rgba(255,255,255,0.9);
          border: 1px solid var(--line);
          padding: 14px 16px;
        }
        .meta-card .label {
          font: 11px ui-monospace, "SFMono-Regular", monospace;
          text-transform: uppercase;
          letter-spacing: 0.16em;
          color: var(--muted);
        }
        .meta-card .value {
          margin-top: 8px;
          font-size: 15px;
          line-height: 1.55;
        }
        .checklist {
          margin: 28px 0 0;
          padding: 0;
          list-style: none;
          display: grid;
          gap: 10px;
        }
        .checklist li {
          display: flex;
          gap: 12px;
          align-items: flex-start;
          padding: 12px 14px;
          border-radius: 18px;
          border: 1px solid var(--line);
          background: var(--panel);
        }
        .checklist .mark {
          min-width: 78px;
          font: 11px ui-monospace, "SFMono-Regular", monospace;
          text-transform: uppercase;
          letter-spacing: 0.14em;
          color: var(--accent);
        }
        .packet-section {
          margin-top: 28px;
          border-top: 1px solid var(--line);
          padding-top: 26px;
        }
        .packet-section h2 {
          margin: 10px 0 12px;
          font-size: 28px;
        }
        .body {
          font-size: 15px;
          line-height: 1.78;
        }
        .body p {
          margin: 0 0 16px;
        }
        @media print {
          .toolbar { display: none; }
          .shell { padding: 22px 20px 48px; }
          .hero { break-inside: avoid; }
          .packet-section { break-inside: avoid; }
        }
      </style>
    </head>
    <body>
      <main class="shell">
        <div class="toolbar">
          <button onclick="window.print()">Print / Save as PDF</button>
        </div>
        <section class="hero">
          <div class="eyebrow">Release packet</div>
          <h1>${escapeHtml(packet.title)}</h1>
          <div class="summary">${paragraphize(packet.packetSummary)}</div>
          <div class="meta">
            <div class="meta-card">
              <div class="label">Account / opportunity</div>
              <div class="value">${escapeHtml(packet.accountName)}</div>
            </div>
            <div class="meta-card">
              <div class="label">Knowledge pack</div>
              <div class="value">${escapeHtml(packet.knowledgeSourceSummary)}</div>
            </div>
          </div>
          ${
            packet.checklistItems.length > 0
              ? `<ul class="checklist">${checklist}</ul>`
              : ""
          }
        </section>
        ${sections}
      </main>
    </body>
  </html>`;
}
