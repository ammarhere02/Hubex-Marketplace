import { describe, expect, it, vi } from "vitest";

// The board must not even build (no queue/Redis contact) when it is disabled.
const getQueue = vi.hoisted(() => vi.fn());
vi.mock("@/lib/queue", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getQueue,
}));

import { GET } from "@/app/admin/queues/[[...path]]/route";

describe("queue dashboard route (disabled configuration)", () => {
  // fake-env.ts leaves ADMIN_EMAIL/ADMIN_PASSWORD unset.
  it("returns 404 and never touches the queues when the admin is not configured", async () => {
    const res = await GET(new Request("https://app.example/admin/queues"));
    expect(res.status).toBe(404);
    expect(getQueue).not.toHaveBeenCalled();
  });
});
