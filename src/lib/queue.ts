// Queue and job definitions shared by the web app (producer) and the worker
// (consumer). Retry policy lives here so both sides agree on it.
import { Queue, type JobsOptions } from "bullmq";
import { createRedisConnection } from "./redis";

export const QUEUES = {
  catalog: "catalog",
  orders: "orders",
} as const;
export type QueueName = (typeof QUEUES)[keyof typeof QUEUES];

export const JOBS = {
  ping: "ping", // diagnostic job used to verify the pipeline end to end
  syncProducts: "sync-products",
  submitOrder: "submit-order",
} as const;

// `attempts` is the TOTAL number of tries, including the first.
export const JOB_OPTIONS: Record<string, JobsOptions> = {
  [JOBS.ping]: { attempts: 1, removeOnComplete: 100, removeOnFail: 100 },
  [JOBS.syncProducts]: {
    attempts: 3,
    backoff: { type: "exponential", delay: 10_000 }, // 10s, 20s
    removeOnComplete: 100,
    removeOnFail: 500,
  },
  [JOBS.submitOrder]: {
    attempts: 5,
    backoff: { type: "exponential", delay: 5_000 }, // 5s, 10s, 20s, 40s
    removeOnComplete: 1000,
    removeOnFail: 5000,
  },
};

/** Deterministic job ID: re-adding the same order is ignored by BullMQ. ":" is reserved. */
export const submitOrderJobId = (orderId: number) => `submit-order-${orderId}`;

// BullMQ does not close connections it was given, so we track and close them.
const queues = new Map<QueueName, { queue: Queue; connection: ReturnType<typeof createRedisConnection> }>();

/** Lazily created producer-side queue (one connection per queue per process). */
export function getQueue(name: QueueName): Queue {
  let entry = queues.get(name);
  if (!entry) {
    const connection = createRedisConnection();
    entry = { queue: new Queue(name, { connection }), connection };
    queues.set(name, entry);
  }
  return entry.queue;
}

export async function closeQueues(): Promise<void> {
  await Promise.all(
    [...queues.values()].map(async ({ queue, connection }) => {
      await queue.close();
      await connection.quit();
    }),
  );
  queues.clear();
}

/** Adds the submit-order job for a committed order. Re-adding the same order is a no-op. */
export async function enqueueSubmitOrder(orderId: number): Promise<void> {
  await getQueue(QUEUES.orders).add(
    JOBS.submitOrder,
    { orderId },
    { ...JOB_OPTIONS[JOBS.submitOrder], jobId: submitOrderJobId(orderId) },
  );
}
