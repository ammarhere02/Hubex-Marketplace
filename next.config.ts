import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Bull Board reads its HTML template and static assets from its own package
  // directory at runtime, so these must stay plain node_modules requires.
  serverExternalPackages: ["@bull-board/api", "@bull-board/ui", "@bull-board/hono", "@hono/node-server", "ejs"],
};

export default nextConfig;
