import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CheckoutState } from "@/app/(store)/cart/actions";
import { cart } from "@/app/(store)/cart/cart-store";

const checkoutAction = vi.hoisted(() => vi.fn());
vi.mock("@/app/(store)/cart/actions", () => ({ checkoutAction }));

import { CheckoutForm } from "@/app/(store)/checkout/checkout-form";

beforeEach(() => {
  localStorage.clear();
  cart.clear();
  checkoutAction.mockReset();
  checkoutAction.mockResolvedValue({} satisfies CheckoutState);
});

async function fillAndSubmit(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/Full name/), "Ada Lovelace");
  await user.type(screen.getByLabelText(/Phone/), "03001234567");
  await user.type(screen.getByLabelText(/^Address/), "12 Model Town");
  await user.type(screen.getByLabelText(/City/), "Lahore");
  await user.type(screen.getByLabelText(/Postal code/), "54000");
  await user.click(screen.getByRole("button", { name: "Place order" }));
}

describe("CheckoutForm", () => {
  it("renders nothing when the cart is empty", () => {
    const { container } = render(<CheckoutForm />);
    expect(container).toBeEmptyDOMElement();
  });

  it("submits the cart lines plus the typed customer fields to the server action", async () => {
    const user = userEvent.setup();
    cart.add(1, 2);
    render(<CheckoutForm />);
    await fillAndSubmit(user);
    expect(checkoutAction).toHaveBeenCalledTimes(1);
    const formData = checkoutAction.mock.calls[0][1] as FormData;
    expect(JSON.parse(String(formData.get("cart")))).toEqual([{ variantId: 1, quantity: 2 }]);
    expect(formData.get("customerName")).toBe("Ada Lovelace");
    expect(formData.get("phone")).toBe("03001234567");
    expect(formData.get("country")).toBe("PK"); // prefilled default
    expect(formData.get("paymentMethod")).toBe("COD");
  });

  it("only offers Cash on Delivery", () => {
    cart.add(1, 1);
    render(<CheckoutForm />);
    const radios = screen.getAllByRole("radio");
    expect(radios).toHaveLength(1);
    expect(radios[0]).toHaveAttribute("value", "COD");
    expect(radios[0]).toBeChecked();
  });

  it("shows field errors from the server next to their inputs", async () => {
    const user = userEvent.setup();
    cart.add(1, 1);
    checkoutAction.mockResolvedValue({
      fieldErrors: { phone: ["Enter a valid phone number for the delivery country"] },
      values: { customerName: "Ada Lovelace", phone: "12", country: "PK" },
    } satisfies CheckoutState);
    render(<CheckoutForm />);
    await fillAndSubmit(user);
    expect(await screen.findByText(/valid phone number/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Phone/)).toHaveClass("is-invalid");
  });

  it("refills what the customer typed after a failed submit", async () => {
    const user = userEvent.setup();
    cart.add(1, 1);
    checkoutAction.mockResolvedValue({
      fieldErrors: { phone: ["bad"] },
      values: { customerName: "Ada Lovelace", city: "Lahore" },
    } satisfies CheckoutState);
    render(<CheckoutForm />);
    await fillAndSubmit(user);
    expect(await screen.findByLabelText(/Full name/)).toHaveValue("Ada Lovelace");
    expect(screen.getByLabelText(/City/)).toHaveValue("Lahore");
  });

  it("shows a form-level error (e.g. cart problems) as an alert", async () => {
    const user = userEvent.setup();
    cart.add(1, 1);
    checkoutAction.mockResolvedValue({
      formError: "Some items changed since you added them. Review your cart.",
    } satisfies CheckoutState);
    render(<CheckoutForm />);
    await fillAndSubmit(user);
    expect(await screen.findByText(/Some items changed/)).toBeInTheDocument();
  });
});
