# Phase 5 — Cart → checkout → order worker

Status: ☐ todo · 🔄 in progress · 🟡 built, awaiting browser check · ✅ done (verified, not just written)

- [x] ✅ Confirm Shopify order access is unblocked (orderByIdentifier found spike order #1005)
- [x] ✅ Shop currency: SHOP_CURRENCY=PKR in env; sync fails (unrecoverable) if Shopify disagrees
- [ ] 🟡 Cart: client-side, localStorage (IDs + quantities only; prices never trusted)
- [ ] 🟡 Add to Cart on the product page (variant select + quantity)
- [ ] 🟡 Cart page: quantity update, remove, totals re-priced from the server
- [x] ✅ Checkout validation (zod): name, phone, full address, optional email; COD only
- [x] ✅ Checkout server action: re-price from MySQL, check variant active + stock
- [x] ✅ Transactional save: Order PENDING_SYNC + OrderItem Decimal snapshots
- [x] ✅ Enqueue submit-order (job ID submit-order-<id>) after commit; tolerate enqueue failure
- [x] ✅ Confirmation page: shows "pending submission" vs "submitted"
- [x] ✅ submit-order job: attempts++ in MySQL, lookup-by-custom-ID before create, create, SYNCED
- [x] ✅ Final failure → FAILED + lastError (userErrors are not retryable)
- [x] ✅ Verify: one real order PENDING_SYNC → SYNCED, visible in Shopify admin as unpaid COD
- [x] ✅ Verify: tampered price / qty / variant ID rejected or re-priced
- [x] ✅ Fix: Shopify custom ID keyed on publicId (local ids repeat after a DB reset → false adoption)
- [x] ✅ Verify: lost reply (Shopify saved, we didn't hear) → worker adopts #1008, no duplicate
- [x] ✅ Verify: Shopify userError → FAILED after 1 attempt, JobLog willRetry=0
- [x] ✅ Fix (found in your browser test): phone accepted at checkout but rejected by Shopify ("923…" without +). Now parsed per country with libphonenumber-js, stored as E.164; invalid → form error
- [ ] 🟡 Confirmation page polls every 2s while PENDING_SYNC → shows SYNCED/FAILED without manual refresh
- [x] ✅ Migration: Order.publicId (unguessable confirmation URL) + shopifyOrderName
- [x] ✅ Update Phases.md + context.md files
- [ ] ☐ YOU: click through in a browser (add → cart → qty/remove → refresh → checkout → confirmation)
- [ ] ☐ Later (Phase 8): transient failure retried 5× → FAILED; (Phase 9) sweeper for commit-without-enqueue

# Phase 7 — Storefront UI: AdminLTE 3.2.0 styled after the MegaMart reference

Decisions (2026-09-26): AdminLTE stays the required base, MegaMart look layered on
top; real data only (no fake search/sign-in); categories = Shopify productType.

- [x] ✅ Install AdminLTE 3.2.0 (vendored CSS in src/vendor — npm package's install script is broken), Font Awesome 5.15.4
- [x] ✅ Sync productType (+ migration), resync: 39/397/392, 1 visible category
- [ ] 🟡 Shell: top bar, header (brand, category nav, cart count), blue footer
- [ ] 🟡 Home: promo banner, "Best deals" row (% OFF / Save), Top Categories circles, product grid
- [ ] 🟡 Listing: category filter + load more
- [ ] 🟡 Product detail: React conversion of e-commerce.html (gallery, variant selectors, price, Add to Cart, Description tab)
- [ ] 🟡 Cart, checkout, confirmation in AdminLTE cards
- [x] ✅ Verify: production build OK; all pages 200 (unknown product 404); screenshots of home/detail/cart checked; no jQuery on product page; typecheck/lint clean
- [x] ✅ Fix: footer hidden below the fold (AdminLTE min-height assumes a 3.5rem header) → flex column
- [ ] ☐ YOU: restart `npm run dev` (old Prisma client in memory → 500 on every page), then click through
