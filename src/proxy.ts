// Whole-site authentication gate: every page and API requires a signed-in
// account. Next.js 16 renamed the `middleware.ts` convention to `proxy.ts`
// (exporting `proxy`) — the old filename is silently ignored, which left the
// site wide open. The session cookie is VALIDATED against the database on each
// request (via the auth API), so a forged or expired cookie cannot bypass the
// gate. Deeper checks still apply behind it: checkout re-verifies the session,
// and /admin/queues re-checks the admin role server-side.
//
// Public: /login, /register, the auth API itself, the Shopify webhook
// (machine-to-machine, protected by its HMAC signature — Shopify cannot log
// in), and the Railway healthcheck (liveness only, exposes nothing).
import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_PATHS = [
  /^\/login$/,
  /^\/register$/,
  /^\/api\/auth\//,
  /^\/api\/webhooks\//,
  /^\/api\/health$/,
];
const SESSION_COOKIE = "hubex_session"; // keep in sync with src/lib/auth/session.ts

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (PUBLIC_PATHS.some((p) => p.test(pathname))) return NextResponse.next();

  const login = new URL("/login", request.url);
  if (pathname !== "/") login.searchParams.set("next", pathname);

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (!token) return NextResponse.redirect(login);

  // Real validation, not cookie presence: /api/auth/me checks the hashed token
  // and expiry in MySQL. A bad session is cleared so the browser stops sending it.
  //
  // Self-fetch over loopback HTTP, not request.url: in production request.url
  // is the public https:// domain, which from inside the container resolves
  // straight to this server's plain-HTTP port (Railway terminates TLS at the
  // edge) — a TLS handshake there dies with ERR_SSL_WRONG_VERSION_NUMBER.
  // The proxy and routes run in the same `next start` process, so loopback
  // always reaches the right server. Errors fail closed to /login, never 500.
  try {
    const me = await fetch(
      new URL("/api/auth/me", `http://127.0.0.1:${process.env.PORT ?? "3000"}`),
      { headers: { cookie: `${SESSION_COOKIE}=${token}` } },
    );
    if (!me.ok) {
      const res = NextResponse.redirect(login);
      res.cookies.delete(SESSION_COOKIE);
      return res;
    }
  } catch (error) {
    console.error("proxy: session validation failed", error);
    return NextResponse.redirect(login);
  }
  return NextResponse.next();
}

export const config = {
  // Everything except Next internals and static files (dot in the last segment).
  // Static assets are safe to serve; all HTML/data/API routes pass through here.
  matcher: ["/((?!_next|.*\\.[^/]+$).*)"],
};
