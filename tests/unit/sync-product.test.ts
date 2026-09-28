import { beforeEach, describe, expect, it, vi } from "vitest";
import { UnrecoverableError, type Job } from "bullmq";

const { prismaMock, fetchProductById, upsertProduct } = vi.hoisted(() => ({
  prismaMock: {
    product: { findUnique: vi.fn(), update: vi.fn() },
    productVariant: { updateMany: vi.fn() },
    webhookReceipt: { update: vi.fn() },
    $transaction: vi.fn(async (ops: unknown[]) => ops),
  },
  fetchProductById: vi.fn(),
  upsertProduct: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/shopify", () => ({ fetchProductById }));
vi.mock("@/jobs/sync-products", () => ({ upsertProduct }));

import { syncProductJob } from "@/jobs/sync-product";
import { logger } from "@/lib/logger";

const GID = "gid://shopify/Product/5";
const run = (attempt = 1, data: Record<string, unknown> = { receiptId: 9, shopifyProductId: GID }) =>
  syncProductJob.handler({ job: { data, opts: { attempts: 3 } } as unknown as Job, attempt, log: logger });

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.product.findUnique.mockResolvedValue({ id: 3 });
  prismaMock.webhookReceipt.update.mockResolvedValue({});
});

describe("sync-product job", () => {
  it("refuses garbage product IDs permanently", async () => {
    await expect(run(1, { receiptId: 9, shopifyProductId: "12345" })).rejects.toThrow(UnrecoverableError);
    expect(fetchProductById).not.toHaveBeenCalled();
  });

  it("fetches fresh state from Shopify (never trusts the payload) and upserts it", async () => {
    fetchProductById.mockResolvedValue({ id: GID, variants: [], images: [], status: "ACTIVE" });
    const result = await run();
    expect(upsertProduct).toHaveBeenCalled();
    expect(result).toEqual({ productId: 3, removed: false });
    expect(prismaMock.webhookReceipt.update.mock.calls[0][0].data).toMatchObject({ status: "PROCESSED", productId: 3 });
  });

  it("marks a deleted product (and its variants) removed", async () => {
    fetchProductById.mockResolvedValue(null);
    const result = await run();
    expect(result).toEqual({ productId: 3, removed: true });
    expect(prismaMock.product.update.mock.calls[0][0]).toMatchObject({ where: { id: 3 }, data: { isRemoved: true } });
    expect(prismaMock.productVariant.updateMany.mock.calls[0][0]).toMatchObject({
      where: { productId: 3 },
      data: { isRemoved: true },
    });
  });

  it("handles deletion of a product we never synced (no local row)", async () => {
    fetchProductById.mockResolvedValue(null);
    prismaMock.product.findUnique.mockResolvedValue(null);
    const result = await run();
    expect(result).toEqual({ productId: null, removed: true });
    expect(prismaMock.product.update).not.toHaveBeenCalled();
  });

  it("keeps the receipt RECEIVED (retryable) on a non-final failure", async () => {
    fetchProductById.mockRejectedValue(new Error("shopify 503"));
    await expect(run(1)).rejects.toThrow("shopify 503");
    const data = prismaMock.webhookReceipt.update.mock.calls[0][0].data;
    expect(data.status).toBeUndefined();
    expect(data.error).toContain("shopify 503");
  });

  it("marks the receipt FAILED on the last attempt", async () => {
    fetchProductById.mockRejectedValue(new Error("shopify 503"));
    await expect(run(3)).rejects.toThrow("shopify 503");
    expect(prismaMock.webhookReceipt.update.mock.calls[0][0].data.status).toBe("FAILED");
  });
});
