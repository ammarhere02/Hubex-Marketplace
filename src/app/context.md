# src/app/ — context for Claude

- / redirects to /products. products/ and products/[handle] are basic MySQL-backed views (Phase 4); AdminLTE + React e-commerce conversion in Phase 10. Run `npx next typegen` if PageProps route types are missing.
- Rules: product reads come from MySQL via Prisma only — never Shopify in a request. Route handlers stay thin and delegate to `src/lib`/`src/jobs`.
- Checkout must re-price from DB, validate server-side, and enqueue after commit (outbox for recovery).
- AdminLTE: React owns gallery/variant behavior; no jQuery for those interactions.
