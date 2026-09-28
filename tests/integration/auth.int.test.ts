// Auth flow against the real database. next/headers cookies() only exists
// inside a Next request scope, so it is mocked with an in-memory jar; every
// other piece — bcrypt hashes, session rows, expiry — is real.
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const jar = vi.hoisted(() => {
  const store = new Map<string, string>();
  return {
    store,
    cookies: async () => ({
      get: (name: string) => (store.has(name) ? { name, value: store.get(name)! } : undefined),
      set: (name: string, value: string) => void store.set(name, value),
      delete: (name: string) => void store.delete(name),
    }),
  };
});
vi.mock("next/headers", () => ({ cookies: jar.cookies }));

// The env-admin needs credentials; integration-env leaves them unset.
const ADMIN_EMAIL = "admin@test.local";
const ADMIN_PASSWORD = "admin-secret-123";
vi.mock("@/lib/env", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/env")>();
  return { ...actual, env: () => ({ ...actual.env(), ADMIN_EMAIL: "admin@test.local", ADMIN_PASSWORD: "admin-secret-123" }) };
});

import { POST as register } from "@/app/api/auth/register/route";
import { checkoutAction } from "@/app/cart/actions";
import { POST as login } from "@/app/api/auth/login/route";
import { POST as logout } from "@/app/api/auth/logout/route";
import { getSessionUser, SESSION_COOKIE } from "@/lib/auth/session";
import { isAdmin } from "@/lib/auth/admin";
import { prisma } from "@/lib/prisma";
import { resetDb, seedProduct } from "./helpers";

const jsonRequest = (body: unknown) =>
  new Request("https://app.example/api/auth/x", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

const CREDS = { name: "Ada Lovelace", email: "ada@example.com", password: "longenough" };

beforeEach(async () => {
  jar.store.clear();
  await prisma.session.deleteMany();
  await prisma.user.deleteMany();
  await resetDb();
});
afterAll(() => prisma.$disconnect());

describe("auth integration", () => {
  it("register → session cookie set, session row stored hashed, user readable", async () => {
    const res = await register(jsonRequest(CREDS));
    expect(res.status).toBe(201);

    const token = jar.store.get(SESSION_COOKIE);
    expect(token).toBeTruthy();
    const session = await prisma.session.findFirstOrThrow();
    expect(session.tokenHash).not.toBe(token); // only the hash is stored
    expect(session.expiresAt.getTime()).toBeGreaterThan(Date.now());

    const user = await getSessionUser();
    expect(user).toMatchObject({ email: "ada@example.com", name: "Ada Lovelace" });
  });

  it("stored passwords are bcrypt hashes, never plaintext", async () => {
    await register(jsonRequest(CREDS));
    const row = await prisma.user.findUniqueOrThrow({ where: { email: CREDS.email } });
    expect(row.passwordHash).toMatch(/^\$2[aby]\$/);
    expect(row.passwordHash).not.toContain("longenough");
  });

  it("login works with right credentials and rejects wrong ones", async () => {
    await register(jsonRequest(CREDS));
    jar.store.clear(); // sign out locally

    expect((await login(jsonRequest({ email: CREDS.email, password: "wrong-pass" }))).status).toBe(401);
    expect(jar.store.has(SESSION_COOKIE)).toBe(false);

    expect((await login(jsonRequest({ email: CREDS.email, password: CREDS.password }))).status).toBe(200);
    expect(await getSessionUser()).toMatchObject({ email: CREDS.email });
  });

  it("logout deletes the session row; the old cookie no longer authenticates", async () => {
    await register(jsonRequest(CREDS));
    const token = jar.store.get(SESSION_COOKIE)!;
    await logout();
    expect(jar.store.has(SESSION_COOKIE)).toBe(false);
    expect(await prisma.session.count()).toBe(0);
    // Replaying the stolen cookie fails.
    jar.store.set(SESSION_COOKIE, token);
    expect(await getSessionUser()).toBeNull();
  });

  it("an expired session no longer authenticates", async () => {
    await register(jsonRequest(CREDS));
    await prisma.session.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
    expect(await getSessionUser()).toBeNull();
  });

  it("a garbage cookie value authenticates nobody", async () => {
    jar.store.set(SESSION_COOKIE, "forged-token");
    expect(await getSessionUser()).toBeNull();
  });

  it("the env-admin can log in (User row upserted) and is recognised by isAdmin", async () => {
    const res = await login(jsonRequest({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }));
    expect(res.status).toBe(200);
    const user = await getSessionUser();
    expect(user?.email).toBe(ADMIN_EMAIL);
    expect(isAdmin(user)).toBe(true);
    expect(await prisma.user.count({ where: { email: ADMIN_EMAIL } })).toBe(1);
    // Ordinary users are not admins.
    expect(isAdmin({ id: 99, email: "ada@example.com", name: "Ada" })).toBe(false);
  });

  it("admin login with the wrong password falls through and fails", async () => {
    const res = await login(jsonRequest({ email: ADMIN_EMAIL, password: "not-the-admin-pass" }));
    expect(res.status).toBe(401);
  });

  it("nobody can register the admin's email (answers 409 as if taken)", async () => {
    const res = await register(jsonRequest({ name: "Mallory", email: ADMIN_EMAIL, password: "sneaky-pass" }));
    expect(res.status).toBe(409);
    expect(await prisma.user.count({ where: { email: ADMIN_EMAIL } })).toBe(0);
  });

  it("checkout is refused without a session (server-side, not just UI)", async () => {
    const p = await seedProduct({ variants: [{ price: "100.00" }] });
    const form = new FormData();
    form.set("cart", JSON.stringify([{ variantId: p.variants[0].id, quantity: 1 }]));
    for (const [k, v] of Object.entries({ customerName: "Ada Lovelace", phone: "03001234567", address1: "12 Model Town", city: "Lahore", zip: "54000", country: "PK", paymentMethod: "COD" })) form.set(k, v);
    // No session cookie → the action must redirect to login and write nothing.
    const err = await checkoutAction({}, form).catch((e: Error) => e);
    expect(String((err as { digest?: string }).digest)).toContain("/login");
    expect(await prisma.order.count()).toBe(0);
  });

  it("an authenticated checkout stores the order under the account", async () => {
    await register(jsonRequest(CREDS)); // sets the session cookie in the jar
    const user = await prisma.user.findUniqueOrThrow({ where: { email: CREDS.email } });
    const p = await seedProduct({ variants: [{ price: "100.00" }] });
    const form = new FormData();
    form.set("cart", JSON.stringify([{ variantId: p.variants[0].id, quantity: 2 }]));
    for (const [k, v] of Object.entries({ customerName: "Ada Lovelace", phone: "03001234567", address1: "12 Model Town", city: "Lahore", zip: "54000", country: "PK", paymentMethod: "COD" })) form.set(k, v);
    const err = await checkoutAction({}, form).catch((e: Error) => e);
    expect(JSON.stringify((err as { digest?: string }).digest ?? err)).toContain("/orders/"); // success redirect
    const order = await prisma.order.findFirstOrThrow();
    expect(order.userId).toBe(user.id);
    expect(order.total.toFixed(2)).toBe("200.00");
  });

  it("duplicate registration answers 409", async () => {
    await register(jsonRequest(CREDS));
    expect((await register(jsonRequest(CREDS))).status).toBe(409);
    expect(await prisma.user.count()).toBe(1);
  });
});
