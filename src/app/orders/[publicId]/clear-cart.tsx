"use client";
// The order is saved by the time this page renders, so the local cart can go.
import { useEffect } from "react";
import { cart } from "@/app/cart/cart-store";

export function ClearCart() {
  useEffect(() => cart.clear(), []);
  return null;
}
