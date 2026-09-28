// Environment for the e2e app server: same derivation trick as the integration
// suite — only the database name / Redis db index are rewritten, so the
// developer's real password never appears here and dev data is untouchable.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export const E2E_DB_NAME = "hubex_marketplace_e2e";
export const E2E_REDIS_DB = 2;

function loadDotEnv(): Record<string, string> {
  const out: Record<string, string> = {};
  try {
    for (const line of readFileSync(resolve(__dirname, "../../.env"), "utf8").split("\n")) {
      const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
      if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch {
    // CI: everything must come from process.env
  }
  return out;
}

export function e2eUrls(): { databaseUrl: string; redisUrl: string } {
  const dotenv = loadDotEnv();
  const base = process.env.E2E_DATABASE_URL ?? dotenv.DATABASE_URL ?? process.env.DATABASE_URL;
  const redisBase = process.env.E2E_REDIS_URL ?? dotenv.REDIS_URL ?? process.env.REDIS_URL;
  if (!base || !redisBase) throw new Error("e2e tests need DATABASE_URL and REDIS_URL (in .env) or E2E_* overrides");
  const db = new URL(base);
  if (!process.env.E2E_DATABASE_URL) db.pathname = `/${E2E_DB_NAME}`;
  const redis = new URL(redisBase);
  if (!process.env.E2E_REDIS_URL) redis.pathname = `/${E2E_REDIS_DB}`;
  return { databaseUrl: db.toString(), redisUrl: redis.toString() };
}

export function e2eEnv(): Record<string, string> {
  const { databaseUrl, redisUrl } = e2eUrls();
  return {
    ...(process.env as Record<string, string>),
    NODE_ENV: "development",
    NEXT_DIST_DIR: ".next-e2e", // own build/lock dir: coexists with `next dev`
    LOG_LEVEL: "fatal",
    DATABASE_URL: databaseUrl,
    REDIS_URL: redisUrl,
    SHOPIFY_SHOP: "e2e-shop",
    SHOPIFY_CLIENT_ID: "e2e-client-id",
    SHOPIFY_CLIENT_SECRET: "e2e-client-secret",
    SHOPIFY_API_VERSION: "2026-07",
    SHOP_CURRENCY: "PKR",
    SYNC_INTERVAL_MINUTES: "0",
    ADMIN_EMAIL: "admin@e2e.test",
    ADMIN_PASSWORD: "admin-secret-123",
  };
}
