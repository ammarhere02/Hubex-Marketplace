# Build phases

Deadline: Monday 2026-09-28 (Monday = verification + submission only).
Each phase ends with: run it, trace DB/queue/log changes, one understanding check.
Status is updated only when the "Verify" column has been observed, not when code is written.

## Done
| # | Phase | Verified |
|---|---|---|
| 0 | Project base + Shopify connection (Next.js, app registration, install, `verify:shopify`) | ✅ 2026-09-26 |

## Today — Saturday 2026-09-26 (~7.5 h)
| # | Budget | Build with Claude | Learn & verify | Status |
|---|---|---|---|---|
| 1 | 30 min | **Design:** draw the two data flows (catalog sync, order submission) and outline the six models: Product, ProductVariant, ProductImage, Order, OrderItem, JobLog | Explain Product → Variant and Order → OrderItem. Name which component (web, worker, Shopify, MySQL, Redis) owns each action | ✅ docs/design.md |
| 2 | 60 min | **Infrastructure:** Docker Compose (MySQL + Redis), Prisma + first migration, env validation, Pino logger, BullMQ queue, separate worker process, initial `JobLog` persistence | Start web and worker independently. Run a small test job and find its history in logs + `JobLog` | ✅ ping ok + fail both in JobLog |
| 3 | 45 min | **Shopify spike:** shared server-only Admin GraphQL client (token cache, cost/throttle handling); check COD order creation (`orderCreate` vs draft order) against the current docs; **decide the recovery approach for unknown outcomes** (timeout ≠ failure) | Token + chosen mutation support an unpaid COD order; documented, doc-backed way to detect an order Shopify saved when our worker got no reply | 🟡 client + decision done; order create blocked on protected customer data access (dashboard) |
| 4 | 105 min | **Catalog sync + basic views:** manual sync (CLI) with cursor pagination incl. nested variants/images, upserts by Shopify IDs, reconcile only after full scan; basic MySQL-backed listing + detail | Follow one product from Shopify into its Product, Variant, Image rows. Resync → no duplicates; row counts unchanged | ✅ 39/397/392 stable across resync; nested pagination verified; archived → 404 |
| 5 | 120 min | **Cart → checkout → order worker:** persistent cart, server-validated checkout (re-price from DB, stock check), transactional save with Decimal snapshots + `PENDING_SYNC`, enqueue, `submit-order` worker | Follow one real order `PENDING_SYNC` → `SYNCED`; unpaid COD order visible in Shopify admin; tampered price/qty/variant ID rejected or re-priced | ✅ #1007 unpaid COD; tamper cases rejected; lost-reply adopted (no dup); userError → FAILED. Browser click-through by user pending |
| 6 | 45 min | **Integrate:** trace full flow end to end, fix issues, make meaningful commits | Explain which code runs during checkout vs later in the worker | ☐ |
| 7 | 90 min | **Storefront UI (moved up from Phase 10):** AdminLTE 3.2.0 base + MegaMart-inspired look; productType categories; React e-commerce.html detail; styled cart/checkout/confirmation | Every page renders in a browser; no jQuery; real data only | 🟡 built + screenshots; user click-through pending |

## Sunday 2026-09-27 — reliability, theme, docs
| # | Phase | Verify | Status |
|---|---|---|---|
| 8 | Scheduled repeatable `sync-products` (3 attempts), `submit-order` 5 attempts → `FAILED`, queue events (completed/failed/stalled), full JobLog fields | Retries + final states observed in logs and DB | ☐ |
| 9 | Recovery: outbox/sweeper for committed-but-not-enqueued orders; sweeper respects existing jobs and the 5-attempt limit; unknown-outcome recovery from Phase 3 | Kill between commit and enqueue → submitted once. Existing job → sweeper adds nothing. Simulated timeout after Shopify saved → no duplicate order. `Order.attempts` never exceeds 5 | ☐ |
| 10 | AdminLTE 3.2.0 across all pages; `e-commerce.html` detail converted to React (gallery, variant selectors, Description tab); listing pagination/load-more | Visual check of every page, no jQuery for gallery/variants | ☐ |
| 11 | Failure drills: worker restart, partial sync, archived/deleted product and variant, tampered cart | Worker restart resumes jobs; partial sync marks nothing removed; archived product hidden; removed variant rejected at checkout; each case noted | ☐ |
| 12 | README (setup/run/migrate/manual sync), design note, screenshots/recording, fresh-clone rehearsal | Setup works from README alone | ☐ |

Deferred bonuses: webhooks, admin dashboard, search/filter, Bull Board, automated tests, polish.

## Conventions
- Every new directory gets `README.md` (for humans) and `context.md` (for Claude).
- Commit at the end of each verified phase.
