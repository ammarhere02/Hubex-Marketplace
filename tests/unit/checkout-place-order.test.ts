import { beforeEach, describe, expect, it, vi } from "vitest";
import { dec, validCustomer, variantRow } from "../helpers/factories";

const enqueueSubmitOrder = vi.fn();
vi.mock("@/lib/queue", () => ({ enqueueSubmitOrder: (...a: unknown[]) => enqueueSubmitOrder(...a) }));

// $transaction runs the callback with a fake tx; capture what gets written.
const orderCreate = vi.fn();
const findMany = vi.fn();
const tx = { productVariant: { findMany }, order: { create: orderCreate } };
vi.mock("@/lib/prisma", () => ({
  prisma: { $transaction: async (fn: (t: unknown) => unknown) => fn(tx) },
}));

import { customerSchema, placeOrder } from "@/lib/checkout";

const customer = customerSchema.parse(validCustomer);

beforeEach(() => {
  vi.clearAllMocks();
  findMany.mockResolvedValue([variantRow({ id: 1, price: dec("50.00") })]);
  orderCreate.mockResolvedValue({ id: 10, publicId: "pub-1", total: dec("100.00") });
  enqueueSubmitOrder.mockResolvedValue(undefined);
});

describe("placeOrder", () => {
  it("saves order + items with price snapshots inside the transaction, then enqueues", async () => {
    const result = await placeOrder([{ variantId: 1, quantity: 2 }], customer);
    expect(result).toEqual({ ok: true, publicId: "pub-1", orderId: 10, enqueued: true });

    const data = orderCreate.mock.calls[0][0].data;
    expect(data.status).toBe("PENDING_SYNC");
    expect(data.subtotal.toFixed(2)).toBe("100.00");
    expect(data.total.toFixed(2)).toBe("100.00");
    expect(data.currency).toBe("PKR");
    expect(data.phone).toBe("+923001234567"); // normalised
    expect(data.publicId).toMatch(/^[0-9a-f-]{36}$/);
    expect(data.items.create).toEqual([
      expect.objectContaining({ variantId: 1, quantity: 2, shopifyVariantId: "gid://shopify/ProductVariant/1" }),
    ]);
    expect(data.items.create[0].unitPrice.toFixed(2)).toBe("50.00");
    expect(enqueueSubmitOrder).toHaveBeenCalledWith(10);
  });

  it("writes nothing and returns problems when any line fails re-pricing", async () => {
    findMany.mockResolvedValue([]); // variant vanished between cart and checkout
    const result = await placeOrder([{ variantId: 1, quantity: 2 }], customer);
    expect(result).toEqual({ ok: false, problems: [{ variantId: 1, reason: "not_found" }] });
    expect(orderCreate).not.toHaveBeenCalled();
    expect(enqueueSubmitOrder).not.toHaveBeenCalled();
  });

  it("still confirms the order when enqueue fails (sweeper will recover it)", async () => {
    enqueueSubmitOrder.mockRejectedValue(new Error("redis down"));
    const result = await placeOrder([{ variantId: 1, quantity: 2 }], customer);
    expect(result).toEqual({ ok: true, publicId: "pub-1", orderId: 10, enqueued: false });
  });

  it("does not hang when enqueue never resolves: caps the wait and confirms", async () => {
    vi.useFakeTimers();
    try {
      enqueueSubmitOrder.mockReturnValue(new Promise(() => {})); // hangs forever
      const pending = placeOrder([{ variantId: 1, quantity: 2 }], customer);
      await vi.advanceTimersByTimeAsync(3_100);
      const result = await pending;
      expect(result).toMatchObject({ ok: true, enqueued: false });
    } finally {
      vi.useRealTimers();
    }
  });

  it("propagates a database failure instead of pretending the order was placed", async () => {
    orderCreate.mockRejectedValue(new Error("deadlock"));
    await expect(placeOrder([{ variantId: 1, quantity: 2 }], customer)).rejects.toThrow("deadlock");
    expect(enqueueSubmitOrder).not.toHaveBeenCalled();
  });
});
