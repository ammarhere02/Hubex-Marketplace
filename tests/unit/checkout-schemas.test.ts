import { describe, expect, it } from "vitest";
import { MAX_QUANTITY, cartLinesSchema, customerSchema } from "@/lib/checkout";
import { validCustomer } from "../helpers/factories";

describe("cartLinesSchema", () => {
  it("accepts a valid cart", () => {
    const r = cartLinesSchema.safeParse([{ variantId: 1, quantity: 2 }]);
    expect(r.success).toBe(true);
  });

  it("rejects an empty cart", () => {
    expect(cartLinesSchema.safeParse([]).success).toBe(false);
  });

  it("rejects non-integer, zero, and negative IDs/quantities", () => {
    for (const bad of [
      [{ variantId: 1.5, quantity: 1 }],
      [{ variantId: 0, quantity: 1 }],
      [{ variantId: -3, quantity: 1 }],
      [{ variantId: 1, quantity: 0 }],
      [{ variantId: 1, quantity: -1 }],
      [{ variantId: 1, quantity: 2.5 }],
      [{ variantId: "1", quantity: 1 }],
    ]) {
      expect(cartLinesSchema.safeParse(bad).success, JSON.stringify(bad)).toBe(false);
    }
  });

  it(`caps quantity at ${MAX_QUANTITY} per line`, () => {
    expect(cartLinesSchema.safeParse([{ variantId: 1, quantity: MAX_QUANTITY }]).success).toBe(true);
    expect(cartLinesSchema.safeParse([{ variantId: 1, quantity: MAX_QUANTITY + 1 }]).success).toBe(false);
  });

  it("caps the cart at 50 lines", () => {
    const lines = (n: number) => Array.from({ length: n }, (_, i) => ({ variantId: i + 1, quantity: 1 }));
    expect(cartLinesSchema.safeParse(lines(50)).success).toBe(true);
    expect(cartLinesSchema.safeParse(lines(51)).success).toBe(false);
  });

  it("rejects non-array payloads", () => {
    expect(cartLinesSchema.safeParse({ variantId: 1, quantity: 1 }).success).toBe(false);
    expect(cartLinesSchema.safeParse("[]").success).toBe(false);
  });
});

describe("customerSchema", () => {
  const parse = (overrides: Record<string, unknown>) => customerSchema.safeParse({ ...validCustomer, ...overrides });

  it("accepts a valid customer and normalises the phone to E.164", () => {
    const r = customerSchema.safeParse(validCustomer);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.phone).toBe("+923001234567");
  });

  it("normalises a phone already carrying the country prefix", () => {
    const r = parse({ phone: "923001234567" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.phone).toBe("+923001234567");
  });

  it("requires first AND last name", () => {
    expect(parse({ customerName: "Ada" }).success).toBe(false);
    expect(parse({ customerName: "   " }).success).toBe(false);
  });

  it("rejects a phone that is invalid for the delivery country", () => {
    const r = parse({ phone: "12345" });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0].path).toEqual(["phone"]);
  });

  it("requires address1, city, and zip", () => {
    for (const field of ["address1", "city", "zip"]) {
      expect(parse({ [field]: "" }).success, field).toBe(false);
    }
  });

  it("turns empty optional fields into null", () => {
    const r = parse({ address2: "", province: "", email: "" });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.address2).toBeNull();
      expect(r.data.province).toBeNull();
      expect(r.data.email).toBeNull();
    }
  });

  it("rejects an invalid email but accepts a missing one", () => {
    expect(parse({ email: "not-an-email" }).success).toBe(false);
    expect(parse({ email: "" }).success).toBe(true);
  });

  it("uppercases the country code and rejects non-ISO values", () => {
    const r = parse({ country: "pk" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.country).toBe("PK");
    expect(parse({ country: "Pakistan" }).success).toBe(false);
  });

  it("only accepts COD as the payment method", () => {
    expect(parse({ paymentMethod: "CARD" }).success).toBe(false);
    expect(parse({ paymentMethod: "" }).success).toBe(false);
  });

  it("rejects oversized field values", () => {
    expect(parse({ city: "x".repeat(129) }).success).toBe(false);
    expect(parse({ customerName: `A ${"x".repeat(255)}` }).success).toBe(false);
  });
});
