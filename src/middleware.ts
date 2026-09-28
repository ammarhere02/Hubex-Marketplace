// Whole-site authentication gate: every page and API requires a signed-in
// account. The session cookie is VALIDATED against the database on each
// request (via the auth API — middleware has no direct DB access), so a forged
// or expired cookie cannot bypass the gate. Deeper checks still apply behind
// it: checkout re-verifies the session, and /admin/queues re-checks the admin
// role server-side.
//
// Public: /login, /register, the auth API itself, and the Shopify webhook
// (machine-to-machine, protected by its HMAC signature — Shopify cannot log in).
import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_PATHS = [/^\/login$/, /^\/register$/, /^\/api\/auth\//, /^\/api\/webhooks\//];
const SESSION_COOKIE = "hubex_session"; // keep in sync with src/lib/auth/session.ts

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (PUBLIC_PATHS.some((p) => p.test(pathname))) return NextResponse.next();

  const login = new URL("/login", request.url);
  if (pathname !== "/") login.searchParams.set("next", pathname);

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (!token) return NextResponse.redirect(login);

  // Real validation, not cookie presence: /api/auth/me checks the hashed token
  // and expiry in MySQL. A bad session is cleared so the browser stops sending it.
  const me = await fetch(new URL("/api/auth/me", request.url), {
    headers: { cookie: `${SESSION_COOKIE}=${token}` },
  });
  if (!me.ok) {
    const res = NextResponse.redirect(login);
    res.cookies.delete(SESSION_COOKIE);
    return res;
  }
  return NextResponse.next();
}

export const config = {
  // Everything except Next internals and static files (dot in the last segment).
  // Static assets are safe to serve; all HTML/data/API routes pass through here.
  matcher: ["/((?!_next|.*\\.[^/]+$).*)"],
};
