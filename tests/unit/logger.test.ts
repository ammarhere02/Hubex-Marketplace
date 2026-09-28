import { describe, expect, it } from "vitest";
import { mask } from "@/lib/logger";

describe("mask", () => {
  it("keeps only the first and last two characters", () => {
    expect(mask("+923001234567")).toBe("+9*********67");
  });

  it("fully masks short values instead of leaking them", () => {
    expect(mask("abcd")).toBe("****");
    expect(mask("ab")).toBe("**");
  });

  it("returns empty string for null/undefined/empty", () => {
    expect(mask(null)).toBe("");
    expect(mask(undefined)).toBe("");
    expect(mask("")).toBe("");
  });

  it("honours a custom keep length", () => {
    expect(mask("secret-value", 3)).toBe("sec******lue");
  });
});

describe("logger redaction", () => {
  it("replaces sensitive fields in log output", async () => {
    // A pino instance with the app's real redact list, writing to a buffer.
    const { default: pino } = await import("pino");
    const { REDACT_PATHS } = await import("@/lib/logger");
    const lines: string[] = [];
    const test = pino(
      { level: "info", redact: { paths: REDACT_PATHS, censor: "[redacted]" } },
      { write: (s: string) => void lines.push(s) },
    );
    test.info(
      {
        phone: "+923001234567",
        email: "a@b.c",
        address1: "12 Secret Lane",
        password: "hunter2",
        shopify: { token: "shpat_x", accessToken: "abc" },
        headers: { authorization: "Basic xyz" },
      },
      "hello",
    );
    const line = JSON.parse(lines[0]);
    expect(line.phone).toBe("[redacted]");
    expect(line.email).toBe("[redacted]");
    expect(line.address1).toBe("[redacted]");
    expect(line.password).toBe("[redacted]");
    expect(line.shopify.token).toBe("[redacted]");
    expect(line.shopify.accessToken).toBe("[redacted]");
    expect(line.headers.authorization).toBe("[redacted]");
    expect(line.msg).toBe("hello");
  });
});
