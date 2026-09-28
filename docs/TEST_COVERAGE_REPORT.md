# Test coverage report

Generated 2026-09-28 from `npm run test:coverage` (Vitest projects: unit +
component + integration, run together). Detailed scenario-by-scenario inventory:
[TEST_CASES.md](./TEST_CASES.md).

## Test execution summary

| Suite | Runner | Tests | Result | Contributes to coverage |
|---|---|---:|---|---|
| unit | Vitest `--project unit` | 150 | ✅ all pass | yes |
| component | Vitest `--project component` (jsdom) | 62 | ✅ all pass | yes |
| integration | Vitest `--project integration` (real MySQL + Redis) | 51 | ✅ all pass | yes |
| e2e | Playwright (chromium + Pixel-7 mobile) | 42 | ✅ all pass | **no** — runs against a separate dev server process |
| **Total** | | **305** | **305 passed · 0 failed · 0 skipped** | |

Only the three Vitest suites produce the numbers below; pages exercised solely
in the browser by Playwright therefore show 0% here even though they are
functionally tested (marked *e2e* in the tables).

## Overall coverage (61 measured `src/**` files, including files no test imports)

| Metric | Coverage | Covered / total |
|---|---:|---:|
| Statements | **81.82%** | 797 / 974 |
| Branches | **75.00%** | 486 / 648 |
| Functions | **72.33%** | 183 / 253 |
| Lines | **82.48%** | 697 / 845 |

Artifacts: `coverage/index.html` (browsable), `coverage/lcov.info`,
`coverage/coverage-summary.json`. Regenerate with `npm run test:coverage`.

## Per-file coverage — core libraries (`src/lib`)

| File | Stmts | Branch | Funcs | Lines | Covered by |
|---|---:|---:|---:|---:|---|
| lib/checkout.ts | 100 | 96.77 | 100 | 100 | unit, integration |
| lib/money.ts | 100 | 100 | 100 | 100 | unit |
| lib/env.ts | 100 | 100 | 100 | 100 | unit |
| lib/queue.ts | 100 | 100 | 100 | 100 | unit, integration |
| lib/redis.ts | 100 | 100 | 100 | 100 | integration |
| lib/logger.ts | 100 | 85.71 | 100 | 100 | unit |
| lib/prisma.ts | 100 | 66.66 | 100 | 100 | integration |
| lib/catalog.ts | 82.14 | 89.65 | 75 | 78.26 | unit, integration |
| lib/shopify/client.ts | 96.25 | 88 | 100 | 96.82 | unit |
| lib/shopify/errors.ts | 100 | 100 | 100 | 100 | unit |
| lib/shopify/products.ts | 100 | 100 | 100 | 100 | unit |
| lib/shopify/orders.ts | **19.04** | 0 | 0 | 21.05 | see note ① |
| lib/shopify/index.ts | 0 | 0 | 0 | 0 | re-export barrel, mocked in tests |
| lib/auth/admin.ts | 100 | 100 | 100 | 100 | unit, integration |
| lib/auth/session.ts | 95.23 | 75 | 100 | 100 | integration |
| lib/auth/passport.ts | 82.35 | 64.28 | 83.33 | 92.85 | unit, integration |

① `orders.ts` builds the live `orderCreate`/`orderByIdentifier` GraphQL calls.
Tests deliberately mock this boundary (no network in tests), so only its pure
helpers execute under coverage. The real calls are verified manually via
`npm run spike:cod` — see Known gaps.

## Per-file coverage — jobs & worker (`src/jobs`, `src/worker`)

| File | Stmts | Branch | Funcs | Lines | Covered by |
|---|---:|---:|---:|---:|---|
| jobs/run-job.ts | 100 | 62.5 | 100 | 100 | unit, integration |
| jobs/submit-order.ts | 100 | 94.44 | 100 | 100 | unit, integration |
| jobs/sweep-orders.ts | 100 | 100 | 100 | 100 | unit, integration |
| jobs/sync-products.ts | 100 | 85.71 | 100 | 100 | integration |
| jobs/sync-product.ts | 92 | 81.25 | 33.33 | 92 | unit, integration |
| jobs/ping.ts | 85.71 | 50 | 100 | 100 | integration (real worker) |
| jobs/index.ts | 100 | 100 | 100 | 100 | integration |
| worker/index.ts | — | — | — | — | excluded (process entrypoint; dispatch/lifecycle tested via runJob + real-worker integration tests) |

## Per-file coverage — API routes & server endpoints

