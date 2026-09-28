import { beforeEach, describe, expect, it, vi } from "vitest";
import { dec } from "../helpers/factories";

const { product, productImage } = vi.hoisted(() => ({
  product: { count: vi.fn(), findMany: vi.fn(), groupBy: vi.fn(), findFirst: vi.fn() },
  productImage: { findFirst: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: { product, productImage } }));

import { PAGE_SIZE, formatPrice, listDeals, listProducts } from "@/lib/catalog";

interface RowOverrides {
  id?: number;
  images?: Array<{ url: string; altText: string | null }>;
  variants?: Array<{ price: ReturnType<typeof dec>; compareAtPrice: ReturnType<typeof dec> | null; availableForSale: boolean }>;
}
const row = (o: RowOverrides = {}) => ({
  id: o.id ?? 1,
  handle: "h",
  title: "T",
  productType: "Shoes",
  images: o.images ?? [{ url: "https://cdn/img.jpg", altText: null }],
  variants: o.variants ?? [{ price: dec("100.00"), compareAtPrice: null, availableForSale: true }],
});

beforeEach(() => {
  vi.clearAllMocks();
  product.count.mockResolvedValue(1);
  product.findMany.mockResolvedValue([row()]);
});

describe("listProducts", () => {
  it("only queries visible products (ACTIVE and not removed)", async () => {
    await listProducts({ page: 1 });
    expect(product.findMany.mock.calls[0][0].where).toMatchObject({ status: "ACTIVE", isRemoved: false });
  });

  it("adds the category filter when given", async () => {
    await listProducts({ page: 1, category: "Shoes" });
    expect(product.findMany.mock.calls[0][0].where.productType).toBe("Shoes");
  });

  it("paginates with skip/take and computes pageCount", async () => {
    product.count.mockResolvedValue(25);
    const r = await listProducts({ page: 3 });
    expect(product.findMany.mock.calls[0][0]).toMatchObject({ skip: 2 * PAGE_SIZE, take: PAGE_SIZE });
    expect(r.pageCount).toBe(Math.ceil(25 / PAGE_SIZE));
  });

  it("reports at least one page even with zero products", async () => {
    product.count.mockResolvedValue(0);
    product.findMany.mockResolvedValue([]);
    const r = await listProducts({ page: 1 });
    expect(r).toMatchObject({ total: 0, pageCount: 1, products: [] });
  });

  it("uses the cheapest variant as the card price and flags availability", async () => {
    product.findMany.mockResolvedValue([
      row({
        variants: [
          { price: dec("300.00"), compareAtPrice: null, availableForSale: false },
          { price: dec("150.00"), compareAtPrice: null, availableForSale: false },
        ],
      }),
    ]);
    const { products } = await listProducts({ page: 1 });
    expect(products[0].price).toBe("150.00");
    expect(products[0].available).toBe(false);
  });

  it("computes discount only when compare-at exceeds the price", async () => {
    product.findMany.mockResolvedValue([
      row({ id: 1, variants: [{ price: dec("80.00"), compareAtPrice: dec("100.00"), availableForSale: true }] }),
      row({ id: 2, variants: [{ price: dec("80.00"), compareAtPrice: dec("80.00"), availableForSale: true }] }),
    ]);
    const { products } = await listProducts({ page: 1 });
    expect(products[0]).toMatchObject({ compareAtPrice: "100.00", saveAmount: "20.00", discountPercent: 20 });
    expect(products[1]).toMatchObject({ compareAtPrice: null, saveAmount: null, discountPercent: null });
  });

  it("survives a product with no image and no variants", async () => {
    product.findMany.mockResolvedValue([row({ images: [], variants: [] })]);
    const { products } = await listProducts({ page: 1 });
    expect(products[0]).toMatchObject({ image: null, price: null, available: false });
  });
});

describe("listDeals", () => {
  it("returns discounted products, biggest discount first", async () => {
    product.findMany.mockResolvedValue([
      row({ id: 1, variants: [{ price: dec("90.00"), compareAtPrice: dec("100.00"), availableForSale: true }] }),
      row({ id: 2, variants: [{ price: dec("50.00"), compareAtPrice: dec("100.00"), availableForSale: true }] }),
      row({ id: 3 }),
    ]);
    const r = await listDeals();
    expect(r.hasDiscounts).toBe(true);
    expect(r.products.map((p) => p.id)).toEqual([2, 1]);
  });

  it("falls back to newest products, honestly flagged, when nothing is discounted", async () => {
    product.findMany.mockResolvedValue([row({ id: 1 }), row({ id: 2 }), row({ id: 3 })]);
    const r = await listDeals(2);
    expect(r.hasDiscounts).toBe(false);
    expect(r.products.map((p) => p.id)).toEqual([3, 2]);
  });
});

describe("formatPrice", () => {
  it("renders a Decimal with exactly two places", () => {
    expect(formatPrice(dec("5"))).toBe("5.00");
  });
});
