// Phase 3 spike (dev store only). Proves, against the live API version:
//   A. the metafield definition with uniqueValues can be created;
//   B. orderCreate makes an unpaid (PENDING) COD order carrying our custom ID;
//   C. orderByIdentifier finds that order by custom ID (recovery lookup);
//   D. a second orderCreate with the same custom ID is rejected (no duplicate).
// Usage: npm run spike:cod -- <fake-local-order-id>   (fake customer data only)
import "dotenv/config";
import { logger } from "@/lib/logger";
import { shopifyGraphQL } from "@/lib/shopify";
import {
  ensureOrderIdDefinition,
  findOrderByCustomId,
  orderCreateCod,
  type CodOrderInput,
} from "@/lib/shopify/orders";

const log = logger.child({ component: "spike" });

async function main() {
  const localOrderId = Number(process.argv[2] ?? 900001);

  const def = await ensureOrderIdDefinition(log);
  log.info(def, "A. order-id metafield definition ready");

  const { shop, productVariants } = await shopifyGraphQL<{
    shop: { currencyCode: string };
    productVariants: { nodes: Array<{ id: string; price: string }> };
  }>(
    `query SpikeData { shop { currencyCode }
      productVariants(first: 1, query: "product_status:active") { nodes { id price } } }`,
    {},
    { log, operation: "spikeData" },
  );
  const variant = productVariants.nodes[0];
  if (!variant) throw new Error("No active variant on the store");

  const input: CodOrderInput = {
    localOrderId,
    currency: shop.currencyCode,
    shipping: {
      firstName: "Spike",
      lastName: "Test",
      phone: "+923001234567",
      address1: "1 Test Street",
      city: "Lahore",
      zip: "54000",
      countryCode: "PK",
    },
    lines: [{ shopifyVariantId: variant.id, quantity: 1, unitPrice: variant.price }],
    total: variant.price,
  };

  const before = await findOrderByCustomId(localOrderId, log);
  log.info({ found: before?.name ?? null }, "C0. lookup before create");

  if (!before) {
    const first = await orderCreateCod(input, log);
    log.info(
      { order: first.order, userErrors: first.userErrors },
      "B. first orderCreate",
    );
  }

  const found = await findOrderByCustomId(localOrderId, log);
  log.info({ found }, "C. lookup by custom ID after create");

  const second = await orderCreateCod(input, log);
  log.info(
    { order: second.order, userErrors: second.userErrors },
    "D. duplicate orderCreate with the same custom ID",
  );
}

main().catch((err) => {
  log.error({ err }, "spike failed");
  process.exit(1);
});
