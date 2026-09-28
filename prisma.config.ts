import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  // `prisma generate` (postinstall) never connects, so a missing URL must not fail
  // CI/host builds. Commands that do connect (migrate) still fail clearly without it.
  datasource: { url: process.env.DATABASE_URL ?? "" },
});
