// Derives isolated test-service URLs from the developer's .env (or CI env vars)
// WITHOUT this file ever knowing the password: only the database name / Redis db
// number are rewritten. Guarantees tests cannot run against the dev database.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export const TEST_DB_NAME = "hubex_marketplace_test";
export const TEST_REDIS_DB = 1;

function loadDotEnv(): Record<string, string> {
  const out: Record<string, string> = {};
  try {
    for (const line of readFileSync(resolve(process.cwd(), ".env"), "utf8").split("\n")) {
      const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
      if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch {
    // no .env (CI): fall back to process.env only
  }
  return out;
}

export function testServiceUrls(): { databaseUrl: string; redisUrl: string } {
  const dotenv = loadDotEnv();
  const base = process.env.TEST_DATABASE_URL ?? dotenv.DATABASE_URL ?? process.env.DATABASE_URL;
  const redisBase = process.env.TEST_REDIS_URL ?? dotenv.REDIS_URL ?? process.env.REDIS_URL;
  if (!base || !redisBase) {
    throw new Error("Integration tests need DATABASE_URL and REDIS_URL (in .env) or TEST_DATABASE_URL/TEST_REDIS_URL");
  }
  const db = new URL(base);
  if (process.env.TEST_DATABASE_URL === undefined) db.pathname = `/${TEST_DB_NAME}`;
  const redis = new URL(redisBase);
  if (process.env.TEST_REDIS_URL === undefined) redis.pathname = `/${TEST_REDIS_DB}`;
  return { databaseUrl: db.toString(), redisUrl: redis.toString() };
}
