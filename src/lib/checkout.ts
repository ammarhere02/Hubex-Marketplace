// Checkout rules (server only). The browser sends only variant IDs and quantities;
// everything else — prices, titles, availability, totals — is read from MySQL here.
//
// Stock rule: a variant must be present, belong to a visible product, and have
// availableForSale. When Shopify reports a positive tracked quantity, the order may
// not exceed it. Zero/negative quantity with availableForSale=true means Shopify
// allows selling anyway (untracked or "continue selling"), so it is accepted.
import { randomUUID } from "node:crypto";
import { parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { env } from "./env";
import { logger, mask } from "./logger";
import { prisma } from "./prisma";
import { enqueueSubmitOrder } from "./queue";

export const MAX_QUANTITY = 99;
const MAX_LINES = 50;
const ENQUEUE_TIMEOUT_MS = 3_000;

// ---------- input schemas (untrusted) ----------

export const cartLinesSchema = z
  .array(
    z.object({
      variantId: z.number().int().positive(),
      quantity: z.number().int().min(1).max(MAX_QUANTITY),
    }),
  )
  .min(1, "Your cart is empty")
  .max(MAX_LINES);
export type CartLineInput = z.infer<typeof cartLinesSchema>[number];

const text = (max: number) => z.string().trim().min(1, "Required").max(max);
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => v || null);

export const customerSchema = z.object({
  customerName: text(255).refine((v) => v.includes(" "), "Enter first and last name"),
  // Checked against the delivery country below and stored in E.164 (+923001234567),
  // the format Shopify accepts. "923001234567" or "03001234567" are both normalised.
  phone: z.string().trim().min(1, "Required").max(32),
  address1: text(255),
  address2: optionalText(255),
  city: text(128),
  province: optionalText(128),
  zip: text(32),
  country: z
    .string()
    .trim()
    .toUpperCase()
    .pipe(z.string().regex(/^[A-Z]{2}$/, "Use a 2-letter country code, e.g. PK")),
  email: z
    .string()
    .trim()
    .transform((v) => v || null)
    .pipe(z.email("Enter a valid email").max(255).nullable()),
  paymentMethod: z.literal("COD", "Cash on Delivery is the only payment method"),
}).transform((data, ctx) => {
  const phone = parsePhoneNumberFromString(data.phone, data.country as CountryCode);
  if (!phone?.isValid()) {
    ctx.addIssue({ code: "custom", path: ["phone"], message: "Enter a valid phone number for the delivery country" });
    return z.NEVER;
  }
  return { ...data, phone: phone.number };
});
export type CustomerInput = z.infer<typeof customerSchema>;

// ---------- pricing ----------

export interface PricedLine {
  variantId: number;
  shopifyVariantId: string;
  productTitle: string;
  productHandle: string;
  variantTitle: string;
  sku: string | null;
  imageUrl: string | null;
  unitPrice: Prisma.Decimal;
  quantity: number;
  lineTotal: Prisma.Decimal;
}
export interface LineProblem {
  variantId: number;
  reason: "not_found" | "unavailable" | "insufficient_stock";
  available?: number;
}
export interface PricedCart {
  lines: PricedLine[];
  problems: LineProblem[];
  subtotal: Prisma.Decimal;
  currency: string;
}

type Db = Prisma.TransactionClient | typeof prisma;

