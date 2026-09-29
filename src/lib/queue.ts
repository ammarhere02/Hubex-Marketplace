// Queue and job definitions shared by the web app (producer) and the worker
// (consumer). Retry policy lives here so both sides agree on it.
import { Queue, type JobsOptions } from "bullmq";
import { mask } from "./logger";
import { formatMoney } from "./money";
import { prisma } from "./prisma";
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
  syncProduct: "sync-product", // one product, triggered by a Shopify webhook
  sweepOrders: "sweep-orders", // recovery: PENDING_SYNC orders without a live job
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
  [JOBS.syncProduct]: {
    attempts: 3,
    backoff: { type: "exponential", delay: 5_000 }, // 5s, 10s
    removeOnComplete: 500,
    removeOnFail: 500,
  },
  // A missed sweep is harmless: the next one runs a minute later.
  [JOBS.sweepOrders]: { attempts: 1, removeOnComplete: 100, removeOnFail: 100 },
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

const SYNC_SCHEDULER_ID = "sync-products-every";

/**
 * Repeatable catalog sync. The scheduler lives in Redis under a fixed ID, so calling
 * this on every worker start updates the one schedule instead of adding another.
 */
export async function scheduleProductSync(everyMinutes: number): Promise<void> {
  const queue = getQueue(QUEUES.catalog);
  if (everyMinutes === 0) {
    await queue.removeJobScheduler(SYNC_SCHEDULER_ID);
    return;
  }
  await queue.upsertJobScheduler(
    SYNC_SCHEDULER_ID,
    { every: everyMinutes * 60_000 },
    { name: JOBS.syncProducts, data: {}, opts: JOB_OPTIONS[JOBS.syncProducts] },
  );
}

const SWEEP_SCHEDULER_ID = "sweep-orders-every";

/** Repeatable recovery sweep for committed-but-not-queued orders (fixed ID, upserted). */
export async function scheduleOrderSweep(everyMs = 60_000): Promise<void> {
  await getQueue(QUEUES.orders).upsertJobScheduler(
    SWEEP_SCHEDULER_ID,
    { every: everyMs },
    { name: JOBS.sweepOrders, data: {}, opts: JOB_OPTIONS[JOBS.sweepOrders] },
  );
}

/**
 * A short, admin-readable snapshot attached to the submit-order job so Bull
 * Board shows who ordered what at a glance, instead of a bare `{ orderId }`.
 * Display-only: the worker keeps reading `orderId` and re-loads the order, so
 * this never affects processing. Customer PII is masked per the logging rules
 * (first name + last initial, masked phone, city only — no street address).
 */
export interface SubmitOrderSummary {
  ref: string; // first 8 chars of publicId — matches the Shopify order note/tag
  customer: string;
  phone: string;
  city: string;
  itemCount: number;
  total: string;
  items: string[]; // e.g. "2× Trail Shoe — Blue / 42"
}

type OrderForSummary = {
  publicId: string;
  customerName: string;
  phone: string;
  city: string;
  total: { toFixed(digits: number): string };
  currency: string;
  items: { productTitle: string; variantTitle: string; quantity: number }[];
};

export function buildSubmitOrderSummary(order: OrderForSummary): SubmitOrderSummary {
  const parts = order.customerName.trim().split(/\s+/).filter(Boolean);
  const customer = parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1][0]}.` : (parts[0] ?? "");
  const items = order.items.map((i) => {
    const label = i.variantTitle && i.variantTitle !== "Default Title" ? `${i.productTitle} — ${i.variantTitle}` : i.productTitle;
    return `${i.quantity}× ${label}`;
  });
  return {
    ref: order.publicId.slice(0, 8),
    customer,
    phone: mask(order.phone),
    city: order.city,
    itemCount: order.items.reduce((n, i) => n + i.quantity, 0),
    total: formatMoney(order.total.toFixed(2), order.currency),
    items,
  };
}

/** Adds the submit-order job for a committed order. Re-adding the same order is a no-op. */
export async function enqueueSubmitOrder(orderId: number): Promise<void> {
  // Attach a brief, masked summary for Bull Board; fall back to just the id if
  // the order can't be read, so enqueueing never fails on the display extra.
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      publicId: true, customerName: true, phone: true, city: true,
      total: true, currency: true,
      items: { select: { productTitle: true, variantTitle: true, quantity: true } },
    },
  });
  const data = order ? { orderId, summary: buildSubmitOrderSummary(order) } : { orderId };
  await getQueue(QUEUES.orders).add(
    JOBS.submitOrder,
    data,
    { ...JOB_OPTIONS[JOBS.submitOrder], jobId: submitOrderJobId(orderId) },
  );
}

/**
 * Admin retry for a FAILED order: the finished Redis job still holds the
 * deterministic jobId, so it must be removed before re-adding, or the add is a
 * silent no-op and the order would sit in PENDING_SYNC forever.
 */
export async function requeueSubmitOrder(orderId: number): Promise<void> {
  const stale = await getQueue(QUEUES.orders).getJob(submitOrderJobId(orderId));
  if (stale) await stale.remove();
  await enqueueSubmitOrder(orderId);
}

/** Refreshes one product after a webhook. Job ID per receipt: one job per delivery. */
export async function enqueueSyncProduct(receiptId: number, shopifyProductId: string): Promise<void> {
  await getQueue(QUEUES.catalog).add(
    JOBS.syncProduct,
    { receiptId, shopifyProductId },
    { ...JOB_OPTIONS[JOBS.syncProduct], jobId: `sync-product-${receiptId}` },
  );
}
