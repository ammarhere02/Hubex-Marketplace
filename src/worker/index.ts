// Separate Node process: consumes BullMQ queues. Run with `npm run worker`.
// The web app never executes jobs; it only enqueues them.
import "dotenv/config";
import { Worker, QueueEvents, type Job } from "bullmq";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { createRedisConnection } from "@/lib/redis";
import { QUEUES, closeQueues, scheduleOrderSweep, scheduleProductSync, type QueueName } from "@/lib/queue";
import { jobDefinitions } from "@/jobs";
import { runJob } from "@/jobs/run-job";

env(); // fail fast on bad configuration
const log = logger.child({ component: "worker" });

async function processJob(job: Job) {
  const def = jobDefinitions[job.name];
  if (!def) throw new Error(`No handler registered for job "${job.name}"`);
  return runJob(def, job, log);
}

const CONCURRENCY: Record<QueueName, number> = {
  // One catalog sync at a time; orders limited by Shopify's order-create rate.
  [QUEUES.catalog]: 1,
  [QUEUES.orders]: 2,
};

const workers: Worker[] = [];
const events: QueueEvents[] = [];

for (const name of Object.values(QUEUES)) {
  const worker = new Worker(name, processJob, {
    connection: createRedisConnection(),
    concurrency: CONCURRENCY[name],
  });
  worker.on("error", (err) => log.error({ err, queue: name }, "worker error"));
  workers.push(worker);

  // Queue-level events (observed via Redis streams, independent of this worker).
  const qe = new QueueEvents(name, { connection: createRedisConnection() });
  qe.on("completed", ({ jobId }) => log.info({ queue: name, jobId }, "queue event: completed"));
  qe.on("failed", ({ jobId, failedReason }) =>
    log.warn({ queue: name, jobId, failedReason }, "queue event: failed"),
  );
  qe.on("stalled", ({ jobId }) => log.warn({ queue: name, jobId }, "queue event: stalled"));
  events.push(qe);
}

log.info({ queues: Object.values(QUEUES) }, "worker started");

const syncEvery = env().SYNC_INTERVAL_MINUTES;
scheduleProductSync(syncEvery)
  .then(() => log.info({ everyMinutes: syncEvery }, syncEvery ? "sync-products scheduled" : "sync-products schedule disabled"))
  .catch((err) => log.error({ err }, "could not schedule sync-products"));
scheduleOrderSweep()
  .then(() => log.info("sweep-orders scheduled every minute"))
  .catch((err) => log.error({ err }, "could not schedule sweep-orders"));

let shuttingDown = false;
async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  log.info({ signal }, "worker shutting down (finishing active jobs)");
  await Promise.all(workers.map((w) => w.close()));
  await Promise.all(events.map((e) => e.close()));
  await closeQueues();
  await prisma.$disconnect();
  log.info("worker stopped");
  process.exit(0);
}
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
