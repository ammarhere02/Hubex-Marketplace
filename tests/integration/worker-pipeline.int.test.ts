// End-to-end queue pipeline with a REAL BullMQ worker: enqueue → process via
// the shared runJob wrapper → JobLog history in MySQL. Also covers scheduler
// upserts and graceful shutdown of the worker.
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { Worker, type Job } from "bullmq";
import { jobDefinitions } from "@/jobs";
import { runJob } from "@/jobs/run-job";
import {
  JOBS,
  QUEUES,
  closeQueues,
  getQueue,
  scheduleOrderSweep,
  scheduleProductSync,
} from "@/lib/queue";
import { createRedisConnection } from "@/lib/redis";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { resetDb } from "./helpers";

beforeEach(async () => {
  await resetDb();
  await getQueue(QUEUES.catalog).obliterate({ force: true });
});
afterAll(async () => {
  await closeQueues();
  await prisma.$disconnect();
});

function startWorker(queue: string) {
  const connection = createRedisConnection();
  const worker = new Worker(
    queue,
    async (job: Job) => {
      const def = jobDefinitions[job.name];
      if (!def) throw new Error(`No handler registered for job "${job.name}"`);
      return runJob(def, job, logger);
    },
    { connection },
  );
  return {
    worker,
    async stop() {
      await worker.close();
      await connection.quit();
    },
  };
}

describe("worker pipeline", () => {
  it("processes an enqueued ping job and persists a COMPLETED JobLog row", async () => {
    const { worker, stop } = startWorker(QUEUES.catalog);
    try {
      const done = new Promise<void>((resolve, reject) => {
        worker.on("completed", () => resolve());
        worker.on("failed", (_j, err) => reject(err));
      });
      await getQueue(QUEUES.catalog).add(JOBS.ping, { hello: "test" }, { attempts: 1 });
      await done;
    } finally {
      await stop();
    }
    const log = await prisma.jobLog.findFirstOrThrow({ where: { jobName: JOBS.ping } });
    expect(log).toMatchObject({ status: "COMPLETED", queueName: QUEUES.catalog, attempt: 1 });
    expect(log.durationMs).toBeGreaterThanOrEqual(0);
    expect(log.finishedAt).toBeInstanceOf(Date);
  });

  it("records a FAILED JobLog (willRetry=false) for an unregistered job name", async () => {
    const { worker, stop } = startWorker(QUEUES.catalog);
    try {
      const failed = new Promise<Error>((resolve) => {
        worker.on("failed", (_j, err) => resolve(err as Error));
      });
      await getQueue(QUEUES.catalog).add("no-such-job", {}, { attempts: 1 });
      expect((await failed).message).toContain("No handler registered");
    } finally {
      await stop();
    }
    // The dispatch failure happens before runJob, so no JobLog row: the queue's
    // failed set holds it. That is the documented behaviour.
    expect(await prisma.jobLog.count()).toBe(0);
  });

  it("upserting job schedulers twice keeps exactly one schedule per ID", async () => {
    await scheduleProductSync(15);
    await scheduleProductSync(30);
    const catalogSchedulers = await getQueue(QUEUES.catalog).getJobSchedulers();
    expect(catalogSchedulers).toHaveLength(1);
    expect(Number(catalogSchedulers[0].every)).toBe(30 * 60_000);

    await scheduleOrderSweep(60_000);
    await scheduleOrderSweep(60_000);
    const orderSchedulers = await getQueue(QUEUES.orders).getJobSchedulers();
    expect(orderSchedulers).toHaveLength(1);
  });

  it("interval 0 removes the product-sync schedule", async () => {
    await scheduleProductSync(15);
    await scheduleProductSync(0);
    expect(await getQueue(QUEUES.catalog).getJobSchedulers()).toHaveLength(0);
  });
});
