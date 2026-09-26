# src/app/ — context for Claude

- Still the create-next-app starter (page.tsx, page.module.css, globals.css). Basic listing/detail in Phase 4; AdminLTE layout in Phase 10.
- Rules: product reads come from MySQL via Prisma only — never Shopify in a request. Route handlers stay thin and delegate to `src/lib`/`src/jobs`.
- Checkout must re-price from DB, validate server-side, and enqueue after commit (outbox for recovery).
- AdminLTE: React owns gallery/variant behavior; no jQuery for those interactions.
