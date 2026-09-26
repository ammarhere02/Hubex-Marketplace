// Catalog reads for the sync job. Yields COMPLETE products: when a product has
// more variants or media than fit in the page query, the remaining nested pages
// are fetched before the product is yielded, so nothing is silently truncated.
//
// Page sizes keep requestedQueryCost well under the 1000-point single-query limit:
// roughly products × (1 + variants + media) = 10 × (1 + 50 + 20) ≈ 710.
import type { Logger } from "@/lib/logger";
import { shopifyGraphQL } from "./client";

const PRODUCTS_PER_PAGE = 10;
const VARIANTS_PER_PAGE = 50;
const MEDIA_PER_PAGE = 20;

interface PageInfo {
  hasNextPage: boolean;
  endCursor: string | null;
}
interface Connection<T> {
  pageInfo: PageInfo;
  nodes: T[];
}

export interface ShopifyVariant {
  id: string;
  title: string;
  sku: string | null;
  price: string; // Money scalar: decimal string, never parsed as a float
  compareAtPrice: string | null;
  inventoryQuantity: number | null;
  availableForSale: boolean;
  selectedOptions: Array<{ name: string; value: string }>;
}

export interface ShopifyImage {
  id: string;
  url: string;
  altText: string | null;
}

export interface ShopifyProduct {
  id: string;
  handle: string;
  title: string;
  descriptionHtml: string;
  status: string;
  options: Array<{ name: string; position: number; values: string[] }>;
  variants: ShopifyVariant[];
  images: ShopifyImage[];
}

// Non-image media (video, 3D) match no fragment and arrive as {}.
type RawMedia = { id?: string; alt?: string | null; image?: { url: string; altText: string | null } | null };
type RawProduct = Omit<ShopifyProduct, "variants" | "images"> & {
  variants: Connection<ShopifyVariant>;
  media: Connection<RawMedia>;
};

const VARIANT_FIELDS = `id title sku price compareAtPrice inventoryQuantity availableForSale selectedOptions { name value }`;
const MEDIA_FIELDS = `... on MediaImage { id alt image { url altText } }`;

const PRODUCTS_QUERY = `
query SyncProductsPage($first: Int!, $after: String) {
  products(first: $first, after: $after, sortKey: ID) {
    pageInfo { hasNextPage endCursor }
    nodes {
      id handle title descriptionHtml status
      options { name position values }
      variants(first: ${VARIANTS_PER_PAGE}) { pageInfo { hasNextPage endCursor } nodes { ${VARIANT_FIELDS} } }
      media(first: ${MEDIA_PER_PAGE}) { pageInfo { hasNextPage endCursor } nodes { ${MEDIA_FIELDS} } }
    }
  }
}`;

const VARIANTS_QUERY = `
query ProductVariantsPage($id: ID!, $after: String) {
  product(id: $id) {
    variants(first: ${VARIANTS_PER_PAGE}, after: $after) { pageInfo { hasNextPage endCursor } nodes { ${VARIANT_FIELDS} } }
  }
}`;

const MEDIA_QUERY = `
query ProductMediaPage($id: ID!, $after: String) {
  product(id: $id) {
    media(first: ${MEDIA_PER_PAGE}, after: $after) { pageInfo { hasNextPage endCursor } nodes { ${MEDIA_FIELDS} } }
  }
}`;

/** Follows a nested connection's cursor until exhausted. Throws if the product vanished mid-scan. */
async function drain<T>(
  first: Connection<T>,
  fetchPage: (after: string) => Promise<Connection<T> | undefined>,
): Promise<T[]> {
  const all = [...first.nodes];
  let pageInfo = first.pageInfo;
  while (pageInfo.hasNextPage && pageInfo.endCursor) {
    const next = await fetchPage(pageInfo.endCursor);
    // A missing product here would leave a partial variant list; fail the scan instead.
    if (!next) throw new Error("Product disappeared during nested pagination");
    all.push(...next.nodes);
    pageInfo = next.pageInfo;
  }
  return all;
}

function toImages(media: RawMedia[]): ShopifyImage[] {
  return media
    .filter((m): m is Required<Pick<RawMedia, "id">> & RawMedia => Boolean(m.id && m.image?.url))
    .map((m) => ({ id: m.id, url: m.image!.url, altText: m.image!.altText ?? m.alt ?? null }));
}

export interface ProductPage {
  pageNumber: number;
  products: ShopifyProduct[];
}

/** Iterates the whole catalog one page at a time. Any error aborts the iteration. */
export async function* fetchAllProducts(log?: Logger): AsyncGenerator<ProductPage> {
  let after: string | null = null;
  for (let pageNumber = 1; ; pageNumber++) {
    const data: { products: Connection<RawProduct> } = await shopifyGraphQL(
      PRODUCTS_QUERY,
      { first: PRODUCTS_PER_PAGE, after },
      { log, operation: "products" },
    );

    const products: ShopifyProduct[] = [];
    for (const raw of data.products.nodes) {
      const variants = await drain(raw.variants, async (cursor) => {
        const r = await shopifyGraphQL<{ product: { variants: Connection<ShopifyVariant> } | null }>(
          VARIANTS_QUERY,
          { id: raw.id, after: cursor },
          { log, operation: "product.variants" },
        );
        return r.product?.variants;
      });
      const media = await drain(raw.media, async (cursor) => {
        const r = await shopifyGraphQL<{ product: { media: Connection<RawMedia> } | null }>(
          MEDIA_QUERY,
          { id: raw.id, after: cursor },
          { log, operation: "product.media" },
        );
        return r.product?.media;
      });
      products.push({
        id: raw.id,
        handle: raw.handle,
        title: raw.title,
        descriptionHtml: raw.descriptionHtml,
        status: raw.status,
        options: raw.options,
        variants,
        images: toImages(media),
      });
    }

    yield { pageNumber, products };

    if (!data.products.pageInfo.hasNextPage) return;
    after = data.products.pageInfo.endCursor;
  }
}
