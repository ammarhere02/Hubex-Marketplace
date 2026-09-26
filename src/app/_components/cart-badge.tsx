"use client";
import Link from "next/link";
import { useCart } from "@/app/cart/cart-store";

export function CartBadge() {
  const count = useCart().reduce((n, l) => n + l.quantity, 0);
  return (
    <Link href="/cart" className="nav-link mm-cart">
      <i className="fas fa-shopping-cart mr-1" /> Cart
      {count > 0 && <span className="badge badge-primary ml-1">{count}</span>}
    </Link>
  );
}
