# API and request documentation

This project has a customer-facing Next.js app, one explicit webhook HTTP route, and server functions called by React components. Shopify Admin GraphQL calls are made by server-side code and the separate worker. There is no public product or checkout REST API.

## Customer pages

| URL | Next.js file | Server-side work |
|---|---|---|
| `/` | `src/app/page.tsx` | Reads products and categories from MySQL for the home page. |
| `/products?page=1&category=...` | `src/app/products/page.tsx` | Calls `listProducts` and `listCategories`; 12 products per page. |
| `/products/[handle]` | `src/app/products/[handle]/page.tsx` | Calls `getProductByHandle`; passes images, options, and variants to the browser's `ProductDetail`. |
| `/cart` | `src/app/cart/page.tsx` | Renders `CartView`; the browser requests a server-side price quote. |
| `/checkout` | `src/app/checkout/page.tsx` | Renders the checkout form and cart summary. |
| `/orders/[publicId]` | `src/app/orders/[publicId]/page.tsx` | Reads the saved order and displays `PENDING_SYNC`, `SYNCED`, or `FAILED`. |

Product listing and detail reads go through `src/lib/catalog.ts` and Prisma into MySQL. Shopify is not called during those page requests. The `publicId` in the order URL is random rather than the sequential database ID.

## Browser-to-server functions

`src/app/cart/actions.ts` starts with `"use server"`. Next.js handles calls to these functions; they are not hand-written REST routes.

| Function | Sent by browser | Server behavior | Returned to browser |
|---|---|---|---|
| `quoteCart(input)` | Variant IDs and quantities | Validates input, then `priceCart` reads current prices and availability from MySQL. | Priced lines, subtotal, and item problems. Decimal values are serialized as strings. |
| `checkoutAction(previousState, formData)` | Cart IDs/quantities, contact and delivery fields, COD method | Validates with Zod, calls `placeOrder`, and redirects on success. | Field/cart errors, or redirect to `/orders/[publicId]`. |

`placeOrder` in `src/lib/checkout.ts` rechecks active variants, stock, and prices inside a MySQL transaction. It saves an `Order` as `PENDING_SYNC` with `OrderItem` price snapshots, then queues `submit-order` in Redis. The confirmation does not wait for Shopify. The cart is kept in browser `localStorage` as IDs and quantities only; server prices are authoritative.

## Shopify webhook HTTP route

**`POST /api/webhooks/shopify`** is implemented by `src/app/api/webhooks/shopify/route.ts` for `products/create`, `products/update`, and `products/delete`.

The route reads the raw request body, checks `X-Shopify-Hmac-Sha256` with the app secret, and uses `X-Shopify-Event-Id` (falling back to the webhook ID header) to create one `WebhookReceipt` per delivery. It extracts the Shopify product ID and queues a `sync-product` job. A duplicate delivery returns `200` without a second job. An invalid signature returns `401`; a database receipt error returns `500`. If enqueueing fails after the receipt is saved, the route returns `200`; the scheduled full sync is the catalog safety net. The worker fetches the product's current state from Shopify instead of trusting the webhook body.

The subscription is configured in `shopify.app.toml` with relative URI `/api/webhooks/shopify`. Delivery requires that `application_url` point to a reachable HTTPS web process. The current configuration names a development tunnel; change and release the configuration for any permanent hosted URL.

## Shopify Admin GraphQL

`src/lib/shopify/client.ts` exchanges the app credentials for a token, caches it until shortly before expiry, sends Admin GraphQL requests, and handles cost limits, throttling, and errors. The worker uses `src/lib/shopify/products.ts` for product reads and `src/lib/shopify/orders.ts` for unpaid COD order creation and existing-order lookup. The manual `npm run verify:shopify` command makes a read-only shop query.

`submit-order` checks for an existing Shopify order by the locally assigned custom ID before a create attempt. The worker stores the returned Shopify ID locally and marks the order `SYNCED`; errors and retries are recorded in `JobLog`. See `docs/design-note.md` for the recovery reasoning.

## Manual and scheduled triggers

`npm run sync:products -- --wait` queues a full catalog sync and waits for its result. The worker also schedules `sync-products` at `SYNC_INTERVAL_MINUTES` and `sweep-orders` every minute. `npm run job:ping` is a diagnostic queue job.
