import { describe, expect, it } from "vitest";
import {
  ShopifyError,
  ShopifyGraphQLError,
  ShopifyThrottledError,
  ShopifyTransportError,
  ShopifyUserError,
} from "@/lib/shopify/errors";

// Jobs branch on `retryable` and `outcomeUnknown`; these flags are load-bearing.
describe("Shopify error vocabulary", () => {
  it("transport errors are retryable with unknown outcome", () => {
    const e = new ShopifyTransportError("timeout", 502);
    expect(e).toBeInstanceOf(ShopifyError);
    expect(e.retryable).toBe(true);
    expect(e.outcomeUnknown).toBe(true);
    expect(e.status).toBe(502);
    expect(e.name).toBe("ShopifyTransportError");
  });

  it("throttled errors are retryable but the request was never executed", () => {
    const e = new ShopifyThrottledError();
    expect(e.retryable).toBe(true);
    expect(e.outcomeUnknown).toBe(false);
  });

  it("GraphQL errors are permanent", () => {
    const e = new ShopifyGraphQLError("bad query", ["ACCESS_DENIED"]);
    expect(e.retryable).toBe(false);
    expect(e.outcomeUnknown).toBe(false);
    expect(e.codes).toEqual(["ACCESS_DENIED"]);
  });

  it("user errors are permanent and list every rejected field", () => {
    const e = new ShopifyUserError([
      { field: ["order", "phone"], message: "Phone is invalid" },
      { message: "Currency mismatch", code: "INVALID" },
    ]);
    expect(e.retryable).toBe(false);
    expect(e.message).toContain("Phone is invalid");
    expect(e.message).toContain("Currency mismatch");
    expect(e.userErrors).toHaveLength(2);
  });
});
