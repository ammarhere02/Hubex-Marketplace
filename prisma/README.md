# prisma/
Database schema and migrations (MySQL via Prisma 7).

- `schema.prisma` — the six models (see `docs/design.md`).
- `migrations/` — committed SQL migrations. Apply with `npm run db:deploy` (reviewer) or
  create new ones with `npm run db:migrate -- --name <change>` (development).
- `../prisma.config.ts` — tells the CLI where the schema is and reads `DATABASE_URL`.
- The generated client goes to `src/generated/prisma` (git-ignored, rebuilt on `npm install`).
