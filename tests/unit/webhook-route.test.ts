import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@/generated/prisma/client";

const { webhookReceipt, enqueueSyncProduct } = vi.hoisted(() => ({
  webhookReceipt: { create: vi.fn() },
  enqueueSyncProduct: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({ prisma: { webhookReceipt } }));
vi.mock("@/lib/queue", () => ({ enqueueSyncProduct }));

import { POST } from "@/app/api/webhooks/shopify/route";

const SECRET = "test-client-secret"; // matches tests/setup/fake-env.ts

function sign(body: string, secret = SECRET) {
  return createHmac("sha256", secret).update(body, "utf8").digest("base64");
}

function request(body: string, headers: Record<string, string | null> = {}) {
  const h = new Headers();
  const defaults: Record<string, string> = {
    "x-shopify-hmac-sha256": sign(body),
    "x-shopify-topic": "products/update",
    "x-shopify-event-id": "evt-1",
    "x-shopify-triggered-at": "2026-09-28T10:00:00Z",
  };
  for (const [k, v] of Object.entries({ ...defaults, ...headers })) if (v !== null) h.set(k, v);
  return new Request("https://app.example/api/webhooks/shopify", { method: "POST", headers: h, body });
}

const BODY = JSON.stringify({ id: 123456, title: "Changed product" });

beforeEach(() => {
  vi.clearAllMocks();
  webhookReceipt.create.mockResolvedValue({ id: 77 });
  enqueueSyncProduct.mockResolvedValue(undefined);
});

describe("Shopify webhook endpoint", () => {
  it("records the delivery and enqueues sync-product for a valid webhook", async () => {
    const res = await POST(request(BODY));
    expect(res.status).toBe(200);
    expect(webhookReceipt.create.mock.calls[0][0].data).toMatchObject({
      eventId: "evt-1",
      topic: "products/update",
      shopifyProductId: "gid://shopify/Product/123456",
    });
    expect(enqueueSyncProduct).toHaveBeenCalledWith(77, "gid://shopify/Product/123456");
  });

  it("rejects a wrong HMAC signature with 401 and does nothing", async () => {
    const res = await POST(request(BODY, { "x-shopify-hmac-sha256": sign(BODY, "wrong-secret") }));
    expect(res.status).toBe(401);
    expect(webhookReceipt.create).not.toHaveBeenCalled();
  });

  it("rejects a missing HMAC header with 401", async () => {
    const res = await POST(request(BODY, { "x-shopify-hmac-sha256": null }));
    expect(res.status).toBe(401);
  });

  it("rejects a body that was tampered with after signing", async () => {
    const res = await POST(
      new Request("https://app.example/api/webhooks/shopify", {
        method: "POST",
        headers: { "x-shopify-hmac-sha256": sign(BODY), "x-shopify-topic": "products/update", "x-shopify-event-id": "e" },
        body: BODY.replace("Changed", "Hacked"),
      }),
    );
    expect(res.status).toBe(401);
  });

  it("acknowledges but ignores unsupported topics", async () => {
    const res = await POST(request(BODY, { "x-shopify-topic": "orders/create" }));
    expect(res.status).toBe(200);
    expect(webhookReceipt.create).not.toHaveBeenCalled();
  });

  it("acknowledges but ignores a delivery without an event ID", async () => {
    const res = await POST(request(BODY, { "x-shopify-event-id": null }));
    expect(res.status).toBe(200);
    expect(webhookReceipt.create).not.toHaveBeenCalled();
  });

  it("falls back to the webhook ID header when the event ID is absent", async () => {
    const res = await POST(request(BODY, { "x-shopify-event-id": null, "x-shopify-webhook-id": "wh-9" }));
    expect(res.status).toBe(200);
    expect(webhookReceipt.create.mock.calls[0][0].data.eventId).toBe("wh-9");
  });

  it("acknowledges but ignores malformed payloads (invalid JSON, missing/garbage id)", async () => {
    for (const body of ["not json", JSON.stringify({}), JSON.stringify({ id: "abc; DROP TABLE" })]) {
      const res = await POST(request(body));
      expect(res.status, body).toBe(200);
    }
    expect(webhookReceipt.create).not.toHaveBeenCalled();
  });

  it("treats a duplicate delivery (unique eventId) as success without re-enqueueing", async () => {
    webhookReceipt.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("Unique constraint", { code: "P2002", clientVersion: "7" }),
    );
    const res = await POST(request(BODY));
    expect(res.status).toBe(200);
    expect(enqueueSyncProduct).not.toHaveBeenCalled();
  });

  it("returns 500 on other database errors so Shopify re-delivers", async () => {
    webhookReceipt.create.mockRejectedValue(new Error("connection lost"));
    const res = await POST(request(BODY));
    expect(res.status).toBe(500);
  });

  it("still returns 200 when enqueue fails (scheduled sync is the safety net)", async () => {
    enqueueSyncProduct.mockRejectedValue(new Error("redis down"));
    const res = await POST(request(BODY));
    expect(res.status).toBe(200);
  });

  it("stores an invalid triggered-at timestamp as null instead of crashing", async () => {
    const res = await POST(request(BODY, { "x-shopify-triggered-at": "not-a-date" }));
    expect(res.status).toBe(200);
    expect(webhookReceipt.create.mock.calls[0][0].data.triggeredAt).toBeNull();
  });
});
