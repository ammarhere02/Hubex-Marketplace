"use client";
// Cart persistence: localStorage, holding ONLY { variantId, quantity }.
// Why localStorage: survives refresh and navigation with no login or server
// session, and nothing in it is trusted — the server re-prices every line.
// useSyncExternalStore keeps every component (and other tabs) in step.
import { useSyncExternalStore } from "react";

export interface CartLine {
  variantId: number;
  quantity: number;
}

const KEY = "hubex-cart-v1";
const MAX_QUANTITY = 99;
const EMPTY: CartLine[] = [];
const listeners = new Set<() => void>();
let cache: { raw: string | null; lines: CartLine[] } = { raw: null, lines: EMPTY };

function read(): CartLine[] {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(KEY);
  } catch {
    return EMPTY; // storage blocked (private mode etc.): behave as an empty cart
  }
  if (raw === cache.raw) return cache.lines; // stable reference for React
  let lines: CartLine[] = EMPTY;
  try {
    const parsed: unknown = JSON.parse(raw ?? "[]");
    if (Array.isArray(parsed)) {
      lines = parsed.filter(
        (l): l is CartLine =>
          Number.isInteger(l?.variantId) && l.variantId > 0 && Number.isInteger(l?.quantity) && l.quantity > 0,
      );
    }
  } catch {
    // corrupt value: start over
  }
  cache = { raw, lines };
  return lines;
}

function write(lines: CartLine[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(lines));
  } catch {
    // ignore: cart just won't persist
  }
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => e.key === KEY && listener();
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

export function useCart(): CartLine[] {
  return useSyncExternalStore(subscribe, read, () => EMPTY);
}

const clamp = (q: number) => Math.max(1, Math.min(MAX_QUANTITY, Math.floor(q)));

export const cart = {
  add(variantId: number, quantity: number) {
    const lines = read();
    const existing = lines.find((l) => l.variantId === variantId);
    write(
      existing
        ? lines.map((l) => (l.variantId === variantId ? { ...l, quantity: clamp(l.quantity + quantity) } : l))
        : [...lines, { variantId, quantity: clamp(quantity) }],
    );
  },
  setQuantity(variantId: number, quantity: number) {
    write(read().map((l) => (l.variantId === variantId ? { ...l, quantity: clamp(quantity) } : l)));
  },
  remove(variantId: number) {
    write(read().filter((l) => l.variantId !== variantId));
  },
  clear() {
    write([]);
  },
};
