"use client";
// Cart persistence: localStorage, holding ONLY { variantId, quantity }.
// Why localStorage: survives refresh and navigation without a server round
// trip, and nothing in it is trusted — the server re-prices every line.
// The key is scoped per signed-in account via the non-httpOnly hubex_uid
// cookie (set/cleared alongside the session): two accounts sharing a browser
// each see only their own cart, and logging back in restores it. The cookie
// is a display hint only — checkout authority is the httpOnly session.
// useSyncExternalStore keeps every component (and other tabs) in step.
import { useSyncExternalStore } from "react";

export interface CartLine {
  variantId: number;
  quantity: number;
}

const KEY_PREFIX = "hubex-cart-v1";
const MAX_QUANTITY = 99;
const EMPTY: CartLine[] = [];
const listeners = new Set<() => void>();
let cache: { key: string; raw: string | null; lines: CartLine[] } = { key: "", raw: null, lines: EMPTY };

function storageKey(): string {
  try {
    const m = document.cookie.match(/(?:^|;\s*)hubex_uid=(\d+)/);
    return `${KEY_PREFIX}:${m ? m[1] : "guest"}`;
  } catch {
    return `${KEY_PREFIX}:guest`;
  }
}

function read(): CartLine[] {
  const key = storageKey();
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(key);
  } catch {
    return EMPTY; // storage blocked (private mode etc.): behave as an empty cart
  }
  if (key === cache.key && raw === cache.raw) return cache.lines; // stable reference for React
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
  cache = { key, raw, lines };
  return lines;
}

function write(lines: CartLine[]) {
  try {
    localStorage.setItem(storageKey(), JSON.stringify(lines));
  } catch {
    // ignore: cart just won't persist
  }
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => e.key === storageKey() && listener();
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
