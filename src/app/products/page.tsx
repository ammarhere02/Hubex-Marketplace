// Product listing (basic; AdminLTE styling comes in Phase 10).
import Link from "next/link";
import { formatPrice, listProducts } from "@/lib/catalog";

export default async function ProductsPage({ searchParams }: PageProps<"/products">) {
  const raw = Number((await searchParams).page);
  const page = Number.isInteger(raw) && raw > 0 ? raw : 1;
  const { products, total, pageCount } = await listProducts(page);

  return (
    <main style={{ padding: 24 }}>
      <h1>Products ({total})</h1>
      <ul style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 16, listStyle: "none", padding: 0 }}>
        {products.map((p) => (
          <li key={p.id}>
            <Link href={`/products/${p.handle}`}>
              {p.image && (
                // eslint-disable-next-line @next/next/no-img-element -- Shopify CDN URLs; next/image config deferred
                <img src={p.image.url} alt={p.image.altText ?? p.title} style={{ width: "100%", aspectRatio: "1", objectFit: "cover" }} />
              )}
              <div>{p.title}</div>
            </Link>
            <div>{p.minPrice ? formatPrice(p.minPrice) : "—"}</div>
            <div>{p.available ? "In stock" : "Out of stock"}</div>
          </li>
        ))}
      </ul>
      <nav style={{ display: "flex", gap: 16 }}>
        {page > 1 && <Link href={`/products?page=${page - 1}`}>← Previous</Link>}
        <span>
          Page {page} of {pageCount}
        </span>
        {page < pageCount && <Link href={`/products?page=${page + 1}`}>Next →</Link>}
      </nav>
    </main>
  );
}
