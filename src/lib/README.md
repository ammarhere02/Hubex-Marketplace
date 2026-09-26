# src/lib/
Shared server-side infrastructure used by both the web app and the worker.

| File | Purpose |
|---|---|
| `env.ts` | Validates environment variables once (zod); fails fast with variable names, never values |
| `logger.ts` | Pino JSON logger with redaction of secrets/customer fields; `mask()` helper |
| `prisma.ts` | One Prisma client per process (MySQL through the mariadb driver adapter) |
| `redis.ts` | Redis connection factory for BullMQ |
| `queue.ts` | Queue names, job names, retry policies (attempts/backoff), deterministic job IDs |
| `shopify/` | Admin GraphQL client (token cache, throttling, error types) and order helpers |

Nothing here may be imported by client components: it holds credentials.
