"use client";
// React conversion of AdminLTE 3.2.0 pages/examples/e-commerce.html.
// Same markup/classes (product-image, product-image-thumbs, btn-group-toggle,
// bg-gray price box, nav-tabs), but React owns the behaviour: gallery selection,
// option selectors → variant, price/stock, Add to Cart, tabs. No jQuery/Bootstrap JS.
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
  /** ProductImage id of this variant's own image (from Shopify variant media), if any. */
  imageId: number | null;
}
export interface DetailProps {
  title: string;
  descriptionHtml: string;
  /** Plain-text excerpt shown under the title, like the lead paragraph in e-commerce.html. */
  descriptionText: string;
  currency: string;
  images: Array<{ id: number; url: string; altText: string | null }>;
  options: Array<{ name: string; values: string[] }>;
  variants: DetailVariant[];
}

const matches = (v: DetailVariant, selected: Record<string, string>) =>
  Object.entries(selected).every(([name, value]) => v.options[name] === value);

export function ProductDetail({ title, descriptionHtml, descriptionText, currency, images, options, variants }: DetailProps) {
  const initial = variants.find((v) => v.available) ?? variants[0];
  const indexOfImage = (imageId: number | null | undefined) => {
    const i = images.findIndex((img) => img.id === imageId);
    return i < 0 ? null : i;
  };
  const [selected, setSelected] = useState<Record<string, string>>(initial?.options ?? {});
  const [imageIndex, setImageIndex] = useState(() => indexOfImage(initial?.imageId) ?? 0);
  const [added, setAdded] = useState(false);
  const [wished, setWished] = useState(false);
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
    // Preview the chosen variant's own image, if it has one.
    const picked = variants.find((v) => matches(v, next));
    const i = indexOfImage(picked?.imageId);
    if (i !== null) setImageIndex(i);
  }

  /** Swatch image for an option value: the image of a variant carrying that value, if all such variants agree. */
  function swatchFor(name: string, value: string) {
    const ids = new Set(variants.filter((v) => v.options[name] === value).map((v) => v.imageId));
    if (ids.size !== 1) return null;
    const i = indexOfImage([...ids][0]);
    return i === null ? null : images[i];
  }

  const main = images[imageIndex];
  const canBuy = Boolean(variant?.available);

  return (
    <div className="card card-solid">
      <div className="card-body">
        <div className="row">
          <div className="col-12 col-sm-6">
            <h3 className="d-inline-block d-sm-none">{title}</h3>
            <div className="col-12">
              {main ? (
                // key remounts the <img> so the fade animation replays on every image change.
                // eslint-disable-next-line @next/next/no-img-element -- Shopify CDN URLs
                <img key={main.id} src={main.url} className="product-image" alt={main.altText ?? title} />
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
            {descriptionText && <p>{descriptionText}</p>}
            <hr />

            {visibleOptions.map((o) => (
              <div key={o.name}>
                <h4 className="mt-3">
                  {o.name} <small>Please select one</small>
                </h4>
                <div className="btn-group btn-group-toggle" role="radiogroup" aria-label={o.name}>
                  {o.values.map((value) => {
                    const active = selected[o.name] === value;
                    const possible = isPossible(o.name, value);
                    const swatch = swatchFor(o.name, value);
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
                        {swatch && (
                          <>
                            <br />
                            {/* eslint-disable-next-line @next/next/no-img-element -- Shopify CDN URLs */}
                            <img src={swatch.url} alt="" className="mm-swatch" />
                          </>
                        )}
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

            <div className="mt-4">
              <button
                type="button"
                className="btn btn-primary btn-lg btn-flat"
                disabled={!canBuy}
                onClick={() => {
                  if (!variant) return;
                  cart.add(variant.id, 1);
                  setAdded(true);
                }}
              >
                <i className="fas fa-cart-plus fa-lg mr-2" />
                {canBuy ? "Add to Cart" : "Sold out"}
              </button>
              <button
                type="button"
                className="btn btn-default btn-lg btn-flat"
                onClick={() => setWished((w) => !w)}
              >
                <i className={`fa-lg mr-2 ${wished ? "fas fa-heart text-danger" : "fas fa-heart"}`} />
                {wished ? "In Wishlist" : "Add to Wishlist"}
              </button>
            </div>
            {added && (
              <div className="alert alert-success mt-3 mb-0 mm-toast">
                <i className="fas fa-check mr-2" />
                Added to your cart. <Link href="/cart">View cart</Link>
              </div>
            )}

            <div className="mt-4 product-share">
              <a href="#" className="text-gray" aria-label="Share on Facebook" onClick={(e) => e.preventDefault()}>
                <i className="fab fa-facebook-square fa-2x" />
              </a>
              <a href="#" className="text-gray" aria-label="Share on Twitter" onClick={(e) => e.preventDefault()}>
                <i className="fab fa-twitter-square fa-2x" />
              </a>
              <a href="#" className="text-gray" aria-label="Share by email" onClick={(e) => e.preventDefault()}>
                <i className="fas fa-envelope-square fa-2x" />
              </a>
              <a href="#" className="text-gray" aria-label="RSS" onClick={(e) => e.preventDefault()}>
                <i className="fas fa-rss-square fa-2x" />
              </a>
            </div>
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
