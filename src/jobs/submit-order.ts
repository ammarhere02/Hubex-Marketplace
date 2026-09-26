// submit-order: sends one committed local order to Shopify as an unpaid COD order.
//
// Every attempt:
//   1. Load the order. SYNCED → nothing to do. FAILED → stop.
//   2. attempts++ in MySQL (the 5-attempt limit is enforced by the DB, not by Redis).
//   3. LOOK UP by custom ID (hubex.order_id) before creating. A previous attempt may
//      have created the order even though we never got the reply; if so, adopt it.
//   4. Create. userErrors mean Shopify applied nothing — unless the error is the
//      custom-ID uniqueness check, so we look up once more before giving up.
//   5. SYNCED + shopifyOrderId, or FAILED + lastError when no retry remains.
import { UnrecoverableError } from "bullmq";
import { prisma } from "@/lib/prisma";
import { ShopifyError, ShopifyUserError } from "@/lib/shopify";
import { findOrderByCustomId, orderCreateCod, type ShopifyOrderRef } from "@/lib/shopify/orders";
import type { JobDefinition } from "./run-job";

export const SUBMIT_ORDER_MAX_ATTEMPTS = 5;

function splitName(full: string): { firstName: string; lastName: string } {
  const parts = full.trim().split(/\s+/);
  const lastName = parts.length > 1 ? parts.pop()! : parts[0];
  return { firstName: parts.join(" "), lastName };
}

export const submitOrderJob: JobDefinition = {
  entityId: (job) => String(job.data?.orderId),

  async handler({ job, attempt, log }) {
    const orderId = Number(job.data?.orderId);
    const order = await prisma.order.findUnique({ where: { id: orderId }, include: { items: true } });
    if (!order) throw new UnrecoverableError(`Order ${orderId} not found`);
    if (order.status === "SYNCED") {
      log.info({ shopifyOrderId: order.shopifyOrderId }, "order already synced; nothing to do");
      return { alreadySynced: true };
    }
    if (order.status === "FAILED") throw new UnrecoverableError(`Order ${orderId} is FAILED`);
    if (order.attempts >= SUBMIT_ORDER_MAX_ATTEMPTS) {
      await markFailed(orderId, order.lastError ?? "attempt limit reached");
      throw new UnrecoverableError(`Order ${orderId} used all ${SUBMIT_ORDER_MAX_ATTEMPTS} attempts`);
    }

    const { attempts } = await prisma.order.update({
      where: { id: orderId },
      data: { attempts: { increment: 1 }, submittedAt: new Date() },
      select: { attempts: true },
    });
    log.info({ orderAttempt: attempts }, "submitting order to Shopify");

    try {
      // Recovery check first: never create blindly.
      const existing = await findOrderByCustomId(order.publicId, log);
      if (existing) {
        log.warn({ shopifyOrder: existing.name }, "order already exists in Shopify; adopting it");
        return await markSynced(orderId, existing);
      }

      const result = await orderCreateCod(
        {
          localOrderId: orderId,
          publicId: order.publicId,
          currency: order.currency,
          shipping: {
            ...splitName(order.customerName),
            phone: order.phone,
            address1: order.address1,
            address2: order.address2,
            city: order.city,
            province: order.province,
            zip: order.zip,
            countryCode: order.country,
          },
          lines: order.items.map((i) => ({
            shopifyVariantId: i.shopifyVariantId,
            quantity: i.quantity,
            unitPrice: i.unitPrice.toFixed(2),
          })),
          total: order.total.toFixed(2),
        },
        log,
      );

      if (result.userErrors.length) {
        // Maybe the uniqueness check fired because an earlier create did succeed.
        const raced = await findOrderByCustomId(order.publicId, log);
        if (raced) return await markSynced(orderId, raced);
        throw new ShopifyUserError(result.userErrors);
      }
      if (!result.order) throw new Error("orderCreate returned neither an order nor userErrors");
      log.info({ shopifyOrder: result.order.name }, "shopify order created");
      return await markSynced(orderId, result.order);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      // Validation / GraphQL errors will not succeed on retry: stop now.
      const retryable = !(err instanceof UnrecoverableError) && !(err instanceof ShopifyError && !err.retryable);
      const lastChance = attempt >= (job.opts.attempts ?? 1) || attempts >= SUBMIT_ORDER_MAX_ATTEMPTS;
      if (!retryable || lastChance) {
        await markFailed(orderId, err.message);
        if (!retryable) throw new UnrecoverableError(err.message);
      } else {
        await prisma.order.update({ where: { id: orderId }, data: { lastError: err.message.slice(0, 60_000) } });
      }
      throw err;
    }
  },
};

async function markSynced(orderId: number, ref: ShopifyOrderRef) {
  await prisma.order.update({
    where: { id: orderId },
    data: {
      status: "SYNCED",
      shopifyOrderId: ref.id,
      shopifyOrderName: ref.name,
      syncedAt: new Date(),
      lastError: null,
    },
  });
  return { shopifyOrderId: ref.id, shopifyOrderName: ref.name };
}

async function markFailed(orderId: number, message: string) {
  await prisma.order.update({
    where: { id: orderId },
    data: { status: "FAILED", lastError: message.slice(0, 60_000) },
  });
}
