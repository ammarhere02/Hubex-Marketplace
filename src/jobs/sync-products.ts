// sync-products: copies the Shopify catalog into MySQL.
//
// 1. Scan: every product (any status) is upserted by shopifyId, one transaction
//    per product, stamped with this run's `runStartedAt`.
// 2. Reconcile — ONLY after the scan finished without error: products whose
//    lastSyncedAt is older than this run were not returned by Shopify (deleted),
//    so they are marked isRemoved. If any page fails, the job throws before this
//    step and nothing is removed; the retry rescans from the start.
//
// Variants/images are reconciled per product during the scan. That is safe because
// fetchAllProducts only yields a product once ALL its nested pages were read.
// Archived/draft products stay in MySQL with their status; the storefront filters them.
import { UnrecoverableError } from "bullmq";
import { Prisma, ProductStatus } from "@/generated/prisma/client";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { fetchAllProducts, fetchShopCurrency, type ShopifyProduct } from "@/lib/shopify";
import type { JobDefinition } from "./run-job";

function toStatus(status: string): ProductStatus {
  if (status === "ACTIVE") return ProductStatus.ACTIVE;
  if (status === "ARCHIVED") return ProductStatus.ARCHIVED;
  // DRAFT and any status added by a later API version are treated as not sellable.
  return ProductStatus.DRAFT;
}

export async function upsertProduct(p: ShopifyProduct, runStartedAt: Date): Promise<void> {
  const fields = {
    handle: p.handle,
    title: p.title,
    descriptionHtml: p.descriptionHtml,
    status: toStatus(p.status),
    productType: p.productType.trim(),
    options: p.options as unknown as Prisma.InputJsonValue,
    colors: p.colors as unknown as Prisma.InputJsonValue,
    isRemoved: false,
    lastSyncedAt: runStartedAt,
  };

  await prisma.$transaction(async (tx) => {
    const product = await tx.product.upsert({
      where: { shopifyId: p.id },
      create: { shopifyId: p.id, ...fields },
      update: fields,
    });

    for (const v of p.variants) {
      const data = {
        productId: product.id,
        title: v.title,
        sku: v.sku || null,
        price: new Prisma.Decimal(v.price),
        compareAtPrice: v.compareAtPrice ? new Prisma.Decimal(v.compareAtPrice) : null,
        inventoryQuantity: v.inventoryQuantity ?? 0,
        availableForSale: v.availableForSale,
        selectedOptions: v.selectedOptions as unknown as Prisma.InputJsonValue,
        imageShopifyId: v.imageId,
        isRemoved: false,
      };
      await tx.productVariant.upsert({ where: { shopifyId: v.id }, create: { shopifyId: v.id, ...data }, update: data });
    }
    // Variants are referenced by OrderItems, so they are flagged, never deleted.
    await tx.productVariant.updateMany({
      where: { productId: product.id, shopifyId: { notIn: p.variants.map((v) => v.id) }, isRemoved: false },
      data: { isRemoved: true },
    });

    for (const [position, img] of p.images.entries()) {
      const data = { productId: product.id, url: img.url, altText: img.altText, position };
      await tx.productImage.upsert({ where: { shopifyId: img.id }, create: { shopifyId: img.id, ...data }, update: data });
    }
    // Images have no dependants, so removed ones are deleted outright.
    await tx.productImage.deleteMany({
      where: { productId: product.id, shopifyId: { notIn: p.images.map((i) => i.id) } },
    });
  });
}

export const syncProductsJob: JobDefinition = {
  async handler({ job, log }) {
    // Same value stamped on every product this run; MySQL DATETIME(3) keeps the milliseconds.
    const runStartedAt = new Date();
    // Prices are stored without a currency column, so a mismatch would mislabel every price.
    const currency = await fetchShopCurrency(log);
    if (currency !== env().SHOP_CURRENCY) {
      throw new UnrecoverableError(`Shop currency is ${currency} but SHOP_CURRENCY is ${env().SHOP_CURRENCY}`);
    }
    let products = 0;
    let variants = 0;
    let images = 0;

    for await (const page of fetchAllProducts(log)) {
      for (const p of page.products) {
        await upsertProduct(p, runStartedAt);
        variants += p.variants.length;
        images += p.images.length;
      }
      products += page.products.length;
      log.info({ page: page.pageNumber, pageSize: page.products.length, products }, "sync page stored");
      await job.updateProgress({ page: page.pageNumber, products });
    }

    // Full scan succeeded: anything not stamped by this run no longer exists in Shopify.
    const stale = await prisma.product.findMany({
      where: { lastSyncedAt: { lt: runStartedAt }, isRemoved: false },
      select: { id: true },
    });
    if (stale.length) {
      const ids = stale.map((s) => s.id);
      await prisma.$transaction([
        prisma.product.updateMany({ where: { id: { in: ids } }, data: { isRemoved: true } }),
        prisma.productVariant.updateMany({ where: { productId: { in: ids } }, data: { isRemoved: true } }),
      ]);
    }

    const summary = { products, variants, images, removed: stale.length };
    log.info(summary, "catalog scan complete, reconciled");
    return summary;
  },
};
