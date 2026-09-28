// Validates configuration once at startup so a missing variable fails loudly
// instead of surfacing later as a confusing runtime error. Server-only.
import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  LOG_LEVEL: z.enum(["trace", "debug", "info", "warn", "error", "fatal"]).default("info"),
  DATABASE_URL: z.string().startsWith("mysql://"),
  REDIS_URL: z.string().startsWith("redis://"),
  SHOPIFY_SHOP: z
    .string()
    .regex(/^[a-z0-9][a-z0-9-]*$/, "subdomain only, without .myshopify.com"),
  SHOPIFY_CLIENT_ID: z.string().min(1),
  SHOPIFY_CLIENT_SECRET: z.string().min(1),
  SHOPIFY_API_VERSION: z.string().regex(/^\d{4}-\d{2}$/),
  // Store currency (ISO 4217). Synced prices are in this currency; sync fails if Shopify disagrees.
  SHOP_CURRENCY: z.string().regex(/^[A-Z]{3}$/),
  // How often the worker schedules sync-products. 0 disables the schedule.
  SYNC_INTERVAL_MINUTES: z.coerce.number().int().min(0).default(15),
  // Admin credentials for the Bull Board at /admin/queues. The admin signs in
  // through the normal /login page with these; leave either empty to disable the board.
  ADMIN_EMAIL: z.string().trim().toLowerCase().email().optional(),
  ADMIN_PASSWORD: z.string().min(8).optional(),
});

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;

export function env(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    // Report variable names only — never values.
    const problems = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
    throw new Error(`Invalid environment configuration:\n  ${problems.join("\n  ")}`);
  }
  cached = parsed.data;
  return cached;
}
