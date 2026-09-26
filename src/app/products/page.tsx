// Product listing: category filter (Shopify productType) + AdminLTE pagination.
import Link from "next/link";
import { ProductCard, SectionTitle } from "@/app/_components/product-card";
import { listCategories, listProducts } from "@/lib/catalog";
import { env } from "@/lib/env";

export default async function ProductsPage({ searchParams }: PageProps<"/products">) {
  const sp = await searchParams;
  const raw = Number(sp.page);
  const page = Number.isInteger(raw) && raw > 0 ? raw : 1;
  const category = typeof sp.category === "string" && sp.category ? sp.category : undefined;
  const [{ products, total, pageCount }, categories] = await Promise.all([
    listProducts({ page, category }),
    listCategories(),
  ]);
  const href = (p: number) => {
    const q = new URLSearchParams({ ...(category ? { category } : {}), page: String(p) });
    return `/products?${q}`;
  };

  return (
    <div className="container">
      <div className="mb-3">
        <Link href="/products" className={`mm-pill ${!category ? "active" : ""}`}>
          All
        </Link>
        {categories.map((c) => (
          <Link
            key={c.name}
            href={`/products?category=${encodeURIComponent(c.name)}`}
            className={`mm-pill ${category === c.name ? "active" : ""}`}
          >
            {c.name} ({c.count})
          </Link>
        ))}
      </div>

      <SectionTitle lead={category ? "Category:" : "All"} accent={`${category ?? "Products"} (${total})`} />
      {products.length === 0 ? (
        <div className="callout callout-info">No products here yet.</div>
      ) : (
        <div className="mm-grid">
          {products.map((p) => (
            <ProductCard key={p.id} product={p} currency={env().SHOP_CURRENCY} />
          ))}
        </div>
      )}

      {pageCount > 1 && (
        <nav className="mt-4 d-flex justify-content-center">
          <ul className="pagination">
            <li className={`page-item ${page <= 1 ? "disabled" : ""}`}>
              <Link className="page-link" href={href(Math.max(1, page - 1))}>
                «
              </Link>
            </li>
            {Array.from({ length: pageCount }, (_, i) => i + 1).map((p) => (
              <li key={p} className={`page-item ${p === page ? "active" : ""}`}>
                <Link className="page-link" href={href(p)}>
                  {p}
                </Link>
              </li>
            ))}
            <li className={`page-item ${page >= pageCount ? "disabled" : ""}`}>
              <Link className="page-link" href={href(Math.min(pageCount, page + 1))}>
                »
              </Link>
            </li>
          </ul>
        </nav>
      )}
    </div>
  );
}
