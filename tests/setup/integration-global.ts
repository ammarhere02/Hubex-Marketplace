// One-time integration setup: migrate the dedicated test database and flush the
// dedicated Redis db. Both URLs are derived (tests/setup/test-urls.ts) so this
// can never touch hubex_marketplace or Redis db 0.
import { execSync } from "node:child_process";
import { Redis } from "ioredis";
import { TEST_DB_NAME, TEST_REDIS_DB, testServiceUrls } from "./test-urls";

export default async function globalSetup(): Promise<void> {
  const { databaseUrl, redisUrl } = testServiceUrls();
  if (!process.env.TEST_DATABASE_URL && !new URL(databaseUrl).pathname.endsWith(TEST_DB_NAME)) {
    throw new Error(`Refusing to run integration tests against ${new URL(databaseUrl).pathname}`);
  }
  execSync("npx prisma migrate deploy", {
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: "pipe",
  });

  const redis = new Redis(redisUrl);
  const dbIndex = Number(new URL(redisUrl).pathname.slice(1) || 0);
  if (!process.env.TEST_REDIS_URL && dbIndex !== TEST_REDIS_DB) {
    throw new Error(`Refusing to flush Redis db ${dbIndex}`);
  }
  await redis.flushdb(); // only the test db index
  await redis.quit();
}
