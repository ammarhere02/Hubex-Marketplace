# src/lib/ — context for Claude
- Import via `@/lib/...`. tsx resolves tsconfig paths for worker/scripts.
- queue.ts: BullMQ does not close connections passed in — closeQueues() quits them (otherwise CLIs hang).
- shopify/client.ts: retries only THROTTLED/429/one 401 refresh. Transport errors → ShopifyTransportError (outcomeUnknown=true) for the caller.
- shopify/orders.ts: duplicate prevention = ORDER metafield hubex.order_id, type `id` (Shopify requires `id` type for custom IDs), uniqueValues on. Definition gid://shopify/MetafieldDefinition/296520187966 on bhoe-1 (first attempt with single_line_text_field was deleted).
- shopify/products.ts: fetchAllProducts() async generator; 10 products/page, nested variants 50 / media 20, drained per product before yield (verified with variants=10 → same totals). Images come from `media` (MediaImage), not deprecated `images`.
- catalog.ts: storefront reads (ACTIVE && !isRemoved; variants !isRemoved). Web must use this, never lib/shopify.
