"use client";
// React conversion of AdminLTE 3.2.0 pages/examples/e-commerce.html.
// Same markup/classes (product-image, product-image-thumbs, btn-group-toggle,
// bg-gray price box, nav-tabs), but React owns the behaviour: gallery selection,
// option selectors → variant, price/stock, Add to Cart, tabs. No jQuery/Bootstrap JS.
import Link from "next/link";
import { useMemo, useState } from "react";
import { cart } from "@/app/(store)/cart/cart-store";
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
  /** Taxonomy "Color" category metafield swatches: display-only (not variants). */
  colors?: Array<{ label: string; color: string | null }>;
  variants: DetailVariant[];
}

const matches = (v: DetailVariant, selected: Record<string, string>) =>
  Object.entries(selected).every(([name, value]) => v.options[name] === value);

// e-commerce.html renders Color values as a name over a colored circle and Size
// values as a large abbreviation over the full label. Shopify option values are
// free text, so both mappings are best-effort with a plain-text fallback.
const CSS_COLOR_KEYWORDS = new Set([
  "black", "white", "red", "blue", "green", "yellow", "orange", "purple", "pink",
  "brown", "gray", "grey", "navy", "teal", "maroon", "olive", "beige", "tan",
  "gold", "silver", "ivory", "khaki", "lavender", "magenta", "cyan", "turquoise",
  "coral", "salmon", "crimson", "indigo", "violet", "plum", "orchid", "chocolate",
  "sienna", "aqua", "lime", "fuchsia", "azure", "linen", "snow", "wheat", "peru",
  "lightblue", "lightgreen", "lightgray", "lightgrey", "lightpink", "lightyellow",
  "lightcyan", "lightsalmon", "lightcoral", "darkblue", "darkgreen", "darkgray",
  "darkgrey", "darkred", "darkorange", "darkviolet", "darkcyan", "darkmagenta",
  "skyblue", "steelblue", "royalblue", "slategray", "slategrey", "hotpink",
  "deeppink", "forestgreen", "seagreen", "springgreen", "olivedrab", "firebrick",
  "tomato", "orangered", "goldenrod", "rosybrown", "saddlebrown", "midnightblue",
]);
const CUSTOM_COLORS: Record<string, string> = {
  charcoal: "#36454f",
  cream: "#fffdd0",
  offwhite: "#faf9f6",
  burgundy: "#800020",
  mint: "#98ff98",
  mustard: "#ffdb58",
  rust: "#b7410e",
  denim: "#1560bd",
  sand: "#c2b280",
  camel: "#c19a6b",
  blush: "#de5d83",
  emerald: "#50c878",
  sapphire: "#0f52ba",
  ruby: "#e0115f",
  rose: "#ff007f",
  peach: "#ffe5b4",
  taupe: "#483c32",
  mauve: "#e0b0ff",
  bronze: "#cd7f32",
  copper: "#b87333",
  // German values (the dev store's products use Farbe/Grösse options).
  schwarz: "#1f1f1f",
  weiss: "#f8f8f8",
  grau: "gray",
  hellgrau: "lightgray",
  dunkelgrau: "darkgray",
  anthrazit: "#36454f",
  blau: "blue",
  hellblau: "lightblue",
  dunkelblau: "darkblue",
  dblau: "darkblue",
  marine: "navy",
  tuerkis: "turquoise",
  rot: "red",
  dunkelrot: "darkred",
  weinrot: "#722f37",
  bordeaux: "#5f021f",
  gruen: "green",
  hellgruen: "lightgreen",
  dunkelgruen: "darkgreen",
  oliv: "olive",
  gelb: "yellow",
  rosa: "pink",
  lila: "purple",
  violett: "violet",
  braun: "#8b5a2b",
  hellbraun: "#c8a165",
  mittelbraun: "#cd853f",
  mbraun: "#cd853f",
  dunkelbraun: "#654321",
  dbraun: "#654321",
  silber: "silver",
  kupfer: "#b87333",
  creme: "#fffdd0",
  natur: "#e8dcc5",
};

/** Lowercase, fold umlauts/ß, drop everything but letters: "d.Blau " → "dblau". */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/[^a-z]/g, "");
}

/** Option-name checks: English and German ("Farbe", "Grösse"). */
export const isColorOption = (name: string) => /colou?r|farbe/.test(normalize(name));
export const isSizeOption = (name: string) => /size|gr(oe|o)sse/.test(normalize(name));

/** CSS color for an option value like "Blue", "Light Blue" or "dunkelbraun", or null when unknown. */
export function cssColorFor(value: string): string | null {
  if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(value.trim())) return value.trim();
  const key = normalize(value);
  if (CUSTOM_COLORS[key]) return CUSTOM_COLORS[key];
  if (CSS_COLOR_KEYWORDS.has(key)) return key;
  // "metallic schwarz", "navy blue": fall back to the longest known color word inside.
  const words = [...Object.keys(CUSTOM_COLORS), ...CSS_COLOR_KEYWORDS].sort((a, b) => b.length - a.length);
  for (const w of words) {
    if (w.length >= 4 && key.includes(w)) return CUSTOM_COLORS[w] ?? w;
  }
  return null;
}

