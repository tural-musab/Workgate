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
    // The root .env file is optional in hosted environments.
  }
}

export function getWorkerEnv() {
  ensureRootEnvLoaded();
  return {
    authSecret: process.env.AUTH_SECRET ?? "replace-with-a-long-random-string",
    databaseUrl: process.env.DATABASE_URL,
    queueDriver: process.env.WORKGATE_QUEUE_DRIVER ?? "inline"
  };
}
