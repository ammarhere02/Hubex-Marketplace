// Product detail: loads one product from MySQL and hands serializable data to the
// React e-commerce.html conversion (product-detail.tsx).
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { getProductByHandle } from "@/lib/catalog";
import { env } from "@/lib/env";
import { ProductDetail } from "./product-detail";

export default async function ProductPage({ params }: PageProps<"/products/[handle]">) {
  await connection(); // catalog changes after every sync: render per request, never at build
  const { handle } = await params;
  const product = await getProductByHandle(handle);
  if (!product) notFound(); // unknown, draft, archived, or removed

  const options = (product.options as Array<{ name: string; values: string[] }>) ?? [];
  const colors = (product.colors as Array<{ label: string; color: string | null }>) ?? [];
  // Lead paragraph under the title, as in e-commerce.html: plain text, first ~300 chars.
  const descriptionText = product.descriptionHtml
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 300);
  return (
    <div className="container mm-product-page">
      {/* AdminLTE content-header: page title left, breadcrumb right (e-commerce.html). */}
      <section className="content-header px-0">
        <div className="row mb-2">
          <div className="col-sm-6">
            <h1>{product.productType || "Product"}</h1>
          </div>
          <div className="col-sm-6">
            <ol className="breadcrumb float-sm-right">
              <li className="breadcrumb-item">
                <Link href="/">Home</Link>
              </li>
              {product.productType && (
                <li className="breadcrumb-item">
                  <Link href={`/products?category=${encodeURIComponent(product.productType)}`}>
                    {product.productType}
                  </Link>
                </li>
              )}
              <li className="breadcrumb-item active">{product.title}</li>
            </ol>
          </div>
        </div>
      </section>
      <ProductDetail
        title={product.title}
        descriptionHtml={product.descriptionHtml}
        descriptionText={descriptionText}
        currency={env().SHOP_CURRENCY}
        images={product.images.map((i) => ({ id: i.id, url: i.url, altText: i.altText }))}
        options={options.map((o) => ({ name: o.name, values: o.values }))}
        colors={colors}
        variants={product.variants.map((v) => ({
          id: v.id,
          title: v.title,
          sku: v.sku,
          price: v.price.toFixed(2),
          compareAtPrice: v.compareAtPrice && v.compareAtPrice.gt(v.price) ? v.compareAtPrice.toFixed(2) : null,
          available: v.availableForSale,
          imageId: product.images.find((i) => i.shopifyId === v.imageShopifyId)?.id ?? null,
          stock: v.inventoryQuantity,
          options: Object.fromEntries(
            (v.selectedOptions as Array<{ name: string; value: string }>).map((s) => [s.name, s.value]),
          ),
        }))}
      />
    </div>
  );
}
