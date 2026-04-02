/* global console, fetch */

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");

function loadEnvFile() {
  const candidatePaths = [path.join(repoRoot, ".env"), path.join(repoRoot, ".env.local")];

  for (const candidate of candidatePaths) {
    if (!fs.existsSync(candidate)) continue;
    for (const line of fs.readFileSync(candidate, "utf8").split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const match = trimmed.match(/^([A-Z0-9_]+)=(.*)$/);
      if (!match) continue;
      const [, key, value] = match;
      if (!(key in process.env)) {
        process.env[key] = value;
      }
    }
  }
}

function maskSecret(value) {
  if (!value) return "(missing)";
  if (value.length <= 8) return "*".repeat(value.length);
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

async function main() {
  loadEnvFile();

  const apiKey = process.env.ANTHROPIC_API_KEY;
  const model = process.argv[2] || process.env.ANTHROPIC_TEST_MODEL || "claude-sonnet-4-6";
  const prompt = process.argv[3] || "Reply with exactly: ok";

  console.log(`Anthropic key: ${maskSecret(apiKey)}`);
  console.log(`Model: ${model}`);
  console.log(`Prompt: ${prompt}`);

  if (!apiKey) {
    console.error("ANTHROPIC_API_KEY is missing.");
    process.exitCode = 1;
    return;
  }

  const startedAt = Date.now();
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json"
    },
    body: JSON.stringify({
      model,
      max_tokens: 32,
      messages: [{ role: "user", content: prompt }]
    })
  });

  const elapsedMs = Date.now() - startedAt;
  const raw = await response.text();

  console.log(`HTTP status: ${response.status}`);
  console.log(`Elapsed: ${elapsedMs}ms`);

  try {
    const parsed = JSON.parse(raw);
    console.log(JSON.stringify(parsed, null, 2));
  } catch {
    console.log(raw);
  }

  if (!response.ok) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exit(1);
});
