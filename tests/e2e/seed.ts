// Deterministic catalog for the browser tests. Run with DATABASE_URL pointing
// at hubex_marketplace_e2e (tests/e2e/global-setup.ts does this).
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { Prisma, PrismaClient, ProductStatus } from "../../src/generated/prisma/client";

const url = new URL(process.env.DATABASE_URL!);
if (!url.pathname.endsWith("hubex_marketplace_e2e") && !process.env.E2E_DATABASE_URL) {
  throw new Error(`Refusing to seed ${url.pathname}`);
}
const prisma = new PrismaClient({
  adapter: new PrismaMariaDb({
    host: url.hostname,
    port: Number(url.port || 3306),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: url.pathname.slice(1),
    connectionLimit: 3,
    allowPublicKeyRetrieval: true,
  }),
});

const dec = (v: string) => new Prisma.Decimal(v);
const IMG = (seed: string) => `https://picsum.photos/seed/${seed}/600/600`;

async function main() {
  await prisma.orderItem.deleteMany();
  await prisma.order.deleteMany();
  await prisma.webhookReceipt.deleteMany();
  await prisma.productImage.deleteMany();
  await prisma.productVariant.deleteMany();
  await prisma.product.deleteMany();
  await prisma.jobLog.deleteMany();

  const now = new Date();

  // The flagship product the journey test drives: 2 options, 3 variants,
  // one sold out, one discounted, two images.
  await prisma.product.create({
    data: {
      shopifyId: "gid://shopify/Product/e2e-1",
      handle: "e2e-trail-shoe",
      title: "E2E Trail Shoe",
      descriptionHtml: "<p>The <b>flagship</b> e2e product.</p>",
      status: ProductStatus.ACTIVE,
      productType: "Shoes",
      options: [
        { name: "Color", position: 1, values: ["Red", "Blue"] },
        { name: "Size", position: 2, values: ["S", "M"] },
      ],
      isRemoved: false,
      lastSyncedAt: now,
      images: {
        create: [
          { shopifyId: "gid://shopify/MediaImage/e2e-1a", url: IMG("shoe-a"), altText: "front", position: 0 },
          { shopifyId: "gid://shopify/MediaImage/e2e-1b", url: IMG("shoe-b"), altText: "side", position: 1 },
        ],
      },
      variants: {
        create: [
          {
            shopifyId: "gid://shopify/ProductVariant/e2e-1-1",
            title: "Red / S",
            sku: "E2E-RS",
            price: dec("1000.00"),
            compareAtPrice: dec("1500.00"),
            inventoryQuantity: 10,
            availableForSale: true,
            selectedOptions: [
              { name: "Color", value: "Red" },
              { name: "Size", value: "S" },
            ],
          },
          {
            shopifyId: "gid://shopify/ProductVariant/e2e-1-2",
            title: "Red / M",
            sku: "E2E-RM",
            price: dec("1100.00"),
            compareAtPrice: null,
            inventoryQuantity: 3,
            availableForSale: true,
            selectedOptions: [
              { name: "Color", value: "Red" },
              { name: "Size", value: "M" },
            ],
          },
          {
            shopifyId: "gid://shopify/ProductVariant/e2e-1-3",
            title: "Blue / S",
            sku: "E2E-BS",
            price: dec("1200.00"),
            compareAtPrice: null,
            inventoryQuantity: 0,
            availableForSale: false,
            selectedOptions: [
              { name: "Color", value: "Blue" },
              { name: "Size", value: "S" },
            ],
          },
        ],
      },
    },
  });

  // A fully sold-out product.
  await simpleProduct("e2e-sold-out", "E2E Sold Out Bag", "Bags", "500.00", { availableForSale: false, inventoryQuantity: 0 });

  // Filler products so the listing paginates (PAGE_SIZE 12 → 2 pages).
  for (let i = 1; i <= 12; i++) {
    await simpleProduct(`e2e-filler-${i}`, `E2E Filler ${String(i).padStart(2, "0")}`, i % 2 ? "Shoes" : "Bags", "250.00");
  }

  // Invisible on the storefront: draft + removed.
  await simpleProduct("e2e-draft", "E2E Draft Product", "Shoes", "10.00", {}, ProductStatus.DRAFT);
  await simpleProduct("e2e-removed", "E2E Removed Product", "Shoes", "10.00", {}, ProductStatus.ACTIVE, true);
}

async function simpleProduct(
  handle: string,
  title: string,
  productType: string,
  price: string,
  variantOver: { availableForSale?: boolean; inventoryQuantity?: number } = {},
  status: ProductStatus = ProductStatus.ACTIVE,
  isRemoved = false,
) {
  await prisma.product.create({
    data: {
      shopifyId: `gid://shopify/Product/${handle}`,
      handle,
      title,
      descriptionHtml: `<p>${title}</p>`,
      status,
      productType,
      options: [{ name: "Title", position: 1, values: ["Default Title"] }],
      isRemoved,
      lastSyncedAt: new Date(),
      images: {
        create: [{ shopifyId: `gid://shopify/MediaImage/${handle}`, url: IMG(handle), altText: null, position: 0 }],
      },
      variants: {
        create: [
          {
            shopifyId: `gid://shopify/ProductVariant/${handle}`,
            title: "Default Title",
            sku: handle.toUpperCase(),
            price: dec(price),
            compareAtPrice: null,
            inventoryQuantity: variantOver.inventoryQuantity ?? 20,
            availableForSale: variantOver.availableForSale ?? true,
            selectedOptions: [{ name: "Title", value: "Default Title" }],
          },
        ],
      },
    },
  });
}

main()
  .then(async () => {
    console.log("e2e database seeded");
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
