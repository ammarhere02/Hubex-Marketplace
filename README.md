# Hubex Marketplace

Next.js (App Router, TypeScript) storefront for the HubexTech trainee exercise.
Shopify owns the catalog; background jobs will copy it into MySQL.

## Prerequisites

- Node.js 22+ and npm
- Shopify CLI 4.x (only needed to change the app registration/config)
- Access to the Shopify organization that owns the **Hubex Marketplace** app
  and the development store it is installed on

## Setup

```bash
npm install
cp .env.example .env   # then fill SHOPIFY_SHOP, SHOPIFY_CLIENT_ID, SHOPIFY_CLIENT_SECRET
```

`SHOPIFY_SHOP` is the store subdomain only (the part before `.myshopify.com`).
The client secret is in Dev Dashboard → Hubex Marketplace → Settings. Never commit `.env`.

## Commands

| Command | Purpose |
|---|---|
| `docker compose up -d` | Start local MySQL 8.4 + Redis 7.4 (needs `MYSQL_PASSWORD`, `MYSQL_ROOT_PASSWORD` in `.env`) |
| `docker compose ps` | Both services should show `(healthy)` |
| `docker compose down` | Stop them (data kept in volumes; add `-v` to wipe) |
| `npm run dev` | Start the Next.js dev server at http://localhost:3000 |
| `npm run lint` | Run ESLint |
| `npm run build` / `npm start` | Production build and serve |
| `npm run verify:shopify` | Read-only check: gets an app access token (client credentials) and queries the shop name and product count. Prints no secrets. |
| `shopify app deploy` | Release changes in `shopify.app.toml` (scopes etc.) as a new app version |

## Shopify connection

- App registration: **Hubex Marketplace** (`client_id` in `shopify.app.toml`)
- Scopes: `read_products`, `read_inventory`, `write_orders`
- Auth: the server exchanges client ID + secret for a ~24h Admin API token
  (client credentials grant). The app must be installed on the store and both
  must belong to the same organization.

## Status

Done: project base, Shopify app registration, installation on the dev store,
and verified Admin API access.

Not started: AdminLTE 3.2.0 integration, Prisma/MySQL schema, Docker Compose,
Redis/BullMQ worker, product sync, cart, checkout, order submission, logging.
