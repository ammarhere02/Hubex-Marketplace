// Migrates and seeds the dedicated e2e database before the browser tests run.
import { execSync } from "node:child_process";
import { resolve } from "node:path";
import { E2E_DB_NAME, e2eUrls } from "./env";

export default function globalSetup(): void {
  const { databaseUrl } = e2eUrls();
  if (!process.env.E2E_DATABASE_URL && !new URL(databaseUrl).pathname.endsWith(E2E_DB_NAME)) {
    throw new Error(`Refusing to run e2e tests against ${new URL(databaseUrl).pathname}`);
  }
  const env = { ...process.env, DATABASE_URL: databaseUrl };
  const root = resolve(__dirname, "../..");
  execSync("npx prisma migrate deploy", { cwd: root, env, stdio: "pipe" });
  execSync("npx tsx tests/e2e/seed.ts", { cwd: root, env, stdio: "pipe" });
}
