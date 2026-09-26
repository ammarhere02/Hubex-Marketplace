"use client";
// React conversion of AdminLTE 3.2.0 pages/examples/e-commerce.html.
// Same markup/classes (product-image, product-image-thumbs, btn-group-toggle,
// bg-gray price box, nav-tabs), but React owns the behaviour: gallery selection,
// option selectors → variant, price/stock, Add to Cart, tabs. No jQuery/Bootstrap JS.
// Wishlist, share icons and the Comments/Rating tabs are omitted: no backing data.
import Link from "next/link";
import { useMemo, useState } from "react";
import { cart } from "@/app/cart/cart-store";
import { formatMoney } from "@/lib/money";

export interface DetailVariant {
  id: number;
  title: string;
  sku: string | null;
  price: string;
  compareAtPrice: string | null;
  available: boolean;
  stock: number;
  options: Record<string, string>;
}
export interface DetailProps {
  title: string;
  descriptionHtml: string;
  currency: string;
  images: Array<{ id: number; url: string; altText: string | null }>;
  options: Array<{ name: string; values: string[] }>;
  variants: DetailVariant[];
}

const matches = (v: DetailVariant, selected: Record<string, string>) =>
  Object.entries(selected).every(([name, value]) => v.options[name] === value);

export function ProductDetail({ title, descriptionHtml, currency, images, options, variants }: DetailProps) {
  const initial = variants.find((v) => v.available) ?? variants[0];
  const [selected, setSelected] = useState<Record<string, string>>(initial?.options ?? {});
  const [imageIndex, setImageIndex] = useState(0);
  const [quantity, setQuantity] = useState(1);
  const [added, setAdded] = useState(false);
  const [tab, setTab] = useState<"desc" | "details">("desc");

  // Shopify's default single variant has the option "Title: Default Title": hide it.
  const visibleOptions = options.filter((o) => !(o.values.length === 1 && o.values[0] === "Default Title"));
  const variant = useMemo(() => variants.find((v) => matches(v, selected)), [variants, selected]);

  /** A value is selectable if some available variant has it together with the other current choices. */
  const isPossible = (name: string, value: string) =>
    variants.some((v) => v.available && matches(v, { ...selected, [name]: value }));

  function choose(name: string, value: string) {
    let next = { ...selected, [name]: value };
    // If the combination doesn't exist, jump to the closest variant that has this value.
    if (!variants.some((v) => matches(v, next))) {
      const fallback = variants.find((v) => v.options[name] === value && v.available) ?? variants.find((v) => v.options[name] === value);
      if (fallback) next = fallback.options;
    }
    setSelected(next);
    setAdded(false);
  }

  const main = images[imageIndex];
  const canBuy = Boolean(variant?.available);
  const maxQty = variant && variant.stock > 0 ? Math.min(99, variant.stock) : 99;

  return (
    <div className="card card-solid">
      <div className="card-body">
        <div className="row">
          <div className="col-12 col-sm-6">
            <h3 className="d-inline-block d-sm-none">{title}</h3>
            <div className="col-12">
              {main ? (
                // eslint-disable-next-line @next/next/no-img-element -- Shopify CDN URLs
                <img src={main.url} className="product-image" alt={main.altText ?? title} />
              ) : (
                <div className="product-image d-flex align-items-center justify-content-center">
                  <i className="fas fa-image fa-4x text-muted" />
                </div>
              )}
            </div>
            {images.length > 1 && (
              <div className="col-12 product-image-thumbs">
                {images.map((img, i) => (
                  <button
                    type="button"
                    key={img.id}
                    className={`product-image-thumb ${i === imageIndex ? "active" : ""}`}
                    onClick={() => setImageIndex(i)}
                    aria-label={`Show image ${i + 1}`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element -- Shopify CDN URLs */}
                    <img src={img.url} alt={img.altText ?? `${title} ${i + 1}`} />
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="col-12 col-sm-6">
            <h3 className="my-3">{title}</h3>
            {variant?.sku && <p className="text-muted mb-0">SKU: {variant.sku}</p>}
            <hr />

            {visibleOptions.map((o) => (
              <div key={o.name} className="mb-3">
                <h4 className="mt-3">
                  {o.name} <small>Please select one</small>
                </h4>
                <div className="btn-group btn-group-toggle" role="radiogroup" aria-label={o.name}>
                  {o.values.map((value) => {
                    const active = selected[o.name] === value;
                    const possible = isPossible(o.name, value);
                    return (
                      <label
                        key={value}
                        className={`btn btn-default text-center ${active ? "active" : ""} ${possible ? "" : "text-muted"}`}
                        title={possible ? undefined : "Sold out in this combination"}
                      >
                        <input
                          type="radio"
                          name={`option-${o.name}`}
                          autoComplete="off"
                          checked={active}
                          onChange={() => choose(o.name, value)}
                        />
                        {possible ? value : <del>{value}</del>}
                      </label>
                    );
                  })}
                </div>
              </div>
            ))}

            <div className="bg-gray py-2 px-3 mt-4">
              <h2 className="mb-0">{variant ? formatMoney(variant.price, currency) : "Unavailable"}</h2>
              <h4 className="mt-0">
                <small>
                  {variant?.compareAtPrice && (
                    <>
                      <del>{formatMoney(variant.compareAtPrice, currency)}</del>{" "}
                    </>
                  )}
                  {!variant
                    ? "This combination is not offered"
                    : !variant.available
                      ? "Sold out"
                      : variant.stock > 0
                        ? `In stock: ${variant.stock}`
                        : "In stock"}
                </small>
              </h4>
            </div>

            <div className="mt-4 d-flex align-items-center flex-wrap" style={{ gap: 8 }}>
              <input
                type="number"
                className="form-control form-control-lg"
                style={{ width: 90 }}
                min={1}
                max={maxQty}
                value={quantity}
                onChange={(e) => setQuantity(Math.max(1, Math.min(maxQty, Number(e.target.value) || 1)))}
                aria-label="Quantity"
              />
              <button
                type="button"
                className="btn btn-primary btn-lg btn-flat"
                disabled={!canBuy}
                onClick={() => {
                  if (!variant) return;
                  cart.add(variant.id, quantity);
                  setAdded(true);
                }}
              >
                <i className="fas fa-cart-plus fa-lg mr-2" />
                {canBuy ? "Add to Cart" : "Sold out"}
              </button>
            </div>
            {added && (
              <div className="alert alert-success mt-3 mb-0">
                <i className="fas fa-check mr-2" />
                Added to your cart. <Link href="/cart">View cart</Link>
              </div>
            )}
          </div>
        </div>

        <div className="row mt-4">
          <nav className="w-100">
            <div className="nav nav-tabs" role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected={tab === "desc"}
                className={`nav-item nav-link ${tab === "desc" ? "active" : ""}`}
                onClick={() => setTab("desc")}
              >
                Description
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={tab === "details"}
                className={`nav-item nav-link ${tab === "details" ? "active" : ""}`}
                onClick={() => setTab("details")}
              >
                Variants
              </button>
            </div>
          </nav>
          <div className="tab-content p-3 w-100">
            {tab === "desc" ? (
              <div
                className="tab-pane fade show active product-desc"
                role="tabpanel"
                // Merchant-authored HTML from our own Shopify store (synced, not user input).
                dangerouslySetInnerHTML={{ __html: descriptionHtml || "<p>No description.</p>" }}
              />
            ) : (
              <div className="tab-pane fade show active" role="tabpanel">
                <table className="table table-sm">
                  <thead>
                    <tr>
                      <th>Variant</th>
                      <th>SKU</th>
                      <th className="text-right">Price</th>
                      <th className="text-right">Availability</th>
                    </tr>
                  </thead>
                  <tbody>
                    {variants.map((v) => (
                      <tr key={v.id} className={v.id === variant?.id ? "table-active" : ""}>
                        <td>{v.title}</td>
                        <td>{v.sku}</td>
                        <td className="text-right">{formatMoney(v.price, currency)}</td>
                        <td className="text-right">{v.available ? "In stock" : "Sold out"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
