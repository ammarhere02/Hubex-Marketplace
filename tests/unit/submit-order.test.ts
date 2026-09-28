import { beforeEach, describe, expect, it, vi } from "vitest";
import { UnrecoverableError, type Job } from "bullmq";
import { ShopifyTransportError } from "@/lib/shopify/errors";
import { dec } from "../helpers/factories";

const { order, findOrderByCustomId, orderCreateCod } = vi.hoisted(() => ({
  order: { findUnique: vi.fn(), update: vi.fn() },
  findOrderByCustomId: vi.fn(),
  orderCreateCod: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({ prisma: { order } }));
vi.mock("@/lib/shopify/orders", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  findOrderByCustomId,
  orderCreateCod,
}));

import { SUBMIT_ORDER_MAX_ATTEMPTS, submitOrderJob } from "@/jobs/submit-order";
import { logger } from "@/lib/logger";

const shopifyRef = { id: "gid://shopify/Order/900", name: "#1001", displayFinancialStatus: "PENDING" };

function dbOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: 10,
    publicId: "pub-10",
    status: "PENDING_SYNC",
    customerName: "Ada Lovelace",
    phone: "+923001234567",
    address1: "12 Model Town",
    address2: null,
    city: "Lahore",
    province: null,
    zip: "54000",
    country: "PK",
    currency: "PKR",
    attempts: 0,
    lastError: null,
    shopifyOrderId: null,
    total: dec("100.00"),
    items: [
      { shopifyVariantId: "gid://shopify/ProductVariant/1", quantity: 2, unitPrice: dec("50.00") },
    ],
    ...overrides,
  };
}

function run(attempt = 1, attempts = 5) {
  const job = { data: { orderId: 10 }, opts: { attempts }, attemptsStarted: attempt } as unknown as Job;
  return submitOrderJob.handler({ job, attempt, log: logger });
}

beforeEach(() => {
  vi.clearAllMocks();
  order.findUnique.mockResolvedValue(dbOrder());
  order.update.mockResolvedValue({ attempts: 1 });
  findOrderByCustomId.mockResolvedValue(null);
  orderCreateCod.mockResolvedValue({ order: shopifyRef, userErrors: [] });
});

