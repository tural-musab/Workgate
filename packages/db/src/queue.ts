import { PgBoss } from "pg-boss";

type QueueMode = "inline" | "pgboss";
type RunHandler = (runId: string) => Promise<void>;

export interface QueueProducer {
  readonly mode: QueueMode;
  enqueueRun(runId: string): Promise<void>;
}

export interface QueueConsumer {
  readonly mode: QueueMode;
  start(handler: RunHandler): Promise<void>;
  stop(): Promise<void>;
}

export interface QueueAdapter extends QueueProducer, QueueConsumer {}

type InlineState = {
  queue: string[];
  handler: RunHandler | null;
  draining: boolean;
};

const sharedInlineState: InlineState = {
  queue: [],
  handler: null,
  draining: false
};

async function drainInlineQueue(state: InlineState) {
  if (state.draining) return;
  const initialHandler = state.handler;
  if (!initialHandler) return;
  state.draining = true;
  try {
    while (state.queue.length > 0) {
      const runId = state.queue.shift();
      const handler = state.handler;
      if (!handler) break;
      if (runId) {
        await handler(runId);
      }
    }
  } finally {
    state.draining = false;
  }
}

class InlineQueueProducer implements QueueProducer {
  readonly mode = "inline" as const;

  constructor(private readonly state: InlineState) {}

  async enqueueRun(runId: string) {
    this.state.queue.push(runId);
    queueMicrotask(() => {
      void drainInlineQueue(this.state);
    });
  }
}

class InlineQueueConsumer implements QueueConsumer {
  readonly mode = "inline" as const;

  constructor(private readonly state: InlineState) {}

  async start(handler: RunHandler) {
    this.state.handler = handler;
    queueMicrotask(() => {
      void drainInlineQueue(this.state);
    });
  }

  async stop() {
    this.state.handler = null;
  }
}

type PgBossSharedState = {
  boss: PgBoss;
  queueCreated: boolean;
  producerStarted: boolean;
  consumerStarted: boolean;
  producerStartPromise: Promise<void> | null;
  consumerStartPromise: Promise<void> | null;
};

function createPgBossState(databaseUrl: string): PgBossSharedState {
  return {
    boss: new PgBoss({ connectionString: databaseUrl }),
    queueCreated: false,
    producerStarted: false,
    consumerStarted: false,
    producerStartPromise: null,
    consumerStartPromise: null
  };
}

async function ensurePgBossStarted(state: PgBossSharedState, scope: "producer" | "consumer") {
  const alreadyStarted = scope === "producer" ? state.producerStarted : state.consumerStarted;
  if (alreadyStarted) return;

  const currentPromise = scope === "producer" ? state.producerStartPromise : state.consumerStartPromise;
  if (currentPromise) {
    await currentPromise;
    return;
  }

  const startPromise = (async () => {
    await state.boss.start();
    if (!state.queueCreated) {
      await state.boss.createQueue("runs.execute");
      state.queueCreated = true;
    }
    if (scope === "producer") {
      state.producerStarted = true;
    } else {
      state.consumerStarted = true;
    }
  })();

  if (scope === "producer") {
    state.producerStartPromise = startPromise;
  } else {
    state.consumerStartPromise = startPromise;
  }

  try {
    await startPromise;
  } finally {
    if (scope === "producer") {
      state.producerStartPromise = null;
    } else {
      state.consumerStartPromise = null;
    }
  }
}

class PgBossQueueProducer implements QueueProducer {
  readonly mode = "pgboss" as const;

  constructor(private readonly state: PgBossSharedState) {}

  async enqueueRun(runId: string) {
    await ensurePgBossStarted(this.state, "producer");
    await this.state.boss.send("runs.execute", { runId });
  }
}

class PgBossQueueConsumer implements QueueConsumer {
  readonly mode = "pgboss" as const;
  private workerRegistered = false;

  constructor(private readonly state: PgBossSharedState) {}

  async start(handler: RunHandler) {
    await ensurePgBossStarted(this.state, "consumer");
    if (this.workerRegistered) return;
    await this.state.boss.work("runs.execute", async (jobs: unknown) => {
      const items = Array.isArray(jobs) ? jobs : [jobs];
      for (const job of items) {
        const data = ((job as { data?: { runId?: string } })?.data ?? {}) as { runId?: string };
        if (data.runId) {
          await handler(data.runId);
        }
      }
    });
    this.workerRegistered = true;
  }

  async stop() {
    if (this.state.consumerStarted || this.state.producerStarted) {
      await this.state.boss.stop();
    }
    this.state.consumerStarted = false;
    this.state.producerStarted = false;
    this.state.queueCreated = false;
    this.workerRegistered = false;
  }
}

type QueueFactoryInput = { databaseUrl: string | undefined; driver: string | undefined };

export function createQueueProducer(input: QueueFactoryInput): QueueProducer {
  if (input.databaseUrl && input.driver === "pgboss") {
    return new PgBossQueueProducer(createPgBossState(input.databaseUrl));
  }
  return new InlineQueueProducer(sharedInlineState);
}

export function createQueueConsumer(input: QueueFactoryInput): QueueConsumer {
  if (input.databaseUrl && input.driver === "pgboss") {
    return new PgBossQueueConsumer(createPgBossState(input.databaseUrl));
  }
  return new InlineQueueConsumer(sharedInlineState);
}

export function createQueueAdapter(input: QueueFactoryInput): QueueAdapter {
  if (input.databaseUrl && input.driver === "pgboss") {
    const state = createPgBossState(input.databaseUrl);
    return {
      mode: "pgboss",
      enqueueRun: async (runId: string) => new PgBossQueueProducer(state).enqueueRun(runId),
      start: async (handler: RunHandler) => new PgBossQueueConsumer(state).start(handler),
      stop: async () => new PgBossQueueConsumer(state).stop()
    };
  }

  const producer = new InlineQueueProducer(sharedInlineState);
  const consumer = new InlineQueueConsumer(sharedInlineState);
  return {
    mode: "inline",
    enqueueRun: producer.enqueueRun.bind(producer),
    start: consumer.start.bind(consumer),
    stop: consumer.stop.bind(consumer)
  };
}
