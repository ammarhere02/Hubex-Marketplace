"use client";
// Renders the localStorage cart using prices from the server (quoteCart).
// Also used at checkout as the order summary.
import Link from "next/link";
import { useEffect, useState } from "react";
import { formatMoney } from "@/lib/money";
import { quoteCart, type CartQuote } from "./actions";
import { cart, useCart } from "./cart-store";

const REASONS = {
  not_found: "This item no longer exists.",
  unavailable: "This item is no longer available.",
  insufficient_stock: "Not enough stock",
} as const;

const EMPTY_QUOTE: CartQuote = { lines: [], problems: [], subtotal: "0.00", currency: "" };

export function useQuote() {
  const lines = useCart();
  const key = JSON.stringify(lines);
  // Each fetched quote remembers which cart it priced. While a new quote loads the
  // previous one stays on screen (no flicker); the server re-prices at checkout anyway.
  const [fetched, setFetched] = useState<{ key: string; quote: CartQuote } | null>(null);

  useEffect(() => {
    if (lines.length === 0) return;
    let cancelled = false;
    quoteCart(lines).then((quote) => !cancelled && setFetched({ key, quote }));
    return () => {
      cancelled = true;
    };
  }, [key, lines]);

  const quote = lines.length === 0 ? EMPTY_QUOTE : (fetched?.quote ?? null);
  return { lines, quote, stale: fetched?.key !== key };
}

export function CartView({ editable = true }: { editable?: boolean }) {
  const { lines, quote, stale } = useQuote();
  if (!quote) return <div className="card card-body text-muted">Loading cart…</div>;
  if (lines.length === 0)
    return (
      <div className="card card-body text-center py-5">
        <i className="fas fa-shopping-cart fa-3x text-muted mb-3" />
        <p className="mb-2">Your cart is empty.</p>
        <Link href="/products" className="btn btn-primary align-self-center">
          Browse products
        </Link>
      </div>
    );

  const money = (v: string) => formatMoney(v, quote.currency);
  return (
    <div className="card">
      <div className="card-body p-0 table-responsive">
        <table className="table table-hover mb-0" style={{ opacity: stale ? 0.6 : 1 }}>
          <thead>
            <tr>
              <th>Item</th>
              <th className="text-right">Price</th>
              <th className="text-center">Qty</th>
              <th className="text-right">Total</th>
              {editable && <th />}
            </tr>
          </thead>
          <tbody>
            {quote.lines.map((l) => (
              <tr key={l.variantId}>
                <td>
                  <div className="d-flex align-items-center">
                    {l.imageUrl && (
                      // eslint-disable-next-line @next/next/no-img-element -- Shopify CDN URL
                      <img src={l.imageUrl} alt="" className="img-size-50 rounded mr-3" />
                    )}
                    <div>
                      <Link href={`/products/${l.productHandle}`}>{l.productTitle}</Link>
                      <div className="text-muted small">{l.variantTitle}</div>
                    </div>
                  </div>
                </td>
                <td className="text-right align-middle">{money(l.unitPrice)}</td>
                <td className="text-center align-middle">
                  {editable ? (
                    <input
                      type="number"
                      className="form-control form-control-sm d-inline-block"
                      min={1}
                      max={99}
                      value={l.quantity}
                      onChange={(e) => cart.setQuantity(l.variantId, Number(e.target.value) || 1)}
                      style={{ width: 70 }}
                      aria-label={`Quantity for ${l.productTitle}`}
                    />
                  ) : (
                    l.quantity
                  )}
                </td>
                <td className="text-right align-middle">{money(l.lineTotal)}</td>
                {editable && (
                  <td className="text-right align-middle">
                    <button
                      className="btn btn-sm btn-outline-danger"
                      // The text span is hidden at mobile widths, so the label keeps the button accessible.
                      aria-label={`Remove ${l.productTitle}`}
                      onClick={() => cart.remove(l.variantId)}
                    >
                      <i className="fas fa-trash" /> <span className="d-none d-md-inline">Remove</span>
                    </button>
                  </td>
                )}
              </tr>
            ))}
            {quote.problems.map((p) => (
              <tr key={p.variantId} className="table-danger">
                <td colSpan={editable ? 4 : 3}>
                  <i className="fas fa-exclamation-triangle mr-2" />
                  {REASONS[p.reason]}
                  {p.reason === "insufficient_stock" && ` (only ${p.available} left)`}
                </td>
                {editable && (
                  <td className="text-right">
                    {p.reason === "insufficient_stock" ? (
                      <button className="btn btn-sm btn-default" onClick={() => cart.setQuantity(p.variantId, p.available ?? 1)}>
                        Use {p.available}
                      </button>
                    ) : (
                      <button className="btn btn-sm btn-outline-danger" onClick={() => cart.remove(p.variantId)}>
                        Remove
                      </button>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="card-footer d-flex justify-content-between">
        <span className="text-muted">Prices checked by the store · Cash on Delivery</span>
        <strong>Subtotal: {money(quote.subtotal)}</strong>
      </div>
    </div>
  );
}
