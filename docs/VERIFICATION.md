# Verification evidence

This record separates checks performed during documentation on 2026-09-28 from behavior described in earlier project notes. It contains no credentials or customer data.

## Checks performed locally on 2026-09-28

| Check | Result | Scope |
|---|---|---|
| `npx prisma validate` | Passed | Prisma schema parses and validates. |
| `npm run typecheck` | Passed | TypeScript type checking. |
| `npm run lint` | Passed | ESLint. |
| `npm run build` | Passed | Prisma client generation and Next.js production build; all storefront and webhook routes compiled. |
| `git check-ignore .env` | Passed | Local credential file is ignored by Git. |
| Tracked-file Shopify credential-prefix scan | No matches | Checked common Shopify token prefixes and non-placeholder `SHOPIFY_CLIENT_SECRET=` assignments; this is not a comprehensive secret audit. |

The repository's `.github/workflows/ci.yml` runs Prisma validation/generation, Next route type generation, TypeScript, lint, and build with placeholder configuration on push and pull request. Its existence does not establish that a remote CI run passed.

## Previously recorded project observations

`Phases.md` records a Shopify read check, a catalog sync/resync with stable row counts, and a COD order reaching Shopify. These are historical development notes. They were **not rerun** for this documentation, and no screenshots or recording were found in `docs/` on 2026-09-28. Do not present them as newly verified evidence.

## End-to-end evidence to capture before submission

- [ ] Run manual sync, show a completed `sync-products` job and product rows in MySQL.
- [ ] Show listing, detail, cart, checkout, and pending confirmation in the browser.
- [ ] Show the same local order becoming `SYNCED`, and its unpaid COD order in Shopify Admin.
- [ ] Show the associated `JobLog` rows without exposing customer details.
- [ ] Verify a second sync does not duplicate products and a partial scan does not hide unvisited products.
- [ ] Record a failed or delayed submission and its recovery, if time permits.
- [ ] Add a screenshot or recording link to `docs/SUBMISSION.md`.

The first three items are the minimum useful full-flow demo. Use test customer data and redact contact details in captured evidence.
