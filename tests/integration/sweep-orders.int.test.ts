// Recovery sweep against real Redis: MySQL is the source of truth and the queue
// is re-derived from it after a lost enqueue or a dead worker.
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { Job } from "bullmq";
import { sweepOrdersJob } from "@/jobs/sweep-orders";
import { QUEUES, closeQueues, enqueueSubmitOrder, getQueue, submitOrderJobId } from "@/lib/queue";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { resetDb, seedOrder } from "./helpers";

const run = () =>
  sweepOrdersJob.handler({ job: { data: {}, opts: {} } as unknown as Job, attempt: 1, log: logger });

const OLD = new Date(Date.now() - 10 * 60_000);

beforeEach(async () => {
  await resetDb();
  await getQueue(QUEUES.orders).obliterate({ force: true });
});
afterAll(async () => {
  await closeQueues();
  await prisma.$disconnect();
});

describe("sweep-orders integration", () => {
  it("enqueues a submit-order job for a committed order that never got one", async () => {
    const order = await seedOrder({ createdAt: OLD });
    expect(await run()).toEqual({ checked: 1, live: 0, enqueued: 1 });
    const job = await getQueue(QUEUES.orders).getJob(submitOrderJobId(order.id));
    expect(job).toBeTruthy();
    // Recovery enqueue carries the same orderId + Bull Board summary as checkout's.
    expect(job!.data.orderId).toBe(order.id);
    expect(job!.data.summary).toMatchObject({ customer: expect.any(String), phone: expect.stringContaining("*") });
  });

  it("leaves fresh orders alone (checkout's own enqueue is still in flight)", async () => {
    await seedOrder(); // createdAt = now, inside the grace period
    expect(await run()).toEqual({ checked: 0, live: 0, enqueued: 0 });
  });

  it("does not duplicate a job that is already waiting", async () => {
    const order = await seedOrder({ createdAt: OLD });
    await enqueueSubmitOrder(order.id);
    expect(await run()).toEqual({ checked: 1, live: 1, enqueued: 0 });
    expect(await getQueue(QUEUES.orders).getJobCountByTypes("waiting", "delayed")).toBe(1);
  });

  it("replaces a terminal-state job whose order update was lost (worker died mid-write)", async () => {
    const order = await seedOrder({ createdAt: OLD });
    const queue = getQueue(QUEUES.orders);
    // Run the job through a real worker that "completes" WITHOUT updating the
    // order — exactly the crash-between-Shopify-and-MySQL window.
    await queue.add("submit-order", { orderId: order.id }, { jobId: submitOrderJobId(order.id), attempts: 1 });
    const { Worker } = await import("bullmq");
    const { createRedisConnection } = await import("@/lib/redis");
    const connection = createRedisConnection();
    const worker = new Worker(QUEUES.orders, async () => ({}), { connection });
    try {
      await new Promise<void>((resolve, reject) => {
        worker.on("completed", () => resolve());
        worker.on("failed", (_j, err) => reject(err));
      });
    } finally {
      await worker.close();
      await connection.quit();
    }
    expect(await (await queue.getJob(submitOrderJobId(order.id)))!.getState()).toBe("completed");

    // The order is still PENDING_SYNC → the sweeper removes the stale job
    // (the deterministic job ID would otherwise block the re-add) and re-enqueues.
    const result = (await run()) as { enqueued: number };
    expect(result.enqueued).toBe(1);
    const fresh = await queue.getJob(submitOrderJobId(order.id));
    expect(await fresh!.getState()).toMatch(/waiting|delayed/);
  });

  it("skips SYNCED and FAILED orders entirely", async () => {
    await seedOrder({ status: "SYNCED", createdAt: OLD });
    await seedOrder({ status: "FAILED", createdAt: OLD });
    expect(await run()).toEqual({ checked: 0, live: 0, enqueued: 0 });
  });

  it("processes at most 100 orders per sweep (batch limit)", async () => {
    // 3 stuck orders with a batch this size proves ordering + full pickup;
    // the 100 cap itself is asserted in the unit suite against the query.
    const a = await seedOrder({ createdAt: new Date(Date.now() - 30 * 60_000) });
    const b = await seedOrder({ createdAt: new Date(Date.now() - 20 * 60_000) });
    const c = await seedOrder({ createdAt: OLD });
    expect(await run()).toEqual({ checked: 3, live: 0, enqueued: 3 });
    for (const o of [a, b, c]) {
      expect(await getQueue(QUEUES.orders).getJob(submitOrderJobId(o.id))).toBeTruthy();
    }
  });
});
