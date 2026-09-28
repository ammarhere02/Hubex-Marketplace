import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";

// Three suites (see docs/TEST_CASES.md):
//   unit        node env, everything mocked           tests/unit/**
//   component   jsdom + Testing Library               tests/component/**
//   integration real MySQL (hubex_marketplace_test) + real Redis (db 1),
//               Shopify mocked                        tests/integration/**
// Coverage is collected across whichever projects run; `npm run test:coverage`
// runs unit+component+integration together so the report reflects all three.
export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  test: {
    globals: true,
    coverage: {
      provider: "v8",
      reporter: ["text-summary", "html", "lcov", "json-summary"],
      reportsDirectory: "coverage",
      // include-based scanning measures the whole application, files no test imports too.
      include: ["src/**/*.{ts,tsx}"],
      exclude: [
        "src/generated/**", // prisma generate output
        "src/vendor/**", // vendored AdminLTE theme
        "src/worker/index.ts", // process entrypoint: spawns real workers/signal handlers; covered by e2e-style manual verification
        "src/**/*.test.*",
      ],
    },
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          environment: "node",
          include: ["tests/unit/**/*.test.ts"],
          setupFiles: ["tests/setup/fake-env.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "component",
          environment: "jsdom",
          include: ["tests/component/**/*.test.{ts,tsx}"],
          setupFiles: ["tests/setup/fake-env.ts", "tests/setup/component.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "integration",
          environment: "node",
          include: ["tests/integration/**/*.test.ts"],
          setupFiles: ["tests/setup/integration-env.ts"],
          globalSetup: ["tests/setup/integration-global.ts"],
          // One database, sequential files: no cross-test interference.
          fileParallelism: false,
          testTimeout: 30_000,
          hookTimeout: 60_000,
        },
      },
    ],
  },
});
