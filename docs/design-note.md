# Design note

## Ownership: who holds the truth
- **Shopify** owns the catalog and is the final home of orders.
- **MySQL** holds a copy of the catalog for fast, Shopify-independent reads. It is the
  **source of truth for orders and job history**.
- **Redis/BullMQ** is only a to-do list. Nothing lives *only* in Redis, so anything lost
  there can be rebuilt from MySQL.
- The **web process** never calls Shopify during a request. The **worker** does all Shopify
  work, with retries.

## Queues and jobs
| Job | Trigger | Attempts | On final failure |
|---|---|---|---|
| `sync-products` | scheduler (every N min) + CLI | 3, exponential backoff | next scheduled run tries again |
| `sync-product` | webhook | 3 | the scheduled full sync corrects it |
| `submit-order` | checkout | 5, exponential backoff | order `FAILED` + `lastError` |
| `sweep-orders` | scheduler (every 1 min) | 1 | next sweep a minute later |

Errors are classified once in the Shopify client. **Transport** errors (timeout, 5xx,
unreadable body) retry. **Throttling** waits and retries inside the client. **GraphQL
errors and mutation `userErrors`** are definite rejections and are not retried. Each attempt
is logged and written to `JobLog`.

## Catalog sync
Full scan with cursor pagination, following nested variant/media pages to the end.
Upserts are keyed by Shopify IDs, so re-running a sync is harmless. **Reconciliation
(hiding products Shopify no longer returns) runs only after a completely successful
scan.** A failure on any page throws first, so an incomplete scan can never be read as
"these products were deleted". Webhooks add near-real-time updates. The job re-fetches the
product instead of trusting the payload, which makes out-of-order deliveries harmless.
The scheduled sync stays as the safety net.

## Checkout: trust nothing from the browser
The browser sends only variant IDs and quantities. Inside one transaction, the server
validates, re-prices from MySQL, checks availability and stock, and saves the order with
its item price snapshots (`Decimal`) as `PENDING_SYNC`. The confirmation page does not wait
for Shopify.

## Commit → enqueue gap
The MySQL commit and the Redis enqueue can't be one atomic step. If Redis is down, or the
process dies between them, the order exists without a job. Because the **order row itself
is the record**, the `sweep-orders` job re-derives the queue from it. Every minute it finds
`PENDING_SYNC` orders older than 2 minutes with no waiting/active/delayed job and queues
them again. This works as a lightweight outbox pattern without a separate outbox table.

## Idempotent order submission
A deterministic job ID (`submit-order-<id>`) prevents two *queued* jobs for one order, and a
local `shopifyOrderId` check skips orders already marked synced. **Neither helps when
Shopify created the order but the response, or our database update, was lost**, and the
retry would then create a duplicate. The Shopify docs do not document native idempotency for
`orderCreate`, so we don't rely on it. Instead:

1. Each order is created with a metafield `hubex.order_id` holding our random `publicId`.
   Its definition is a custom-ID type with **unique values** enforced by Shopify.
2. **Every attempt looks the order up by that ID first** (`orderByIdentifier`, a direct
   read rather than the search index). If found, it adopts the order and marks it `SYNCED`.
3. If two creates ever race, Shopify's uniqueness check rejects the second, and the worker
   looks up once more and adopts the winner.

The attempt limit is counted in MySQL (`Order.attempts`), so re-queued jobs from the
sweeper can never exceed 5 in total.

## Trade-offs and next steps
- **Polling + webhooks** rather than webhooks alone. It's simpler and self-healing, at the
  cost of a full scan every interval. For a large catalog, the next step is incremental
  sync (`updated_at` filters) or bulk operations.
- **Inventory is checked against the last synced value.** Shopify decrements stock when it
  creates the order, but two customers could buy the last unit between syncs. A real store
  would reserve stock or accept the oversell and cancel.
- **The cart is in localStorage.** This is simple and needs no accounts, but it doesn't
  follow the customer across devices.
- **No admin UI** for retrying `FAILED` orders. The state and errors are in MySQL, ready
  for one.
