// Checkout against the real test database and real Redis: transactional order
// persistence, price snapshots, and the enqueue-after-commit contract.
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { placeOrder, priceCart, customerSchema } from "@/lib/checkout";
import { QUEUES, closeQueues, getQueue, submitOrderJobId } from "@/lib/queue";
import { prisma } from "@/lib/prisma";
import { resetDb, seedProduct, dec } from "./helpers";
import { validCustomer } from "../helpers/factories";

const customer = customerSchema.parse(validCustomer);

beforeEach(async () => {
  await resetDb();
  await getQueue(QUEUES.orders).obliterate({ force: true });
});
afterAll(async () => {
  await closeQueues();
  await prisma.$disconnect();
});

describe("checkout integration", () => {
  it("saves order + item snapshots atomically and enqueues submit-order", async () => {
    const p = await seedProduct({ variants: [{ price: "149.50", inventoryQuantity: 5 }] });
    const result = await placeOrder([{ variantId: p.variants[0].id, quantity: 2 }], customer);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.enqueued).toBe(true);

    const order = await prisma.order.findUnique({ where: { id: result.orderId }, include: { items: true } });
    expect(order?.status).toBe("PENDING_SYNC");
    expect(order?.subtotal.toFixed(2)).toBe("299.00");
    expect(order?.total.toFixed(2)).toBe("299.00");
    expect(order?.phone).toBe("+923001234567");
    expect(order?.items).toHaveLength(1);
    expect(order?.items[0].unitPrice.toFixed(2)).toBe("149.50");
    expect(order?.items[0].lineTotal.toFixed(2)).toBe("299.00");

    const job = await getQueue(QUEUES.orders).getJob(submitOrderJobId(result.orderId));
    expect(job).toBeTruthy();
    // orderId stays the worker's source of truth; a masked summary rides along
    // for Bull Board (who ordered, what, how much) without leaking PII.
    expect(job!.data.orderId).toBe(result.orderId);
    expect(job!.data.summary).toMatchObject({
      customer: expect.any(String),
      phone: expect.stringContaining("*"), // masked, not the raw number
      itemCount: 2, // total units ordered (quantity 2 of one line)
      items: expect.arrayContaining([expect.stringMatching(/^2× /)]),
    });
    expect(job!.data.summary.phone).not.toBe(order?.phone); // never the raw phone
    expect(job!.opts.attempts).toBe(5);
  });

  it("changing the stored price changes what checkout charges (server repricing)", async () => {
    const p = await seedProduct({ variants: [{ price: "100.00" }] });
    await prisma.productVariant.update({ where: { id: p.variants[0].id }, data: { price: dec("175.25") } });
    const result = await placeOrder([{ variantId: p.variants[0].id, quantity: 1 }], customer);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const order = await prisma.order.findUnique({ where: { id: result.orderId } });
    expect(order?.total.toFixed(2)).toBe("175.25");
  });

  it("writes NOTHING when any line has a problem (all-or-nothing)", async () => {
    const p = await seedProduct({ variants: [{ price: "100.00", inventoryQuantity: 1 }] });
    const result = await placeOrder(
      [
        { variantId: p.variants[0].id, quantity: 1 },
        { variantId: 99_999_999, quantity: 1 },
      ],
      customer,
    );
    expect(result).toEqual({ ok: false, problems: [{ variantId: 99_999_999, reason: "not_found" }] });
    expect(await prisma.order.count()).toBe(0);
    expect(await prisma.orderItem.count()).toBe(0);
    const jobs = await getQueue(QUEUES.orders).getJobCountByTypes("waiting", "delayed", "active");
    expect(jobs).toBe(0);
  });

  it("rejects checkout when stock ran out since the cart was built", async () => {
    const p = await seedProduct({ variants: [{ price: "100.00", inventoryQuantity: 1 }] });
    const result = await placeOrder([{ variantId: p.variants[0].id, quantity: 3 }], customer);
    expect(result).toEqual({
      ok: false,
      problems: [{ variantId: p.variants[0].id, reason: "insufficient_stock", available: 1 }],
    });
  });

  it("prices carts from the database through priceCart's default client", async () => {
    const p = await seedProduct({ variants: [{ price: "42.42" }] });
    const priced = await priceCart([{ variantId: p.variants[0].id, quantity: 2 }]);
    expect(priced.subtotal.toFixed(2)).toBe("84.84");
  });

  it("two checkouts create two distinct orders and two distinct jobs", async () => {
    const p = await seedProduct({ variants: [{ price: "10.00", inventoryQuantity: 0 }] });
    const a = await placeOrder([{ variantId: p.variants[0].id, quantity: 1 }], customer);
    const b = await placeOrder([{ variantId: p.variants[0].id, quantity: 1 }], customer);
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    expect(a.publicId).not.toBe(b.publicId);
    expect(await getQueue(QUEUES.orders).getJobCountByTypes("waiting", "delayed")).toBe(2);
  });
});
