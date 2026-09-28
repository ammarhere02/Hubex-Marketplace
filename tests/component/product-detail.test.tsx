import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { ProductDetail, type DetailProps, type DetailVariant } from "@/app/products/[handle]/product-detail";
import { cart } from "@/app/cart/cart-store";

const v = (
  id: number,
  options: Record<string, string>,
  over: Partial<DetailVariant> = {},
): DetailVariant => ({
  id,
  title: Object.values(options).join(" / "),
  sku: `SKU-${id}`,
  price: "1000.00",
  compareAtPrice: null,
  available: true,
  stock: 5,
  options,
  imageId: null,
  ...over,
});

const baseProps = (): DetailProps => ({
  title: "Trail Shoe",
  descriptionHtml: "<p>Great <b>shoe</b>.</p>",
  descriptionText: "Great shoe.",
  currency: "PKR",
  images: [
    { id: 11, url: "https://cdn/1.jpg", altText: "front" },
    { id: 12, url: "https://cdn/2.jpg", altText: "side" },
  ],
  options: [
    { name: "Color", values: ["Red", "Blue"] },
    { name: "Size", values: ["S", "M"] },
  ],
  variants: [
    v(1, { Color: "Red", Size: "S" }, { price: "1000.00", imageId: 11 }),
    v(2, { Color: "Red", Size: "M" }, { price: "1100.00" }),
    v(3, { Color: "Blue", Size: "S" }, { price: "1200.00", available: false, stock: 0, imageId: 12 }),
    // Blue/M does not exist
  ],
});

beforeEach(() => {
  localStorage.clear();
  cart.clear();
});

describe("ProductDetail", () => {
  it("renders title, lead text, price of the first available variant, and stock", () => {
    render(<ProductDetail {...baseProps()} />);
    expect(screen.getAllByRole("heading", { name: "Trail Shoe" }).length).toBeGreaterThan(0);
    expect(screen.getByText("Rs 1,000.00")).toBeInTheDocument();
    expect(screen.getByText("In stock: 5")).toBeInTheDocument();
  });

  it("starts on the first AVAILABLE variant when earlier ones are sold out", () => {
    const props = baseProps();
    props.variants[0] = v(1, { Color: "Red", Size: "S" }, { available: false, stock: 0 });
    render(<ProductDetail {...props} />);
    expect(screen.getByText("Rs 1,100.00")).toBeInTheDocument(); // variant 2
  });

  it("updates price and stock when another option value is chosen", async () => {
    const user = userEvent.setup();
    render(<ProductDetail {...baseProps()} />);
    await user.click(within(screen.getByRole("radiogroup", { name: "Size" })).getByRole("radio", { name: /M/ }));
    expect(screen.getByText("Rs 1,100.00")).toBeInTheDocument();
  });

  it("shows Sold out and disables Add to Cart for an unavailable variant", async () => {
    const user = userEvent.setup();
    render(<ProductDetail {...baseProps()} />);
    await user.click(within(screen.getByRole("radiogroup", { name: "Color" })).getByRole("radio", { name: /Blue/ }));
    expect(screen.getByText("Sold out", { selector: "small" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Sold out/ })).toBeDisabled();
  });

  it("jumps to a variant carrying the chosen value when the combination does not exist", async () => {
    const user = userEvent.setup();
    render(<ProductDetail {...baseProps()} />);
    // Select Red/M first, then Blue: Blue/M does not exist → falls to Blue/S.
    await user.click(within(screen.getByRole("radiogroup", { name: "Size" })).getByRole("radio", { name: /M/ }));
    await user.click(within(screen.getByRole("radiogroup", { name: "Color" })).getByRole("radio", { name: /Blue/ }));
    expect(screen.getByText("Rs 1,200.00")).toBeInTheDocument();
  });

  it("strikes through values with no available variant in the current combination", () => {
    render(<ProductDetail {...baseProps()} />);
    // With Red selected, Blue has only a sold-out S variant → struck through.
    const colorGroup = screen.getByRole("radiogroup", { name: "Color" });
    expect(within(colorGroup).getByText("Blue").tagName).toBe("DEL");
    expect(within(colorGroup).queryByText("Red")?.tagName).not.toBe("DEL");
  });

  it("changes the main image via thumbnails and via variant images", async () => {
    const user = userEvent.setup();
    render(<ProductDetail {...baseProps()} />);
    const main = () => document.querySelector("img.product-image")!.getAttribute("src");
    expect(main()).toBe("https://cdn/1.jpg");
    await user.click(screen.getByRole("button", { name: "Show image 2" }));
    expect(main()).toBe("https://cdn/2.jpg");
    // Selecting the sold-out Blue variant previews its own image (id 12 → 2.jpg).
    await user.click(screen.getByRole("button", { name: "Show image 1" }));
    await user.click(within(screen.getByRole("radiogroup", { name: "Color" })).getByRole("radio", { name: /Blue/ }));
    expect(main()).toBe("https://cdn/2.jpg");
  });

  it("adds the selected variant to the cart and confirms it", async () => {
    const user = userEvent.setup();
    render(<ProductDetail {...baseProps()} />);
    await user.click(screen.getByRole("button", { name: /Add to Cart/ }));
    expect(JSON.parse(localStorage.getItem("hubex-cart-v1")!)).toEqual([{ variantId: 1, quantity: 1 }]);
    expect(screen.getByText(/Added to your cart/)).toBeInTheDocument();
    // Adding again merges the quantity.
    await user.click(screen.getByRole("button", { name: /Add to Cart/ }));
    expect(JSON.parse(localStorage.getItem("hubex-cart-v1")!)).toEqual([{ variantId: 1, quantity: 2 }]);
  });

  it("hides the confirmation once the selection changes", async () => {
    const user = userEvent.setup();
    render(<ProductDetail {...baseProps()} />);
    await user.click(screen.getByRole("button", { name: /Add to Cart/ }));
    await user.click(within(screen.getByRole("radiogroup", { name: "Size" })).getByRole("radio", { name: /M/ }));
    expect(screen.queryByText(/Added to your cart/)).not.toBeInTheDocument();
  });

  it("hides Shopify's placeholder 'Default Title' option", () => {
    render(
      <ProductDetail
        {...baseProps()}
        options={[{ name: "Title", values: ["Default Title"] }]}
        variants={[v(1, { Title: "Default Title" })]}
      />,
    );
    expect(screen.queryByRole("radiogroup")).not.toBeInTheDocument();
  });

  it("switches between Description and Variants tabs", async () => {
    const user = userEvent.setup();
    render(<ProductDetail {...baseProps()} />);
    expect(screen.getByText("shoe")).toBeInTheDocument(); // rendered HTML description
    await user.click(screen.getByRole("tab", { name: "Variants" }));
    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.getByText("SKU-3")).toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "Description" }));
    expect(screen.getByText("shoe")).toBeInTheDocument();
  });

  it("shows a compare-at price struck through when discounted", () => {
    const props = baseProps();
    props.variants[0].compareAtPrice = "1500.00";
    render(<ProductDetail {...props} />);
    expect(screen.getByText("Rs 1,500.00").tagName).toBe("DEL");
  });

  it("renders a placeholder and 'Unavailable' when the product has no images or variants", () => {
    render(<ProductDetail {...baseProps()} images={[]} options={[]} variants={[]} />);
    expect(screen.getByText("Unavailable")).toBeInTheDocument();
    expect(screen.getByText("This combination is not offered")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Sold out/ })).toBeDisabled();
  });
});
