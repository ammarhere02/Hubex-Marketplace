// Manual catalog sync trigger. The worker does the Shopify work; this only enqueues.
// Usage: npm run sync:products            (enqueue and exit)
//        npm run sync:products -- --wait  (also wait for the worker's result)
import "dotenv/config";
import { QueueEvents } from "bullmq";
import { logger } from "@/lib/logger";
import { createRedisConnection } from "@/lib/redis";
import { JOBS, JOB_OPTIONS, QUEUES, closeQueues, getQueue } from "@/lib/queue";

async function main() {
  const log = logger.child({ component: "cli" });
  const wait = process.argv.includes("--wait");
  const job = await getQueue(QUEUES.catalog).add(JOBS.syncProducts, {}, JOB_OPTIONS[JOBS.syncProducts]);
  log.info({ jobName: job.name, jobId: job.id }, "sync-products enqueued");

  if (wait) {
    const connection = createRedisConnection();
    const events = new QueueEvents(QUEUES.catalog, { connection });
    try {
      // Covers all retries: resolves on final success, rejects on final failure.
      const result = await job.waitUntilFinished(events);
      log.info({ jobId: job.id, result }, "sync-products finished");
    } finally {
      await events.close();
      await connection.quit();
    }
  }
  await closeQueues();
}

main().catch((err) => {
  logger.error({ err }, "sync-products failed");
  process.exit(1);
});
