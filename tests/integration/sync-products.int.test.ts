// Catalog sync against the real database. The Shopify feed is mocked so every
// scenario — repeat syncs, updates, deletions, partial failures, currency
// mismatch — is reproducible.
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Job } from "bullmq";
import { UnrecoverableError } from "bullmq";

const { fetchAllProducts, fetchShopCurrency } = vi.hoisted(() => ({
  fetchAllProducts: vi.fn(),
  fetchShopCurrency: vi.fn(),
}));
vi.mock("@/lib/shopify", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  fetchAllProducts,
  fetchShopCurrency,
}));

import { syncProductsJob } from "@/jobs/sync-products";
import type { ShopifyProduct } from "@/lib/shopify/products";
import { listProducts } from "@/lib/catalog";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { resetDb } from "./helpers";

function shopifyProduct(n: number, over: Partial<ShopifyProduct> = {}): ShopifyProduct {
  return {
    id: `gid://shopify/Product/${n}`,
    handle: `product-${n}`,
    title: `Product ${n}`,
    descriptionHtml: "<p>d</p>",
    status: "ACTIVE",
    productType: "Shoes",
    options: [{ name: "Size", position: 1, values: ["S"] }],
    colors: [],
    variants: [
      {
        id: `gid://shopify/ProductVariant/${n}-1`,
        title: "S",
        sku: `SKU-${n}`,
        price: "100.00",
        compareAtPrice: null,
        inventoryQuantity: 5,
        availableForSale: true,
        selectedOptions: [{ name: "Size", value: "S" }],
        imageId: null,
      },
    ],
    images: [{ id: `gid://shopify/MediaImage/${n}-1`, url: `https://cdn/${n}.jpg`, altText: null }],
    ...over,
  };
}

function feed(...pages: ShopifyProduct[][]) {
  fetchAllProducts.mockImplementation(async function* () {
    let pageNumber = 0;
    for (const products of pages) yield { pageNumber: ++pageNumber, products };
  });
}

const run = () =>
  syncProductsJob.handler({
    job: { data: {}, opts: { attempts: 3 }, updateProgress: async () => {} } as unknown as Job,
    attempt: 1,
    log: logger,
  });

beforeEach(async () => {
  vi.clearAllMocks();
  fetchShopCurrency.mockResolvedValue("PKR");
  await resetDb();
});
afterAll(() => prisma.$disconnect());

describe("sync-products integration", () => {
  it("copies products, variants, and images into MySQL across multiple pages", async () => {
    feed([shopifyProduct(1), shopifyProduct(2)], [shopifyProduct(3)]);
    const summary = await run();
    expect(summary).toEqual({ products: 3, variants: 3, images: 3, removed: 0 });
    expect(await prisma.product.count()).toBe(3);
    const p1 = await prisma.product.findUniqueOrThrow({
      where: { shopifyId: "gid://shopify/Product/1" },
      include: { variants: true, images: true },
    });
    expect(p1.variants[0].price.toFixed(2)).toBe("100.00");
    expect(p1.images[0].url).toBe("https://cdn/1.jpg");
  });

  it("a repeated sync updates in place (upsert by Shopify ID, no duplicates)", async () => {
    feed([shopifyProduct(1)]);
    await run();
    feed([shopifyProduct(1, { title: "Renamed", variants: [{ ...shopifyProduct(1).variants[0], price: "150.00" }] })]);
    await run();
    expect(await prisma.product.count()).toBe(1);
    expect(await prisma.productVariant.count()).toBe(1);
    const p = await prisma.product.findFirstOrThrow({ include: { variants: true } });
    expect(p.title).toBe("Renamed");
    expect(p.variants[0].price.toFixed(2)).toBe("150.00");
  });

  it("marks products deleted from Shopify as removed — they vanish from the storefront", async () => {
    feed([shopifyProduct(1), shopifyProduct(2)]);
    await run();
    expect((await listProducts({ page: 1 })).total).toBe(2);
    feed([shopifyProduct(1)]); // product 2 gone from Shopify
    const summary = await run();
    expect(summary).toMatchObject({ removed: 1 });
    expect((await listProducts({ page: 1 })).total).toBe(1);
    // The row survives for order history, flagged.
    const p2 = await prisma.product.findUniqueOrThrow({
      where: { shopifyId: "gid://shopify/Product/2" },
      include: { variants: true },
    });
    expect(p2.isRemoved).toBe(true);
    expect(p2.variants.every((v) => v.isRemoved)).toBe(true);
  });

  it("a re-appearing product is restored (isRemoved cleared)", async () => {
    feed([shopifyProduct(1)]);
    await run();
    feed([]);
    await run();
    feed([shopifyProduct(1)]);
    await run();
    expect((await listProducts({ page: 1 })).total).toBe(1);
  });

  it("flags variants dropped from a product but deletes dropped images outright", async () => {
    const two = shopifyProduct(1);
    two.variants.push({ ...two.variants[0], id: "gid://shopify/ProductVariant/1-2", title: "M", sku: "SKU-1-M" });
    two.images.push({ id: "gid://shopify/MediaImage/1-2", url: "https://cdn/1b.jpg", altText: null });
    feed([two]);
    await run();
    feed([shopifyProduct(1)]); // back to one variant, one image
    await run();
    const p = await prisma.product.findFirstOrThrow({ include: { variants: true, images: true } });
    const dropped = p.variants.find((v) => v.shopifyId.endsWith("1-2"));
    expect(dropped?.isRemoved).toBe(true); // kept: order items reference variants
    expect(p.images).toHaveLength(1); // images have no dependants
  });

  it("archived products are stored but hidden from the storefront", async () => {
    feed([shopifyProduct(1, { status: "ARCHIVED" }), shopifyProduct(2, { status: "DRAFT" }), shopifyProduct(3)]);
    await run();
    expect(await prisma.product.count()).toBe(3);
    const { products, total } = await listProducts({ page: 1 });
    expect(total).toBe(1);
    expect(products[0].title).toBe("Product 3");
  });

  it("a partial scan failure removes NOTHING (products simply not visited stay visible)", async () => {
    feed([shopifyProduct(1), shopifyProduct(2)]);
    await run();
    // Next scan dies after page 1, before it would have seen product 2.
    fetchAllProducts.mockImplementation(async function* () {
      yield { pageNumber: 1, products: [shopifyProduct(1)] };
      throw new Error("Shopify 503 on page 2");
    });
    await expect(run()).rejects.toThrow("Shopify 503 on page 2");
    expect((await listProducts({ page: 1 })).total).toBe(2); // 2 NOT deactivated
    expect((await prisma.product.findMany()).every((p) => !p.isRemoved)).toBe(true);
  });

  it("aborts unrecoverably (no retries, nothing written) on a currency mismatch", async () => {
    fetchShopCurrency.mockResolvedValue("USD"); // env says PKR
    feed([shopifyProduct(1)]);
    await expect(run()).rejects.toThrow(UnrecoverableError);
    expect(await prisma.product.count()).toBe(0);
  });

  it("normalises status: unknown future statuses become DRAFT (not sellable)", async () => {
    feed([shopifyProduct(1, { status: "SOMETHING_NEW" })]);
    await run();
    const p = await prisma.product.findFirstOrThrow();
    expect(p.status).toBe("DRAFT");
  });
});
