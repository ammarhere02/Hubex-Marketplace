# Database documentation

MySQL holds the local catalog copy, customer orders, job attempt history, and webhook receipts. Prisma is the only database access layer; `prisma/schema.prisma` defines the models and `prisma/migrations/` contains the SQL migrations. Redis holds BullMQ jobs and schedules, not the product or order tables.

## Models and relationships

| Model | Key fields and purpose | Relationship |
|---|---|---|
| `Product` | Unique `shopifyId`, handle, title, description, status, type, options, `isRemoved`, `lastSyncedAt`. | One product has many variants and images. |
| `ProductVariant` | Unique `shopifyId`, selected options, SKU, Decimal price, inventory, availability, image reference, `isRemoved`. | Belongs to a product; referenced by historical order items. |
| `ProductImage` | Unique Shopify media ID, URL, alt text, position. | Belongs to a product. |
| `Order` | Random unique `publicId`, customer/delivery fields, Decimal totals, COD method, status, attempts, Shopify order ID/name, last error. | One order has many items. |
| `OrderItem` | Variant reference, quantity, title/SKU and Decimal unit-price/line-total snapshots. | Belongs to an order and references a variant. |
| `JobLog` | Queue/job names, job ID, attempt, entity ID, status, start/end timestamps, duration, error, `willRetry`. | One row per execution attempt. |
| `WebhookReceipt` | Unique Shopify event ID, topic, product ID, processing status and timestamps. | Optionally references the synced product. |

`Product.shopifyId` and `ProductVariant.shopifyId` are unique so a sync can upsert instead of creating duplicates. The storefront filters out removed, draft, and archived products. Removed variants keep their rows because older `OrderItem` records refer to them. Money is stored as `Decimal(10,2)`; item prices remain snapshots after catalog prices change.

## Order state

`PENDING_SYNC` means the order was committed to MySQL and awaits or is retrying Shopify submission. `SYNCED` means its Shopify ID was saved locally. `FAILED` means submission was rejected or the attempt limit was reached; `lastError` is retained for diagnosis. `Order.attempts` tracks attempts independently of Redis job retention.

## Migrations

| Migration | Change |
|---|---|
| `20260926104406_init` | Initial catalog, order, and JobLog tables. |
| `20260926153718_order_public_id` | Random public order identifier. |
| `20260926181905_product_type` | Product type for categories. |
| `20260927100850_webhook_receipts` | Webhook receipt tracking. |
| `20260928120000_variant_image` | Variant-specific Shopify image reference. |

For a fresh local database, start MySQL with `docker compose up -d`, then run `npm run db:deploy`. Use `npm run db:migrate` only when changing the schema during development. Do not edit migrations that have already been applied; create a new migration instead.

## Safe inspection queries

These aggregate queries avoid displaying customer details:

```sql
SELECT COUNT(*) AS products FROM Product WHERE status = 'ACTIVE' AND isRemoved = 0;
SELECT COUNT(*) AS variants FROM ProductVariant WHERE isRemoved = 0;
SELECT status, COUNT(*) AS orders FROM `Order` GROUP BY status;
SELECT jobName, status, COUNT(*) AS attempts FROM JobLog GROUP BY jobName, status;
SELECT status, COUNT(*) AS receipts FROM WebhookReceipt GROUP BY status;
```
