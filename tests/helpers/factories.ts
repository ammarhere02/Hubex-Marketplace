// Shared in-memory row factories for unit tests (shape of Prisma query results).
import { Prisma } from "@/generated/prisma/client";

export const dec = (v: string | number) => new Prisma.Decimal(v);

export interface FakeVariantRow {
  id: number;
  shopifyId: string;
  title: string;
  sku: string | null;
  price: Prisma.Decimal;
  compareAtPrice: Prisma.Decimal | null;
  inventoryQuantity: number;
  availableForSale: boolean;
  isRemoved: boolean;
  product: {
    title: string;
    handle: string;
    status: "ACTIVE" | "DRAFT" | "ARCHIVED";
    isRemoved: boolean;
    images: Array<{ url: string }>;
  };
}

export function variantRow(overrides: Partial<FakeVariantRow> & { id: number }): FakeVariantRow {
  return {
    shopifyId: `gid://shopify/ProductVariant/${overrides.id}`,
    title: "Default Title",
    sku: `SKU-${overrides.id}`,
    price: dec("100.00"),
    compareAtPrice: null,
    inventoryQuantity: 10,
    availableForSale: true,
    isRemoved: false,
    ...overrides,
    product: {
      title: "Test Product",
      handle: "test-product",
      status: "ACTIVE",
      isRemoved: false,
      images: [{ url: "https://cdn.example/p.jpg" }],
      ...overrides.product,
    },
  };
}

/** Minimal fake of the Prisma client surface priceCart uses. */
export function fakeDb(rows: FakeVariantRow[]) {
  return {
    productVariant: {
      findMany: async ({ where }: { where: { id: { in: number[] } } }) =>
        rows.filter((r) => where.id.in.includes(r.id)),
    },
  } as never;
}

export const validCustomer = {
  customerName: "Ada Lovelace",
  phone: "0300 1234567",
  address1: "12 Model Town",
  address2: "",
  city: "Lahore",
  province: "Punjab",
  zip: "54000",
  country: "PK",
  email: "ada@example.com",
  paymentMethod: "COD",
};
