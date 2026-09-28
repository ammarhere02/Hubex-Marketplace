import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Bull Board reads its HTML template and static assets from its own package
  // directory at runtime, so these must stay plain node_modules requires.
  serverExternalPackages: ["@bull-board/api", "@bull-board/ui", "@bull-board/hono", "@hono/node-server", "ejs"],
  // The e2e suite (playwright.config.ts) starts its own dev server with a
  // separate build/lock directory so it can run beside the normal `next dev`.
  distDir: process.env.NEXT_DIST_DIR || ".next",
};

export default nextConfig;
