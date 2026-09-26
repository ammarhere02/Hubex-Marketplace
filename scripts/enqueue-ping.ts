// Adds a diagnostic ping job. Usage: npm run job:ping [-- --fail]
import "dotenv/config";
import { logger } from "@/lib/logger";
import { JOBS, JOB_OPTIONS, QUEUES, closeQueues, getQueue } from "@/lib/queue";

async function main() {
  const fail = process.argv.includes("--fail");
  const job = await getQueue(QUEUES.catalog).add(
    JOBS.ping,
    { message: "hello from CLI", fail },
    JOB_OPTIONS[JOBS.ping],
  );
  logger.info({ component: "cli", jobName: job.name, jobId: job.id, fail }, "ping enqueued");
  await closeQueues();
}

main().catch((err) => {
  logger.error({ err }, "enqueue failed");
  process.exit(1);
});
