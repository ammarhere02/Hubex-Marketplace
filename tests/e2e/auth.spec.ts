// Auth journeys: register → signed-in header → logout; login errors; and the
// admin-gated queue dashboard (redirect for anonymous, board for the admin).
// The admin credentials come from tests/e2e/env.ts.
import { expect, test } from "@playwright/test";

const ADMIN_EMAIL = "admin@e2e.test";
const ADMIN_PASSWORD = "admin-secret-123";

import { gotoHydrated, signUp } from "./helpers";

test.describe("site-wide authentication gate", () => {
  test("the first page is authentication: every route redirects guests to /login", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/login/);
    await page.goto("/products");
    await expect(page).toHaveURL(/\/login\?next=%2Fproducts/);
    await page.goto("/products/e2e-trail-shoe");
    await expect(page).toHaveURL(/\/login/);
    await page.goto("/cart");
    await expect(page).toHaveURL(/\/login/);
    await page.goto("/checkout");
    await expect(page).toHaveURL(/\/login/);
  });

  test("a forged session cookie does not bypass the gate", async ({ page, context }) => {
    await context.addCookies([{ name: "hubex_session", value: "forged-token-123", url: "http://localhost:3105" }]);
    await page.goto("/products");
    await expect(page).toHaveURL(/\/login/);
  });

  test("after signing up the storefront opens and deep links work", async ({ page }) => {
    await signUp(page);
    await page.goto("/products");
    await expect(page).toHaveURL(/\/products/);
    await expect(page.locator(".mm-card").first()).toBeVisible();
  });
});

test.describe("customer accounts", () => {
  test("register, see the account in the header, then log out", async ({ page }) => {
    const email = `e2e-${Date.now()}@example.com`;
    await gotoHydrated(page, "/register");
    await page.getByLabel("Full name").fill("Grace Hopper");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill("longenough");
    await page.getByRole("button", { name: "Register" }).click();

    await expect(page.getByText("Grace Hopper")).toBeVisible(); // header shows the session
    await page.getByRole("button", { name: /Sign out|Logout|Log out/i }).click();
    // Logging out drops the session, so the gate sends the visitor to the
    // chrome-free login page (no storefront header on auth screens).
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByText("Sign in to start your session")).toBeVisible();
  });

  test("login rejects wrong credentials with a visible error", async ({ page }) => {
    await gotoHydrated(page, "/login");
    await page.getByLabel("Email").fill("nobody@example.com");
    await page.getByLabel("Password").fill("wrong-password");
    await page.getByRole("button", { name: "Sign In" }).click();
    await expect(page.getByText(/Invalid email or password/)).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });
});

test.describe("queue dashboard gating", () => {
  test("anonymous visitors are redirected to /login and returned after signing in", async ({ page }) => {
    await page.goto("/admin/queues");
    await expect(page).toHaveURL(/\/login\?next=%2Fadmin%2Fqueues/);
    await page.waitForLoadState("networkidle");
    await page.getByLabel("Email").fill(ADMIN_EMAIL);
    await page.getByLabel("Password").fill(ADMIN_PASSWORD);
    await page.getByRole("button", { name: "Sign In" }).click();
    await expect(page).toHaveURL(/\/admin\/queues/);
    await expect(page.getByText("Hubex queues")).toBeVisible();
  });

  test("admin login lands on the admin home, not the storefront, and reaches the board", async ({ page }) => {
    await gotoHydrated(page, "/login");
    await page.getByLabel("Email").fill(ADMIN_EMAIL);
    await page.getByLabel("Password").fill(ADMIN_PASSWORD);
    await page.getByRole("button", { name: "Sign In" }).click();
    await expect(page).toHaveURL(/\/admin$/);
    await expect(page.getByText("Hubex Admin")).toBeVisible();
    await page.getByRole("link", { name: "Open queue board" }).click();
    await expect(page.getByText("Hubex queues")).toBeVisible();
  });

  test("an admin session cannot browse the storefront: shop pages redirect to /admin", async ({ page }) => {
    await gotoHydrated(page, "/login");
    await page.getByLabel("Email").fill(ADMIN_EMAIL);
    await page.getByLabel("Password").fill(ADMIN_PASSWORD);
    await page.getByRole("button", { name: "Sign In" }).click();
    await expect(page).toHaveURL(/\/admin$/);
    await page.goto("/products");
    await expect(page).toHaveURL(/\/admin$/);
  });

  test("a signed-in non-admin gets 404, not the board @desktop-only", async ({ page }) => {
    const email = `e2e-nonadmin-${Date.now()}@example.com`;
    await gotoHydrated(page, "/register");
    await page.getByLabel("Full name").fill("Normal User");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill("longenough");
    await page.getByRole("button", { name: "Register" }).click();
    await expect(page.getByText("Normal User")).toBeVisible();

    const res = await page.goto("/admin/queues");
    expect(res!.status()).toBe(404);
  });
});
