# scripts/

Standalone command-line helpers run with Node, outside the web app and worker.

| Script | Run with | What it does |
|---|---|---|
| `verify-shopify.mjs` | `npm run verify:shopify` | Read-only: exchanges client ID/secret for an Admin API token, then queries shop name and product count. Prints no secrets. |

Planned: a manual `sync-products` CLI trigger (Phase 4); scheduled repeatable job in Phase 8.
