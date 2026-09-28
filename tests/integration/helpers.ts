// Shared helpers for integration tests. Runs against hubex_marketplace_test
// (see tests/setup/integration-env.ts) — never the development database.
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";

export const dec = (v: string | number) => new Prisma.Decimal(v);

/** Empties every table between tests (FK-safe order). */
export async function resetDb(): Promise<void> {
  await prisma.session.deleteMany();
  await prisma.user.deleteMany();
  await prisma.orderItem.deleteMany();
  await prisma.order.deleteMany();
  await prisma.webhookReceipt.deleteMany();
  await prisma.productImage.deleteMany();
  await prisma.productVariant.deleteMany();
  await prisma.product.deleteMany();
  await prisma.jobLog.deleteMany();
}

let seq = 0;
export function nextId(): number {
  return ++seq + Math.floor(Date.now() % 1_000_000) * 100;
}

export async function seedProduct(over: {
  status?: "ACTIVE" | "DRAFT" | "ARCHIVED";
  isRemoved?: boolean;
  productType?: string;
  variants?: Array<{
    price: string;
    compareAtPrice?: string | null;
    inventoryQuantity?: number;
    availableForSale?: boolean;
    isRemoved?: boolean;
    title?: string;
  }>;
} = {}) {
  const id = nextId();
  return prisma.product.create({
    data: {
      shopifyId: `gid://shopify/Product/${id}`,
      handle: `product-${id}`,
      title: `Product ${id}`,
      descriptionHtml: "<p>desc</p>",
      status: over.status ?? "ACTIVE",
      productType: over.productType ?? "Shoes",
      options: [],
      isRemoved: over.isRemoved ?? false,
      lastSyncedAt: new Date(),
      images: {
        create: [{ shopifyId: `gid://shopify/MediaImage/${id}`, url: `https://cdn/${id}.jpg`, altText: null, position: 0 }],
      },
      variants: {
        create: (over.variants ?? [{ price: "100.00" }]).map((v, i) => ({
          shopifyId: `gid://shopify/ProductVariant/${id}-${i}`,
          title: v.title ?? `Variant ${i}`,
          sku: `SKU-${id}-${i}`,
          price: dec(v.price),
          compareAtPrice: v.compareAtPrice != null ? dec(v.compareAtPrice) : null,
          inventoryQuantity: v.inventoryQuantity ?? 10,
          availableForSale: v.availableForSale ?? true,
          selectedOptions: [],
          isRemoved: v.isRemoved ?? false,
        })),
      },
    },
    include: { variants: true, images: true },
  });
}

export const testCustomer = {
  customerName: "Ada Lovelace",
  phone: "+923001234567",
  address1: "12 Model Town",
  address2: null,
  city: "Lahore",
  province: null,
  zip: "54000",
  country: "PK",
  email: null,
  paymentMethod: "COD" as const,
};

export async function seedOrder(over: Partial<{ status: "PENDING_SYNC" | "SYNCED" | "FAILED"; attempts: number; createdAt: Date; variantId: number; shopifyVariantId: string }> = {}) {
  let variantId = over.variantId;
  let shopifyVariantId = over.shopifyVariantId;
  if (!variantId) {
    const p = await seedProduct();
    variantId = p.variants[0].id;
    shopifyVariantId = p.variants[0].shopifyId;
  }
  return prisma.order.create({
    data: {
      publicId: crypto.randomUUID(),
      status: over.status ?? "PENDING_SYNC",
      ...testCustomer,
      subtotal: dec("200.00"),
      total: dec("200.00"),
      currency: "PKR",
      attempts: over.attempts ?? 0,
      createdAt: over.createdAt,
      items: {
        create: [
          {
            variantId,
            shopifyVariantId: shopifyVariantId ?? "gid://shopify/ProductVariant/x",
            productTitle: "Product",
            variantTitle: "Variant",
            sku: "SKU",
            unitPrice: dec("100.00"),
            quantity: 2,
            lineTotal: dec("200.00"),
          },
        ],
      },
    },
    include: { items: true },
  });
}
