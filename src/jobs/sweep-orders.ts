// sweep-orders: recovery for committed orders that have no live submit-order job.
//
// Checkout commits the order to MySQL, THEN enqueues. If Redis is down or the process
// dies between the two, the order is PENDING_SYNC with no job. MySQL is the source of
// truth, so this repeatable job re-derives the queue from it:
//   - job waiting/delayed/active  → leave it alone (normal retry in progress)
//   - job missing                 → enqueue
//   - job completed/failed but order still PENDING_SYNC (worker died before updating
//     the order) → remove the stale job and enqueue again, because the deterministic
//     job ID would otherwise make the new add a no-op.
// Re-enqueueing is safe: submit-order enforces the 5-attempt limit from Order.attempts
// and looks up the Shopify order by our custom ID before creating one.
import { prisma } from "@/lib/prisma";
import { QUEUES, enqueueSubmitOrder, getQueue, submitOrderJobId } from "@/lib/queue";
import type { JobDefinition } from "./run-job";

/** Orders younger than this are still being handled by checkout's own enqueue. */
const GRACE_MS = 2 * 60_000;
const BATCH = 100;
const LIVE_STATES = new Set(["waiting", "delayed", "active", "waiting-children", "prioritized"]);

export const sweepOrdersJob: JobDefinition = {
  async handler({ log }) {
    const stuck = await prisma.order.findMany({
      where: { status: "PENDING_SYNC", createdAt: { lt: new Date(Date.now() - GRACE_MS) } },
      select: { id: true },
      orderBy: { createdAt: "asc" },
      take: BATCH,
    });

    const queue = getQueue(QUEUES.orders);
    let enqueued = 0;
    let live = 0;
    for (const { id } of stuck) {
      const job = await queue.getJob(submitOrderJobId(id));
      const state = job ? await job.getState() : "missing";
      if (LIVE_STATES.has(state)) {
        live++;
        continue;
      }
      if (job) await job.remove();
      await enqueueSubmitOrder(id);
      enqueued++;
      log.warn({ orderId: id, previousJobState: state }, "re-enqueued PENDING_SYNC order");
    }

    log.info({ checked: stuck.length, live, enqueued }, "order sweep finished");
    return { checked: stuck.length, live, enqueued };
  },
};
