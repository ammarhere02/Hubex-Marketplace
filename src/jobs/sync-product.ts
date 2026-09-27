// sync-product: refreshes ONE product after a Shopify webhook.
//
// The webhook payload is only a hint ("product X changed"). We fetch the product's
// current state from Shopify instead of trusting the payload, so late or out-of-order
// deliveries cannot overwrite newer data. Not found → deleted in Shopify → hidden here.
// The scheduled full sync remains the safety net for missed webhooks.
import { UnrecoverableError } from "bullmq";
import { prisma } from "@/lib/prisma";
import { fetchProductById } from "@/lib/shopify";
import type { JobDefinition } from "./run-job";
import { upsertProduct } from "./sync-products";

export const syncProductJob: JobDefinition = {
  entityId: (job) => String(job.data?.shopifyProductId),

  async handler({ job, attempt, log }) {
    const receiptId = Number(job.data?.receiptId);
    const shopifyProductId = String(job.data?.shopifyProductId ?? "");
    if (!shopifyProductId.startsWith("gid://shopify/Product/")) {
      throw new UnrecoverableError(`Invalid product ID "${shopifyProductId}"`);
    }

    try {
      const product = await fetchProductById(shopifyProductId, log);
      let productId: number | null = null;
      if (product) {
        await upsertProduct(product, new Date());
        productId = (await prisma.product.findUnique({ where: { shopifyId: product.id }, select: { id: true } }))!.id;
        log.info({ productId, status: product.status, variants: product.variants.length }, "product refreshed from webhook");
      } else {
        const existing = await prisma.product.findUnique({ where: { shopifyId: shopifyProductId }, select: { id: true } });
        if (existing) {
          productId = existing.id;
          await prisma.$transaction([
            prisma.product.update({ where: { id: existing.id }, data: { isRemoved: true } }),
            prisma.productVariant.updateMany({ where: { productId: existing.id }, data: { isRemoved: true } }),
          ]);
        }
        log.info({ productId }, "product no longer in Shopify; marked removed");
      }

      await prisma.webhookReceipt.update({
        where: { id: receiptId },
        data: { status: "PROCESSED", productId, processedAt: new Date(), error: null },
      });
      return { productId, removed: !product };
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      // Only the last attempt marks the receipt FAILED; earlier ones stay RECEIVED for retry.
      const final = err instanceof UnrecoverableError || attempt >= (job.opts.attempts ?? 1);
      await prisma.webhookReceipt
        .update({
          where: { id: receiptId },
          data: { ...(final && { status: "FAILED" as const }), error: err.message.slice(0, 60_000) },
        })
        .catch((e) => log.error({ err: e }, "could not update webhook receipt"));
      throw err;
    }
  },
};
