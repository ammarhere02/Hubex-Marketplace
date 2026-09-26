# src/app/ — context for Claude

- Phase 7 UI: layout.tsx imports vendored AdminLTE CSS (src/vendor) + globals.css theme (mm-* classes, MegaMart-inspired). _components/: site-header (categories via connection()), cart-badge, site-footer, product-card. / = home (banner, deals-or-new-arrivals, categories, grid). products/[handle]/product-detail.tsx = React e-commerce.html conversion (options→variant, gallery, tabs; no jQuery). Run `npx next typegen` if PageProps route types are missing.
- Rules: product reads come from MySQL via Prisma only — never Shopify in a request. Route handlers stay thin and delegate to `src/lib`/`src/jobs`.
- cart/: cart-store.ts (localStorage, {variantId, quantity} only, useSyncExternalStore), actions.ts (quoteCart, checkoutAction → lib/checkout.ts), cart-view.tsx. checkout/, orders/[publicId]/ (confirmation, clears cart).
- Checkout must re-price from DB, validate server-side, and enqueue after commit (outbox for recovery).
- AdminLTE: React owns gallery/variant behavior; no jQuery for those interactions.
