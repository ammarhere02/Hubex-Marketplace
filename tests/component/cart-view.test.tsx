import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CartQuote } from "@/app/(store)/cart/actions";
import { cart } from "@/app/(store)/cart/cart-store";

const quoteCart = vi.hoisted(() => vi.fn());
vi.mock("@/app/(store)/cart/actions", () => ({ quoteCart }));

import { CartView } from "@/app/(store)/cart/cart-view";

const quote = (over: Partial<CartQuote> = {}): CartQuote => ({
  lines: [
    {
      variantId: 1,
      productTitle: "Trail Shoe",
      productHandle: "trail-shoe",
      variantTitle: "Red / S",
      imageUrl: "https://cdn/1.jpg",
      unitPrice: "1000.00",
      quantity: 2,
      lineTotal: "2000.00",
    },
  ],
  problems: [],
  subtotal: "2000.00",
  currency: "PKR",
  ...over,
});

beforeEach(() => {
  localStorage.clear();
  cart.clear();
  quoteCart.mockReset();
  quoteCart.mockResolvedValue(quote());
});

describe("CartView", () => {
  it("shows the empty state with a browse link when the cart is empty", () => {
    render(<CartView />);
    expect(screen.getByText("Your cart is empty.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Browse products" })).toHaveAttribute("href", "/products");
    expect(quoteCart).not.toHaveBeenCalled(); // no pointless server round-trip
  });

  it("shows a loading state until the server quote arrives", async () => {
    cart.add(1, 2);
    quoteCart.mockReturnValue(new Promise(() => {}));
    render(<CartView />);
    expect(screen.getByText("Loading cart…")).toBeInTheDocument();
  });

  it("renders server-priced lines: unit price, quantity, line total, subtotal", async () => {
    cart.add(1, 2);
    render(<CartView />);
    expect(await screen.findByText("Trail Shoe")).toBeInTheDocument();
    expect(screen.getByText("Rs 1,000.00")).toBeInTheDocument();
    expect(screen.getByText("Rs 2,000.00")).toBeInTheDocument();
    expect(screen.getByText(/Subtotal:/)).toHaveTextContent("Rs 2,000.00");
    expect(quoteCart).toHaveBeenCalledWith([{ variantId: 1, quantity: 2 }]);
  });

  it("updates the store when the quantity input changes", async () => {
    cart.add(1, 2);
    render(<CartView />);
    const input = await screen.findByRole("spinbutton", { name: /Quantity for Trail Shoe/ });
    // The value is controlled by the server quote, so set it in one change event.
    fireEvent.change(input, { target: { value: "5" } });
    await waitFor(() =>
      expect(JSON.parse(localStorage.getItem("hubex-cart-v1:guest")!)).toEqual([{ variantId: 1, quantity: 5 }]),
    );
  });

  it("removes the line via the Remove button", async () => {
    const user = userEvent.setup();
    cart.add(1, 2);
    render(<CartView />);
    await user.click(await screen.findByRole("button", { name: /Remove/ }));
    expect(JSON.parse(localStorage.getItem("hubex-cart-v1:guest")!)).toEqual([]);
    expect(await screen.findByText("Your cart is empty.")).toBeInTheDocument();
  });

  it("explains missing/unavailable items and offers removal", async () => {
    cart.add(9, 1);
    quoteCart.mockResolvedValue(quote({ lines: [], problems: [{ variantId: 9, reason: "unavailable" }], subtotal: "0.00" }));
    render(<CartView />);
    expect(await screen.findByText("This item is no longer available.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remove" })).toBeInTheDocument();
  });

  it("offers 'Use N' to clamp an insufficient-stock line to what is left", async () => {
    const user = userEvent.setup();
    cart.add(1, 50);
    quoteCart.mockResolvedValue(
      quote({ lines: [], problems: [{ variantId: 1, reason: "insufficient_stock", available: 3 }], subtotal: "0.00" }),
    );
    render(<CartView />);
    expect(await screen.findByText(/Not enough stock/)).toBeInTheDocument();
    expect(screen.getByText(/only 3 left/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Use 3" }));
    expect(JSON.parse(localStorage.getItem("hubex-cart-v1:guest")!)).toEqual([{ variantId: 1, quantity: 3 }]);
  });

  it("hides quantity inputs and remove buttons in read-only mode (checkout summary)", async () => {
    cart.add(1, 2);
    render(<CartView editable={false} />);
    expect(await screen.findByText("Trail Shoe")).toBeInTheDocument();
    expect(screen.queryByRole("spinbutton")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Remove/ })).not.toBeInTheDocument();
  });
});
