// Home (MegaMart layout): promo banner, best deals, top categories, product grid.
// Every product/category shown comes from MySQL; the banner is static copy.
import Link from "next/link";
import { connection } from "next/server";
import { ProductCard, SectionTitle } from "@/app/_components/product-card";
import { listCategories, listDeals, listProducts } from "@/lib/catalog";
import { env } from "@/lib/env";

export default async function Home() {
  await connection();
  const currency = env().SHOP_CURRENCY;
  const [deals, categories, latest] = await Promise.all([listDeals(5), listCategories(), listProducts({ page: 1 })]);
  const heroImage = deals.products.find((p) => p.image)?.image;

  return (
    <div className="container">
      <section className="mm-hero">
        <p className="mb-0">Cash on Delivery · Nationwide</p>
        <h1>SHOP THE COLLECTION.</h1>
        <p className="mb-4">Order online, pay when it arrives.</p>
        <Link href="/products" className="btn btn-light">
          Shop now <i className="fas fa-arrow-right ml-1" />
        </Link>
        {heroImage && (
          // eslint-disable-next-line @next/next/no-img-element -- Shopify CDN URL
          <img src={heroImage.url} alt="" />
        )}
      </section>

      <SectionTitle
        lead={deals.hasDiscounts ? "Grab the best deal on" : "Fresh in"}
        accent={deals.hasDiscounts ? "Top Picks" : "New Arrivals"}
        href="/products"
      />
      <div className="mm-grid">
        {deals.products.map((p) => (
          <ProductCard key={p.id} product={p} currency={currency} />
        ))}
      </div>

      {categories.length > 0 && (
        <>
          <SectionTitle lead="Shop From" accent="Top Categories" href="/products" />
          <div className="mm-cats">
            {categories.map((c) => (
              <Link key={c.name} href={`/products?category=${encodeURIComponent(c.name)}`} className="mm-cat">
                <div className="mm-cat-img">
                  {c.imageUrl && (
                    // eslint-disable-next-line @next/next/no-img-element -- Shopify CDN URL
                    <img src={c.imageUrl} alt="" />
                  )}
                </div>
                {c.name}
                <div className="text-muted small">{c.count} products</div>
              </Link>
            ))}
          </div>
        </>
      )}

      <SectionTitle lead="All" accent="Products" href="/products" />
      <div className="mm-grid">
        {latest.products.map((p) => (
          <ProductCard key={p.id} product={p} currency={currency} />
        ))}
      </div>
    </div>
  );
}
