# prisma/ — context for Claude
- Prisma 7.10: generator `prisma-client` (output src/generated/prisma), no url in schema; URL comes from prisma.config.ts. Runtime uses `@prisma/adapter-mariadb` (see src/lib/prisma.ts).
- `migrate dev` needs a shadow DB → app user has global grants via docker/mysql-init (local only).
- Money = Decimal(10,2). Catalog rows never hard-deleted (isRemoved/status).
