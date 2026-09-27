# Hubex Marketplace

A customer-facing storefront backed by a Shopify development store. Shopify owns the
product catalog; a background worker copies it into MySQL, and the storefront reads
only from MySQL. Customers browse, add items to a cart, and check out with Cash on
Delivery. Orders are saved locally first and then submitted to Shopify in the
background as unpaid COD orders, with retries and duplicate protection.

- **Web:** Next.js 16 (App Router, TypeScript), styled with AdminLTE 3.2.0
- **Data:** MySQL 8.4 through Prisma 7 (migrations included)
- **Background jobs:** Redis 7.4 + BullMQ, run by a separate Node worker process
- **Shopify:** Admin GraphQL API (`2026-07`), server/worker side only
- **Logging:** Pino (JSON), plus a `JobLog` table with the history of every job attempt

The design reasoning (queues, sync, idempotency, trade-offs) is in
[docs/design-note.md](docs/design-note.md).

---

## Architecture

```
                         ┌──────────────── Shopify (Admin GraphQL API) ───────────────┐
                         │  catalog (source of truth)            orders (final home)  │
                         └───────▲──────────────┬───────────────────────▲─────────────┘
                     read catalog│   webhooks   │              orderCreate│
                                 │  (optional)  ▼                         │
┌──────────────┐  reads   ┌──────┴──────────────────┐   jobs   ┌─────────┴──────────┐
│   Browser    │─────────▶│   Web (Next.js)         │────────▶│  Redis (BullMQ)     │
│ cart in      │ checkout │ - pages read MySQL only │         └─────────┬──────────┘
│ localStorage │─────────▶│ - validates + prices    │                   │
└──────────────┘          │ - saves order, enqueues │         ┌─────────▼──────────┐
                          └──────────┬──────────────┘         │  Worker (Node)      │
                                     │                        │ - sync-products     │
                                     ▼                        │ - sync-product      │
                          ┌─────────────────────────┐◀────────│ - submit-order      │
                          │  MySQL (Prisma)         │         │ - sweep-orders      │
                          │ catalog copy, orders,   │         └────────────────────┘
                          │ JobLog, WebhookReceipt  │
                          └─────────────────────────┘
```

| Process | Responsibility |
|---|---|
| **Web** (`npm run dev`) | Renders the storefront from MySQL, validates checkout, saves orders, enqueues jobs, receives webhooks. It never runs jobs itself. |
| **Worker** (`npm run worker`) | Runs every job: catalog sync, single-product refresh, order submission and the recovery sweep. It is the only process that calls Shopify during normal operation. |
| **MySQL** | Local copy of the catalog. It is the source of truth for orders and for job history. |
| **Redis** | The job queue only. Everything important also exists in MySQL, so a lost job can be rebuilt. |

---

## Prerequisites

- **Node.js 22+** and npm
- **Docker** with Docker Compose, for MySQL and Redis
- A **Shopify development store**, with a custom app installed that has these Admin API scopes:
  `read_products`, `read_inventory`, `write_orders`.
  The app authenticates with the **client credentials grant**. The app and the store must
  belong to the same organization.
- Optional: **ngrok** (or another HTTPS tunnel) and the **Shopify CLI**, only if you want
  real-time product webhooks

---

## Setup

### 1. Install dependencies

```bash
npm install
```

`postinstall` also generates the Prisma client.

### 2. Configure environment

```bash
cp .env.example .env
```

Fill in `.env`:

| Variable | Description |
|---|---|
| `SHOPIFY_SHOP` | Store subdomain only, e.g. `my-dev-store` for `my-dev-store.myshopify.com` |
| `SHOPIFY_CLIENT_ID` / `SHOPIFY_CLIENT_SECRET` | From the app's settings in the Shopify Dev Dashboard |
| `SHOPIFY_API_VERSION` | Admin API version, `2026-07` |
| `SHOP_CURRENCY` | The store's currency code (e.g. `PKR`). The sync fails loudly if Shopify disagrees |
| `MYSQL_PASSWORD` / `MYSQL_ROOT_PASSWORD` | Any local passwords. `MYSQL_PASSWORD` must match the one inside `DATABASE_URL` |
| `DATABASE_URL` | `mysql://app:<MYSQL_PASSWORD>@127.0.0.1:3306/hubex_marketplace` |
| `REDIS_URL` | `redis://127.0.0.1:6379` |
| `SYNC_INTERVAL_MINUTES` | How often the catalog sync runs automatically (default `15`, `0` disables it) |
| `LOG_LEVEL` | `trace`, `debug`, `info` (default), `warn`, `error` |

`.env` is git-ignored. Credentials are only read on the server and in the worker. They
are never exposed to the browser and never logged.

### 3. Start MySQL and Redis

```bash
docker compose up -d
docker compose ps        # wait until both services show (healthy)
```

MySQL and Redis are bound to `127.0.0.1` only. Redis runs with AOF persistence, so
queued jobs survive a Redis restart.

### 4. Create the database schema

```bash
npm run db:deploy        # applies all migrations in prisma/migrations
```

