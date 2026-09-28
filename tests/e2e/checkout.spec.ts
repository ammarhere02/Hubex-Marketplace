// The full purchase journey, plus cart persistence and server-side validation.
// Each test starts with a clean cart (fresh browser context per test).
import { expect, test, type Page } from "@playwright/test";

// Dev-mode pages stream + hydrate; wait for the network to settle before
// interacting so clicks land on hydrated React, not the static shell.
async function gotoHydrated(page: Page, url: string) {
  await page.goto(url);
  await page.waitForLoadState("networkidle");
}

async function addFlagshipToCart(page: Page) {
  await gotoHydrated(page, "/products/e2e-trail-shoe");
  // Retried as one block: a click can land before dev-mode hydration attaches handlers.
  await expect(async () => {
    await page.getByRole("button", { name: "Add to Cart" }).click();
    await expect(page.getByText("Added to your cart.")).toBeVisible({ timeout: 1_000 });
  }).toPass();
}

async function fillCheckout(page: Page, over: Record<string, string> = {}) {
  const values: Record<string, string> = {
    "Full name": "Ada Lovelace",
    Phone: "03001234567",
    Address: "12 Model Town",
    City: "Lahore",
    "Postal code": "54000",
    ...over,
  };
  for (const [label, value] of Object.entries(values)) {
    const field = page.getByLabel(new RegExp(`^${label}`));
    await field.fill(value);
  }
}

test.describe("cart", () => {
  test("add, merge, update quantity, remove, and persist across refresh", async ({ page }) => {
    await addFlagshipToCart(page);
    await addFlagshipToCart(page); // same variant again → merged quantity
    await page.locator("a.mm-cart").first().click();

    await expect(page.getByRole("link", { name: "E2E Trail Shoe" })).toBeVisible();
    const qty = page.getByRole("spinbutton", { name: /Quantity for E2E Trail Shoe/ });
    await expect(qty).toHaveValue("2");
    await expect(page.getByText(/Subtotal:/)).toContainText("Rs 2,000.00");

    await qty.fill("3");
    await expect(page.getByText(/Subtotal:/)).toContainText("Rs 3,000.00");

    // Survives a full reload (localStorage).
    await page.reload();
    await expect(page.getByRole("spinbutton", { name: /Quantity/ })).toHaveValue("3");

    await page.getByRole("button", { name: /Remove/ }).click();
    await expect(page.getByText("Your cart is empty.")).toBeVisible();
  });

  test("cart badge counts items across pages", async ({ page }) => {
    await addFlagshipToCart(page);
    await page.goto("/products");
    await expect(page.locator(".mm-cart .badge")).toHaveText("1");
  });
});

test.describe("checkout", () => {
  test("server-side validation: bad phone is rejected, typed values survive", async ({ page }) => {
    await addFlagshipToCart(page);
    await gotoHydrated(page, "/checkout");
    await fillCheckout(page, { Phone: "12345" });
    await page.getByRole("button", { name: "Place order" }).click();
    await expect(page.getByText(/valid phone number for the delivery country/)).toBeVisible();
    await expect(page.getByLabel(/Full name/)).toHaveValue("Ada Lovelace");
    await expect(page.getByLabel(/City/)).toHaveValue("Lahore");
    await expect(page).toHaveURL(/\/checkout/); // no order placed
  });

  test("full journey: browse → variant → cart → checkout → pending confirmation", async ({ page }) => {
    // Choose the Red/M variant explicitly.
    await gotoHydrated(page, "/products/e2e-trail-shoe");
    await expect(async () => {
      await page.getByRole("radiogroup", { name: "Size" }).getByText("M", { exact: true }).click();
      await expect(page.getByText("Rs 1,100.00").first()).toBeVisible({ timeout: 1_000 });
    }).toPass();
    await page.getByRole("button", { name: "Add to Cart" }).click();
    await page.getByRole("link", { name: "View cart" }).click();
    await expect(page.getByText("Red / M")).toBeVisible();
    await expect(page.getByText(/Subtotal:/)).toContainText("Rs 1,100.00");

    await gotoHydrated(page, "/checkout");
    await expect(page.getByText("Order summary")).toBeVisible();
    await expect(page.getByRole("radio", { name: /Cash on Delivery/ })).toBeChecked();
    await fillCheckout(page);
    await page.getByRole("button", { name: "Place order" }).click();

    // Confirmation returns WITHOUT waiting for Shopify: pending state shown.
    await expect(page).toHaveURL(/\/orders\/[0-9a-f-]{36}/);
    // Heading role, not text: Next's route announcer live-region duplicates the page title.
    await expect(page.getByRole("heading", { name: /Thank you, Ada!/ })).toBeVisible();
    await expect(page.getByText("PENDING_SYNC")).toBeVisible();
    await expect(page.getByText(/We are submitting it to the store/)).toBeVisible();
    await expect(page.getByText("1 × Rs 1,100.00")).toBeVisible();
    await expect(page.getByText("Total: Rs 1,100.00")).toBeVisible();
    // Phone is masked, never shown in full.
    await expect(page.getByText("+923001234567")).toHaveCount(0);
    await expect(page.getByText(/\+9\*+67/)).toBeVisible();

    // The cart was cleared by the confirmation page.
    await page.goto("/cart");
    await expect(page.getByText("Your cart is empty.")).toBeVisible();

    // The confirmation URL survives a refresh (order is server-persisted).
    await page.goBack();
    await page.reload();
    await expect(page.getByRole("heading", { name: /Thank you, Ada!/ })).toBeVisible();
  });

  test("checkout page without a cart shows only the summary side", async ({ page }) => {
    await page.goto("/checkout");
    await expect(page.getByText("Your cart is empty.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Place order" })).toHaveCount(0);
  });

  test("an unknown order reference shows not-found instead of leaking anything", async ({ page }) => {
    await page.goto("/orders/00000000-0000-0000-0000-000000000000");
    await expect(page.getByText(/could not be found/i)).toBeVisible({ timeout: 15_000 }); // cold compile of the 404 boundary
  });

  test("keyboard-only add to cart works @desktop-only", async ({ page }) => {
    await gotoHydrated(page, "/products/e2e-trail-shoe");
    const button = page.getByRole("button", { name: "Add to Cart" });
    await expect(async () => {
      await button.focus();
      await page.keyboard.press("Enter");
      await expect(page.getByText("Added to your cart.")).toBeVisible({ timeout: 1_000 });
    }).toPass();
  });
});
