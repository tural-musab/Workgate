import { createDecipheriv, createHash } from "node:crypto";

import { createQueueConsumer, createQueueProducer, createStorageAdapter } from "@workgate/db";
import { GitHubExecutionService } from "@workgate/github";
import { startWorker, stopWorker, type RuntimeServices } from "@workgate/runtime";

import { getWorkerEnv } from "./env";

function decryptSecret(payload: string, authSecret: string) {
  const [ivPart, authTagPart, encryptedPart] = payload.split(".");
  if (!ivPart || !authTagPart || !encryptedPart) {
    throw new Error("Invalid encrypted payload.");
  }
  const key = createHash("sha256").update(authSecret).digest();
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivPart, "base64"));
  decipher.setAuthTag(Buffer.from(authTagPart, "base64"));
  const decrypted = Buffer.concat([decipher.update(Buffer.from(encryptedPart, "base64")), decipher.final()]);
  return decrypted.toString("utf8");
}

async function main() {
  const env = getWorkerEnv();

  const runtime: RuntimeServices = {
    storage: createStorageAdapter(env.databaseUrl),
    producer: createQueueProducer({ databaseUrl: env.databaseUrl, driver: env.queueDriver }),
    consumer: createQueueConsumer({ databaseUrl: env.databaseUrl, driver: env.queueDriver }),
    github: new GitHubExecutionService(),
    resolveGitHubToken: (encrypted) => (encrypted ? decryptSecret(encrypted, env.authSecret) : null),
    workerStarted: false,
    activeRuns: new Set<string>()
  };

  await startWorker(runtime);
  process.stdout.write(`[workgate-worker] started with ${runtime.storage.mode}/${runtime.consumer.mode}\n`);

  const shutdown = async () => {
    await stopWorker(runtime);
    process.exit(0);
  };

  process.on("SIGINT", () => {
    void shutdown();
  });

  process.on("SIGTERM", () => {
    void shutdown();
  });
}

void main();
