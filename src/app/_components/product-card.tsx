// Deal-style product card (MegaMart reference): image tile, % OFF ribbon, price,
// struck-through compare-at price, and a "Save" line. All values come from MySQL.
import Link from "next/link";
import type { ProductCard as Card } from "@/lib/catalog";
import { formatMoney } from "@/lib/money";

export function ProductCard({ product, currency }: { product: Card; currency: string }) {
  const save = product.saveAmount;
  return (
    <Link href={`/products/${product.handle}`} className="card mm-card h-100">
      <div className="mm-card-img">
        {product.image ? (
          // eslint-disable-next-line @next/next/no-img-element -- Shopify CDN URLs
          <img src={product.image.url} alt={product.image.altText ?? product.title} loading="lazy" />
        ) : (
          <i className="fas fa-image fa-3x text-muted" />
        )}
        {product.discountPercent ? (
          <span className="mm-ribbon">
            {product.discountPercent}%<br />
            OFF
          </span>
        ) : null}
        {!product.available && <span className="mm-soldout">Sold out</span>}
      </div>
      <div className="card-body mm-card-body">
        <div className="mm-card-title">{product.title}</div>
        <div className="mm-price-row">
          <strong>{product.price ? formatMoney(product.price, currency) : "—"}</strong>
          {product.compareAtPrice && <del>{formatMoney(product.compareAtPrice, currency)}</del>}
        </div>
        <div className="mm-save">
          {save ? `Save - ${formatMoney(save, currency)}` : product.available ? "In stock" : "Out of stock"}
        </div>
      </div>
    </Link>
  );
}

export function SectionTitle({ lead, accent, href }: { lead: string; accent: string; href?: string }) {
  return (
    <div className="mm-section-title">
      <h2>
        {lead} <span>{accent}</span>
      </h2>
      {href && (
        <Link href={href}>
          View All <i className="fas fa-chevron-right ml-1" />
        </Link>
      )}
    </div>
  );
}