/** Merges duplicate variant lines, then prices every line from the database. */
export async function priceCart(input: CartLineInput[], db: Db = prisma): Promise<PricedCart> {
  const merged = new Map<number, number>();
  for (const l of input) merged.set(l.variantId, Math.min(MAX_QUANTITY, (merged.get(l.variantId) ?? 0) + l.quantity));

  const variants = await db.productVariant.findMany({
    where: { id: { in: [...merged.keys()] } },
    include: {
      product: {
        select: {
          title: true,
          handle: true,
          status: true,
          isRemoved: true,
          images: { orderBy: { position: "asc" }, take: 1, select: { url: true } },
        },
      },
    },
  });
  const byId = new Map(variants.map((v) => [v.id, v]));

  const lines: PricedLine[] = [];
  const problems: LineProblem[] = [];
  for (const [variantId, quantity] of merged) {
    const v = byId.get(variantId);
    if (!v) {
      problems.push({ variantId, reason: "not_found" });
      continue;
    }
    if (v.isRemoved || !v.availableForSale || v.product.isRemoved || v.product.status !== "ACTIVE") {
      problems.push({ variantId, reason: "unavailable" });
      continue;
    }
    if (v.inventoryQuantity > 0 && quantity > v.inventoryQuantity) {
      problems.push({ variantId, reason: "insufficient_stock", available: v.inventoryQuantity });
      continue;
    }
    lines.push({
      variantId,
      shopifyVariantId: v.shopifyId,
      productTitle: v.product.title,
      productHandle: v.product.handle,
      variantTitle: v.title,
      sku: v.sku,
      imageUrl: v.product.images[0]?.url ?? null,
      unitPrice: v.price,
      quantity,
      lineTotal: v.price.mul(quantity),
    });
  }

  const subtotal = lines.reduce((sum, l) => sum.add(l.lineTotal), new Prisma.Decimal(0));
  return { lines, problems, subtotal, currency: env().SHOP_CURRENCY };
}

// ---------- placing the order ----------

export type PlaceOrderResult =
  | { ok: true; publicId: string; orderId: number; enqueued: boolean }
  | { ok: false; problems: LineProblem[] };

/**
 * 1. One MySQL transaction: re-price, re-check stock, insert Order (PENDING_SYNC)
 *    and OrderItems with price snapshots. Any problem → nothing is written.
 * 2. After COMMIT, enqueue submit-order. If Redis is down the order still exists
 *    as PENDING_SYNC and is picked up by the sweeper (Phase 9); the customer still
 *    gets a confirmation because their order IS recorded.
 */
export async function placeOrder(cart: CartLineInput[], customer: CustomerInput): Promise<PlaceOrderResult> {
  const log = logger.child({ component: "checkout" });

  const saved = await prisma.$transaction(async (tx) => {
    const priced = await priceCart(cart, tx);
    if (priced.problems.length || priced.lines.length === 0) return { problems: priced.problems };

    const order = await tx.order.create({
      data: {
        publicId: randomUUID(),
        status: "PENDING_SYNC",
        ...customer,
        subtotal: priced.subtotal,
        total: priced.subtotal, // no shipping/tax/discounts in this storefront
        currency: priced.currency,
        items: {
          create: priced.lines.map((l) => ({
            variantId: l.variantId,
            shopifyVariantId: l.shopifyVariantId,
            productTitle: l.productTitle,
            variantTitle: l.variantTitle,
            sku: l.sku,
            unitPrice: l.unitPrice,
            quantity: l.quantity,
            lineTotal: l.lineTotal,
          })),
        },
      },
      select: { id: true, publicId: true, total: true },
    });
    return { order, lineCount: priced.lines.length };
  });

  if ("problems" in saved) {
    log.info({ problems: saved.problems }, "checkout rejected: cart problems");
    return { ok: false, problems: saved.problems ?? [] };
  }

  const { order } = saved;
  log.info(
    { orderId: order.id, lines: saved.lineCount, total: order.total.toFixed(2), phone: mask(customer.phone) },
    "order saved PENDING_SYNC",
  );

  let enqueued = false;
  try {
    // BullMQ connections retry forever, so a down Redis would hang checkout: cap the wait.
    await Promise.race([
      enqueueSubmitOrder(order.id),
      new Promise((_, reject) => setTimeout(() => reject(new Error("enqueue timed out")), ENQUEUE_TIMEOUT_MS)),
    ]);
    enqueued = true;
    log.info({ orderId: order.id }, "submit-order enqueued");
  } catch (err) {
    // Committed but not queued: recoverable, because the order row is the source of truth.
    log.error({ err, orderId: order.id }, "enqueue failed; order stays PENDING_SYNC for the sweeper");
  }
  return { ok: true, publicId: order.publicId, orderId: order.id, enqueued };
}
