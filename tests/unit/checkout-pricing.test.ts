import { describe, expect, it, vi } from "vitest";
import { MAX_QUANTITY, priceCart } from "@/lib/checkout";
import { dec, fakeDb, variantRow } from "../helpers/factories";

// priceCart never talks to Redis/queue, but the module imports them: keep the
// import side-effect free.
vi.mock("@/lib/queue", () => ({ enqueueSubmitOrder: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));

describe("priceCart", () => {
  it("prices lines from the database, ignoring any client-side price", async () => {
    const db = fakeDb([variantRow({ id: 1, price: dec("249.99") })]);
    const cart = await priceCart([{ variantId: 1, quantity: 3 }], db);
    expect(cart.problems).toEqual([]);
    expect(cart.lines[0].unitPrice.toFixed(2)).toBe("249.99");
    expect(cart.lines[0].lineTotal.toFixed(2)).toBe("749.97");
    expect(cart.subtotal.toFixed(2)).toBe("749.97");
    expect(cart.currency).toBe("PKR");
  });

  it("keeps exact decimal totals (no float drift)", async () => {
    const db = fakeDb([variantRow({ id: 1, price: dec("0.10") }), variantRow({ id: 2, price: dec("0.20") })]);
    const cart = await priceCart(
      [
        { variantId: 1, quantity: 3 },
        { variantId: 2, quantity: 3 },
      ],
      db,
    );
    // 0.1*3 + 0.2*3 in binary floats is 0.9000000000000001.
    expect(cart.subtotal.toFixed(2)).toBe("0.90");
    expect(cart.subtotal.eq(dec("0.9"))).toBe(true);
  });

  it("merges duplicate variant lines and caps the merged quantity", async () => {
    const db = fakeDb([variantRow({ id: 1, inventoryQuantity: 0 })]);
    const cart = await priceCart(
      [
        { variantId: 1, quantity: 60 },
        { variantId: 1, quantity: 60 },
      ],
      db,
    );
    expect(cart.lines).toHaveLength(1);
    expect(cart.lines[0].quantity).toBe(MAX_QUANTITY);
  });

  it("flags unknown variant IDs as not_found", async () => {
    const cart = await priceCart([{ variantId: 999, quantity: 1 }], fakeDb([]));
    expect(cart.lines).toEqual([]);
    expect(cart.problems).toEqual([{ variantId: 999, reason: "not_found" }]);
  });

  it("flags removed/unavailable variants and non-ACTIVE or removed products", async () => {
    const db = fakeDb([
      variantRow({ id: 1, isRemoved: true }),
      variantRow({ id: 2, availableForSale: false }),
      variantRow({ id: 3, product: { title: "t", handle: "h", status: "DRAFT", isRemoved: false, images: [] } }),
      variantRow({ id: 4, product: { title: "t", handle: "h", status: "ACTIVE", isRemoved: true, images: [] } }),
    ]);
    const cart = await priceCart(
      [1, 2, 3, 4].map((variantId) => ({ variantId, quantity: 1 })),
      db,
    );
    expect(cart.lines).toEqual([]);
    expect(cart.problems.map((p) => p.reason)).toEqual(["unavailable", "unavailable", "unavailable", "unavailable"]);
  });

  it("rejects quantities above positive tracked stock, reporting what is left", async () => {
    const db = fakeDb([variantRow({ id: 1, inventoryQuantity: 2 })]);
    const cart = await priceCart([{ variantId: 1, quantity: 3 }], db);
    expect(cart.problems).toEqual([{ variantId: 1, reason: "insufficient_stock", available: 2 }]);
  });

  it("accepts quantity exactly equal to stock", async () => {
    const db = fakeDb([variantRow({ id: 1, inventoryQuantity: 3 })]);
    const cart = await priceCart([{ variantId: 1, quantity: 3 }], db);
    expect(cart.problems).toEqual([]);
    expect(cart.lines[0].quantity).toBe(3);
  });

  it("allows overselling when Shopify reports zero/negative stock but availableForSale", async () => {
    const db = fakeDb([
      variantRow({ id: 1, inventoryQuantity: 0 }),
      variantRow({ id: 2, inventoryQuantity: -4 }),
    ]);
    const cart = await priceCart(
      [
        { variantId: 1, quantity: 50 },
        { variantId: 2, quantity: 5 },
      ],
      db,
    );
    expect(cart.problems).toEqual([]);
    expect(cart.lines).toHaveLength(2);
  });

  it("prices valid lines even when other lines have problems", async () => {
    const db = fakeDb([variantRow({ id: 1 })]);
    const cart = await priceCart(
      [
        { variantId: 1, quantity: 1 },
        { variantId: 2, quantity: 1 },
      ],
      db,
    );
    expect(cart.lines).toHaveLength(1);
    expect(cart.problems).toHaveLength(1);
  });

  it("takes the first product image as the line image, or null", async () => {
    const db = fakeDb([
      variantRow({ id: 1 }),
      variantRow({ id: 2, product: { title: "t", handle: "h", status: "ACTIVE", isRemoved: false, images: [] } }),
    ]);
    const cart = await priceCart(
      [
        { variantId: 1, quantity: 1 },
        { variantId: 2, quantity: 1 },
      ],
      db,
    );
    expect(cart.lines.find((l) => l.variantId === 1)?.imageUrl).toBe("https://cdn.example/p.jpg");
    expect(cart.lines.find((l) => l.variantId === 2)?.imageUrl).toBeNull();
  });
});
