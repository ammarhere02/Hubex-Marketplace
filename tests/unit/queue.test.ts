import { describe, expect, it } from "vitest";
import { buildSubmitOrderSummary, JOBS, JOB_OPTIONS, QUEUES, submitOrderJobId } from "@/lib/queue";

const sampleOrder = {
  publicId: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  customerName: "Grace Hopper",
  phone: "+923001234567",
  city: "Karachi",
  total: { toFixed: () => "3000.00" },
  currency: "PKR",
  items: [
    { productTitle: "Trail Shoe", variantTitle: "Blue / 42", quantity: 2 },
    { productTitle: "Watch Strap", variantTitle: "Default Title", quantity: 1 },
  ],
};

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

describe("submit-order Bull Board summary", () => {
  it("shows who ordered and what, masking PII", () => {
    const s = buildSubmitOrderSummary(sampleOrder);
    expect(s.customer).toBe("Grace H."); // first name + last initial, not the full name
    expect(s.phone).toBe("+9*********67"); // masked, never the raw number
    expect(s.city).toBe("Karachi");
    expect(s.ref).toBe("a1b2c3d4"); // short reference matching the Shopify note/tag
    expect(s.itemCount).toBe(3);
    expect(s.total).toBe("Rs 3,000.00");
  });

  it("labels items with quantity and hides Shopify's default variant title", () => {
    const s = buildSubmitOrderSummary(sampleOrder);
    expect(s.items).toEqual(["2× Trail Shoe — Blue / 42", "1× Watch Strap"]);
  });

  it("handles a single-word customer name without an undefined initial", () => {
    const s = buildSubmitOrderSummary({ ...sampleOrder, customerName: "Prince" });
    expect(s.customer).toBe("Prince");
  });
});
