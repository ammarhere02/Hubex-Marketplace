import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// env() caches its result at module scope, so each test re-imports a fresh copy.
async function freshEnv() {
  vi.resetModules();
  const mod = await import("@/lib/env");
  return mod.env;
}

const ORIGINAL = { ...process.env };

describe("env()", () => {
  beforeEach(() => {
    process.env = { ...ORIGINAL };
  });
  afterEach(() => {
    process.env = ORIGINAL;
  });

  it("parses a valid configuration and applies defaults", async () => {
    delete process.env.SYNC_INTERVAL_MINUTES;
    delete process.env.LOG_LEVEL;
    const env = await freshEnv();
    const parsed = env();
    expect(parsed.SHOPIFY_SHOP).toBe("test-shop");
    expect(parsed.SYNC_INTERVAL_MINUTES).toBe(15); // default
    expect(parsed.LOG_LEVEL).toBe("info"); // default
  });

  it("rejects a DATABASE_URL that is not mysql://", async () => {
    process.env.DATABASE_URL = "postgres://x";
    const env = await freshEnv();
    expect(() => env()).toThrow(/DATABASE_URL/);
  });

  it("rejects a full myshopify.com domain in SHOPIFY_SHOP", async () => {
    process.env.SHOPIFY_SHOP = "my-shop.myshopify.com";
    const env = await freshEnv();
    expect(() => env()).toThrow(/SHOPIFY_SHOP/);
  });

  it("rejects a malformed API version", async () => {
    process.env.SHOPIFY_API_VERSION = "latest";
    const env = await freshEnv();
    expect(() => env()).toThrow(/SHOPIFY_API_VERSION/);
  });

  it("rejects a non-ISO currency", async () => {
    process.env.SHOP_CURRENCY = "rupees";
    const env = await freshEnv();
    expect(() => env()).toThrow(/SHOP_CURRENCY/);
  });

  it("rejects a negative sync interval but accepts 0 (disabled)", async () => {
    process.env.SYNC_INTERVAL_MINUTES = "-5";
    let env = await freshEnv();
    expect(() => env()).toThrow(/SYNC_INTERVAL_MINUTES/);
    process.env.SYNC_INTERVAL_MINUTES = "0";
    env = await freshEnv();
    expect(env().SYNC_INTERVAL_MINUTES).toBe(0);
  });

  it("reports variable names but never values", async () => {
    process.env.DATABASE_URL = "postgres://secret-host/secret-db";
    const env = await freshEnv();
    try {
      env();
      expect.unreachable("should have thrown");
    } catch (e) {
      expect((e as Error).message).not.toContain("secret-host");
      expect((e as Error).message).toContain("DATABASE_URL");
    }
  });

  it("fails when a required variable is missing entirely", async () => {
    delete process.env.SHOPIFY_CLIENT_SECRET;
    const env = await freshEnv();
    expect(() => env()).toThrow(/SHOPIFY_CLIENT_SECRET/);
  });

  it("caches the first successful parse", async () => {
    const env = await freshEnv();
    const first = env();
    process.env.SHOPIFY_SHOP = "changed-later";
    expect(env().SHOPIFY_SHOP).toBe(first.SHOPIFY_SHOP);
  });
});
