# Design (Phase 1)

## Components and ownership
| Component | Owns / does |
|---|---|
| Shopify | Source of truth for catalog; final home of orders |
| MySQL (via Prisma) | Local copy of catalog; source of truth for orders + job history |
| Redis (BullMQ) | Job queue only — a notification, never the only copy of anything |
| Web (Next.js) | Reads catalog from MySQL; validates checkout; saves order; enqueues |
| Worker (Node) | Talks to Shopify: syncs products, submits orders, runs sweeper |

## Flow 1 — Catalog sync
```
schedule / CLI ──> Redis: sync-products ──> Worker
Worker ──GraphQL (paginated)──> Shopify
Worker ──upsert by shopifyId──> MySQL (Product, ProductVariant, ProductImage)
Only after a FULL successful scan: mark products not seen as isRemoved
Web ──reads only MySQL──> storefront pages
```
Failure: a failed page fetch aborts the run (retry, 3 attempts); nothing is marked
removed because the scan was incomplete.

## Flow 2 — Order submission
```
Browser cart ──POST──> Web
Web: validate input, re-price from MySQL, check stock and that each variant is
     still active (not removed/unavailable) — otherwise reject the checkout
Web: TRANSACTION { Order(PENDING_SYNC) + OrderItems(snapshots) }
Web ──add job, custom ID submit-order-<orderId> (e.g. submit-order-42)──> Redis
Web ──> confirmation page ("pending submission")      (no Shopify call yet)

Worker <── Redis job
Worker: if a previous attempt's outcome is unknown → run the Phase 3 recovery
        check first; never create blindly
Worker ──create unpaid COD order──> Shopify
Worker ──> MySQL: SYNCED + shopifyOrderId   | retry (5 attempts total) → FAILED + lastError
```

### Key concept: a failed response is not a failed action
If the create request times out or the connection drops, Shopify may still have
saved the order — we just never heard back. So the worker records the attempt as
**outcome unknown** and, on the next attempt, must first determine whether the
order already exists. Only a definite "not created" (e.g. a validation error
returned by Shopify) allows another create. How to look it up (tag, note,
source identifier, search) is a **recovery approach to verify in Phase 3**
against current Shopify docs — it is not assumed to prevent duplicates yet.

### Sweeper (recovery for commit-then-crash-before-enqueue)
Runs every ~1 min in the worker. For each order `PENDING_SYNC` older than 2 min:
1. `queue.getJob("submit-order-<id>")`.
2. Job exists and is waiting/active/delayed → do nothing (it will run; BullMQ
   also ignores an add with an existing custom ID, so no second job appears).
3. Job exists and has failed with attempts exhausted → the worker's final-failure
   handler should already have set `FAILED`; the sweeper sets it if not. Never re-add.
4. No job (enqueue never happened, or job was cleaned up) → add it with
   `attempts = 5 - order.attempts`. `Order.attempts` is incremented in MySQL at the
   start of every attempt, so the five-attempt limit is enforced by the database,
   not by whichever Redis job happens to exist. If `order.attempts >= 5`, mark `FAILED`.

Custom IDs use `-`, not `:` (BullMQ reserves `:` in its Redis keys).

## Models
Relations: Product 1─* ProductVariant, Product 1─* ProductImage,
Order 1─* OrderItem, OrderItem *─1 ProductVariant, JobLog standalone.

- **Product**: id, shopifyId (unique), handle, title, descriptionHtml,
  status (ACTIVE/DRAFT/ARCHIVED), options Json, isRemoved, lastSyncedAt
- **ProductVariant**: id, shopifyId (unique), productId, title, sku?, price Decimal(10,2),
  compareAtPrice?, inventoryQuantity, availableForSale, isRemoved, selectedOptions Json
- **ProductImage**: id, shopifyId (unique), productId, url, altText?, position
- **Order**: id, status (PENDING_SYNC/SYNCED/FAILED), customerName, phone, address1,
  address2?, city, province?, zip, country, email?, subtotal, total (Decimal), currency,
  paymentMethod=COD, shopifyOrderId? (unique), attempts, lastError?, createdAt,
  submittedAt?, syncedAt?
- **OrderItem**: id, orderId, variantId, shopifyVariantId, productTitle, variantTitle, sku?,
  unitPrice, quantity, lineTotal (snapshots)
- **JobLog**: id, queueName, jobName, jobId, attempt, status (STARTED/COMPLETED/FAILED),
  entityId?, startedAt, finishedAt?, durationMs?, error?, willRetry

## Decisions
- Catalog rows are **never hard-deleted**. Archived/deleted products are hidden
  (`status`/`isRemoved`); deleted variants keep their row but get `isRemoved = true`
  and `availableForSale = false`, because OrderItems reference them. Checkout rejects them.
- Money is Decimal end to end; OrderItem prices are snapshots taken at checkout.
- Upserts key on Shopify IDs, so resync is idempotent.

## Phase 3 decisions (checked against 2026-07 docs + live dev store)
- **Mutation: `orderCreate`** (not draft orders): one call creates a real order with
  `financialStatus: PENDING`, a PENDING `SALE` transaction on gateway
  "Cash on Delivery (COD)", tags `hubex-marketplace, cod`, and a COD note. Line
  prices come from our checkout snapshot (`priceSet`). Requires `write_orders` and
  protected-customer-data access. Dev stores are limited to 5 orderCreate calls per minute.
- **No native idempotency for orderCreate.** Shopify's `@idempotent` directive is
  documented only for inventory/refund/location mutations, and orderCreate's
  description doesn't mention it. So a BullMQ job ID or a local
  `shopifyOrderId` check can't stop a duplicate when Shopify saved the order but the reply was lost.
- **Chosen recovery: a Shopify-side custom ID.** Every order carries metafield
  `hubex.order_id = hubex-order-<Order.publicId>` (a random UUID, not the
  auto-increment id: ids restart after a DB reset and would "find" an old Shopify order). Its definition is type `id` (Shopify requires
  this type for custom IDs) with `uniqueValues` enabled.
  - Before creating (on every attempt), the worker calls
    `orderByIdentifier(customId: …)`. This is a direct lookup, not the eventually
    consistent search index. If an order is found, the worker adopts its ID and marks it `SYNCED`.
  - Otherwise it creates. The unique constraint is the backstop: if two creates ever
    race, Shopify rejects the second one (to be confirmed in the spike, step D).
- Error handling: `ShopifyTransportError` (timeout/5xx/unreadable body) means the
  outcome is unknown and the job retries (look up first). THROTTLED/429 waits inside the
  client and never ran. `userErrors` and GraphQL errors are definite rejections.
