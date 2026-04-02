import { existsSync } from "node:fs";
import path from "node:path";

function ensureRootEnvLoaded() {
  const candidatePaths = [
    path.resolve(process.cwd(), ".env"),
    path.resolve(process.cwd(), "../../.env")
  ];

  for (const candidate of candidatePaths) {
    if (existsSync(candidate)) {
      process.loadEnvFile(candidate);
      break;
    }
  }
}

export function getAppEnv() {
  ensureRootEnvLoaded();
  return {
    adminUsername: process.env.ADMIN_USERNAME ?? "operator",
    adminPassword: process.env.ADMIN_PASSWORD ?? "change-me",
    authSecret: process.env.AUTH_SECRET ?? "replace-with-a-long-random-string",
    databaseUrl: process.env.DATABASE_URL,
    queueDriver: process.env.AI_TEAMS_QUEUE_DRIVER ?? "inline",
    mockMode: process.env.AI_TEAMS_MOCK_MODE !== "false"
  };
}
