# Hubex Marketplace

Customer-facing Next.js marketplace backed by a Shopify development store. A separate worker copies Shopify products into MySQL and submits locally saved Cash on Delivery orders to Shopify. The storefront reads products from MySQL.

The GitHub links to the new documentation files become live after these files are committed and pushed to `main`.

## 1. Source Repository

[Hubex Marketplace on GitHub](https://github.com/ammarhere02/Hubex-Marketplace)

## 2. README

[Setup, commands, architecture, and troubleshooting](https://github.com/ammarhere02/Hubex-Marketplace/blob/main/README.md)

## 3. API Documentation

[Routes, server actions, webhooks, and Shopify API use](https://github.com/ammarhere02/Hubex-Marketplace/blob/main/docs/API.md)

The customer checkout is a Next.js Server Action. It is not a public REST endpoint. The only explicit HTTP API route in this repository receives Shopify product webhooks.

## 4. Demo Evidence

**Pending:** No recording or screenshots are present in the repository as of 2026-09-28. Add a real link after capturing the flow: manual sync → product listing/detail → cart → COD checkout → local pending order → unpaid order in Shopify → local synced status. Do not include customer details or credentials in the recording.

## 5. Test Evidence

[Verification record and remaining checks](https://github.com/ammarhere02/Hubex-Marketplace/blob/main/docs/VERIFICATION.md) · [CI workflow](https://github.com/ammarhere02/Hubex-Marketplace/blob/main/.github/workflows/ci.yml)

Local Prisma validation, typecheck, lint, and production build passed on 2026-09-28. The verification record distinguishes these checks from end-to-end behavior that was not rerun during documentation.

## 6. Database Documentation

[Data model, relationships, migrations, and safe inspection queries](https://github.com/ammarhere02/Hubex-Marketplace/blob/main/docs/DATABASE.md) · [Prisma schema](https://github.com/ammarhere02/Hubex-Marketplace/blob/main/prisma/schema.prisma)

## Time spent by phase

**Actual hours were not recorded in the repository.** The time budgets in `Phases.md` are plans, not evidence of elapsed work. Fill in measured or honestly estimated time before submitting if the reviewer requires it.

| Phase | Actual time |
|---|---|
| Design and Shopify connection | To be supplied |
| MySQL, Prisma, Redis, queue, and worker | To be supplied |
| Catalog sync and storefront | To be supplied |
| Cart, COD checkout, and order submission | To be supplied |
| Recovery, webhooks, verification, and documentation | To be supplied |

**AI and tool disclosure:** Claude assisted with implementation; Codex assisted with code understanding, review, and this documentation. The project was developed in phases with checks after implementation. This disclosure does not imply that every failure drill or browser demo has been independently verified.

**Repository safety confirmation:** The local `.env` is Git-ignored. A 2026-09-28 scan of tracked files found no matches for the checked Shopify credential prefixes. Do not put credentials or customer details in submitted evidence.
