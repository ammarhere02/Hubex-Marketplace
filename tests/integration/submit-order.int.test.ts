// submit-order against the real database (status transitions, attempt limits,
// JobLog history). The Shopify boundary is mocked — success, userErrors,
// transport failure, and the "created but reply lost" recovery case.
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Job } from "bullmq";

const { findOrderByCustomId, orderCreateCod } = vi.hoisted(() => ({
  findOrderByCustomId: vi.fn(),
  orderCreateCod: vi.fn(),
}));
vi.mock("@/lib/shopify/orders", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  findOrderByCustomId,
  orderCreateCod,
}));

import { SUBMIT_ORDER_MAX_ATTEMPTS, submitOrderJob } from "@/jobs/submit-order";
import { runJob } from "@/jobs/run-job";
import { ShopifyTransportError } from "@/lib/shopify/errors";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { resetDb, seedOrder } from "./helpers";

const shopifyRef = { id: "gid://shopify/Order/900", name: "#1001", displayFinancialStatus: "PENDING" };

const fakeJob = (orderId: number, attempt = 1) =>
  ({
    id: `submit-order-${orderId}`,
    name: "submit-order",
    queueName: "orders",
    data: { orderId },
    opts: { attempts: 5 },
    attemptsStarted: attempt,
  }) as unknown as Job;

const run = (orderId: number, attempt = 1) => runJob(submitOrderJob, fakeJob(orderId, attempt), logger);

beforeEach(async () => {
  vi.clearAllMocks();
  findOrderByCustomId.mockResolvedValue(null);
  orderCreateCod.mockResolvedValue({ order: shopifyRef, userErrors: [] });
  await resetDb();
});
afterAll(() => prisma.$disconnect());

describe("submit-order integration", () => {
  it("PENDING_SYNC → SYNCED with Shopify IDs, attempts=1, and a COMPLETED JobLog", async () => {
    const order = await seedOrder();
    await run(order.id);
    const after = await prisma.order.findUnique({ where: { id: order.id } });
    expect(after).toMatchObject({
      status: "SYNCED",
      shopifyOrderId: shopifyRef.id,
      shopifyOrderName: "#1001",
      attempts: 1,
      lastError: null,
    });
    expect(after?.syncedAt).toBeInstanceOf(Date);

    const logs = await prisma.jobLog.findMany({ where: { jobName: "submit-order" } });
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ status: "COMPLETED", entityId: String(order.id), attempt: 1 });
    expect(logs[0].durationMs).toBeGreaterThanOrEqual(0);
  });

  it("transient failure: stays PENDING_SYNC with lastError; JobLog says willRetry", async () => {
    const order = await seedOrder();
    orderCreateCod.mockRejectedValue(new ShopifyTransportError("HTTP 503", 503));
    await expect(run(order.id, 1)).rejects.toThrow("HTTP 503");
    const after = await prisma.order.findUnique({ where: { id: order.id } });
    expect(after).toMatchObject({ status: "PENDING_SYNC", attempts: 1 });
    expect(after?.lastError).toContain("HTTP 503");
    const log = await prisma.jobLog.findFirstOrThrow({ where: { jobName: "submit-order" } });
    expect(log).toMatchObject({ status: "FAILED", willRetry: true });
    expect(log.error).toContain("HTTP 503");
  });

  it("exhausted attempts: FAILED with the error retained; retries stop", async () => {
    const order = await seedOrder();
    orderCreateCod.mockRejectedValue(new ShopifyTransportError("HTTP 503", 503));
    for (let attempt = 1; attempt <= SUBMIT_ORDER_MAX_ATTEMPTS; attempt++) {
      await expect(run(order.id, attempt)).rejects.toThrow();
    }
    const after = await prisma.order.findUnique({ where: { id: order.id } });
    expect(after).toMatchObject({ status: "FAILED", attempts: SUBMIT_ORDER_MAX_ATTEMPTS });
    expect(after?.lastError).toContain("HTTP 503");
    // A later stray run does not resurrect it or call Shopify again.
    orderCreateCod.mockClear();
    await expect(run(order.id, 1)).rejects.toThrow(/FAILED/);
    expect(orderCreateCod).not.toHaveBeenCalled();
    // Attempt history survives in JobLog: 5 failed runs + the final refusal.
    expect(await prisma.jobLog.count({ where: { jobName: "submit-order" } })).toBe(SUBMIT_ORDER_MAX_ATTEMPTS + 1);
  });

  it("uncertain outcome recovery: transport error, then the retry finds and adopts the order", async () => {
    const order = await seedOrder();
    orderCreateCod.mockRejectedValueOnce(new ShopifyTransportError("socket hang up"));
    await expect(run(order.id, 1)).rejects.toThrow("socket hang up");
    // Retry: the lookup discovers Shopify actually created it. No second create.
    findOrderByCustomId.mockResolvedValue(shopifyRef);
    orderCreateCod.mockClear();
    await run(order.id, 2);
    expect(orderCreateCod).not.toHaveBeenCalled();
    const after = await prisma.order.findUnique({ where: { id: order.id } });
    expect(after).toMatchObject({ status: "SYNCED", shopifyOrderId: shopifyRef.id, attempts: 2, lastError: null });
  });

  it("permanent userErrors: FAILED immediately without burning the remaining attempts", async () => {
    const order = await seedOrder();
    orderCreateCod.mockResolvedValue({ order: null, userErrors: [{ message: "Variant not found" }] });
    await expect(run(order.id, 1)).rejects.toThrow();
    const after = await prisma.order.findUnique({ where: { id: order.id } });
    expect(after?.status).toBe("FAILED");
    expect(after?.lastError).toContain("Variant not found");
    const log = await prisma.jobLog.findFirstOrThrow({ where: { jobName: "submit-order" } });
    expect(log.willRetry).toBe(false);
  });

  it("running a SYNCED order again is a harmless no-op (idempotent replay)", async () => {
    const order = await seedOrder();
    await run(order.id);
    orderCreateCod.mockClear();
    findOrderByCustomId.mockClear();
    await run(order.id, 1);
    expect(orderCreateCod).not.toHaveBeenCalled();
    expect(findOrderByCustomId).not.toHaveBeenCalled();
    const after = await prisma.order.findUnique({ where: { id: order.id } });
    expect(after?.attempts).toBe(1); // not incremented by the replay
  });
});
