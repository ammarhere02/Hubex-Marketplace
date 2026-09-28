import { describe, expect, it } from "vitest";
import { formatMoney } from "@/lib/money";

describe("formatMoney", () => {
  it("formats a whole amount with two decimals", () => {
    expect(formatMoney("1500", "PKR")).toBe("Rs 1,500.00");
  });

  it("keeps decimal fractions", () => {
    expect(formatMoney("1234.56", "PKR")).toBe("Rs 1,234.56");
  });

  it("pads a single-digit fraction", () => {
    expect(formatMoney("10.5", "PKR")).toBe("Rs 10.50");
  });

  it("truncates fractions longer than two digits", () => {
    expect(formatMoney("10.999", "PKR")).toBe("Rs 10.99");
  });

  it("groups thousands in large amounts", () => {
    expect(formatMoney("123456789.00", "PKR")).toBe("Rs 123,456,789.00");
  });

  it("formats zero", () => {
    expect(formatMoney("0.00", "PKR")).toBe("Rs 0.00");
  });

  it("uses PKR's Rs symbol but the raw code for other currencies", () => {
    expect(formatMoney("9.99", "USD")).toBe("USD 9.99");
    expect(formatMoney("9.99", "PKR").startsWith("Rs ")).toBe(true);
  });

  it("does not group amounts under 1000", () => {
    expect(formatMoney("999.99", "PKR")).toBe("Rs 999.99");
  });
});