| File | Stmts | Branch | Funcs | Lines | Covered by |
|---|---:|---:|---:|---:|---|
| api/webhooks/shopify/route.ts | 97.61 | 96.29 | 75 | 100 | unit, integration |
| api/auth/register/route.ts | 100 | 100 | 100 | 100 | unit, integration |
| api/auth/login/route.ts | 100 | 100 | 100 | 100 | unit, integration |
| api/auth/logout/route.ts | 100 | 100 | 100 | 100 | unit, integration |
| api/auth/me/route.ts | 100 | 100 | 100 | 100 | unit |
| admin/queues/[[...path]]/route.ts | 100 | 100 | 100 | 100 | unit, integration, e2e |
| cart/actions.ts (server actions) | partial | — | — | — | integration (auth gate + authenticated checkout), e2e; see note ② |
| middleware.ts (site-wide auth gate) | — | — | — | — | e2e (redirects, forged-cookie rejection); runs in Next's edge sandbox, outside Vitest |

② `checkoutAction`/`quoteCart` are thin wrappers over `lib/checkout.ts` (100%);
component tests mock them and only e2e drives them end to end (full checkout
journey, validation errors, redirects), which doesn't count toward these
numbers. Direct unit tests of the wrappers are a listed follow-up.

## Per-file coverage — client components

| File | Stmts | Branch | Funcs | Lines | Covered by |
|---|---:|---:|---:|---:|---|
| cart/cart-store.ts | 97.82 | 88.88 | 94.44 | 100 | component, e2e |
| cart/cart-view.tsx | 96.66 | 91.42 | 91.66 | 96.15 | component, e2e |
| checkout/checkout-form.tsx | 100 | 94.44 | 100 | 100 | component, e2e |
| products/[handle]/product-detail.tsx | 90 | 90 | 82.85 | 90.19 | component, e2e |
| orders/[publicId]/status-poller.tsx | 100 | 100 | 100 | 100 | component |
| orders/[publicId]/clear-cart.tsx | 100 | 100 | 100 | 100 | component, e2e |
| _components/product-card.tsx | 100 | 94.44 | 100 | 100 | component, e2e |
| _components/cart-badge.tsx | 100 | 100 | 100 | 100 | component, e2e |
| (auth)/login/auth-form.tsx | 100 | 90.32 | 100 | 100 | component (12 tests), e2e |
| _components/logout-button.tsx, header-auth.tsx | 0 | — | 0 | 0 | e2e only |
| _components/nav-progress.tsx, skeletons.tsx, site-header/footer | 0 | — | 0 | 0 | e2e renders them; no assertions |

## Per-file coverage — pages (async Server Components)

`page.tsx` / `layout.tsx` / `loading.tsx` / `not-found.tsx` / `template.tsx`
files all show **0%** in Vitest coverage by design: async Server Components
can't run under Vitest (per Next.js's own testing guide), so they are tested
in the browser instead. Playwright covers: home, product listing (pagination,
category filter, empty/sold-out/discount states), product detail, cart,
checkout, order confirmation (PENDING_SYNC state, masked phone), not-found,
login/register, and the admin queue dashboard — on desktop and mobile
viewports. Data-shaping logic for these pages lives in `lib/catalog.ts` /
`lib/checkout.ts`, which are unit-tested to 82–100%.

## Exclusions (documented, not padding)

| Excluded | Reason |
|---|---|
| `src/generated/**` | Prisma-generated client |
| `src/vendor/**` | Vendored AdminLTE 3.2.0 theme |
| `src/worker/index.ts` | Process entrypoint (signal handlers, process.exit); logic covered via runJob + real-worker tests |
| `tests/**`, config files | Not application code |

No coverage-suppression comments (`istanbul ignore` etc.) are used anywhere.

## Defects found by tests (fixed)

1. Shopify client re-classified permanent token rejections (bad credentials)
   as retryable transport errors with unknown outcome → endless retries.
2. Missing root `not-found.tsx` → blank page for unknown products/orders.
3. Cart "Remove" button had no accessible name at mobile widths.

## Known gaps / next steps

- **Live Shopify contract** (`lib/shopify/orders.ts`, 19%): all suites mock the
  Admin API; real `orderCreate` + custom-ID uniqueness verified only by manual
  scripts (`verify:shopify`, `spike:cod`).
- **Server-action wrappers** (`cart/actions.ts`, 0% in Vitest): covered by e2e
  only; direct unit tests would lift this.
- Decorative components (skeletons, nav-progress, header/footer) rendered in
  e2e but with no dedicated assertions.
- Backoff *timing*, multi-process submit races, visual regression, load tests:
  out of scope, listed in TEST_CASES.md.