const SIZE_ABBREVIATIONS: Record<string, string> = {
  "extra small": "XS",
  "x-small": "XS",
  "xtra small": "XS",
  small: "S",
  medium: "M",
  large: "L",
  "extra large": "XL",
  "x-large": "XL",
  "xtra large": "XL",
  "xtra-large": "XL",
  "2x-large": "XXL",
  "xx-large": "XXL",
  "2xl": "XXL",
  "3x-large": "XXXL",
  "xxx-large": "XXXL",
};

/** Short size label ("Medium" → "M", "38" → "38"), or null when there is no sensible one. */
export function sizeAbbreviation(value: string): string | null {
  const key = value.trim().toLowerCase().replace(/\s+/g, " ");
  if (SIZE_ABBREVIATIONS[key]) return SIZE_ABBREVIATIONS[key];
  const trimmed = value.trim();
  if (trimmed.length > 0 && trimmed.length <= 4) return trimmed.toUpperCase();
  return null;
}

export function ProductDetail({ title, descriptionHtml, descriptionText, currency, images, options, colors = [], variants }: DetailProps) {
  const initial = variants.find((v) => v.available) ?? variants[0];
  const indexOfImage = (imageId: number | null | undefined) => {
    const i = images.findIndex((img) => img.id === imageId);
    return i < 0 ? null : i;
  };
  const [selected, setSelected] = useState<Record<string, string>>(initial?.options ?? {});
  const [imageIndex, setImageIndex] = useState(() => indexOfImage(initial?.imageId) ?? 0);
  const [added, setAdded] = useState(false);
  const [wished, setWished] = useState(false);
  const [tab, setTab] = useState<"desc" | "comments" | "rating">("desc");

  // Shopify's default single variant has the option "Title: Default Title": hide it.
  const visibleOptions = options.filter((o) => !(o.values.length === 1 && o.values[0] === "Default Title"));
  // Category-metafield colors are informational. Skip them when a real Color
  // variant option exists, so the same colors aren't listed twice.
  const metafieldColors = visibleOptions.some((o) => isColorOption(o.name)) ? [] : colors;
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
            {images.length > 0 && (
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

            {metafieldColors.length > 0 && (
              <div>
                <h4 className="mt-3">Available Colors</h4>
                <div className="btn-group btn-group-toggle" role="group" aria-label="Available colors">
                  {metafieldColors.map((c) => {
                    const circleColor = c.color ?? cssColorFor(c.label);
                    return (
                      <span key={c.label} className="btn btn-default text-center" style={{ cursor: "default" }}>
                        {c.label}
                        {circleColor && (
                          <>
                            <br />
                            <i className="fas fa-circle fa-2x" style={{ color: circleColor }} aria-hidden="true" />
                          </>
                        )}
                      </span>
                    );
                  })}
                </div>
              </div>
            )}

            {visibleOptions.map((o) => {
              const colorLike = isColorOption(o.name);
              const sizeLike = isSizeOption(o.name);
              return (
                <div key={o.name}>
                  <h4 className="mt-3">
                    {colorLike ? (
                      "Available Colors"
                    ) : (
                      <>
                        {o.name} <small>Please select one</small>
                      </>
                    )}
                  </h4>
                  <div className="btn-group btn-group-toggle" role="radiogroup" aria-label={o.name}>
                    {o.values.map((value) => {
                      const active = selected[o.name] === value;
                      const possible = isPossible(o.name, value);
                      const circleColor = colorLike ? cssColorFor(value) : null;
                      const abbrev = sizeLike ? sizeAbbreviation(value) : null;
                      const text = possible ? value : <del>{value}</del>;
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
                          {circleColor ? (
                            // e-commerce.html color tile: name over a colored circle.
                            <>
                              {text}
                              <br />
                              <i className="fas fa-circle fa-2x" style={{ color: circleColor }} aria-hidden="true" />
                            </>
                          ) : abbrev ? (
                            // e-commerce.html size tile: big abbreviation over the full label.
                            <>
                              <span className="text-xl">{possible ? abbrev : <del>{abbrev}</del>}</span>
                              {abbrev.toLowerCase() !== value.trim().toLowerCase() && (
                                <>
                                  <br />
                                  {text}
                                </>
                              )}
                            </>
                          ) : (
                            text
                          )}
                        </label>
                      );
                    })}
                  </div>
                </div>
              );
            })}

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

            <div className="mt-4 product-actions">
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
                aria-selected={tab === "comments"}
                className={`nav-item nav-link ${tab === "comments" ? "active" : ""}`}
                onClick={() => setTab("comments")}
              >
                Comments
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={tab === "rating"}
                className={`nav-item nav-link ${tab === "rating" ? "active" : ""}`}
                onClick={() => setTab("rating")}
              >
                Rating
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
            ) : tab === "comments" ? (
              <div className="tab-pane fade show active" role="tabpanel">
                <p className="text-muted mb-0">
                  <i className="far fa-comments mr-2" />
                  No comments yet.
                </p>
              </div>
            ) : (
              <div className="tab-pane fade show active" role="tabpanel">
                <p className="text-muted mb-0">
                  <i className="far fa-star mr-2" />
                  No ratings yet.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
