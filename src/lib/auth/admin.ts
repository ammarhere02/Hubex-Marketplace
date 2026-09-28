// Admin identity comes from the environment, not the database: ADMIN_EMAIL /
// ADMIN_PASSWORD in .env. The admin logs in through the normal /login page;
// on a credential match we upsert a matching User row so the standard
// DB-backed session flow (cookie + Session table) applies unchanged.
import { createHash, timingSafeEqual } from "node:crypto";
import { env } from "../env";
import { prisma } from "../prisma";
import { hashPassword, type AuthUser } from "./passport";

function safeEqual(a: string, b: string): boolean {
  // Hash first so lengths always match and comparison stays constant-time.
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

/** True when this session user is the configured admin. */
export function isAdmin(user: AuthUser | null): boolean {
  const { ADMIN_EMAIL, ADMIN_PASSWORD } = env();
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD || !user) return false;
  return user.email === ADMIN_EMAIL;
}

/**
 * If the credentials match ADMIN_EMAIL/ADMIN_PASSWORD, upserts the admin's
 * User row and returns it; otherwise null (fall through to the DB check).
 */
export async function authenticateAdmin(email: string, password: string): Promise<AuthUser | null> {
  const { ADMIN_EMAIL, ADMIN_PASSWORD } = env();
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD) return null;
  if (!safeEqual(email, ADMIN_EMAIL) || !safeEqual(password, ADMIN_PASSWORD)) return null;
  const passwordHash = await hashPassword(password);
  const user = await prisma.user.upsert({
    where: { email: ADMIN_EMAIL },
    update: { passwordHash },
    create: { email: ADMIN_EMAIL, name: "Admin", passwordHash },
  });
  return { id: user.id, email: user.email, name: user.name };
}
