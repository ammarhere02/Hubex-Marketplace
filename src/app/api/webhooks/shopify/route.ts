// Shopify product webhooks. Web side only records and enqueues; the worker does the
// Shopify read and the MySQL update. Shopify expects a 2xx within 5 seconds and
// re-delivers otherwise, so this handler stays small.
//
//   1. Verify X-Shopify-Hmac-Sha256 over the RAW body with the app's client secret.
//   2. Insert WebhookReceipt keyed by X-Shopify-Event-Id; a duplicate → 200, no work.
//   3. Enqueue sync-product. If Redis is down we still return 200: the receipt stays
//      RECEIVED and the scheduled full sync picks up the change.
import { createHmac, timingSafeEqual } from "node:crypto";
import { Prisma } from "@/generated/prisma/client";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { enqueueSyncProduct } from "@/lib/queue";

const TOPICS = new Set(["products/create", "products/update", "products/delete"]);
const ENQUEUE_TIMEOUT_MS = 2_000;

function validHmac(rawBody: string, header: string | null): boolean {
  if (!header) return false;
  const expected = createHmac("sha256", env().SHOPIFY_CLIENT_SECRET).update(rawBody, "utf8").digest();
  const given = Buffer.from(header, "base64");
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export async function POST(request: Request): Promise<Response> {
  const log = logger.child({ component: "webhook" });
  const rawBody = await request.text();
  if (!validHmac(rawBody, request.headers.get("x-shopify-hmac-sha256"))) {
    log.warn("webhook rejected: invalid HMAC");
    return new Response("Unauthorized", { status: 401 });
  }

  const topic = request.headers.get("x-shopify-topic") ?? "";
  const eventId = request.headers.get("x-shopify-event-id") ?? request.headers.get("x-shopify-webhook-id") ?? "";
  if (!TOPICS.has(topic) || !eventId) {
    log.warn({ topic }, "webhook ignored: unexpected topic or missing event ID");
    return new Response(null, { status: 200 });
  }

  let productNumericId: string;
  try {
    const id = (JSON.parse(rawBody) as { id?: number | string }).id;
    if (!id || !/^\d+$/.test(String(id))) throw new Error("missing id");
    productNumericId = String(id);
  } catch {
    log.warn({ topic, eventId }, "webhook ignored: payload has no product id");
    return new Response(null, { status: 200 });
  }
  const shopifyProductId = `gid://shopify/Product/${productNumericId}`;
  const triggeredHeader = request.headers.get("x-shopify-triggered-at");
  const triggeredAt = triggeredHeader && !Number.isNaN(Date.parse(triggeredHeader)) ? new Date(triggeredHeader) : null;

  let receiptId: number;
  try {
    const receipt = await prisma.webhookReceipt.create({
      data: { eventId, topic, shopifyProductId, triggeredAt },
      select: { id: true },
    });
    receiptId = receipt.id;
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      log.info({ topic, eventId }, "duplicate webhook delivery ignored");
      return new Response(null, { status: 200 });
    }
    log.error({ err, topic, eventId }, "could not record webhook");
    return new Response("Error", { status: 500 }); // Shopify will re-deliver
  }

  try {
    await Promise.race([
      enqueueSyncProduct(receiptId, shopifyProductId),
      new Promise((_, reject) => setTimeout(() => reject(new Error("enqueue timed out")), ENQUEUE_TIMEOUT_MS)),
    ]);
    log.info({ topic, eventId, receiptId, shopifyProductId }, "webhook recorded and enqueued");
  } catch (err) {
    log.error({ err, receiptId }, "webhook recorded but enqueue failed; scheduled sync will catch up");
  }
  return new Response(null, { status: 200 });
}