describe("submit-order job", () => {
  it("creates the Shopify order and marks the local order SYNCED", async () => {
    const result = await run();
    expect(result).toEqual({ shopifyOrderId: shopifyRef.id, shopifyOrderName: "#1001" });
    // attempts incremented first, then SYNCED written
    expect(order.update.mock.calls[0][0].data.attempts).toEqual({ increment: 1 });
    const synced = order.update.mock.calls.at(-1)![0];
    expect(synced.data).toMatchObject({ status: "SYNCED", shopifyOrderId: shopifyRef.id, lastError: null });
    // looked up before creating — never creates blindly
    expect(findOrderByCustomId).toHaveBeenCalledWith("pub-10", expect.anything());
    expect(findOrderByCustomId.mock.invocationCallOrder[0]).toBeLessThan(orderCreateCod.mock.invocationCallOrder[0]);
  });

  it("passes snapshot prices and COD details to Shopify", async () => {
    await run();
    const input = orderCreateCod.mock.calls[0][0];
    expect(input.lines).toEqual([{ shopifyVariantId: "gid://shopify/ProductVariant/1", quantity: 2, unitPrice: "50.00" }]);
    expect(input.total).toBe("100.00");
    expect(input.shipping).toMatchObject({ firstName: "Ada", lastName: "Lovelace", countryCode: "PK" });
  });

  it("adopts an existing Shopify order instead of creating a duplicate", async () => {
    findOrderByCustomId.mockResolvedValue(shopifyRef);
    const result = await run(2);
    expect(result).toEqual({ shopifyOrderId: shopifyRef.id, shopifyOrderName: "#1001" });
    expect(orderCreateCod).not.toHaveBeenCalled();
  });

  it("is a no-op when the order is already SYNCED", async () => {
    order.findUnique.mockResolvedValue(dbOrder({ status: "SYNCED", shopifyOrderId: "x" }));
    expect(await run()).toEqual({ alreadySynced: true });
    expect(order.update).not.toHaveBeenCalled();
    expect(orderCreateCod).not.toHaveBeenCalled();
  });

  it("stops permanently when the order row does not exist", async () => {
    order.findUnique.mockResolvedValue(null);
    await expect(run()).rejects.toThrow(UnrecoverableError);
  });

  it("stops permanently when the order is already FAILED", async () => {
    order.findUnique.mockResolvedValue(dbOrder({ status: "FAILED" }));
    await expect(run()).rejects.toThrow(UnrecoverableError);
  });

  it("enforces the DB-side attempt limit even if BullMQ re-runs the job", async () => {
    order.findUnique.mockResolvedValue(dbOrder({ attempts: SUBMIT_ORDER_MAX_ATTEMPTS }));
    await expect(run(1)).rejects.toThrow(UnrecoverableError);
    expect(order.update.mock.calls[0][0].data.status).toBe("FAILED");
    expect(orderCreateCod).not.toHaveBeenCalled();
  });

  it("retries transient errors, recording lastError but keeping PENDING_SYNC", async () => {
    orderCreateCod.mockRejectedValue(new ShopifyTransportError("HTTP 503", 503));
    await expect(run(1)).rejects.toThrow("HTTP 503");
    const updates = order.update.mock.calls.map((c) => c[0].data);
    expect(updates.some((d) => d.status === "FAILED")).toBe(false);
    expect(updates.at(-1)).toMatchObject({ lastError: expect.stringContaining("HTTP 503") });
  });

  it("marks FAILED and keeps the error after the final attempt", async () => {
    order.update.mockResolvedValueOnce({ attempts: 5 });
    orderCreateCod.mockRejectedValue(new ShopifyTransportError("HTTP 503", 503));
    await expect(run(5)).rejects.toThrow("HTTP 503");
    expect(order.update.mock.calls.at(-1)![0].data).toMatchObject({
      status: "FAILED",
      lastError: expect.stringContaining("HTTP 503"),
    });
  });

  it("fails immediately (no retry) on permanent user errors", async () => {
    orderCreateCod.mockResolvedValue({ order: null, userErrors: [{ message: "Phone invalid" }] });
    await expect(run(1)).rejects.toThrow(UnrecoverableError);
    expect(order.update.mock.calls.at(-1)![0].data.status).toBe("FAILED");
  });

  it("recovers when userErrors were caused by the earlier create actually succeeding", async () => {
    // First lookup: nothing. Create: uniqueness rejection. Second lookup: found it.
    findOrderByCustomId.mockResolvedValueOnce(null).mockResolvedValueOnce(shopifyRef);
    orderCreateCod.mockResolvedValue({ order: null, userErrors: [{ message: "Value must be unique", code: "TAKEN" }] });
    const result = await run(2);
    expect(result).toEqual({ shopifyOrderId: shopifyRef.id, shopifyOrderName: "#1001" });
    expect(order.update.mock.calls.at(-1)![0].data.status).toBe("SYNCED");
  });

  it("throws when Shopify returns neither order nor userErrors", async () => {
    orderCreateCod.mockResolvedValue({ order: null, userErrors: [] });
    await expect(run(1)).rejects.toThrow(/neither an order nor userErrors/);
  });

  it("uses the single word as both names when the customer has one name", async () => {
    // Shopify requires a last name on the address; a single-word name fills both.
    order.findUnique.mockResolvedValue(dbOrder({ customerName: "Madonna" }));
    await run();
    expect(orderCreateCod.mock.calls[0][0].shipping).toMatchObject({ firstName: "Madonna", lastName: "Madonna" });
  });
});
