import { beforeEach, describe, expect, it, vi } from "vitest";
import bcrypt from "bcryptjs";

const { user, createSession, destroySession, getSessionUser } = vi.hoisted(() => ({
  user: { findUnique: vi.fn(), create: vi.fn(), upsert: vi.fn() },
  createSession: vi.fn(),
  destroySession: vi.fn(),
  getSessionUser: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({ prisma: { user } }));
vi.mock("@/lib/auth/session", () => ({ createSession, destroySession, getSessionUser }));

import { authenticateLocal, hashPassword } from "@/lib/auth/passport";
import { isAdmin } from "@/lib/auth/admin";
import { POST as register } from "@/app/api/auth/register/route";
import { POST as login } from "@/app/api/auth/login/route";
import { POST as logout } from "@/app/api/auth/logout/route";
import { GET as me } from "@/app/api/auth/me/route";

const jsonRequest = (body: unknown) =>
  new Request("https://app.example/api/auth/x", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

const HASH = bcrypt.hashSync("correct-password", 4);
const dbUser = { id: 5, email: "ada@example.com", name: "Ada", passwordHash: HASH };

beforeEach(() => {
  vi.clearAllMocks();
  user.findUnique.mockResolvedValue(null);
});

describe("passport local strategy", () => {
  it("authenticates a known email with the right password", async () => {
    user.findUnique.mockResolvedValue(dbUser);
    const result = await authenticateLocal("ada@example.com", "correct-password");
    expect(result).toEqual({ id: 5, email: "ada@example.com", name: "Ada" });
  });

  it("rejects a wrong password and an unknown email the same way", async () => {
    user.findUnique.mockResolvedValue(dbUser);
    expect(await authenticateLocal("ada@example.com", "wrong")).toBeNull();
    user.findUnique.mockResolvedValue(null);
    expect(await authenticateLocal("nobody@example.com", "correct-password")).toBeNull();
  });

  it("normalises the email before lookup", async () => {
    user.findUnique.mockResolvedValue(dbUser);
    await authenticateLocal("  ADA@Example.com ", "correct-password");
    expect(user.findUnique).toHaveBeenCalledWith({ where: { email: "ada@example.com" } });
  });

  it("hashPassword produces a bcrypt hash that verifies", async () => {
    const hash = await hashPassword("s3cret-pass");
    expect(hash).not.toContain("s3cret-pass");
    expect(bcrypt.compareSync("s3cret-pass", hash)).toBe(true);
  });
});

describe("isAdmin", () => {
  // fake-env leaves ADMIN_EMAIL/ADMIN_PASSWORD unset.
  it("is false for everyone when no admin is configured", () => {
    expect(isAdmin({ id: 1, email: "anyone@example.com", name: "X" })).toBe(false);
    expect(isAdmin(null)).toBe(false);
  });
});

describe("POST /api/auth/register", () => {
  const valid = { name: "Ada", email: "ada@example.com", password: "longenough" };

  it("creates the user with a hashed password and starts a session", async () => {
    user.create.mockResolvedValue({ id: 7, email: valid.email, name: "Ada" });
    const res = await register(jsonRequest(valid));
    expect(res.status).toBe(201);
    expect((await res.json()).user).toEqual({ id: 7, email: valid.email, name: "Ada" });
    const data = user.create.mock.calls[0][0].data;
    expect(data.passwordHash).not.toContain("longenough");
    expect(bcrypt.compareSync("longenough", data.passwordHash)).toBe(true);
    expect(createSession).toHaveBeenCalledWith(7);
  });

  it("rejects invalid input: bad email, short password, missing name, malformed JSON", async () => {
    for (const body of [
      { ...valid, email: "not-an-email" },
      { ...valid, password: "short" },
      { name: "", email: valid.email, password: valid.password },
      "{not json",
    ]) {
      const res = await register(jsonRequest(body));
      expect(res.status, JSON.stringify(body)).toBe(400);
    }
    expect(user.create).not.toHaveBeenCalled();
    expect(createSession).not.toHaveBeenCalled();
  });

  it("answers 409 for an already-registered email", async () => {
    user.findUnique.mockResolvedValue({ id: 1 });
    const res = await register(jsonRequest(valid));
    expect(res.status).toBe(409);
    expect(user.create).not.toHaveBeenCalled();
  });
});

describe("POST /api/auth/login", () => {
  it("starts a session on valid credentials", async () => {
    user.findUnique.mockResolvedValue(dbUser);
    const res = await login(jsonRequest({ email: "ada@example.com", password: "correct-password" }));
    expect(res.status).toBe(200);
    expect(createSession).toHaveBeenCalledWith(5);
  });

  it("answers 401 without a session on bad credentials", async () => {
    user.findUnique.mockResolvedValue(dbUser);
    const res = await login(jsonRequest({ email: "ada@example.com", password: "wrong" }));
    expect(res.status).toBe(401);
    expect(createSession).not.toHaveBeenCalled();
  });

  it("answers 400 on malformed input", async () => {
    expect((await login(jsonRequest({ email: "x" }))).status).toBe(400);
    expect((await login(jsonRequest("{oops"))).status).toBe(400);
  });
});

describe("session endpoints", () => {
  it("GET /api/auth/me returns the user, or 401 when signed out", async () => {
    getSessionUser.mockResolvedValue({ id: 5, email: "ada@example.com", name: "Ada" });
    expect((await me()).status).toBe(200);
    getSessionUser.mockResolvedValue(null);
    expect((await me()).status).toBe(401);
  });

  it("POST /api/auth/logout destroys the session", async () => {
    const res = await logout();
    expect(res.status).toBe(200);
    expect(destroySession).toHaveBeenCalled();
  });
});
