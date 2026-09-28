// Runs in each integration test worker BEFORE application modules load, so
// src/lib/env.ts caches the test URLs. Shopify values are fake: integration
// tests mock the Shopify module boundary, never the network.
import { testServiceUrls } from "./test-urls";

const { databaseUrl, redisUrl } = testServiceUrls();
(process.env as Record<string, string>).NODE_ENV = "test";
process.env.LOG_LEVEL = process.env.TEST_LOG_LEVEL ?? "fatal";
process.env.DATABASE_URL = databaseUrl;
process.env.REDIS_URL = redisUrl;
process.env.SHOPIFY_SHOP = "test-shop";
process.env.SHOPIFY_CLIENT_ID = "test-client-id";
process.env.SHOPIFY_CLIENT_SECRET = "test-client-secret";
process.env.SHOPIFY_API_VERSION = "2026-07";
process.env.SHOP_CURRENCY = "PKR";
process.env.SYNC_INTERVAL_MINUTES = "0";
delete process.env.ADMIN_EMAIL; // board/admin disabled unless a test enables it
delete process.env.ADMIN_PASSWORD;
