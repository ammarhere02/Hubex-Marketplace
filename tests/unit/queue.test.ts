import { describe, expect, it } from "vitest";
import { JOBS, JOB_OPTIONS, QUEUES, submitOrderJobId } from "@/lib/queue";

// Retry policy is part of the assignment contract: sync-products 3 total
// attempts, submit-order 5 total attempts, both exponential backoff.
describe("queue configuration", () => {
  it("gives sync-products 3 total attempts with exponential backoff", () => {
    expect(JOB_OPTIONS[JOBS.syncProducts]).toMatchObject({
      attempts: 3,
      backoff: { type: "exponential" },
    });
  });

  it("gives submit-order 5 total attempts with exponential backoff", () => {
    expect(JOB_OPTIONS[JOBS.submitOrder]).toMatchObject({
      attempts: 5,
      backoff: { type: "exponential" },
    });
  });

  it("runs ping and sweep-orders once, without retries", () => {
    expect(JOB_OPTIONS[JOBS.ping].attempts).toBe(1);
    expect(JOB_OPTIONS[JOBS.sweepOrders].attempts).toBe(1);
  });

  it("builds a deterministic submit-order job ID (no reserved ':' characters)", () => {
    expect(submitOrderJobId(42)).toBe("submit-order-42");
    expect(submitOrderJobId(42)).toBe(submitOrderJobId(42));
    expect(submitOrderJobId(7)).not.toContain(":");
  });

  it("keeps queue names stable (Redis keys depend on them)", () => {
    expect(QUEUES).toEqual({ catalog: "catalog", orders: "orders" });
  });
});
