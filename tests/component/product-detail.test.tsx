import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { ProductDetail, type DetailProps, type DetailVariant } from "@/app/(store)/products/[handle]/product-detail";
import { cart } from "@/app/(store)/cart/cart-store";

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
    expect(JSON.parse(localStorage.getItem("hubex-cart-v1:guest")!)).toEqual([{ variantId: 1, quantity: 1 }]);
    expect(screen.getByText(/Added to your cart/)).toBeInTheDocument();
    // Adding again merges the quantity.
    await user.click(screen.getByRole("button", { name: /Add to Cart/ }));
    expect(JSON.parse(localStorage.getItem("hubex-cart-v1:guest")!)).toEqual([{ variantId: 1, quantity: 2 }]);
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

  it("switches between the Description, Comments, and Rating tabs", async () => {
    const user = userEvent.setup();
    render(<ProductDetail {...baseProps()} />);
    expect(screen.getByText("shoe")).toBeInTheDocument(); // rendered HTML description
    await user.click(screen.getByRole("tab", { name: "Comments" }));
    expect(screen.getByText("No comments yet.")).toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "Rating" }));
    expect(screen.getByText("No ratings yet.")).toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "Description" }));
    expect(screen.getByText("shoe")).toBeInTheDocument();
  });

  it("shows a compare-at price struck through when discounted", () => {
    const props = baseProps();
    props.variants[0].compareAtPrice = "1500.00";
    render(<ProductDetail {...props} />);
    expect(screen.getByText("Rs 1,500.00").tagName).toBe("DEL");
  });

  it("renders color values as name + colored circle under an 'Available Colors' heading", () => {
    render(<ProductDetail {...baseProps()} />);
    expect(screen.getByRole("heading", { name: "Available Colors" })).toBeInTheDocument();
    const colorGroup = screen.getByRole("radiogroup", { name: "Color" });
    const circles = colorGroup.querySelectorAll("i.fas.fa-circle.fa-2x");
    expect(circles).toHaveLength(2);
    expect((circles[0] as HTMLElement).style.color).toBe("red");
    expect((circles[1] as HTMLElement).style.color).toBe("blue");
  });

  it("renders size values as a large abbreviation with the full label underneath", () => {
    const props = baseProps();
    props.options = [
      { name: "Color", values: ["Red", "Blue"] },
      { name: "Size", values: ["Small", "Medium"] },
    ];
    props.variants = [
      v(1, { Color: "Red", Size: "Small" }, { imageId: 11 }),
      v(2, { Color: "Red", Size: "Medium" }),
      v(3, { Color: "Blue", Size: "Small" }, { available: false, stock: 0, imageId: 12 }),
    ];
    render(<ProductDetail {...props} />);
    expect(screen.getByRole("heading", { name: /Size Please select one/ })).toBeInTheDocument();
    const sizeGroup = screen.getByRole("radiogroup", { name: "Size" });
    const big = sizeGroup.querySelectorAll("span.text-xl");
    expect([...big].map((s) => s.textContent)).toEqual(["S", "M"]);
    expect(within(sizeGroup).getByText("Small")).toBeInTheDocument();
    expect(within(sizeGroup).getByText("Medium")).toBeInTheDocument();
  });

  it("recognizes German option names and color values (Farbe/Grösse, schwarz/dunkelbraun)", () => {
    const props = baseProps();
    props.options = [
      { name: "Farbe", values: ["schwarz", "dunkelbraun"] },
      { name: "Grösse", values: ["M"] },
    ];
    props.variants = [
      v(1, { Farbe: "schwarz", "Grösse": "M" }),
      v(2, { Farbe: "dunkelbraun", "Grösse": "M" }),
    ];
    render(<ProductDetail {...props} />);
    expect(screen.getByRole("heading", { name: "Available Colors" })).toBeInTheDocument();
    const colorGroup = screen.getByRole("radiogroup", { name: "Farbe" });
    const circles = colorGroup.querySelectorAll("i.fas.fa-circle.fa-2x");
    expect(circles).toHaveLength(2);
    expect((circles[0] as HTMLElement).style.color).toBe("rgb(31, 31, 31)"); // schwarz
    expect((circles[1] as HTMLElement).style.color).toBe("rgb(101, 67, 33)"); // dunkelbraun
    const sizeGroup = screen.getByRole("radiogroup", { name: "Grösse" });
    expect(sizeGroup.querySelector("span.text-xl")).toHaveTextContent("M");
  });

  it("falls back to a plain text tile for a color value it cannot map", () => {
    const props = baseProps();
    props.options = [{ name: "Color", values: ["Zebra Print"] }];
    props.variants = [v(1, { Color: "Zebra Print" })];
    render(<ProductDetail {...props} />);
    const group = screen.getByRole("radiogroup", { name: "Color" });
    expect(within(group).getByText("Zebra Print")).toBeInTheDocument();
    expect(group.querySelector("i.fa-circle")).toBeNull();
  });

  it("renders a placeholder and 'Unavailable' when the product has no images or variants", () => {
    render(<ProductDetail {...baseProps()} images={[]} options={[]} variants={[]} />);
    expect(screen.getByText("Unavailable")).toBeInTheDocument();
    expect(screen.getByText("This combination is not offered")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Sold out/ })).toBeDisabled();
  });
});
