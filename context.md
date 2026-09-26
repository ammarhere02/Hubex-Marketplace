# Repo root — context for Claude

- Authoritative requirements: CLAUDE.md (and the PDF it references). Plan: Phases.md.
- Single Next.js 16.3.6 app at root (App Router, `src/`). Read `node_modules/next/dist/docs/` before using Next APIs (AGENTS.md).
- Planned layout (create as phases arrive, each with README.md + context.md):
  - `src/app/` web routes/pages only (thin; call into lib)
  - `src/lib/` shared infra: env, logger, prisma client, shopify client, queue defs
  - `src/jobs/` job handlers (sync-products, submit-order) — pure functions of (job, deps)
  - `src/worker/` separate Node process entry; registers handlers, queue events
  - `prisma/` schema + migrations
  - `scripts/` one-off CLIs (verify, manual sync trigger)
- Secrets: `.env` only (git-ignored, verified). Never print. No `NEXT_PUBLIC_` on Shopify vars.
- API version: `.env` uses 2026-07; `shopify.app.toml` webhooks use 2026-10 — webhooks deferred, so harmless; align when building the Shopify client.
- Git: no commits yet as of 2026-09-26.
- Infra: docker-compose.yml runs mysql:8.4 + redis:7.4-alpine on 127.0.0.1 only; Redis uses AOF + noeviction (BullMQ requirement). Phase 2 verified 2026-09-26 (ping job → worker → JobLog, success + failure).
- Phase 3 (2026-09-26): shared client + custom-ID dedup built; `npm run spike:cod` blocked by "not approved to access the Order object" → needs protected customer data access declared in the Dev Dashboard (user action). Rerun spike after.
