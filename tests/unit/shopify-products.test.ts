import { beforeEach, describe, expect, it, vi } from "vitest";

const shopifyGraphQL = vi.hoisted(() => vi.fn());
vi.mock("@/lib/shopify/client", () => ({ shopifyGraphQL, assertNoUserErrors: vi.fn() }));

import { fetchAllProducts, fetchProductById, fetchShopCurrency } from "@/lib/shopify/products";

const rawVariant = (id: number, mediaId: string | null = null) => ({
  id: `gid://shopify/ProductVariant/${id}`,
  title: `V${id}`,
  sku: `S${id}`,
  price: "10.00",
  compareAtPrice: null,
  inventoryQuantity: 5,
  availableForSale: true,
  selectedOptions: [{ name: "Size", value: String(id) }],
  media: { nodes: mediaId ? [{ id: mediaId }] : [] },
});
const image = (id: number) => ({ id: `gid://shopify/MediaImage/${id}`, alt: null, image: { url: `https://cdn/${id}.jpg`, altText: null } });
const conn = <T,>(nodes: T[], hasNextPage = false, endCursor: string | null = null) => ({
  pageInfo: { hasNextPage, endCursor },
  nodes,
});
const rawProduct = (id: number, extras: Record<string, unknown> = {}) => ({
  id: `gid://shopify/Product/${id}`,
  handle: `p${id}`,
  title: `P${id}`,
  descriptionHtml: "",
  status: "ACTIVE",
  productType: "Shoes",
  options: [],
  variants: conn([rawVariant(id * 10)]),
  media: conn([image(id * 100)]),
  ...extras,
});

beforeEach(() => shopifyGraphQL.mockReset());

describe("fetchAllProducts", () => {
  it("follows top-level cursor pagination until exhausted", async () => {
    shopifyGraphQL
      .mockResolvedValueOnce({ products: conn([rawProduct(1)], true, "cur-1") })
      .mockResolvedValueOnce({ products: conn([rawProduct(2)], false) });
    const pages = [];
    for await (const page of fetchAllProducts()) pages.push(page);
    expect(pages.map((p) => p.pageNumber)).toEqual([1, 2]);
    expect(pages[1].products[0].id).toBe("gid://shopify/Product/2");
    expect(shopifyGraphQL.mock.calls[1][1]).toMatchObject({ after: "cur-1" });
  });

  it("drains nested variant pages before yielding the product", async () => {
    shopifyGraphQL
      .mockResolvedValueOnce({
        products: conn([rawProduct(1, { variants: conn([rawVariant(1)], true, "vc-1") })]),
      })
      .mockResolvedValueOnce({ product: { variants: conn([rawVariant(2)], true, "vc-2") } })
      .mockResolvedValueOnce({ product: { variants: conn([rawVariant(3)]) } });
    const pages = [];
    for await (const page of fetchAllProducts()) pages.push(page);
    expect(pages[0].products[0].variants.map((v) => v.title)).toEqual(["V1", "V2", "V3"]);
  });

  it("drains nested media pages and drops non-image media", async () => {
    shopifyGraphQL
      .mockResolvedValueOnce({
        products: conn([rawProduct(1, { media: conn([image(1), {}], true, "mc-1") })]), // {} = video
      })
      .mockResolvedValueOnce({ product: { media: conn([image(2)]) } });
    const pages = [];
    for await (const page of fetchAllProducts()) pages.push(page);
    expect(pages[0].products[0].images.map((i) => i.url)).toEqual(["https://cdn/1.jpg", "https://cdn/2.jpg"]);
  });

  it("fails the scan when a product disappears during nested pagination (no silent truncation)", async () => {
    shopifyGraphQL
      .mockResolvedValueOnce({
        products: conn([rawProduct(1, { variants: conn([rawVariant(1)], true, "vc-1") })]),
      })
      .mockResolvedValueOnce({ product: null });
    const iterate = async () => {
      for await (const _ of fetchAllProducts()) void _;
    };
    await expect(iterate()).rejects.toThrow(/disappeared during nested pagination/);
  });

  it("propagates a mid-scan API error instead of yielding partial data", async () => {
    shopifyGraphQL
      .mockResolvedValueOnce({ products: conn([rawProduct(1)], true, "cur-1") })
      .mockRejectedValueOnce(new Error("boom"));
    const seen: number[] = [];
    const iterate = async () => {
      for await (const page of fetchAllProducts()) seen.push(page.pageNumber);
    };
    await expect(iterate()).rejects.toThrow("boom");
    expect(seen).toEqual([1]); // page 2 never yielded
  });

  it("maps the variant's first media node to imageId", async () => {
    shopifyGraphQL.mockResolvedValueOnce({
      products: conn([rawProduct(1, { variants: conn([rawVariant(1, "gid://shopify/MediaImage/100")]) })]),
    });
    const pages = [];
    for await (const page of fetchAllProducts()) pages.push(page);
    expect(pages[0].products[0].variants[0].imageId).toBe("gid://shopify/MediaImage/100");
  });
});

describe("fetchProductById", () => {
  it("returns the completed product", async () => {
    shopifyGraphQL.mockResolvedValueOnce({ product: rawProduct(7) });
    const p = await fetchProductById("gid://shopify/Product/7");
    expect(p?.handle).toBe("p7");
    expect(p?.variants).toHaveLength(1);
  });

  it("returns null when Shopify no longer has the product", async () => {
    shopifyGraphQL.mockResolvedValueOnce({ product: null });
    expect(await fetchProductById("gid://shopify/Product/404")).toBeNull();
  });
});

describe("fetchShopCurrency", () => {
  it("returns the store currency code", async () => {
    shopifyGraphQL.mockResolvedValueOnce({ shop: { currencyCode: "PKR" } });
    expect(await fetchShopCurrency()).toBe("PKR");
  });
});
