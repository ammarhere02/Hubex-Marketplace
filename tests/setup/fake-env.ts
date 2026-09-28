// Unit/component tests never touch real services: satisfy src/lib/env.ts with
// obviously fake values so importing modules that call env() cannot fail — and
// cannot accidentally reach the development database, Redis, or Shopify.
(process.env as Record<string, string>).NODE_ENV = "test";
process.env.LOG_LEVEL = "fatal"; // quietest level env.ts accepts
process.env.DATABASE_URL = "mysql://test:test@127.0.0.1:1/never_connects";
process.env.REDIS_URL = "redis://127.0.0.1:1/0";
process.env.SHOPIFY_SHOP = "test-shop";
process.env.SHOPIFY_CLIENT_ID = "test-client-id";
process.env.SHOPIFY_CLIENT_SECRET = "test-client-secret";
process.env.SHOPIFY_API_VERSION = "2026-07";
process.env.SHOP_CURRENCY = "PKR";
process.env.SYNC_INTERVAL_MINUTES = "0";
delete process.env.ADMIN_EMAIL; // board/admin disabled unless a test enables it
delete process.env.ADMIN_PASSWORD;
