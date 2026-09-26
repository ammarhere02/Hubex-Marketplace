// Product detail (basic; the React e-commerce.html conversion with gallery and
// variant selectors replaces this in Phase 10).
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { formatPrice, getProductByHandle } from "@/lib/catalog";

export default async function ProductPage({ params }: PageProps<"/products/[handle]">) {
  await connection(); // catalog changes after every sync: render per request, never at build
  const { handle } = await params;
  const product = await getProductByHandle(handle);
  if (!product) notFound(); // unknown, draft, archived, or removed

  return (
    <main style={{ padding: 24 }}>
      <Link href="/products">← All products</Link>
      <h1>{product.title}</h1>
      <div style={{ display: "flex", gap: 8, overflowX: "auto" }}>
        {product.images.map((img) => (
          // eslint-disable-next-line @next/next/no-img-element -- Shopify CDN URLs; next/image config deferred
          <img key={img.id} src={img.url} alt={img.altText ?? product.title} style={{ height: 160 }} />
        ))}
      </div>
      <table>
        <thead>
          <tr>
            <th align="left">Variant</th>
            <th align="left">SKU</th>
            <th align="right">Price</th>
            <th align="right">Stock</th>
          </tr>
        </thead>
        <tbody>
          {product.variants.map((v) => (
            <tr key={v.id}>
              <td>{v.title}</td>
              <td>{v.sku ?? ""}</td>
              <td align="right">{formatPrice(v.price)}</td>
              <td align="right">{v.availableForSale ? v.inventoryQuantity : "Sold out"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {/* Merchant-authored HTML from our own Shopify store (synced, not user input). */}
      <div dangerouslySetInnerHTML={{ __html: product.descriptionHtml }} />
    </main>
  );
}