If you are changing the schema during development, use `npm run db:migrate` instead.

### 5. Check the Shopify connection (read-only)

```bash
npm run verify:shopify
```

This command gets an access token and prints the shop name and product count. It prints no secrets.

### 6. Start the app

The web app and the worker each run in their own terminal:

```bash
# terminal 1: storefront + API
npm run dev              # http://localhost:3000

# terminal 2: background worker
npm run worker
```

### 7. Load the catalog

When the worker starts, it schedules a sync, but the first automatic sync only runs
after one interval has passed. Trigger one now:

```bash
npm run sync:products -- --wait
```

Open http://localhost:3000. The products are there.

---

## Everyday commands

| Command | What it does |
|---|---|
| `npm run dev` | Start the web app (development) |
| `npm run build` then `npm start` | Production build and serve |
| `npm run worker` | Start the background worker |
| `npm run sync:products` | Queue a full catalog sync and exit |
| `npm run sync:products -- --wait` | Queue a sync and wait for the result, including retries |
| `npm run db:deploy` | Apply migrations |
| `npm run db:migrate` | Create/apply a migration after editing `prisma/schema.prisma` |
| `npx prisma studio` | Browse the database in a web UI |
| `npm run verify:shopify` | Read-only Shopify connection check |
| `npm run typecheck` / `npm run lint` | TypeScript and ESLint |
| `docker compose down` | Stop MySQL and Redis (data is kept; add `-v` to wipe it) |

---

## How it works

### Catalog sync

- **`sync-products`** reads every product with cursor pagination (10 per page). For each
  product, it also follows its variant and image pages to the end, so nothing is silently
  truncated. The sync saves title, handle, description, status, options, images,
  variants, prices, SKU and inventory. Rows are upserted by their unique Shopify IDs.
- **When it runs:** automatically every `SYNC_INTERVAL_MINUTES` (a BullMQ job scheduler
  in Redis with a fixed ID, so restarts never duplicate it), and on demand with
  `npm run sync:products`.
- **Removed products:** only after a *fully successful* scan are products Shopify no longer
  returned marked `isRemoved`. If any page fails, the run throws before that step, so a
  partial failure never hides products. Archived and draft products stay in the database
  with their status, and the storefront shows only `ACTIVE` ones.
- **Rows are never hard-deleted.** Order items reference variants, so removed products and
  variants are flagged instead of deleted.
- **Retries:** 3 attempts in total, with exponential backoff (10 s, 20 s).
- **Rate limits:** the Shopify client reads each query's cost, waits when the bucket is low,
  and backs off on `THROTTLED` / HTTP 429.

### Real-time product updates (optional webhooks)

With webhooks registered, a product change in Shopify appears in the storefront within
seconds instead of on the next scheduled sync:

1. Shopify sends a signed `products/create|update|delete` webhook to
   `POST /api/webhooks/shopify`.
2. The route verifies the HMAC signature, records a `WebhookReceipt` row, queues a
   **`sync-product`** job and replies `200` straight away. `eventId` is unique, so a
   re-delivered webhook is ignored.
3. The worker fetches that product's *current* state from Shopify and does not trust the
   payload, so late or out-of-order deliveries can't overwrite newer data. It then upserts
   the product, or marks it removed if Shopify no longer has it.

The scheduled full sync stays in place as a safety net for missed webhooks.

**Setup:**
1. Start a tunnel to port 3000 with a fixed domain:
   `ngrok http --url=<your-domain> 3000`
2. Set `application_url` in `shopify.app.toml` to `https://<your-domain>`. The webhook
   subscription uses the relative URI `/api/webhooks/shopify`.
3. Run `shopify app deploy` once to register the subscriptions.

### Storefront

- **Listing** (`/products`): active products with image, title, price and availability;
  category filter (Shopify product type); pagination (12 per page).
- **Product detail** (`/products/[handle]`): AdminLTE's `e-commerce.html` converted to React.
  It has the main image and thumbnails, variant selectors, price and stock that update with
  the selected variant, Add to Cart, and a Description tab. React state drives the gallery,
  variants and tabs. No jQuery or Bootstrap JS is loaded.
- **Cart** (`/cart`): add, change quantity, remove, totals.
- **Checkout** (`/checkout`) → **Confirmation** (`/orders/[id]`).

**Why the cart lives in localStorage:** the cart survives page refreshes and navigation
without accounts, cookies or server sessions. It stores only `{ variantId, quantity }`,
because nothing in the browser is trusted. The cart page asks the server to price the
lines from MySQL, and checkout re-validates everything.

### Checkout and order submission

1. **Browser → server:** the checkout form sends only variant IDs, quantities and the
   customer details. It sends no prices or totals.
2. **Validation (server):** the cart shape is validated (whole-number quantities 1–99,
   at most 50 lines). Name, phone (validated for the delivery country and stored in E.164
   format), full address and optional email are validated too. Payment must be `COD`, the
   only method.
