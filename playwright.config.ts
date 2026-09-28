// Browser (e2e) tests. A dedicated database (hubex_marketplace_e2e) and Redis
// db 2 keep them away from both development data and the Vitest integration DB.
// The dev server is started here with those URLs; Shopify credentials are fake —
// checkout enqueues to Redis but no worker runs, so orders stay PENDING_SYNC,
// which is exactly the state the confirmation page must handle.
// NOTE: baseURL must be localhost (not 127.0.0.1): Next 16 blocks cross-origin
// dev resources (hydration/HMR) from other host spellings by default.
import { defineConfig, devices } from "@playwright/test";
import { e2eEnv } from "./tests/e2e/env";

const PORT = 3105;

export default defineConfig({
  testDir: "tests/e2e",
  globalSetup: "./tests/e2e/global-setup.ts",
  fullyParallel: false, // one shared database; specs manage their own state
  workers: 1,
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] }, grepInvert: /@desktop-only/ },
  ],
  webServer: {
    command: `npx next dev --port ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: e2eEnv(),
  },
});
