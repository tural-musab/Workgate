import { PgBoss } from "pg-boss";

export interface QueueAdapter {
  readonly mode: "inline" | "pgboss";
  start(handler: (runId: string) => Promise<void>): Promise<void>;
  enqueueRun(runId: string): Promise<void>;
  stop(): Promise<void>;
}

class InlineQueueAdapter implements QueueAdapter {
  readonly mode = "inline" as const;
  private handler: ((runId: string) => Promise<void>) | null = null;

  async start(handler: (runId: string) => Promise<void>) {
    this.handler = handler;
  }

  async enqueueRun(runId: string) {
    if (!this.handler) {
      throw new Error("Inline queue has not been started.");
    }
    queueMicrotask(() => {
      void this.handler?.(runId);
    });
  }

  async stop() {}
}

class PgBossQueueAdapter implements QueueAdapter {
  readonly mode = "pgboss" as const;
  private readonly boss: PgBoss;
  private started = false;
  private startPromise: Promise<void> | null = null;

  constructor(databaseUrl: string) {
    this.boss = new PgBoss({ connectionString: databaseUrl });
  }

  async start(handler: (runId: string) => Promise<void>) {
    if (this.started) return;
    if (this.startPromise) {
      await this.startPromise;
      return;
    }

    this.startPromise = (async () => {
      await this.boss.start();
      await this.boss.createQueue("runs.execute");
      await this.boss.work("runs.execute", async (jobs: unknown) => {
        const items = Array.isArray(jobs) ? jobs : [jobs];
        for (const job of items) {
          const data = ((job as { data?: { runId?: string } })?.data ?? {}) as { runId?: string };
          if (data.runId) {
            await handler(data.runId);
          }
        }
      });
      this.started = true;
    })();

    try {
      await this.startPromise;
    } finally {
      this.startPromise = null;
    }
  }

  async enqueueRun(runId: string) {
    if (!this.started) {
      throw new Error("pg-boss queue has not been started.");
    }
    await this.boss.send("runs.execute", { runId });
  }

  async stop() {
    if (this.started) {
      await this.boss.stop();
      this.started = false;
    }
  }
}

export function createQueueAdapter(input: { databaseUrl: string | undefined; driver: string | undefined }): QueueAdapter {
  if (input.databaseUrl && input.driver === "pgboss") {
    return new PgBossQueueAdapter(input.databaseUrl);
  }
  return new InlineQueueAdapter();
}
