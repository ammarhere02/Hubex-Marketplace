// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cart, useCart } from "@/app/cart/cart-store";

const KEY = "hubex-cart-v1";
const stored = () => JSON.parse(localStorage.getItem(KEY) ?? "[]");

beforeEach(() => {
  localStorage.clear();
  cart.clear();
});

describe("cart store", () => {
  it("adds a line and persists it to localStorage", () => {
    cart.add(1, 2);
    expect(stored()).toEqual([{ variantId: 1, quantity: 2 }]);
  });

  it("merges quantities when the same variant is added again", () => {
    cart.add(1, 2);
    cart.add(1, 3);
    cart.add(2, 1);
    expect(stored()).toEqual([
      { variantId: 1, quantity: 5 },
      { variantId: 2, quantity: 1 },
    ]);
  });

  it("clamps quantities to 1..99 and floors fractions", () => {
    cart.add(1, 150);
    expect(stored()).toEqual([{ variantId: 1, quantity: 99 }]);
    cart.setQuantity(1, 0);
    expect(stored()).toEqual([{ variantId: 1, quantity: 1 }]);
    cart.setQuantity(1, 2.9);
    expect(stored()).toEqual([{ variantId: 1, quantity: 2 }]);
  });

  it("updates and removes lines", () => {
    cart.add(1, 1);
    cart.add(2, 1);
    cart.setQuantity(1, 7);
    cart.remove(2);
    expect(stored()).toEqual([{ variantId: 1, quantity: 7 }]);
  });

  it("clears the cart", () => {
    cart.add(1, 1);
    cart.clear();
    expect(stored()).toEqual([]);
  });

  it("survives corrupted stored JSON by starting over", () => {
    localStorage.setItem(KEY, "{not json![");
    const { result } = renderHook(() => useCart());
    expect(result.current).toEqual([]);
    act(() => cart.add(3, 1)); // still usable afterwards
    expect(result.current).toEqual([{ variantId: 3, quantity: 1 }]);
  });

  it("filters invalid entries out of stored data instead of trusting them", () => {
    localStorage.setItem(
      KEY,
      JSON.stringify([
        { variantId: 1, quantity: 2 },
        { variantId: -5, quantity: 2 },
        { variantId: 2, quantity: 0 },
        { variantId: 2.5, quantity: 1 },
        { variantId: "9", quantity: 1 },
        "garbage",
        null,
      ]),
    );
    const { result } = renderHook(() => useCart());
    expect(result.current).toEqual([{ variantId: 1, quantity: 2 }]);
  });

  it("treats a non-array stored value as an empty cart", () => {
    localStorage.setItem(KEY, JSON.stringify({ variantId: 1 }));
    const { result } = renderHook(() => useCart());
    expect(result.current).toEqual([]);
  });

  it("behaves as an empty cart when localStorage is unavailable", () => {
    const spy = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("blocked");
    });
    const setSpy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("blocked");
    });
    try {
      const { result } = renderHook(() => useCart());
      expect(result.current).toEqual([]);
      expect(() => cart.add(1, 1)).not.toThrow(); // write failure is swallowed
    } finally {
      spy.mockRestore();
      setSpy.mockRestore();
    }
  });

  it("notifies React components of updates", () => {
    const { result } = renderHook(() => useCart());
    expect(result.current).toEqual([]);
    act(() => cart.add(4, 2));
    expect(result.current).toEqual([{ variantId: 4, quantity: 2 }]);
  });

  it("keeps a stable array reference between renders while unchanged", () => {
    act(() => cart.add(1, 1));
    const { result, rerender } = renderHook(() => useCart());
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
  });

  it("picks up changes written by another tab (storage event)", () => {
    const { result } = renderHook(() => useCart());
    act(() => {
      localStorage.setItem(KEY, JSON.stringify([{ variantId: 8, quantity: 3 }]));
      window.dispatchEvent(new StorageEvent("storage", { key: KEY, newValue: "x" }));
    });
    expect(result.current).toEqual([{ variantId: 8, quantity: 3 }]);
  });

  it("ignores storage events for other keys", () => {
    const { result } = renderHook(() => useCart());
    const before = result.current;
    act(() => {
      localStorage.setItem(KEY, JSON.stringify([{ variantId: 8, quantity: 3 }]));
      window.dispatchEvent(new StorageEvent("storage", { key: "other-key", newValue: "x" }));
    });
    expect(result.current).toBe(before);
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});
