// Browse → filter → paginate → product detail. Read-only against the seeded catalog.
import { expect, test, type Page } from "@playwright/test";

// Dev-mode pages stream + hydrate; wait for the network to settle before
// interacting so clicks land on hydrated React, not the static shell.
async function gotoHydrated(page: Page, url: string) {
  await page.goto(url);
  await page.waitForLoadState("networkidle");
}

test.describe("catalog browsing", () => {
  test("home page renders and links into the catalog", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("body")).toContainText(/products|deals|shop/i);
    await page.getByRole("link", { name: "Cart" }).first().click();
    await expect(page).toHaveURL(/\/cart/);
    await expect(page.getByText("Your cart is empty.")).toBeVisible();
  });

  test("listing shows visible products with image, title, price, availability", async ({ page }) => {
    await page.goto("/products");
    await expect(page.getByText("All Products (14)")).toBeVisible(); // 14 visible seeds
    const flagship = page.locator(".mm-card", { hasText: "E2E Trail Shoe" });
    await expect(flagship).toBeVisible();
    await expect(flagship).toContainText("Rs 1,000.00"); // cheapest variant
    await expect(flagship.locator("del")).toContainText("Rs 1,500.00"); // compare-at
    await expect(flagship.locator(".mm-ribbon")).toContainText("33%");
    await expect(flagship.locator("img")).toBeVisible();
    // Sold-out product is marked.
    const soldOut = page.locator(".mm-card", { hasText: "E2E Sold Out Bag" });
    await expect(soldOut.locator(".mm-soldout")).toBeVisible();
  });

  test("draft and removed products never appear", async ({ page }) => {
    await page.goto("/products");
    await expect(page.getByText("E2E Draft Product")).toHaveCount(0);
    await expect(page.getByText("E2E Removed Product")).toHaveCount(0);
    await page.goto("/products?page=2");
    await expect(page.getByText("E2E Draft Product")).toHaveCount(0);
    // Their detail pages render the not-found page. (The status code is 200
    // because Next streams the shell before notFound() is thrown server-side.)
    await page.goto("/products/e2e-draft");
    await expect(page.getByText(/could not be found/i)).toBeVisible({ timeout: 15_000 }); // cold compile of the 404 boundary
    await expect(page.getByText("E2E Draft Product")).toHaveCount(0);
  });

  test("pagination: 12 cards on page 1, the rest on page 2", async ({ page }) => {
    await page.goto("/products");
    await expect(page.locator(".mm-card")).toHaveCount(12);
    await page.getByRole("navigation").getByRole("link", { name: "2", exact: true }).click();
    await expect(page).toHaveURL(/page=2/);
    await expect(page.locator(".mm-card")).toHaveCount(2);
  });

  test("category filter narrows the list", async ({ page }) => {
    await page.goto("/products");
    await page.getByRole("link", { name: /^Bags \(\d+\)$/ }).click();
    await expect(page.getByText(/Category: Bags/)).toBeVisible();
    const cards = page.locator(".mm-card");
    await expect(cards.first()).toBeVisible();
    await expect(page.getByText("E2E Trail Shoe")).toHaveCount(0); // Shoes filtered out
  });

  test("unknown product handle renders the not-found page", async ({ page }) => {
    await page.goto("/products/does-not-exist");
    await expect(page.getByText(/could not be found/i)).toBeVisible({ timeout: 15_000 }); // cold compile of the 404 boundary
  });
});

test.describe("product detail", () => {
  test("variant selection updates price, stock, and gallery; sold-out combos are handled", async ({ page }) => {
    await gotoHydrated(page, "/products/e2e-trail-shoe");
    await expect(page.getByRole("heading", { name: "E2E Trail Shoe" }).last()).toBeVisible();
    // Initial: first available variant Red/S with compare-at price.
    await expect(page.getByText("Rs 1,000.00").first()).toBeVisible();
    await expect(page.locator("del", { hasText: "Rs 1,500.00" })).toBeVisible();
    await expect(page.getByText("In stock: 10")).toBeVisible();

    // Switch size to M: price and stock update. Retried as one block because a
    // click can land before dev-mode hydration attaches React's handlers.
    await expect(async () => {
      await page.getByRole("radiogroup", { name: "Size" }).getByText("M", { exact: true }).click();
      await expect(page.getByText("Rs 1,100.00").first()).toBeVisible({ timeout: 1_000 });
    }).toPass();
    await expect(page.getByText("In stock: 3")).toBeVisible();

    // Blue only exists sold out: value is struck through, selecting it disables purchase.
    const blue = page.getByRole("radiogroup", { name: "Color" }).locator("label", { hasText: "Blue" });
    await expect(blue.locator("del")).toBeVisible();
    await blue.click();
    await expect(page.getByRole("button", { name: "Sold out" })).toBeDisabled();

    // Thumbnails switch the main image.
    await page.getByRole("button", { name: "Show image 2" }).click();
    await expect(page.locator("img.product-image")).toHaveAttribute("src", /shoe-b/);
  });

  test("description tab shows merchant HTML; variants tab lists every variant", async ({ page }) => {
    await gotoHydrated(page, "/products/e2e-trail-shoe");
    await expect(page.locator("b", { hasText: "flagship" })).toBeVisible(); // merchant HTML rendered
    await page.getByRole("tab", { name: "Variants" }).click();
    await expect(page.getByRole("cell", { name: "E2E-BS" })).toBeVisible();
    await expect(page.locator("tr", { hasText: "Blue / S" }).getByText("Sold out")).toBeVisible();
  });
});
