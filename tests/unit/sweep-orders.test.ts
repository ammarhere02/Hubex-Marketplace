import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Job } from "bullmq";

const { order, getJob, enqueueSubmitOrder } = vi.hoisted(() => ({
  order: { findMany: vi.fn() },
  getJob: vi.fn(),
  enqueueSubmitOrder: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({ prisma: { order } }));
vi.mock("@/lib/queue", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getQueue: () => ({ getJob }),
  enqueueSubmitOrder,
}));

import { sweepOrdersJob } from "@/jobs/sweep-orders";
import { logger } from "@/lib/logger";

const run = () =>
  sweepOrdersJob.handler({ job: { data: {}, opts: {} } as unknown as Job, attempt: 1, log: logger });

const fakeJob = (state: string) => ({ getState: async () => state, remove: vi.fn() });

beforeEach(() => {
  vi.clearAllMocks();
  order.findMany.mockResolvedValue([]);
  getJob.mockResolvedValue(undefined);
  enqueueSubmitOrder.mockResolvedValue(undefined);
});

describe("sweep-orders job", () => {
  it("only sweeps PENDING_SYNC orders older than the grace period, oldest first, max 100", async () => {
    await run();
    const q = order.findMany.mock.calls[0][0];
    expect(q.where.status).toBe("PENDING_SYNC");
    expect(q.where.createdAt.lt.getTime()).toBeLessThanOrEqual(Date.now() - 2 * 60_000);
    expect(q).toMatchObject({ orderBy: { createdAt: "asc" }, take: 100 });
  });

  it("re-enqueues orders whose job is missing", async () => {
    order.findMany.mockResolvedValue([{ id: 1 }, { id: 2 }]);
    expect(await run()).toEqual({ checked: 2, live: 0, enqueued: 2 });
    expect(enqueueSubmitOrder).toHaveBeenCalledWith(1);
    expect(enqueueSubmitOrder).toHaveBeenCalledWith(2);
  });

  it("leaves orders alone while their job is waiting/delayed/active", async () => {
    order.findMany.mockResolvedValue([{ id: 1 }, { id: 2 }, { id: 3 }]);
    getJob
      .mockResolvedValueOnce(fakeJob("waiting"))
      .mockResolvedValueOnce(fakeJob("delayed"))
      .mockResolvedValueOnce(fakeJob("active"));
    expect(await run()).toEqual({ checked: 3, live: 3, enqueued: 0 });
    expect(enqueueSubmitOrder).not.toHaveBeenCalled();
  });

  it("removes a completed/failed stale job before re-enqueueing (deterministic job ID would block the add)", async () => {
    order.findMany.mockResolvedValue([{ id: 1 }, { id: 2 }]);
    const completed = fakeJob("completed");
    const failed = fakeJob("failed");
    getJob.mockResolvedValueOnce(completed).mockResolvedValueOnce(failed);
    expect(await run()).toEqual({ checked: 2, live: 0, enqueued: 2 });
    expect(completed.remove).toHaveBeenCalled();
    expect(failed.remove).toHaveBeenCalled();
    expect(completed.remove.mock.invocationCallOrder[0]).toBeLessThan(enqueueSubmitOrder.mock.invocationCallOrder[0]);
  });

  it("does nothing when no orders are stuck", async () => {
    expect(await run()).toEqual({ checked: 0, live: 0, enqueued: 0 });
    expect(getJob).not.toHaveBeenCalled();
  });
});
