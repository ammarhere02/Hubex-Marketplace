// Storefront catalog reads. MySQL only: request handling never calls Shopify.
// "Visible" = ACTIVE in Shopify and still present at the last full sync.
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "./prisma";

export const PAGE_SIZE = 12;

const visibleProduct = { status: "ACTIVE", isRemoved: false } satisfies Prisma.ProductWhereInput;
const visibleVariant = { isRemoved: false } satisfies Prisma.ProductVariantWhereInput;

export async function listProducts(page: number) {
  const [total, products] = await Promise.all([
    prisma.product.count({ where: visibleProduct }),
    prisma.product.findMany({
      where: visibleProduct,
      orderBy: { id: "asc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        handle: true,
        title: true,
        images: { orderBy: { position: "asc" }, take: 1, select: { url: true, altText: true } },
        variants: { where: visibleVariant, select: { price: true, availableForSale: true } },
      },
    }),
  ]);

  return {
    total,
    pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)),
    products: products.map(({ variants, images, ...p }) => ({
      ...p,
      image: images[0] ?? null,
      // Decimal comparison, not float: the cheapest variant is the "from" price.
      minPrice: variants.reduce<Prisma.Decimal | null>((min, v) => (!min || v.price.lt(min) ? v.price : min), null),
      available: variants.some((v) => v.availableForSale),
    })),
  };
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
