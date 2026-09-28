// Queue dashboard access against real Redis-backed queues. The admin identity
// is env-owned; env() and the session lookup are mocked so each access level
// (anonymous, ordinary user, admin) is reproducible.
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthUser } from "@/lib/auth/passport";

const ADMIN_EMAIL = "admin@test.local";

const { getSessionUser } = vi.hoisted(() => ({ getSessionUser: vi.fn<() => Promise<AuthUser | null>>() }));
vi.mock("@/lib/auth/session", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getSessionUser,
}));
vi.mock("@/lib/env", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/env")>();
  return {
    ...actual,
    env: () => ({ ...actual.env(), ADMIN_EMAIL: "admin@test.local", ADMIN_PASSWORD: "admin-secret-123" }),
  };
});

import { GET } from "@/app/(admin)/admin/queues/[[...path]]/route";

const req = (path = "/admin/queues") => new Request(`https://app.example${path}`);

beforeEach(() => {
  getSessionUser.mockReset();
  getSessionUser.mockResolvedValue(null);
});
afterAll(async () => {
  const { closeQueues } = await import("@/lib/queue");
  await closeQueues();
  const { prisma } = await import("@/lib/prisma");
  await prisma.$disconnect();
});

describe("queue dashboard access", () => {
  it("redirects anonymous visitors to /login with a next parameter", async () => {
    const res = await GET(req());
    expect(res.status).toBe(302);
    const location = new URL(res.headers.get("location")!);
    expect(location.pathname).toBe("/login");
    expect(location.searchParams.get("next")).toBe("/admin/queues");
  });

  it("answers 404 to signed-in non-admins (board existence not advertised)", async () => {
    getSessionUser.mockResolvedValue({ id: 2, email: "user@example.com", name: "User" });
    const res = await GET(req());
    expect(res.status).toBe(404);
  });

  it("serves the board to the admin", async () => {
    getSessionUser.mockResolvedValue({ id: 1, email: ADMIN_EMAIL, name: "Admin" });
    const res = await GET(req());
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("<!DOCTYPE html>");
  });

  it("protects nested board routes (API paths), not just the root", async () => {
    const anon = await GET(req("/admin/queues/api/queues"));
    expect(anon.status).toBe(302);
    getSessionUser.mockResolvedValue({ id: 1, email: ADMIN_EMAIL, name: "Admin" });
    const res = await GET(req("/admin/queues/api/queues"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { queues: Array<{ name: string }> };
    expect(body.queues.map((q) => q.name).sort()).toEqual(["catalog", "orders"]);
  });
});