3. **One MySQL transaction:** the cart is re-priced from the database. Every variant must
   exist, be available and belong to an active product, and the quantity must be in stock.
   The `Order` (`PENDING_SYNC`) and its `OrderItem` price snapshots are saved together. All
   money is `Decimal`. If anything fails, nothing is written and the customer is shown what
   changed.
4. **After commit:** a `submit-order` job is queued, and the customer sees the
   confirmation page right away. It shows **"pending submission"** and updates by itself
   once the order reaches Shopify. The customer never waits for Shopify.
5. **Worker, `submit-order`:** before creating anything, it looks the order up in Shopify
   by our custom ID. If Shopify already has it, the worker adopts that order. Otherwise it
   calls `orderCreate` to create an **unpaid** order: a pending COD transaction, the
   tags `hubex-marketplace` and `cod`, a COD note, and the checkout prices. Shopify also
   decrements inventory.
6. **Outcome:** on success the order becomes `SYNCED` and the Shopify order ID/name are
   saved. Transient errors (network, 5xx, throttling) are retried, **5 attempts** in total
   (backoff 5 s, 10 s, 20 s, 40 s). Validation errors and exhausted attempts set `FAILED`
   and keep `lastError`.

| Order status | Meaning |
|---|---|
| `PENDING_SYNC` | Saved locally; waiting for (or retrying) Shopify submission |
| `SYNCED` | The order exists in Shopify (`shopifyOrderId`, `shopifyOrderName` set) |
| `FAILED` | Shopify rejected it or all attempts were used; see `lastError` |

**Recovery:** the **`sweep-orders`** job runs every minute. It re-queues any order that is
still `PENDING_SYNC` after 2 minutes without a live job. That covers Redis being down at
checkout, or a crash between the database commit and the enqueue. See the
[design note](docs/design-note.md) for why this and the Shopify-side lookup together
prevent both lost and duplicate orders.

---

## Logging and job history

- All logs are JSON (Pino) on stdout. Every job attempt logs start, progress, completion
  (with `durationMs`) and failure (message, stack, `willRetry`). Each line carries
  `jobName`, `jobId`, `attempt` and the related entity ID. Queue-level `completed`,
  `failed` and `stalled` events are logged too.
- Every attempt is also saved to the **`JobLog`** table (status, timestamps, duration,
  error, whether a retry follows), so the history survives restarts.
- Credentials are never logged. Customer phone numbers are masked, and full addresses and
  raw Shopify payloads are not logged.

Useful queries:

```sql
-- latest job attempts
SELECT jobName, jobId, attempt, status, durationMs, willRetry, startedAt
FROM JobLog ORDER BY id DESC LIMIT 20;

-- order submission state
SELECT id, status, attempts, shopifyOrderName, lastError, createdAt
FROM `Order` ORDER BY id DESC LIMIT 10;

-- webhook deliveries
SELECT id, topic, status, shopifyProductId, receivedAt, processedAt
FROM WebhookReceipt ORDER BY id DESC LIMIT 10;
```

Tip: pipe the worker through `npx pino-pretty` for readable local output.

---

## Project structure

```
src/
  app/                  Next.js routes (web process)
    products/           listing + product detail (React e-commerce page)
    cart/               cart page, cart store (localStorage), server actions
    checkout/           checkout form
    orders/[publicId]/  confirmation + status polling
    api/webhooks/shopify/  webhook receiver
  worker/               worker process entry: queues, events, schedules, shutdown
  jobs/                 job handlers: sync-products, sync-product, submit-order,
                        sweep-orders, and run-job (shared logging + JobLog wrapper)
  lib/                  shared infrastructure: env, logger, prisma, redis, queue,
                        checkout rules, catalog queries, money helpers
    shopify/            Admin GraphQL client (token, cost/throttle, errors),
                        product and order operations
  vendor/adminlte-3.2.0/  AdminLTE CSS
prisma/                 schema + migrations
scripts/                CLI entry points (manual sync, Shopify check)
docker-compose.yml      MySQL + Redis
shopify.app.toml        Shopify app config (scopes, webhook subscriptions)
docs/                   design note, screenshots
```

---

## Screenshots

The full flow is in [`docs/screenshots/`](docs/screenshots/): listing → product detail →
cart → checkout → confirmation (pending → synced) → the order in Shopify admin.

---

## Troubleshooting

| Symptom | Likely cause / fix |
|---|---|
| `Invalid environment configuration` on start | A variable in `.env` is missing or malformed. The message names it. |
| Storefront is empty | The catalog hasn't been synced yet: run `npm run sync:products -- --wait` with the worker running. |
| Orders stay `PENDING_SYNC` | The worker isn't running, or Redis is down. Start both. The sweeper re-queues stuck orders within about 3 minutes. |
| Sync fails with a currency mismatch | `SHOP_CURRENCY` doesn't match the store's currency. |
| Webhook requests return `401` | The signature didn't verify. Check that `SHOPIFY_CLIENT_SECRET` belongs to the app that registered the webhooks. |
| `prisma migrate dev` fails creating the shadow database | The MySQL volume predates `docker/mysql-init`. Run `docker compose down -v` and start again. |
