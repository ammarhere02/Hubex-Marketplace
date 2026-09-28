// DB-backed sessions. The browser cookie carries a random opaque token; MySQL
// stores only its SHA-256 hash, so leaked DB rows can't be replayed as logins.
import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { prisma } from "../prisma";
import type { AuthUser } from "./passport";

export const SESSION_COOKIE = "hubex_session";
// Non-httpOnly companion holding only the numeric user id, so client code can
// scope per-account state (the localStorage cart key). Never an auth input:
// every server decision reads the httpOnly session cookie.
export const UID_COOKIE = "hubex_uid";
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Creates a session row and sets the cookie. Call from a Route Handler or Server Function. */
export async function createSession(userId: number): Promise<void> {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await prisma.session.create({ data: { tokenHash: hashToken(token), userId, expiresAt } });
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
  store.set(UID_COOKIE, String(userId), {
    httpOnly: false,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
}

/** Returns the logged-in user, or null. Safe in Server Components (read-only). */
export async function getSessionUser(): Promise<AuthUser | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await prisma.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: true },
  });
  if (!session || session.expiresAt < new Date()) return null;
  return { id: session.user.id, email: session.user.email, name: session.user.name };
}

/** Deletes the session row (if any) and clears the cookie. */
export async function destroySession(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) {
    await prisma.session.deleteMany({ where: { tokenHash: hashToken(token) } });
  }
  store.delete(SESSION_COOKIE);
  store.delete(UID_COOKIE);
}
