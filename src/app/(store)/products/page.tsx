// Product listing: title search + category filter (Shopify productType) + AdminLTE pagination.
import Link from "next/link";
import { ProductCard, SectionTitle } from "@/app/_components/product-card";
import { listCategories, listProducts } from "@/lib/catalog";
import { env } from "@/lib/env";

export default async function ProductsPage({ searchParams }: PageProps<"/products">) {
  const sp = await searchParams;
  const raw = Number(sp.page);
  const page = Number.isInteger(raw) && raw > 0 ? raw : 1;
  const category = typeof sp.category === "string" && sp.category ? sp.category : undefined;
  const search = typeof sp.q === "string" && sp.q.trim() ? sp.q.trim().slice(0, 100) : undefined;
  const [{ products, total, pageCount }, categories] = await Promise.all([
    listProducts({ page, category, search }),
    listCategories(),
  ]);
  const href = (p: number) => {
    const q = new URLSearchParams({
      ...(category ? { category } : {}),
      ...(search ? { q: search } : {}),
      page: String(p),
    });
    return `/products?${q}`;
  };
  const catHref = (cat?: string) => {
    const q = new URLSearchParams({ ...(cat ? { category: cat } : {}), ...(search ? { q: search } : {}) });
    return `/products${q.size ? `?${q}` : ""}`;
  };

  return (
    <div className="container">
      <form action="/products" method="get" className="mb-3" role="search">
        {category && <input type="hidden" name="category" value={category} />}
        <div className="input-group" style={{ maxWidth: 420 }}>
          <input
            type="search"
            name="q"
            className="form-control"
            placeholder="Search products…"
            defaultValue={search ?? ""}
            aria-label="Search products"
          />
          <div className="input-group-append">
            <button type="submit" className="btn btn-primary">
              <i className="fas fa-search" />
            </button>
          </div>
        </div>
      </form>

      <div className="mb-3">
        <Link href={catHref()} className={`mm-pill ${!category ? "active" : ""}`}>
          All
        </Link>
        {categories.map((c) => (
          <Link
            key={c.name}
            href={catHref(c.name)}
            className={`mm-pill ${category === c.name ? "active" : ""}`}
          >
            {c.name} ({c.count})
          </Link>
        ))}
      </div>

      <SectionTitle
        lead={search ? "Search:" : category ? "Category:" : "All"}
        accent={`${search ?? category ?? "Products"} (${total})`}
      />
      {products.length === 0 ? (
        <div className="callout callout-info">
          {search ? (
            <>
              No products match “{search}”. <Link href={catHref()}>Clear search</Link>
            </>
          ) : (
            "No products here yet."
          )}
        </div>
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
