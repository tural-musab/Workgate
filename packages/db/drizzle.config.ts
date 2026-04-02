import { fileURLToPath } from "node:url";
import process from "node:process";

import { defineConfig } from "drizzle-kit";

const ROOT_ENV_PATH = fileURLToPath(new URL("../../.env", import.meta.url));

try {
  process.loadEnvFile(ROOT_ENV_PATH);
} catch {
  // The repo root .env file is optional when DATABASE_URL comes from the shell.
}

export default defineConfig({
  schema: "./src/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/workgate"
  }
});
