import path from "node:path";
import { fileURLToPath } from "node:url";

const CURRENT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT_ENV_PATH = path.resolve(CURRENT_DIR, "../../../.env");
let envLoaded = false;

function ensureRootEnvLoaded() {
  if (envLoaded) {
    return;
  }

  envLoaded = true;

  try {
    process.loadEnvFile(ROOT_ENV_PATH);
  } catch {
    // The root .env file is optional in CI and hosted environments.
  }
}

export function getAppEnv() {
  ensureRootEnvLoaded();
  return {
    authMode: process.env.WORKGATE_AUTH_MODE === "supabase" ? "supabase" : "seed_admin",
    adminUsername: process.env.ADMIN_USERNAME ?? "operator",
    adminPassword: process.env.ADMIN_PASSWORD ?? "change-me",
    authSecret: process.env.AUTH_SECRET ?? "replace-with-a-long-random-string",
    databaseUrl: process.env.DATABASE_URL,
    queueDriver: process.env.WORKGATE_QUEUE_DRIVER ?? "inline",
    mockMode: process.env.WORKGATE_MOCK_MODE !== "false",
    executionBackend: process.env.WORKGATE_EXECUTION_BACKEND === "remote_sandbox" ? "remote_sandbox" : "local",
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? null,
    supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY ?? null,
    supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? null,
    supabaseStorageBucket: process.env.WORKGATE_SUPABASE_STORAGE_BUCKET ?? "workgate-knowledge",
    siteUrl: process.env.NEXT_PUBLIC_SITE_URL ?? process.env.SITE_URL ?? "http://localhost:3000"
  };
}
