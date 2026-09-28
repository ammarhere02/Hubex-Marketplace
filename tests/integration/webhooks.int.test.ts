// Webhook receipt lifecycle against the real database: unique event IDs stop
// duplicate deliveries, and sync-product moves receipts RECEIVED → PROCESSED/FAILED.
import { createHmac } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Job } from "bullmq";

const { fetchProductById } = vi.hoisted(() => ({ fetchProductById: vi.fn() }));
vi.mock("@/lib/shopify", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  fetchProductById,
}));

import { POST } from "@/app/api/webhooks/shopify/route";
import { syncProductJob } from "@/jobs/sync-product";
import type { ShopifyProduct } from "@/lib/shopify/products";
import { QUEUES, closeQueues, getQueue } from "@/lib/queue";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { resetDb } from "./helpers";

const SECRET = "test-client-secret";
const sign = (body: string) => createHmac("sha256", SECRET).update(body, "utf8").digest("base64");

function webhookRequest(body: string, eventId: string, topic = "products/update") {
  return new Request("https://app.example/api/webhooks/shopify", {
    method: "POST",
    headers: {
      "x-shopify-hmac-sha256": sign(body),
      "x-shopify-topic": topic,
      "x-shopify-event-id": eventId,
    },
    body,
  });
}

const product: ShopifyProduct = {
  id: "gid://shopify/Product/777",
  handle: "hooked",
  title: "Hooked Product",
  descriptionHtml: "",
  status: "ACTIVE",
  productType: "Shoes",
  options: [],
  variants: [
    {
      id: "gid://shopify/ProductVariant/777-1",
      title: "Default",
      sku: null,
      price: "99.00",
      compareAtPrice: null,
      inventoryQuantity: 3,
      availableForSale: true,
      selectedOptions: [],
      imageId: null,
    },
  ],
  images: [],
};

beforeEach(async () => {
  vi.clearAllMocks();
  await resetDb();
  await getQueue(QUEUES.catalog).obliterate({ force: true });
});
afterAll(async () => {
  await closeQueues();
  await prisma.$disconnect();
});

describe("webhook + sync-product integration", () => {
  it("records the receipt, enqueues, and the job creates the product locally", async () => {
    const body = JSON.stringify({ id: 777 });
    const res = await POST(webhookRequest(body, "evt-int-1", "products/create"));
    expect(res.status).toBe(200);

    const receipt = await prisma.webhookReceipt.findUniqueOrThrow({ where: { eventId: "evt-int-1" } });
    expect(receipt.status).toBe("RECEIVED");
    const job = await getQueue(QUEUES.catalog).getJob(`sync-product-${receipt.id}`);
    expect(job).toBeTruthy();

    fetchProductById.mockResolvedValue(product);
    await syncProductJob.handler({
      job: { data: job!.data, opts: { attempts: 3 } } as unknown as Job,
      attempt: 1,
      log: logger,
    });

    const local = await prisma.product.findUniqueOrThrow({ where: { shopifyId: product.id }, include: { variants: true } });
    expect(local.title).toBe("Hooked Product");
    expect(local.variants[0].price.toFixed(2)).toBe("99.00");
    const processed = await prisma.webhookReceipt.findUniqueOrThrow({ where: { eventId: "evt-int-1" } });
    expect(processed).toMatchObject({ status: "PROCESSED", productId: local.id, error: null });
    expect(processed.processedAt).toBeInstanceOf(Date);
  });

  it("a duplicate delivery (same event ID) is acknowledged but recorded and enqueued once", async () => {
    const body = JSON.stringify({ id: 777 });
    expect((await POST(webhookRequest(body, "evt-dup"))).status).toBe(200);
    expect((await POST(webhookRequest(body, "evt-dup"))).status).toBe(200);
    expect(await prisma.webhookReceipt.count()).toBe(1);
    expect(await getQueue(QUEUES.catalog).getJobCountByTypes("waiting", "delayed")).toBe(1);
  });

  it("a products/delete flow hides the product and marks the receipt processed", async () => {
    // Seed via a create webhook + job first.
    fetchProductById.mockResolvedValue(product);
    await POST(webhookRequest(JSON.stringify({ id: 777 }), "evt-del-1", "products/create"));
    const r1 = await prisma.webhookReceipt.findUniqueOrThrow({ where: { eventId: "evt-del-1" } });
    await syncProductJob.handler({
      job: { data: { receiptId: r1.id, shopifyProductId: product.id }, opts: { attempts: 3 } } as unknown as Job,
      attempt: 1,
      log: logger,
    });

    // Now Shopify no longer has it.
    fetchProductById.mockResolvedValue(null);
    await POST(webhookRequest(JSON.stringify({ id: 777 }), "evt-del-2", "products/delete"));
    const r2 = await prisma.webhookReceipt.findUniqueOrThrow({ where: { eventId: "evt-del-2" } });
    await syncProductJob.handler({
      job: { data: { receiptId: r2.id, shopifyProductId: product.id }, opts: { attempts: 3 } } as unknown as Job,
      attempt: 1,
      log: logger,
    });

    const local = await prisma.product.findUniqueOrThrow({ where: { shopifyId: product.id }, include: { variants: true } });
    expect(local.isRemoved).toBe(true);
    expect(local.variants.every((v) => v.isRemoved)).toBe(true);
    expect((await prisma.webhookReceipt.findUniqueOrThrow({ where: { eventId: "evt-del-2" } })).status).toBe("PROCESSED");
  });

  it("a failing Shopify read keeps the receipt retryable, then FAILED on the last attempt", async () => {
    await POST(webhookRequest(JSON.stringify({ id: 777 }), "evt-fail"));
    const receipt = await prisma.webhookReceipt.findUniqueOrThrow({ where: { eventId: "evt-fail" } });
    fetchProductById.mockRejectedValue(new Error("shopify down"));

    const jobArg = { data: { receiptId: receipt.id, shopifyProductId: product.id }, opts: { attempts: 3 } } as unknown as Job;
    await expect(syncProductJob.handler({ job: jobArg, attempt: 1, log: logger })).rejects.toThrow("shopify down");
    expect((await prisma.webhookReceipt.findUniqueOrThrow({ where: { eventId: "evt-fail" } })).status).toBe("RECEIVED");

    await expect(syncProductJob.handler({ job: jobArg, attempt: 3, log: logger })).rejects.toThrow("shopify down");
    const failed = await prisma.webhookReceipt.findUniqueOrThrow({ where: { eventId: "evt-fail" } });
    expect(failed.status).toBe("FAILED");
    expect(failed.error).toContain("shopify down");
  });
});
