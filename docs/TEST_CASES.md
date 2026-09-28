# Test inventory

Status date: 2026-09-28. Every "implemented" case below is part of a passing run
(counts and commands in [Running the suites](#running-the-suites)).

Suites and where they run:

| Type | Runner | Environment | Location |
|---|---|---|---|
| unit | Vitest (`--project unit`) | Node, everything external mocked | `tests/unit/` |
| component | Vitest (`--project component`) | jsdom + Testing Library | `tests/component/` |
| integration | Vitest (`--project integration`) | real MySQL `hubex_marketplace_test` + real Redis db 1; Shopify mocked | `tests/integration/` |
| e2e | Playwright (chromium + Pixel-7 mobile) | real dev server, MySQL `hubex_marketplace_e2e`, Redis db 2, seeded catalog | `tests/e2e/` |

ID convention: `U-` unit, `C-` component, `I-` integration, `E-` e2e, numbered per module block.
Status: ✅ implemented and passing · ⛔ known gap (listed at the end).

## Money formatting — `tests/unit/money.test.ts` (unit) ✅

| ID | Scenario | Expected |
|---|---|---|
| U-MON-1 | Whole amount | `Rs 1,500.00` (two decimals added) |
| U-MON-2 | Decimal amount | fraction kept |
| U-MON-3 | One-digit fraction | padded to two digits |
| U-MON-4 | >2-digit fraction | truncated, not rounded |
| U-MON-5 | Large amount | thousands grouped |
| U-MON-6 | Zero | `Rs 0.00` |
| U-MON-7 | Currency label | `Rs` for PKR, raw code otherwise |
| U-MON-8 | Amount < 1000 | no grouping |

## Logging & masking — `tests/unit/logger.test.ts` (unit) ✅

| ID | Scenario | Expected |
|---|---|---|
| U-LOG-1..4 | `mask()` long/short/empty/custom-keep values | first+last chars only; short values fully masked; null/undefined → `""` |
| U-LOG-5 | Log line carrying phone/email/address/password/token/authorization | every sensitive path replaced with `[redacted]`, message intact |

## Environment validation — `tests/unit/env.test.ts` (unit) ✅

| ID | Scenario | Expected |
|---|---|---|
| U-ENV-1 | Valid config | parsed; defaults applied (LOG_LEVEL info, sync 15 min) |
| U-ENV-2..5 | Bad DATABASE_URL scheme / full myshopify domain / bad API version / bad currency | throws naming the variable |
| U-ENV-6 | Negative vs zero sync interval | negative rejected; 0 = disabled accepted |
| U-ENV-7 | Error message content | variable names only, never values |
| U-ENV-8 | Missing required var | throws naming it |
| U-ENV-9 | Caching | first successful parse wins |

## Queue configuration — `tests/unit/queue.test.ts` (unit) ✅

| ID | Scenario | Expected |
|---|---|---|
| U-QUE-1 | sync-products retry policy | 3 total attempts, exponential backoff |
| U-QUE-2 | submit-order retry policy | 5 total attempts, exponential backoff |
| U-QUE-3 | ping / sweep-orders | single attempt |
| U-QUE-4 | submit-order job ID | deterministic, no reserved `:` |
| U-QUE-5 | Queue names | stable (`catalog`, `orders`) |

## Shopify error vocabulary — `tests/unit/shopify-errors.test.ts` (unit) ✅

U-ERR-1..4: transport errors are retryable with unknown outcome (and carry the
HTTP status); throttled errors retryable but never executed; GraphQL and
userErrors permanent, with codes / per-field messages preserved.

## Shopify GraphQL client — `tests/unit/shopify-client.test.ts` (unit) ✅

| ID | Scenario | Expected |
|---|---|---|
| U-CLI-1 | Token reuse | one token request serves many calls; header set |
| U-CLI-2 | Concurrent first calls | single shared in-flight token request |
| U-CLI-3 | 401 mid-session | one token refresh, request repeated, succeeds |
| U-CLI-4 | 401 again after refresh | permanent `ShopifyGraphQLError` |
| U-CLI-5 | Network failure | retryable transport error |
| U-CLI-6 | HTTP 5xx | transport error, `outcomeUnknown`, status kept |
| U-CLI-7 | Body cut off mid-stream | transport error (mutation outcome unknown) |
| U-CLI-8 | HTTP 429 | waits `Retry-After`, retries, succeeds |
| U-CLI-9 | GraphQL THROTTLED | cost-based backoff; gives up after 5 retries with `ShopifyThrottledError` |
| U-CLI-10 | Other GraphQL errors | permanent, codes preserved |
| U-CLI-11 | Token endpoint 4xx | permanent (bad credentials are not retried) — **found defect #1, fixed** |
| U-CLI-12 | Token endpoint 5xx | retryable transport error |
| U-CLI-13 | `assertNoUserErrors` | throws `ShopifyUserError` only when userErrors exist |

## Shopify catalog reads — `tests/unit/shopify-products.test.ts` (unit) ✅

| ID | Scenario | Expected |
|---|---|---|
| U-PRD-1 | Top-level cursor pagination | follows `endCursor` until exhausted |
| U-PRD-2 | Nested variant pages | drained before the product is yielded |
| U-PRD-3 | Nested media pages | drained; non-image media dropped |
| U-PRD-4 | Product vanishes during nested pagination | scan fails — no silent truncation |
| U-PRD-5 | API error mid-scan | error propagates; later pages never yielded |
| U-PRD-6 | Variant image | first media node mapped to `imageId` |
| U-PRD-7/8 | `fetchProductById` found / deleted | completed product / null |
| U-PRD-9 | `fetchShopCurrency` | shop currency code |

## Checkout input schemas — `tests/unit/checkout-schemas.test.ts` (unit) ✅

| ID | Scenario | Expected |
|---|---|---|
| U-SCH-1 | Valid cart | accepted |
| U-SCH-2 | Empty cart | rejected ("Your cart is empty") |
| U-SCH-3 | Non-integer / zero / negative IDs and quantities, wrong types | rejected |
| U-SCH-4 | Quantity 99 vs 100 | 99 accepted, 100 rejected |
| U-SCH-5 | 50 vs 51 lines | 51 rejected (max cart size) |
| U-SCH-6 | Non-array cart payload | rejected |
| U-SCH-7 | Valid customer | accepted; phone normalised to E.164 |
| U-SCH-8 | Phone with country prefix | normalised |
| U-SCH-9 | Single-word / blank name | rejected (first + last required) |
| U-SCH-10 | Phone invalid for country | rejected on the phone field |
| U-SCH-11 | Missing address1/city/zip | rejected |
| U-SCH-12 | Empty optional fields | become null |
| U-SCH-13 | Invalid vs absent email | invalid rejected, absent fine |
| U-SCH-14 | Country code case / non-ISO | uppercased / rejected |
| U-SCH-15 | Payment method other than COD | rejected |
| U-SCH-16 | Oversized values | rejected |

## Pricing — `tests/unit/checkout-pricing.test.ts` (unit) ✅

| ID | Scenario | Expected |
|---|---|---|
| U-PRC-1 | Line pricing | unit price/total from DB, client prices ignored |
| U-PRC-2 | 0.10×3 + 0.20×3 | exactly 0.90 (Decimal, no float drift) |
| U-PRC-3 | Duplicate variant lines | merged; merged quantity capped at 99 |
| U-PRC-4 | Unknown variant | `not_found` problem |
| U-PRC-5 | Removed variant / unavailable / draft product / removed product | `unavailable` |
| U-PRC-6 | Quantity above positive stock | `insufficient_stock` with remaining count |
| U-PRC-7 | Quantity equal to stock | accepted |
| U-PRC-8 | Zero/negative tracked stock with availableForSale | oversell allowed (Shopify "continue selling") |
| U-PRC-9 | Mixed valid + problem lines | valid lines still priced |
| U-PRC-10 | Line image | first product image or null |

## Order placement — `tests/unit/checkout-place-order.test.ts` (unit) ✅

| ID | Scenario | Expected |
|---|---|---|
| U-ORD-1 | Happy path | PENDING_SYNC order + snapshot items in one transaction, then enqueue |
| U-ORD-2 | Any line problem | nothing written, problems returned |
| U-ORD-3 | Enqueue fails (Redis down) | order still confirmed, `enqueued: false` |
| U-ORD-4 | Enqueue hangs | wait capped (3s), order confirmed |
| U-ORD-5 | DB failure | error propagates, no enqueue |

## Jobs (mocked I/O) — `tests/unit/submit-order.test.ts`, `sweep-orders.test.ts`, `run-job.test.ts`, `sync-product.test.ts` (unit) ✅

| ID | Scenario | Expected |
|---|---|---|
| U-SUB-1 | Submit happy path | lookup-before-create, SYNCED with Shopify IDs |
| U-SUB-2 | Payload to Shopify | snapshot prices, COD total, split name, country |
| U-SUB-3 | Order already in Shopify | adopted, no second create |
| U-SUB-4 | Already SYNCED / missing / FAILED order | no-op / unrecoverable / unrecoverable |
| U-SUB-5 | DB attempt limit reached | FAILED even if BullMQ re-runs |
| U-SUB-6 | Transient error | lastError recorded, stays PENDING_SYNC |
| U-SUB-7 | Final attempt fails | FAILED with error retained |
| U-SUB-8 | Permanent userErrors | immediate FAILED, no wasted retries |
| U-SUB-9 | Uniqueness userError after hidden success | second lookup adopts the order |
| U-SUB-10 | Empty Shopify response | error raised |
| U-SUB-11 | Single-word customer name | used as both first and last name |
| U-SWP-1..5 | Sweep query shape / missing job / live job / stale terminal job / clean state | grace period + batch 100; re-enqueue only when needed; stale job removed first |
| U-RUN-1..5 | runJob lifecycle | STARTED→COMPLETED with duration; FAILED with error+stack and correct `willRetry`; UnrecoverableError never retries; JobLog write failure doesn't mask the job error |
| U-SYP-1..6 | sync-product: bad ID / refresh / delete / unknown delete / retryable failure / final failure | unrecoverable; upsert + receipt PROCESSED; removal cascades to variants; receipt stays RECEIVED until last attempt, then FAILED |

## Webhook endpoint — `tests/unit/webhook-route.test.ts` (unit) ✅

| ID | Scenario | Expected |
|---|---|---|
| U-WEB-1 | Valid delivery | receipt recorded, sync-product enqueued, 200 |
| U-WEB-2..4 | Wrong HMAC / missing header / tampered body | 401, nothing recorded |
| U-WEB-5/6 | Unsupported topic / missing event ID | 200, ignored |
| U-WEB-7 | Webhook-ID fallback header | used as event ID |
| U-WEB-8 | Malformed payloads (bad JSON, no id, garbage id) | 200, ignored |
| U-WEB-9 | Duplicate delivery (P2002) | 200, no re-enqueue |
| U-WEB-10 | Other DB error | 500 so Shopify re-delivers |
| U-WEB-11 | Enqueue failure | still 200 (scheduled sync catches up) |
| U-WEB-12 | Invalid triggered-at | stored as null |

## Auth — `tests/unit/auth.test.ts` (unit) ✅

| ID | Scenario | Expected |
|---|---|---|
| U-AUT-1..3 | Passport local: valid / wrong password / unknown email / email normalisation | user object or null; identical failure shape; lowercased lookup |
| U-AUT-4 | `hashPassword` | bcrypt hash, verifies, no plaintext |
| U-AUT-5 | `isAdmin` with no admin configured | false for everyone |
| U-AUT-6 | Register happy path | 201, hashed password stored, session started |
| U-AUT-7 | Register invalid inputs (email, short password, blank name, bad JSON) | 400, no user/session |
| U-AUT-8 | Register duplicate email | 409 |
| U-AUT-9/10 | Login right/wrong credentials | 200 + session / 401 no session |
| U-AUT-11 | Login malformed input | 400 |
| U-AUT-12 | `/api/auth/me` signed in/out | 200 user / 401 |
| U-AUT-13 | Logout | session destroyed |

## Board route (disabled) — `tests/unit/bull-board-route.test.ts` (unit) ✅

U-BRD-1: with no ADMIN_EMAIL/ADMIN_PASSWORD configured the route answers 404
and never touches the queues.

## Catalog reads — `tests/unit/catalog.test.ts` (unit) ✅

| ID | Scenario | Expected |
|---|---|---|
| U-CAT-1/2 | Visibility + category filter | only ACTIVE, not-removed products; productType filter |
| U-CAT-3/4 | Pagination / empty catalog | skip/take + pageCount; at least one page |
| U-CAT-5 | Cheapest variant | card price + availability from variants |
| U-CAT-6 | Discounts | only when compare-at > price; save amount + percent |
| U-CAT-7 | No image / no variants | null image, null price, unavailable |
| U-CAT-8/9 | Deals | discounted first (biggest first); honest fallback flag |
| U-CAT-10 | `formatPrice` | two decimals |

## Cart store — `tests/component/cart-store.test.ts` (component) ✅

C-CRT-1..12: add + persist; merge; clamp 1..99 with flooring; update/remove/
clear; corrupted JSON recovery; invalid entries filtered; non-array ignored;
blocked localStorage → empty cart, writes don't throw; React notification;
stable reference; cross-tab storage events (and other-key events ignored).

## Product detail UI — `tests/component/product-detail.test.tsx` (component) ✅

C-PDP-1..12: initial render (title, price, stock); first-available initial
variant; option change updates price/stock; sold-out variant disables buying;
non-existent combination jumps to a matching variant; impossible values struck
through; gallery thumbnails + variant-image preview; add to cart writes
localStorage, confirms, and merges on repeat; confirmation cleared on
re-selection; "Default Title" option hidden; Description/Variants tabs;
compare-at strike-through; no-image/no-variant placeholder state.

## Cart view — `tests/component/cart-view.test.tsx` (component) ✅

C-CVW-1..8: empty state (no server call); loading state; server-priced lines
with totals; quantity edit writes the store; removal; unavailable-item and
insufficient-stock problem rows (with "Use N" clamp); read-only checkout
summary mode.

## Checkout form — `tests/component/checkout-form.test.tsx` (component) ✅

C-CHF-1..6: hidden when cart empty; submits cart JSON + typed fields (PK
default, COD); COD is the only payment option; server field errors displayed on
the right inputs; typed values refilled after a failed submit; form-level error
alert.

## Confirmation helpers — `tests/component/status-poller.test.tsx`, `small-components.test.tsx` (component) ✅

C-POL-1..4: polls every 2s, stops after 60 polls, cleans its timer on unmount,
renders nothing. C-SML-1..6: product card (link/image/price, discount ribbon,
sold-out and missing-image fallbacks), cart badge totals, ClearCart empties the
cart on mount, SectionTitle link.

## Auth form — `tests/component/auth-form.test.tsx` (component) ✅

C-AUTH-1..12: login mode (no name field, current-password autocomplete) and
register mode (name field, minlength 8, new-password) render correctly; submit
posts JSON to `/api/auth/login` / `/api/auth/register` with the right body and
navigates home (`router.push("/")` + refresh); a 401 shows the server's error
and leaves the form usable; a non-JSON error body falls back to a generic
message; a rejected fetch shows a network error; a previous error clears on
the next successful submit; the button disables with a pending label while the
request is in flight; a same-site `?next=` path is followed via
`location.assign`, while `https://…` and `//…` values are ignored (open
redirect guard) and navigation falls back to home.

## Checkout persistence — `tests/integration/checkout.int.test.ts` (integration) ✅

| ID | Scenario | Expected |
|---|---|---|
| I-CHK-1 | Happy path | order + snapshot items atomically; submit-order job in Redis with deterministic ID and 5 attempts |
| I-CHK-2 | DB price changed after cart built | checkout charges the new DB price |
| I-CHK-3 | One bad line | nothing written anywhere (rollback), no job |
| I-CHK-4 | Stock ran out | rejected with remaining stock |
| I-CHK-5 | Default prisma client path | priceCart works unparameterised |
| I-CHK-6 | Two checkouts | two orders, two jobs |

## Order submission — `tests/integration/submit-order.int.test.ts` (integration) ✅

| ID | Scenario | Expected |
|---|---|---|
| I-SUB-1 | Success | SYNCED + Shopify IDs + COMPLETED JobLog with duration |
| I-SUB-2 | Transient failure | PENDING_SYNC + lastError; JobLog FAILED with willRetry |
| I-SUB-3 | 5 exhausted attempts | FAILED, error retained, later runs refuse without calling Shopify; JobLog history rows persisted |
| I-SUB-4 | Uncertain outcome (reply lost) | retry finds the Shopify order and adopts it — no duplicate |
| I-SUB-5 | Permanent userErrors | immediate FAILED |
| I-SUB-6 | Replay of a SYNCED order | no-op, attempts unchanged |

## Recovery sweep — `tests/integration/sweep-orders.int.test.ts` (integration) ✅

I-SWP-1..6: committed-but-unqueued order re-enqueued; fresh orders left inside
the grace period; already-waiting job untouched (no duplicates); job completed
by a worker that died before the DB write is removed and re-enqueued (real
BullMQ worker used); SYNCED/FAILED orders skipped; multiple stuck orders all
picked up oldest-first.

## Catalog sync — `tests/integration/sync-products.int.test.ts` (integration) ✅

| ID | Scenario | Expected |
|---|---|---|
| I-SYN-1 | Multi-page sync | products/variants/images copied |
| I-SYN-2 | Repeated sync | upsert by Shopify ID, no duplicates, updates applied |
| I-SYN-3 | Deleted product | flagged removed after full scan; gone from storefront; row kept for order history |
| I-SYN-4 | Re-appearing product | restored |
| I-SYN-5 | Dropped variant vs dropped image | variant flagged (FK-safe), image deleted |
| I-SYN-6 | Archived/draft products | stored but hidden |
| I-SYN-7 | Partial scan failure | nothing deactivated; unvisited products stay visible |
| I-SYN-8 | Currency mismatch | UnrecoverableError before any write |
| I-SYN-9 | Unknown future status | treated as DRAFT (not sellable) |

## Webhooks + sync-product — `tests/integration/webhooks.int.test.ts` (integration) ✅

I-WEB-1..4: full receipt→enqueue→job→PROCESSED flow creating the product
locally; duplicate delivery recorded/enqueued once; delete flow hides the
product and processes the receipt; failing Shopify read keeps the receipt
retryable then FAILED on the last attempt with the error.

## Auth flow — `tests/integration/auth.int.test.ts` (integration) ✅

I-AUT-1..9: register sets a cookie whose token is stored only as a hash;
passwords stored as bcrypt; login right/wrong credentials; logout deletes the
session row and a replayed cookie fails; expired sessions rejected; forged
cookies rejected; env-admin login upserts its user and `isAdmin` recognises
only it; admin email cannot be registered by the public (409, no row); wrong
admin password rejected; duplicate registration 409.

## Queue dashboard — `tests/integration/bull-board.int.test.ts` (integration) ✅

I-BRD-1..4: anonymous → 302 to `/login?next=/admin/queues`; signed-in
non-admin → 404; admin → board HTML; nested board API paths protected and,
authorized, list exactly the `catalog` and `orders` queues (real Redis).

## Worker pipeline — `tests/integration/worker-pipeline.int.test.ts` (integration) ✅

I-WRK-1..4: real BullMQ worker processes an enqueued ping through `runJob`
(COMPLETED JobLog row); unregistered job name fails without a JobLog row;
scheduler upserts keep exactly one schedule per fixed ID; interval 0 removes
the product-sync schedule. Graceful worker close is exercised by every test's
teardown.

## Browser journeys — `tests/e2e/*.spec.ts` (e2e; chromium + mobile) ✅

| ID | Scenario | Expected |
|---|---|---|
| E-CAT-1 | Home → cart link | empty-cart state |
| E-CAT-2 | Listing | 14 visible products; price, compare-at, ribbon, image, sold-out badge |
| E-CAT-3 | Draft/removed products | absent everywhere; detail pages show not-found |
| E-CAT-4 | Pagination | 12 cards page 1, 2 on page 2 |
| E-CAT-5 | Category filter | narrows list, other categories gone |
| E-CAT-6 | Unknown handle | not-found page |
| E-PDP-1 | Variant selection | price/stock/gallery update; sold-out combo struck + buying disabled |
| E-PDP-2 | Tabs | merchant HTML description; variants table with SKUs |
| E-CRT-1 | Cart | add, merge, quantity update, refresh persistence (localStorage), removal |
| E-CRT-2 | Cart badge | counts items across pages |
| E-CHK-1 | Server validation | bad phone rejected, typed values preserved, stays on /checkout |
| E-CHK-2 | Full journey | browse → variant → cart → checkout → confirmation shows PENDING_SYNC without waiting for Shopify; masked phone; cart cleared; URL survives refresh |
| E-CHK-3 | Checkout with empty cart | summary only, no submit button |
| E-CHK-4 | Unknown order reference | not-found, nothing leaked |
| E-CHK-5 | Keyboard-only add to cart | works (desktop project) |
| E-AUT-1 | Register → header shows account → logout | works end to end |
| E-AUT-2 | Wrong login | visible error, stays on /login |
| E-AUT-3 | /admin/queues anonymous | redirected to login, returned to the board after admin sign-in |
| E-AUT-4 | /admin/queues as non-admin | 404 |

Mobile project (Pixel 7 viewport) re-runs every spec except `@desktop-only`,
covering the mobile layout of the same journeys.

## Running the suites

```bash
npm test                 # unit + component (no services needed)
npm run test:integration # needs docker compose up (MySQL + Redis)
npm run test:all         # all three Vitest projects
npm run test:coverage    # all three + coverage (html/lcov/json-summary in coverage/)
npm run test:e2e         # Playwright; starts its own dev server on :3105
```

Current counts (2026-09-28, all passing, none skipped): unit 150 · component 62
· integration 51 · e2e 42 (21 scenarios × chromium/mobile, minus 2 desktop-only
run once each). Coverage (Vitest projects combined; e2e does not contribute):
statements 79.09%, branches 70.28%, functions 70.91%, lines 79.46% across 60
`src/**` files, including files no test imports.

Isolation: integration uses database `hubex_marketplace_test` and Redis db 1;
e2e uses `hubex_marketplace_e2e`, Redis db 2, and its own Next build dir
(`.next-e2e`). Both derive connection URLs from `.env` by rewriting only the
database name/index (`tests/setup/test-urls.ts`, `tests/e2e/env.ts`) and refuse
to run against any other database. CI (`.github/workflows/tests.yml`) uses
service containers with placeholder credentials.

Coverage exclusions (documented, not padding): `src/generated/**` (Prisma
output), `src/vendor/**` (vendored AdminLTE), `src/worker/index.ts` (process
entrypoint with signal handlers; its dispatch/lifecycle logic is covered via
`runJob` and the worker-pipeline integration tests).

## Defects found by tests (fixed)

1. `src/lib/shopify/client.ts` — a permanent token-endpoint rejection (e.g. bad
   credentials, HTTP 403) was re-wrapped as a retryable transport error with
   `outcomeUnknown`, so jobs would retry hopeless credentials forever. Fixed by
   passing through already-classified `ShopifyError`s. (U-CLI-11)
2. No root `not-found.tsx`: unknown product/order URLs rendered a blank main
   area. Added a minimal 404 page. (E-CAT-6, E-CHK-4)
3. Cart "Remove" button had no accessible name at mobile widths (its text is
   `d-none d-md-inline`). Added an `aria-label`. (E-CRT-1 mobile)

## Known gaps (not covered)

- **Live Shopify contract**: every suite mocks the Admin API boundary; the real
  `orderCreate`/metafield-uniqueness behaviour is only verified by the existing
  manual scripts (`npm run verify:shopify`, `spike:cod`). A recorded-response
  contract test would close this.
- **Worker process entrypoint** (`src/worker/index.ts`): startup wiring and
  SIGTERM handling are excluded from coverage; the equivalent logic is tested
  through `runJob` + a real Worker in `worker-pipeline.int.test.ts`, but the
  file itself is not executed under test.
- **Backoff timing**: retry *policies* are asserted; actual BullMQ delay
  scheduling (5s/10s/20s…) is not waited on in tests.
- **Server components' rendering** (product/listing/order pages) is exercised
  only via e2e, not unit-rendered (async Server Components are not supported by
  Vitest per Next's own testing guide).
- **Concurrency races**: simultaneous submit-order workers on the same order
  rely on the DB attempt counter + Shopify custom-ID uniqueness; a true
  multi-process race is not simulated.
- **Visual regression** (AdminLTE fidelity) and load/performance testing are
  out of scope.
