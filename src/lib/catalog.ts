// Storefront catalog reads. MySQL only: request handling never calls Shopify.
// "Visible" = ACTIVE in Shopify and still present at the last full sync.
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "./prisma";

export const PAGE_SIZE = 12;

const visibleProduct = { status: "ACTIVE", isRemoved: false } satisfies Prisma.ProductWhereInput;
const visibleVariant = { isRemoved: false } satisfies Prisma.ProductVariantWhereInput;

const cardSelect = {
  id: true,
  handle: true,
  title: true,
  productType: true,
  images: { orderBy: { position: "asc" }, take: 1, select: { url: true, altText: true } },
  variants: { where: visibleVariant, select: { price: true, compareAtPrice: true, availableForSale: true } },
} satisfies Prisma.ProductSelect;

type CardRow = Prisma.ProductGetPayload<{ select: typeof cardSelect }>;

/** Serializable card data: Decimals become strings for client components. */
export interface ProductCard {
  id: number;
  handle: string;
  title: string;
  category: string;
  image: { url: string; altText: string | null } | null;
  price: string | null;
  compareAtPrice: string | null;
  saveAmount: string | null;
  discountPercent: number | null;
  available: boolean;
}

function toCard({ variants, images, productType, ...p }: CardRow): ProductCard {
  // The cheapest variant is the "from" price; its compare-at price (if higher) is the deal.
  const cheapest = variants.reduce<CardRow["variants"][number] | null>(
    (min, v) => (!min || v.price.lt(min.price) ? v : min),
    null,
  );
  const compare = cheapest?.compareAtPrice && cheapest.compareAtPrice.gt(cheapest.price) ? cheapest.compareAtPrice : null;
  return {
    ...p,
    category: productType,
    image: images[0] ?? null,
    price: cheapest ? cheapest.price.toFixed(2) : null,
    compareAtPrice: compare ? compare.toFixed(2) : null,
    saveAmount: compare && cheapest ? compare.sub(cheapest.price).toFixed(2) : null,
    discountPercent:
      compare && cheapest ? Math.round(compare.sub(cheapest.price).div(compare).mul(100).toNumber()) : null,
    available: variants.some((v) => v.availableForSale),
  };
}

export async function listProducts({ page, category, search }: { page: number; category?: string; search?: string }) {
  const where: Prisma.ProductWhereInput = {
    ...visibleProduct,
    ...(category ? { productType: category } : {}),
    ...(search ? { title: { contains: search } } : {}),
  };
  const [total, rows] = await Promise.all([
    prisma.product.count({ where }),
    prisma.product.findMany({
      where,
      orderBy: { id: "asc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: cardSelect,
    }),
  ]);
  return { total, pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)), products: rows.map(toCard) };
}

/**
 * Products with a real compare-at discount, biggest first. When the store has
 * none, falls back to the newest products (flagged so the UI can title it honestly).
 */
export async function listDeals(limit = 5): Promise<{ products: ProductCard[]; hasDiscounts: boolean }> {
  const rows = await prisma.product.findMany({ where: visibleProduct, select: cardSelect });
  const cards = rows.map(toCard);
  const deals = cards.filter((c) => c.discountPercent).sort((a, b) => b.discountPercent! - a.discountPercent!);
  if (deals.length) return { products: deals.slice(0, limit), hasDiscounts: true };
  return { products: cards.sort((a, b) => b.id - a.id).slice(0, limit), hasDiscounts: false };
}

/** Categories (Shopify productType) that have visible products, with a sample image. */
export async function listCategories() {
  const groups = await prisma.product.groupBy({
    by: ["productType"],
    where: { ...visibleProduct, productType: { not: "" } },
    _count: { _all: true },
    orderBy: { productType: "asc" },
  });
  return Promise.all(
    groups.map(async (g) => {
      const sample = await prisma.productImage.findFirst({
        where: { product: { ...visibleProduct, productType: g.productType } },
        orderBy: [{ productId: "asc" }, { position: "asc" }],
        select: { url: true },
      });
      return { name: g.productType, count: g._count._all, imageUrl: sample?.url ?? null };
    }),
  );
}

export async function getProductByHandle(handle: string) {
  return prisma.product.findFirst({
    where: { ...visibleProduct, handle },
    include: {
      images: { orderBy: { position: "asc" } },
      variants: { where: visibleVariant, orderBy: { id: "asc" } },
    },
  });
}

export const formatPrice = (value: Prisma.Decimal) => value.toFixed(2);
