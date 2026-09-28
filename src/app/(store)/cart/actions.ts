"use server";
// Server Functions called from the cart and checkout pages. Inputs arrive from the
// browser, so everything is parsed with zod before use.
import { redirect } from "next/navigation";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth/session";
import { cartLinesSchema, customerSchema, placeOrder, priceCart, type LineProblem } from "@/lib/checkout";

export interface CartQuote {
  lines: Array<{
    variantId: number;
    productTitle: string;
    productHandle: string;
    variantTitle: string;
    imageUrl: string | null;
    unitPrice: string;
    quantity: number;
    lineTotal: string;
  }>;
  problems: LineProblem[];
  subtotal: string;
  currency: string;
}

/** Prices a cart from MySQL. Decimals become strings to cross the server/client boundary. */
export async function quoteCart(input: unknown): Promise<CartQuote> {
  const parsed = cartLinesSchema.safeParse(input);
  if (!parsed.success) return { lines: [], problems: [], subtotal: "0.00", currency: "" };
  const priced = await priceCart(parsed.data);
  return {
    lines: priced.lines.map((l) => ({
      variantId: l.variantId,
      productTitle: l.productTitle,
      productHandle: l.productHandle,
      variantTitle: l.variantTitle,
      imageUrl: l.imageUrl,
      unitPrice: l.unitPrice.toFixed(2),
      quantity: l.quantity,
      lineTotal: l.lineTotal.toFixed(2),
    })),
    problems: priced.problems,
    subtotal: priced.subtotal.toFixed(2),
    currency: priced.currency,
  };
}

export interface CheckoutState {
  fieldErrors?: Record<string, string[] | undefined>;
  formError?: string;
  problems?: LineProblem[];
  /** What the customer typed, echoed back so React's post-action form reset refills it. */
  values?: Record<string, string>;
}

const CUSTOMER_FIELDS = [
  "customerName", "phone", "address1", "address2", "city", "province", "zip", "country", "email", "paymentMethod",
] as const;

export async function checkoutAction(_prev: CheckoutState, formData: FormData): Promise<CheckoutState> {
  // Ordering requires an account. Enforced HERE (server), not just in the page:
  // a crafted request without a session must never create an order.
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/checkout");

  let cartJson: unknown;
  try {
    cartJson = JSON.parse(String(formData.get("cart") ?? "[]"));
  } catch {
    return { formError: "Your cart could not be read. Please reload the page." };
  }
  const cart = cartLinesSchema.safeParse(cartJson);
  if (!cart.success) return { formError: "Your cart is empty or invalid." };

  const values = Object.fromEntries(CUSTOMER_FIELDS.map((f) => [f, String(formData.get(f) ?? "")]));
  const customer = customerSchema.safeParse(values);
  if (!customer.success) return { fieldErrors: z.flattenError(customer.error).fieldErrors, values };

  const result = await placeOrder(cart.data, customer.data, user.id);
  if (!result.ok) {
    return {
      formError: "Some items changed since you added them. Review your cart.",
      problems: result.problems,
      values,
    };
  }
  redirect(`/orders/${result.publicId}`);
}
