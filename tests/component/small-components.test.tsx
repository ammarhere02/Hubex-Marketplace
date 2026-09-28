import { render, screen } from "@testing-library/react";
import { act } from "react";
import { beforeEach, describe, expect, it } from "vitest";
import type { ProductCard as Card } from "@/lib/catalog";
import { CartBadge } from "@/app/_components/cart-badge";
import { ProductCard, SectionTitle } from "@/app/_components/product-card";
import { ClearCart } from "@/app/(store)/orders/[publicId]/clear-cart";
import { cart } from "@/app/(store)/cart/cart-store";

beforeEach(() => {
  localStorage.clear();
  cart.clear();
});

const card = (over: Partial<Card> = {}): Card => ({
  id: 1,
  handle: "trail-shoe",
  title: "Trail Shoe",
  category: "Shoes",
  image: { url: "https://cdn/1.jpg", altText: "front" },
  price: "1000.00",
  compareAtPrice: null,
  saveAmount: null,
  discountPercent: null,
  available: true,
  ...over,
});

describe("ProductCard", () => {
  it("links to the product page with image, title, and price", () => {
    render(<ProductCard product={card()} currency="PKR" />);
    expect(screen.getByRole("link")).toHaveAttribute("href", "/products/trail-shoe");
    expect(screen.getByRole("img")).toHaveAttribute("src", "https://cdn/1.jpg");
    expect(screen.getByText("Trail Shoe")).toBeInTheDocument();
    expect(screen.getByText("Rs 1,000.00")).toBeInTheDocument();
    expect(screen.getByText("In stock")).toBeInTheDocument();
  });

  it("shows discount ribbon, struck compare-at price, and save line", () => {
    render(
      <ProductCard
        product={card({ compareAtPrice: "1500.00", saveAmount: "500.00", discountPercent: 33 })}
        currency="PKR"
      />,
    );
    expect(screen.getByText(/33%/)).toBeInTheDocument();
    expect(screen.getByText("Rs 1,500.00").tagName).toBe("DEL");
    expect(screen.getByText(/Save - Rs 500\.00/)).toBeInTheDocument();
  });

  it("marks sold-out products and survives a missing image or price", () => {
    render(<ProductCard product={card({ available: false, image: null, price: null })} currency="PKR" />);
    expect(screen.getByText("Sold out")).toBeInTheDocument();
    expect(screen.getByText("Out of stock")).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.getByText("—")).toBeInTheDocument();
  });
});

describe("CartBadge", () => {
  it("hides the count at zero and totals quantities otherwise", () => {
    const { rerender } = render(<CartBadge />);
    expect(screen.queryByText("0")).not.toBeInTheDocument();
    act(() => {
      cart.add(1, 2);
      cart.add(2, 3);
    });
    rerender(<CartBadge />);
    expect(screen.getByText("5")).toBeInTheDocument();
  });
});

describe("ClearCart", () => {
  it("empties the cart on mount (order confirmed)", () => {
    cart.add(1, 2);
    render(<ClearCart />);
    expect(JSON.parse(localStorage.getItem("hubex-cart-v1:guest")!)).toEqual([]);
  });
});

describe("SectionTitle", () => {
  it("renders lead/accent text and an optional View All link", () => {
    const { rerender } = render(<SectionTitle lead="Grab" accent="Deals" />);
    expect(screen.getByRole("heading")).toHaveTextContent("Grab Deals");
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    rerender(<SectionTitle lead="Grab" accent="Deals" href="/products" />);
    expect(screen.getByRole("link", { name: /View All/ })).toHaveAttribute("href", "/products");
  });
});
