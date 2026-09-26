// Shopify order creation + duplicate detection (Phase 3 decision, docs/design.md).
//
// orderCreate does NOT document support for the @idempotent directive (checked
// 2026-07 docs; the supported list is inventory/refund/location mutations). So we
// give every Shopify order a custom ID: an ORDER metafield `hubex.order_id` of type `id`
// (Shopify requires this type for custom IDs) with the `uniqueValues` capability. That gives us:
//   1. lookup:    orderByIdentifier(customId) — a direct read, not a search index;
//   2. guarantee: Shopify rejects a second order carrying the same value.
// Recovery rule: before any create on a retry, look up first; adopt if found.
import type { Logger } from "@/lib/logger";
import { assertNoUserErrors, shopifyGraphQL } from "./client";

export const ORDER_ID_NAMESPACE = "hubex";
export const ORDER_ID_KEY = "order_id";
export const orderCustomId = (localOrderId: number) => `hubex-order-${localOrderId}`;

type UserErrors = Array<{ field?: string[] | null; message: string; code?: string | null }>;

// ---------- one-time setup: the unique metafield definition ----------

export async function ensureOrderIdDefinition(log?: Logger): Promise<{ id: string; created: boolean }> {
  const existing = await shopifyGraphQL<{
    metafieldDefinitions: {
      nodes: Array<{ id: string; type: { name: string }; capabilities: { uniqueValues: { enabled: boolean } } }>;
    };
  }>(
    `query OrderIdDefinition {
      metafieldDefinitions(first: 1, ownerType: ORDER, namespace: "${ORDER_ID_NAMESPACE}", key: "${ORDER_ID_KEY}") {
        nodes { id type { name } capabilities { uniqueValues { enabled } } }
      }
    }`,
    {},
    { log, operation: "metafieldDefinitions" },
  );
  const found = existing.metafieldDefinitions.nodes[0];
  if (found) {
    // Custom IDs (orderByIdentifier) require type "id" with unique values.
    if (found.type.name !== "id" || !found.capabilities.uniqueValues.enabled) {
      throw new Error(`hubex.order_id definition has type ${found.type.name}; expected unique "id"`);
    }
    return { id: found.id, created: false };
  }

  const res = await shopifyGraphQL<{
    metafieldDefinitionCreate: { createdDefinition: { id: string } | null; userErrors: UserErrors };
  }>(
    `mutation CreateOrderIdDefinition($definition: MetafieldDefinitionInput!) {
      metafieldDefinitionCreate(definition: $definition) {
        createdDefinition { id capabilities { uniqueValues { enabled } } }
        userErrors { field message code }
      }
    }`,
    {
      definition: {
        name: "Hubex marketplace order ID",
        namespace: ORDER_ID_NAMESPACE,
        key: ORDER_ID_KEY,
        ownerType: "ORDER",
        type: "id",
        description: "Local order ID; unique so an order can never be created twice.",
        capabilities: { uniqueValues: { enabled: true } },
      },
    },
    { log, operation: "metafieldDefinitionCreate" },
  );
  assertNoUserErrors(res.metafieldDefinitionCreate);
  return { id: res.metafieldDefinitionCreate.createdDefinition!.id, created: true };
}

// ---------- lookup ----------

export interface ShopifyOrderRef {
  id: string;
  name: string;
  displayFinancialStatus: string | null;
}

export async function findOrderByCustomId(localOrderId: number, log?: Logger): Promise<ShopifyOrderRef | null> {
  const res = await shopifyGraphQL<{ orderByIdentifier: ShopifyOrderRef | null }>(
    `query OrderByCustomId($namespace: String!, $key: String!, $value: String!) {
      orderByIdentifier(identifier: { customId: { namespace: $namespace, key: $key, value: $value } }) {
        id name displayFinancialStatus
      }
    }`,
    { namespace: ORDER_ID_NAMESPACE, key: ORDER_ID_KEY, value: orderCustomId(localOrderId) },
    { log, operation: "orderByIdentifier" },
  );
  return res.orderByIdentifier;
}

// ---------- create ----------

export interface CodOrderInput {
  localOrderId: number;
  currency: string;
  shipping: {
    firstName: string;
    lastName: string;
    phone: string;
    address1: string;
    address2?: string | null;
    city: string;
    province?: string | null;
    zip: string;
    countryCode: string;
  };
  lines: Array<{ shopifyVariantId: string; quantity: number; unitPrice: string }>;
  total: string;
}

// Email is deliberately not sent: the app declares only Name, Address and Phone as
// protected customer fields (data minimisation). The local Order still stores it.
export const COD_GATEWAY = "Cash on Delivery (COD)";

/** Raw orderCreate call. Returns userErrors instead of throwing so callers can inspect codes. */
export async function orderCreateCod(input: CodOrderInput, log?: Logger) {
  const money = (amount: string) => ({ shopMoney: { amount, currencyCode: input.currency } });
  const res = await shopifyGraphQL<{
    orderCreate: { order: (ShopifyOrderRef & { tags: string[] }) | null; userErrors: UserErrors };
  }>(
    `mutation CreateCodOrder($order: OrderCreateOrderInput!, $options: OrderCreateOptionsInput) {
      orderCreate(order: $order, options: $options) {
        order { id name displayFinancialStatus tags }
        userErrors { field message code }
      }
    }`,
    {
      order: {
        currency: input.currency,
        phone: input.shipping.phone,
        shippingAddress: input.shipping,
        billingAddress: input.shipping,
        lineItems: input.lines.map((l) => ({
          variantId: l.shopifyVariantId,
          quantity: l.quantity,
          priceSet: money(l.unitPrice), // our checkout snapshot, not Shopify's current price
        })),
        // Unpaid: one PENDING manual transaction for the full amount, collected on delivery.
        financialStatus: "PENDING",
        transactions: [
          { kind: "SALE", status: "PENDING", gateway: COD_GATEWAY, amountSet: money(input.total) },
        ],
        tags: ["hubex-marketplace", "cod"],
        note: `Cash on Delivery — collect ${input.total} ${input.currency}. Hubex order #${input.localOrderId}.`,
        metafields: [
          {
            namespace: ORDER_ID_NAMESPACE,
            key: ORDER_ID_KEY,
            type: "id",
            value: orderCustomId(input.localOrderId),
          },
        ],
      },
      options: { sendReceipt: false, sendFulfillmentReceipt: false },
    },
    { log, operation: "orderCreate" },
  );
  return res.orderCreate;
}
